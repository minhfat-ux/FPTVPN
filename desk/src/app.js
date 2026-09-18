import http from "node:http";
import { config } from "./config.js";
import { audit, initDb, recentAudit } from "./db.js";
import { createLimiters } from "./ratelimit.js";
import { entitlementFor, entitlementStatus, userById, userByEmail } from "./entitlement.js";
import { issueInvitation, listInvitations, revokeInvitation, publicInvitation } from "./codes.js";
import { redeemCode } from "./activations.js";
import { clientIp, bearerToken } from "./net.js";
import { attachSttProxy } from "./stt.js";
import { summarize } from "./summary.js";
import {
  listActivations,
  publicActivation,
  refreshSession,
  requireActivation,
  revokeActivation,
} from "./sessions.js";
import { usageThisMonth } from "./usage.js";
import { HttpError, badRequest, forbidden, notFound, safeEqual, shortText, tooMany, unauthorized } from "./util.js";

/**
 * Lớp HTTP của flowdesk.
 *
 * Viết trên `node:http` thuần (không express, không dependency nào) vì đây là
 * service lộ ra internet: ít bề mặt tấn công, deploy không cần `npm install`.
 *
 * Nguyên tắc bắt buộc (§3.5 của file bàn giao):
 *  - Mọi route đều cần xác thực, TRỪ `/health`.
 *  - Rate limit theo IP và theo phiên.
 *  - KHÔNG bao giờ trả key Soniox/OpenRouter (hay bất kỳ secret nào) ra client.
 */

const SECURITY_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

function sendJson(res, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body ?? {});
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    ...SECURITY_HEADERS,
    ...extraHeaders,
  });
  res.end(payload);
}

function sendError(res, err) {
  const status = err instanceof HttpError ? err.status : 500;
  const code = err instanceof HttpError ? err.code : "internal_error";
  const message = err instanceof HttpError ? err.message : "Lỗi hệ thống";
  if (!(err instanceof HttpError)) console.error("[flowdesk] lỗi không mong đợi:", err);
  sendJson(res, status, { error: message, code });
}

async function readJsonBody(req, limit = config.maxBodyBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw badRequest("Body quá lớn", "body_too_large");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    throw badRequest("Body phải là JSON hợp lệ", "bad_json");
  }
}

function bearerTokenOrBody(ctx) {
  return ctx.token ?? ctx.body?.token ?? null;
}

function requireAdmin(req) {
  if (!config.adminToken) throw new HttpError(503, "Route admin chưa được cấu hình", "admin_not_configured");
  const provided = req.headers["x-desk-admin-token"];
  if (!provided || !safeEqual(String(provided), config.adminToken)) {
    throw unauthorized("Token admin không hợp lệ", "bad_admin_token");
  }
}

function takeOrThrow(limiter, key) {
  const result = limiter.take(key);
  if (!result.ok) {
    const err = tooMany("Quá nhiều yêu cầu, thử lại sau", "rate_limited");
    err.retryAfterSec = result.retryAfterSec;
    throw err;
  }
  return result;
}

