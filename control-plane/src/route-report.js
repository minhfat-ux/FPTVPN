/**
 * route-report — **server quyết định đường tốt nhất** cho client VPN.
 *
 * Yêu cầu gốc (chủ dự án, 22/09/2026 — `docs/YEU_CAU_TOC_DO_ON_DINH.md` §1 vế 7 + §2f + tiêu chí A9):
 *   *"App có thể gửi về server các thông số để server quyết định cho app dùng đường nào là tốt nhất
 *   rồi mới đổi"*.
 *
 * Vì sao cần server: mỗi máy chỉ thấy đường của chính nó; control plane thấy **tất cả** khách (node nào
 * đang tốt, relay nào đang chập, IP nào bị chặn theo vùng) ⇒ quyết định tốt hơn suy đoán cục bộ.
 *
 * Luật an toàn (bắt buộc, theo §2f):
 *  1. Server chỉ **ĐỀ XUẤT** (`recommended`); app chỉ đổi khi `recommended` khác đường đang dùng và
 *     `ttl_s` còn hạn, đổi theo §2c (giữ interface VPN, khựng ≤3 s, ≤3 lần/phiên, chỉ khi rảnh ≥5 s).
 *  2. **Không có quyết định của server thì app tự chọn** ⇒ endpoint này là *kênh tối ưu*, KHÔNG phải
 *     cổng chặn: mọi nhánh "không chắc" đều trả `{recommended: null}` (giữ nguyên đường đang chạy).
 *  3. **Riêng tư**: chỉ nhận số liệu tổng hợp; định danh mạng phải là **băm** (`identity_hash`) — từ chối
 *     giá trị thô (SSID/IP/email/carrier) để không ai vô tình gửi dữ liệu định danh lên server.
 *  4. **Nhịp**: ≤1 lần/5 phút/thiết bị (A9). Báo dày hơn ⇒ trả `recommended: null` + `retry_after_s`
 *     (không phạt lỗi, để app cũ/mới đều chạy đúng); lạm dụng thật thì 429.
 *  5. **Triển khai**: control plane commit TRƯỚC rồi mới deploy (AGENTS.md §6b); app chưa có endpoint
 *     vẫn chạy y như hiện tại (server thiếu API ⇒ client bỏ qua im lặng).
 */

import express from "express";
import { createRateLimiter } from "./client-telemetry.js";

export const ROUTE_REPORT_PATH = "/v1/route-report";
/** Phiên bản schema request (tăng khi đổi tên/bỏ field). */
export const ROUTE_REPORT_SCHEMA_VERSION = 1;
/** Các đường hợp lệ: udp = QUIC/UDP trực tiếp · tcp = TCP relay · ws = WS relay (nút thắt đã đo). */
export const ROUTE_TRANSPORTS = Object.freeze(["udp", "tcp", "ws"]);
export const ROUTE_PLATFORMS = Object.freeze(["android", "ios", "macos", "windows"]);
export const ROUTE_NETWORK_TYPES = Object.freeze(["cell", "wifi", "other"]);
export const DEFAULT_TTL_S = 1800;
/** A9: ≤1 lần/5 phút/thiết bị. */
export const DEFAULT_MIN_INTERVAL_S = 300;
export const ROUTE_REPORT_MAX_BYTES = 4096;
export const MAX_CANDIDATES = 6;

const HASH_RE = /^[0-9a-f]{32,64}$/i;
const TOKEN_RE = /^[A-Za-z0-9._:@-]{1,64}$/;
/** Khoá bị CẤM trong body: gửi lên là dữ liệu định danh thô ⇒ từ chối (luật riêng tư §2f.3). */
const FORBIDDEN_KEYS = Object.freeze([
  "ssid", "bssid", "ip", "ip_address", "email", "phone", "password", "token",
  "carrier_raw", "hostname", "url", "payload", "content",
]);

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Chuẩn hoá số: chấp nhận số hoặc chuỗi số; ngoài khoảng ⇒ null. */
function number(value, { min = 0, max = 1_000_000_000, integer = false } = {}) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(parsed)) return null;
  if (parsed < min || parsed > max) return null;
  return integer ? Math.round(parsed) : parsed;
}

function text(value, { max = 64, pattern = null } = {}) {
  if (value === undefined || value === null) return null;
  const parsed = String(value).trim();
  if (!parsed || parsed.length > max) return null;
  if (pattern && !pattern.test(parsed)) return null;
  return parsed;
}

function pick(value, field, errors) {
  if (value === null || value === undefined) errors.push(`${field}:invalid`);
  return value;
}