/** Bảng route — mỗi route khai báo method + đường dẫn, tham số `:name`. */
function buildRoutes(limiters) {
  return [
    {
      method: "GET",
      path: "/v1/desktop/health",
      handler: () => ({
        status: 200,
        body: {
          ok: true,
          service: config.serviceName,
          version: config.version,
          env: config.env,
          uptimeSec: Math.round(process.uptime()),
          entitlementSource: (() => {
            const status = entitlementStatus();
            return { available: status.available, error: status.error ?? null };
          })(),
        },
      }),
    },
    {
      method: "POST",
      path: "/v1/desktop/activate",
      handler: async (ctx) => {
        takeOrThrow(limiters.activatePerIp, `ip:${ctx.ip}`);
        const failState = limiters.activateFailPerIp.peek(`ip:${ctx.ip}`);
        if (!failState.ok) {
          audit("activation_blocked", { ip: ctx.ip, detail: { reason: "too_many_failures" } });
          throw tooMany("Quá nhiều lần thử sai, thử lại sau", "too_many_failed_attempts");
        }
        const code = ctx.body.code ?? ctx.body.activationCode ?? ctx.body.key;
        try {
          const result = redeemCode({
            code,
            deviceId: ctx.body.deviceId ?? null,
            deviceLabel: ctx.body.deviceLabel ?? ctx.body.deviceName ?? null,
            ip: ctx.ip,
            userAgent: ctx.userAgent,
          });
          return {
            status: 200,
            body: {
              ok: true,
              token: result.session.token,
              expiresAt: result.session.expiresAt,
              expiresInSec: result.session.expiresInSec,
              plan: result.plan,
              activationId: result.activation.id,
              // Chỉ trả phần tối thiểu về đơn hàng — không có gì nhạy cảm.
              order: result.order ? { id: result.order.id, paidAt: result.order.paidAt } : null,
              usage: usageThisMonth(result.activation.userId),
            },
          };
        } catch (err) {
          if (err instanceof HttpError && err.status !== 429) {
            limiters.activateFailPerIp.take(`ip:${ctx.ip}`);
          }
          throw err;
        }
      },
    },
    {
      method: "POST",
      path: "/v1/desktop/session",
      handler: async (ctx) => {
        takeOrThrow(limiters.sessionPerIp, `ip:${ctx.ip}`);
        const token = bearerTokenOrBody(ctx);
        const { session, activation } = refreshSession(token, { ip: ctx.ip });
        const usage = usageThisMonth(activation.userId);
        if (usage.exceeded) {
          audit("session_refused_quota", { userId: activation.userId, activationId: activation.id, ip: ctx.ip });
          throw forbidden("Đã hết hạn mức audio tháng này", "quota_exceeded");
        }
        // Nguồn quyền hỏng thì KHÔNG cắt phiên đang chạy (lỗi hạ tầng không phải
        // lỗi khách); chỉ khi đọc được mà thấy không còn đơn paid mới từ chối.
        const source = entitlementStatus();
        if (source.available) {
          const decision = entitlementFor({ userId: activation.userId });
          if (!decision.entitled) {
            audit("session_refused_entitlement", {
              userId: activation.userId,
              activationId: activation.id,
              ip: ctx.ip,
              detail: { reason: decision.reason },
            });
            throw forbidden("Tài khoản chưa có đơn đã thanh toán", `not_entitled_${decision.reason}`);
          }
        }
        return { status: 200, body: { ok: true, token: session.token, expiresAt: session.expiresAt, expiresInSec: session.expiresInSec, plan: "desktop", usage } };
      },
    },
    {
      method: "GET",
      path: "/v1/desktop/me",
      handler: async (ctx) => {
        takeOrThrow(limiters.sessionPerIp, `ip:${ctx.ip}`);
        const activation = requireActivation(ctx.token, { ip: ctx.ip, action: "me" });
        return {
          status: 200,
          body: {
            ok: true,
            plan: "desktop",
            activation: publicActivation(activation),
            usage: usageThisMonth(activation.user_id),
            serverTime: new Date().toISOString(),
          },
        };
      },
    },
    {
      method: "POST",
      path: "/v1/desktop/revoke",
      handler: async (ctx) => {
        takeOrThrow(limiters.sessionPerIp, `ip:${ctx.ip}`);
        const activation = requireActivation(ctx.token, { ip: ctx.ip, action: "revoke" });
        // Route này chỉ cho thiết bị tự gỡ chính mình; admin dùng route admin.
        const target = ctx.body.activationId ? String(ctx.body.activationId) : activation.id;
        if (target !== activation.id) throw forbidden("Chỉ thu hồi được thiết bị của chính mình", "not_owner");
        const revoked = revokeActivation({ id: target, reason: ctx.body.reason ? shortText(ctx.body.reason, 60) : "user_revoked", actor: "self" });
        if (!revoked) throw notFound("Không tìm thấy thiết bị", "activation_not_found");
        return { status: 200, body: { ok: true, activation: revoked } };
      },
    },

    {
      method: "POST",
      path: "/v1/desktop/summary",
      handler: async (ctx) => {
        takeOrThrow(limiters.sessionPerIp, `ip:${ctx.ip}`);
        const activation = requireActivation(bearerTokenOrBody(ctx), { ip: ctx.ip, action: "summary" });
        const usage = usageThisMonth(activation.user_id);
        if (usage.exceeded) {
          audit("summary_refused_quota", { userId: activation.user_id, activationId: activation.id, ip: ctx.ip });
          throw forbidden("Đã hết hạn mức audio tháng này", "quota_exceeded");
        }
        const result = await summarize({
          body: ctx.body,
          userId: activation.user_id,
          activationId: activation.id,
        });
        if (!result.ok) throw new HttpError(result.status ?? 502, result.message, result.code);
        return {
          status: 200,
          body: {
            ok: true,
            content: result.content,
            model: result.model,
            usage: result.usage,
            quota: usageThisMonth(activation.user_id),
          },
        };
      },
    },

    // ------------------------------------------------------------- admin ----
    {
      method: "POST",
      path: "/v1/desktop/invitations",
      admin: true,
      handler: async (ctx) => {
        const userId = ctx.body.userId ? String(ctx.body.userId) : (ctx.body.email ? userByEmail(ctx.body.email)?.id : null);
        if (!userId) throw badRequest("Cần userId hoặc email của tài khoản đã trả tiền", "missing_user");
        const user = userById(userId);
        const entitlement = entitlementStatus();
        if (!entitlement.available) {
          throw new HttpError(503, "Chưa đọc được DB đơn hàng của fBuddy", "entitlement_unavailable");
        }
        // Chỉ phát mã cho người thật sự có đơn `paid` — không phát tay cho ai khác.
        const decision = entitlementFor({ userId, orderId: ctx.body.orderId ?? null });
        if (!decision.entitled) {
          audit("invitation_refused", { userId, ip: ctx.ip, detail: { reason: decision.reason } });
          throw forbidden("Tài khoản này chưa có đơn nào ở trạng thái paid", `not_entitled_${decision.reason}`);
        }
        const { invitation, code } = issueInvitation({
          userId,
          email: user?.email ?? ctx.body.email ?? null,
          orderId: ctx.body.orderId ?? decision.order.id,
          actor: "admin",
          reason: ctx.body.reason ? shortText(ctx.body.reason, 60) : "issued",
        });
        return { status: 201, body: { ok: true, invitation, code, order: decision.order } };
      },
    },
    {
      method: "GET",
      path: "/v1/desktop/invitations",
      admin: true,
      handler: (ctx) => ({ status: 200, body: { ok: true, invitations: listInvitations({ userId: ctx.query.userId ?? null, limit: ctx.query.limit }) } }),
    },
    {
      method: "POST",
      path: "/v1/desktop/invitations/:id/revoke",
      admin: true,
      handler: (ctx) => ({
        status: 200,
        body: {
          ok: true,
          invitation: revokeInvitation({ id: ctx.params.id, reason: ctx.body.reason ? shortText(ctx.body.reason, 60) : "admin_revoked", actor: "admin" }),
        },
      }),
    },
    {
      method: "GET",
      path: "/v1/desktop/activations",
      admin: true,
      handler: (ctx) => ({
        status: 200,
        body: {
          ok: true,
          activations: listActivations({ userId: ctx.query.userId ?? null, invitationId: ctx.query.invitationId ?? null, limit: ctx.query.limit }),
        },
      }),
    },
    {
      method: "POST",
      path: "/v1/desktop/activations/:id/revoke",
      admin: true,
      handler: (ctx) => {
        const revoked = revokeActivation({ id: ctx.params.id, reason: ctx.body.reason ? shortText(ctx.body.reason, 60) : "admin_revoked", actor: "admin" });
        if (!revoked) throw notFound("Không tìm thấy thiết bị", "activation_not_found");
        return { status: 200, body: { ok: true, activation: revoked } };
      },
    },
    {
      method: "GET",
      path: "/v1/desktop/audit",
      admin: true,
      handler: (ctx) => ({ status: 200, body: { ok: true, entries: recentAudit(Number(ctx.query.limit) || 50) } }),
    },
  ];
}