/** Tìm khoá bị cấm ở mọi độ sâu (body lồng nhau vẫn phải sạch). */
export function findForbiddenKeys(value, depth = 0, found = new Set()) {
  if (depth > 6 || !isPlainObject(value)) return found;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.includes(String(key).toLowerCase())) found.add(String(key).toLowerCase());
    if (isPlainObject(child) || Array.isArray(child)) findForbiddenKeys(child, depth + 1, found);
  }
  return found;
}

/**
 * Validate body của `POST /v1/route-report`. Trả `{ok:true, value}` hoặc `{ok:false, errors}`.
 * Hàm THUẦN (không I/O) để test được không cần server.
 */
export function validateRouteReport(raw) {
  const errors = [];
  if (!isPlainObject(raw)) return { ok: false, errors: ["body:not_object"] };

  const forbidden = findForbiddenKeys(raw);
  if (forbidden.size) return { ok: false, errors: [`body:forbidden_keys:${[...forbidden].join(",")}`] };

  const platform = pick(text(raw.platform, { max: 16 }), "platform", errors);
  if (platform && !ROUTE_PLATFORMS.includes(platform)) errors.push("platform:unsupported");

  const deviceId = pick(text(raw.device_id, { max: 64, pattern: TOKEN_RE }), "device_id", errors);
  const credential = pick(text(raw.credential, { max: 128, pattern: TOKEN_RE }), "credential", errors);
  const appVersion = text(raw.app_version, { max: 32 });

  const networkRaw = isPlainObject(raw.network) ? raw.network : null;
  if (!networkRaw) {
    errors.push("network:required");
  }
  const networkType = networkRaw ? text(networkRaw.type, { max: 8 }) : null;
  if (networkRaw && (!networkType || !ROUTE_NETWORK_TYPES.includes(networkType))) errors.push("network.type:unsupported");
  const identityHash = networkRaw ? text(networkRaw.identity_hash, { max: 64, pattern: HASH_RE }) : null;
  if (networkRaw && !identityHash) errors.push("network.identity_hash:not_a_hash");
  const rawKbps = networkRaw ? number(networkRaw.raw_kbps, { min: 0, max: 100_000_000 }) : null;
  if (networkRaw && rawKbps === null) errors.push("network.raw_kbps:invalid");

  const currentRaw = isPlainObject(raw.current) ? raw.current : null;
  if (!currentRaw) errors.push("current:required");
  const currentTransport = currentRaw ? text(currentRaw.transport, { max: 8 }) : null;
  if (currentRaw && (!currentTransport || !ROUTE_TRANSPORTS.includes(currentTransport))) {
    errors.push("current.transport:unsupported");
  }
  const currentNode = currentRaw ? text(currentRaw.node, { max: 64 }) : null;
  const currentPort = currentRaw ? number(currentRaw.port, { min: 0, max: 65535, integer: true }) : null;
  const goodput = currentRaw ? number(currentRaw.goodput_kbps, { min: 0, max: 100_000_000 }) : null;
  if (currentRaw && goodput === null) errors.push("current.goodput_kbps:invalid");
  const stableKbps = currentRaw ? number(currentRaw.stable_kbps, { min: 0, max: 100_000_000 }) : null;
  const rttMs = currentRaw ? number(currentRaw.rtt_ms, { min: 0, max: 600_000 }) : null;
  const reconnects = currentRaw ? number(currentRaw.reconnects, { min: 0, max: 10_000, integer: true }) : null;

  const candidatesRaw = Array.isArray(raw.candidates) ? raw.candidates : [];
  if (candidatesRaw.length > MAX_CANDIDATES) errors.push("candidates:too_many");
  const candidates = [];
  candidatesRaw.slice(0, MAX_CANDIDATES).forEach((item, index) => {
    if (!isPlainObject(item)) {
      errors.push(`candidates[${index}]:not_object`);
      return;
    }
    const transport = text(item.transport, { max: 8 });
    if (!transport || !ROUTE_TRANSPORTS.includes(transport)) {
      errors.push(`candidates[${index}].transport:unsupported`);
      return;
    }
    candidates.push({
      transport,
      port: number(item.port, { min: 0, max: 65535, integer: true }),
      node: text(item.node, { max: 64 }),
      connectMs: number(item.connect_ms, { min: -1, max: 600_000, integer: true }),
      rttMs: number(item.rtt_ms, { min: 0, max: 600_000 }),
      result: item.result === "ok" || item.result === "fail" ? item.result : null,
    });
  });

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    value: {
      schema_version: ROUTE_REPORT_SCHEMA_VERSION,
      platform,
      app_version: appVersion,
      device_id: deviceId,
      credential,
      network: { type: networkType, identity_hash: identityHash, raw_kbps: rawKbps },
      current: {
        transport: currentTransport,
        node: currentNode,
        port: currentPort,
        goodput_kbps: goodput,
        stable_kbps: stableKbps,
        rtt_ms: rttMs,
        reconnects: reconnects ?? 0,
      },
      candidates,
    },
  };
}

function samePath(a, b) {
  if (!a || !b) return false;
  return a.transport === b.transport
    && (a.port ?? null) === (b.port ?? null)
    && (a.node ?? null) === (b.node ?? null);
}

function candidateLabel(candidate) {
  return [candidate.transport, candidate.port, candidate.node].filter((part) => part !== null && part !== undefined && part !== "").join(":");
}

/**
 * Quyết định đường nên dùng — hàm THUẦN, test được.
 *
 * Thứ tự ưu tiên (theo §2f): server đề xuất → app tự chọn → giữ nguyên.
 * Ở đây server chỉ đề xuất khi dữ liệu **chứng minh** có lãi; mọi trường hợp khác trả `null`
 * (giữ nguyên đường đang chạy) — đúng nguyên tắc "server là kênh tối ưu, không phải cổng chặn".
 */
export function decideRoute(report, { ttlS = DEFAULT_TTL_S } = {}) {
  const keep = (reason) => ({ recommended: null, ttl_s: ttlS, reason });
  const { current, candidates, network } = report;

  const usable = candidates.filter((candidate) => candidate.result !== "fail");
  const reachable = usable.filter((candidate) => candidate.result === "ok" || candidate.connectMs !== null);
  const better = reachable.filter((candidate) => !samePath(candidate, current));
  if (!better.length) return keep("không có đường nào khác đã chứng minh chạy được");

  // (1) Đang đi cầu WS — nút thắt streaming đã đo (§3.3 của yêu cầu) — mà có đường trực tiếp chạy được.
  if (current.transport === "ws") {
    const direct = better.find((candidate) => candidate.transport === "udp" || candidate.transport === "tcp");
    if (direct) {
      return {
        recommended: {
          transport: direct.transport,
          port: direct.port ?? null,
          node: direct.node ?? null,
          reason: `thoát cầu WS (nút thắt streaming): ${candidateLabel(direct)} đã chạy được`,
        },
        ttl_s: ttlS,
        reason: "ws_bottleneck",
      };
    }
  }

  // (2) Đường đang dùng bóp quá nửa so với mạng gốc đo được → thử đường khác đã chạy được.
  if (network.raw_kbps > 0 && current.goodput_kbps > 0 && current.goodput_kbps < network.raw_kbps * 0.5) {
    const best = better.slice().sort((a, b) => (a.rttMs ?? a.connectMs ?? 1e9) - (b.rttMs ?? b.connectMs ?? 1e9))[0];
    return {
      recommended: {
        transport: best.transport,
        port: best.port ?? null,
        node: best.node ?? null,
        reason: `goodput ${Math.round(current.goodput_kbps)} kbps < 50% mạng gốc ${Math.round(network.raw_kbps)} kbps`,
      },
      ttl_s: ttlS,
      reason: "under_half_of_raw",
    };
  }

  // (3) Node hiện tại reconnect nhiều trong cửa sổ, mà có node khác đã chạy được → đổi node.
  if (current.reconnects >= 2) {
    const otherNode = better.find((candidate) => candidate.node && candidate.node !== current.node);
    if (otherNode) {
      return {
        recommended: {
          transport: otherNode.transport,
          port: otherNode.port ?? null,
          node: otherNode.node ?? null,
          reason: `node hiện tại reconnect ${current.reconnects} lần trong cửa sổ`,
        },
        ttl_s: ttlS,
        reason: "current_node_unstable",
      };
    }
  }

  return keep("đường đang chạy chưa chứng minh kém hơn");
}