function matchRoute(routes, method, pathname) {
  const segments = pathname.split("/").filter(Boolean);
  let pathMatched = false;
  for (const route of routes) {
    const target = route.path.split("/").filter(Boolean);
    if (target.length !== segments.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < target.length; i += 1) {
      if (target[i].startsWith(":")) params[target[i].slice(1)] = decodeURIComponent(segments[i]);
      else if (target[i] !== segments[i]) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    pathMatched = true;
    if (route.method === method) return { route, params };
  }
  return pathMatched ? { methodNotAllowed: true } : null;
}

/** Tạo http.Server (chưa listen). Gọi `initDb()` luôn cho tiện test. */
export function createServer() {
  initDb();
  const limiters = createLimiters(config);
  const routes = buildRoutes(limiters);

  const server = http.createServer(async (req, res) => {
    const started = Date.now();
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      const ip = clientIp(req);
      const matched = matchRoute(routes, req.method ?? "GET", url.pathname);
      if (!matched) throw notFound("Không có endpoint này", "no_route");
      if (matched.methodNotAllowed) throw new HttpError(405, "Sai method", "method_not_allowed");

      const ctx = {
        req,
        res,
        ip,
        params: matched.params,
        query: Object.fromEntries(url.searchParams.entries()),
        userAgent: req.headers["user-agent"] ?? null,
        token: bearerToken(req),
        isAdmin: false,
      };

      if (matched.route.admin) {
        takeOrThrow(limiters.adminPerIp, `ip:${ip}`);
        requireAdmin(req);
        ctx.isAdmin = true;
      }
      if (req.method !== "GET") ctx.body = await readJsonBody(req);

      const result = await matched.route.handler(ctx);
      sendJson(res, result.status ?? 200, result.body ?? {});
    } catch (err) {
      if (err instanceof HttpError && err.retryAfterSec) {
        res.setHeader("Retry-After", String(err.retryAfterSec));
        sendJson(res, err.status, { error: err.message, code: err.code });
        return;
      }
      sendError(res, err);
    } finally {
      const ms = Date.now() - started;
      if (ms > 2000) console.warn(`[flowdesk] chậm: ${req.method} ${req.url} ${ms}ms`);
    }
  });

  server.on("clientError", (_err, socket) => {
    if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
  });

  // WebSocket proxy tới Soniox — xác thực trước khi nâng cấp giao thức.
  attachSttProxy(server);

  return server;
}

/** Khởi động service thật (dùng trong `index.js` và test boot). */
export async function startServer({ port = config.port, host = config.host } = {}) {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  const address = server.address();
  const url = `http://${host}:${typeof address === "object" && address ? address.port : port}`;
  return { server, url, port: typeof address === "object" && address ? address.port : port };
}