function envNumber(env, key, fallback) {
  const parsed = Number(env?.[key]);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function clientIpOf(req) {
  return String(req.headers["cf-connecting-ip"] ?? req.headers["x-forwarded-for"] ?? req.ip ?? "unknown")
    .split(",")[0]
    .trim();
}

/**
 * Đăng ký `POST /v1/route-report`.
 *
 * Đăng ký TRƯỚC cổng `AUTH_TOKEN` toàn cục (như `client-telemetry`): app không có token admin.
 * Tự xác thực bằng **credential thiết bị** (`peer_id`/`device_id` + `credential`) đúng như
 * `POST /v1/peers/heartbeat`, và tự lo trần byte + nhịp + chống lạm dụng.
 *
 * @param {import("express").Express} app
 * @param {{ store?: {findById(id:string):Promise<any>, all():Promise<any[]>, _save(rows:any[]):Promise<void>}, env?: Record<string,string|undefined>, log?: Console, now?: () => number }} [options]
 */
export function registerRouteReport(app, {
  store = null,
  env = process.env,
  log = console,
  now = () => Date.now(),
} = {}) {
  const enabled = String(env?.ROUTE_REPORT ?? "1") !== "0";
  const ttlS = envNumber(env, "ROUTE_REPORT_TTL_S", DEFAULT_TTL_S);
  const minIntervalS = envNumber(env, "ROUTE_REPORT_MIN_INTERVAL_S", DEFAULT_MIN_INTERVAL_S);
  const cadence = createRateLimiter({ limit: 1, windowMs: Math.max(1, minIntervalS) * 1000 });
  const perDevice = createRateLimiter({ limit: envNumber(env, "ROUTE_REPORT_PER_DEVICE_PER_MIN", 12) });
  const perIp = createRateLimiter({ limit: envNumber(env, "ROUTE_REPORT_PER_IP_PER_MIN", 60) });

  const router = express.Router();
  router.post(ROUTE_REPORT_PATH, async (req, res) => {
    try {
      // Tắt bằng env: vẫn trả null (app chạy y như khi chưa có endpoint) — không làm hỏng client.
      if (!enabled) return res.json({ recommended: null, ttl_s: ttlS, reason: "disabled" });

      const declared = Number(req.headers["content-length"] ?? 0);
      const rawLength = req.rawBody ? req.rawBody.length : JSON.stringify(req.body ?? null).length;
      if ((Number.isFinite(declared) && declared > ROUTE_REPORT_MAX_BYTES) || rawLength > ROUTE_REPORT_MAX_BYTES) {
        return res.status(413).json({ error: "payload_too_large", max_bytes: ROUTE_REPORT_MAX_BYTES });
      }

      const result = validateRouteReport(req.body);
      if (!result.ok) return res.status(400).json({ error: "invalid_route_report", details: result.errors });
      const report = result.value;

      // Xác thực thiết bị: cùng cơ chế với /v1/peers/heartbeat (404 unknown · 403 lệch credential).
      if (store) {
        const device = await store.findById(report.device_id).catch(() => null);
        if (!device || device.active === false) return res.status(404).json({ error: "unknown device" });
        if (device.peerCredential && device.peerCredential !== report.credential) {
          log?.warn?.(`route-report: credential KHÔNG khớp cho device ${report.device_id}`);
          return res.status(403).json({ error: "invalid credential" });
        }
      }

      const ts = now();
      const abuseDevice = perDevice.check(report.device_id, { now: ts });
      if (!abuseDevice.allowed) {
        res.set("Retry-After", String(abuseDevice.retryAfterS));
        return res.status(429).json({ error: "rate_limited", retry_after_s: abuseDevice.retryAfterS });
      }
      const abuseIp = perIp.check(clientIpOf(req), { now: ts });
      if (!abuseIp.allowed) {
        res.set("Retry-After", String(abuseIp.retryAfterS));
        return res.status(429).json({ error: "rate_limited", retry_after_s: abuseIp.retryAfterS });
      }

      // Nhịp A9 (≤1 lần/5 phút/thiết bị): báo dày hơn ⇒ giữ nguyên đường, KHÔNG phạt lỗi.
      const pacing = cadence.check(report.device_id, { now: ts });
      if (!pacing.allowed) {
        return res.json({
          recommended: null,
          ttl_s: ttlS,
          reason: "too_soon",
          retry_after_s: pacing.retryAfterS,
        });
      }

      const decision = decideRoute(report, { ttlS });
      log?.log?.(
        `route-report: ${report.platform} ${report.device_id} current=${report.current.transport}` +
        `${report.current.node ? `@${report.current.node}` : ""} raw=${report.network.raw_kbps}kbps ` +
        `goodput=${report.current.goodput_kbps}kbps -> ${decision.recommended ? candidateLabel(decision.recommended) : "giữ nguyên"} (${decision.reason})`,
      );
      return res.json(decision);
    } catch (err) {
      log?.error?.(`POST ${ROUTE_REPORT_PATH} failed:`, err);
      // Lỗi nội bộ ⇒ vẫn trả null để client giữ nguyên đường đang chạy (server không phải cổng chặn).
      return res.status(500).json({ error: "internal_error", recommended: null });
    }
  });

  app.use(router);
  return { path: ROUTE_REPORT_PATH, enabled, ttlS, minIntervalS };
}
