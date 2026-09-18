import { WebSocket, WebSocketServer } from "ws";
import { config, sonioxKey, sonioxWsUrl } from "./config.js";
import { audit } from "./db.js";
import { entitlementFor, entitlementStatus } from "./entitlement.js";
import { clientIp, bearerToken } from "./net.js";
import { requireActivation } from "./sessions.js";
import { recordUsage, usageThisMonth } from "./usage.js";

/**
 * `WS /v1/desktop/stt` — proxy PCM 16 kHz mono → Soniox.
 *
 * Vì sao phải proxy thay vì đưa key cho app:
 *  - app Windows không giữ key Soniox ⇒ lộ app không lộ key;
 *  - chủ dự án thu hồi được quyền (token phiên gắn với activation);
 *  - đo được mức dùng và áp hạn mức tháng cho từng user.
 *
 * Luồng: app gửi khung TEXT đầu tiên (cấu hình Soniox của app, KHÔNG có key) →
 * proxy bỏ mọi `api_key` do client gửi, chèn key thật, ép tham số audio về giá
 * trị hợp lệ → gửi lên Soniox; sau đó hai chiều chỉ còn khung nhị phân.
 */

/** Mẫu ngôn ngữ đích hợp lệ (BCP-47 gọn) — không cho client gửi chuỗi bậy lên Soniox. */
const LANGUAGE_RE = /^[a-z]{2,3}(?:-[A-Za-z]{2,4})?$/;
const AUDIO_FORMATS = new Set(["pcm_s16le", "pcm_mulaw", "pcm_alaw"]);
const MAX_PENDING_AUDIO_BYTES = 2 * 1024 * 1024;

function rejectUpgrade(socket, status, code) {
  const body = JSON.stringify({ error: code, code });
  socket.write(
    `HTTP/1.1 ${status} ${status === 401 ? "Unauthorized" : status === 403 ? "Forbidden" : status === 429 ? "Too Many Requests" : "Error"}\r\n` +
      `Content-Type: application/json; charset=utf-8\r\n` +
      `Content-Length: ${Buffer.byteLength(body)}\r\n` +
      `Cache-Control: no-store\r\n` +
      `Connection: close\r\n\r\n${body}`,
  );
  socket.destroy();
}

function sendJson(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

/** Cấu hình gửi lên Soniox: mọi thứ do client đặt đều bị kiểm lại. */
export function sanitizeSonioxConfig(input = {}, { key, model = config.sonioxModel } = {}) {
  const language = String(input?.translation?.target_language ?? "");
  const sampleRate = Number(input?.sample_rate ?? 16000);
  const config = {
    api_key: key,
    model: /^[a-z0-9.\-]{1,40}$/i.test(String(input?.model ?? "")) ? String(input.model) : model,
    audio_format: AUDIO_FORMATS.has(String(input?.audio_format)) ? String(input.audio_format) : "pcm_s16le",
    sample_rate: Number.isFinite(sampleRate) ? Math.min(48000, Math.max(8000, Math.trunc(sampleRate))) : 16000,
    num_channels: Number(input?.num_channels) === 2 ? 2 : 1,
    enable_language_identification: Boolean(input?.enable_language_identification),
    enable_speaker_diarization: Boolean(input?.enable_speaker_diarization),
    enable_endpoint_detection: input?.enable_endpoint_detection !== false,
  };
  if (input?.endpoint_latency_adjustment_level !== undefined) {
    config.endpoint_latency_adjustment_level = Math.min(3, Math.max(0, Number(input.endpoint_latency_adjustment_level) || 0));
  }
  if (input?.endpoint_sensitivity !== undefined) {
    config.endpoint_sensitivity = Math.min(1, Math.max(0, Number(input.endpoint_sensitivity) || 0));
  }
  if (input?.max_endpoint_delay_ms !== undefined) {
    config.max_endpoint_delay_ms = Math.min(5000, Math.max(0, Math.trunc(Number(input.max_endpoint_delay_ms) || 0)));
  }
  if (input?.translation && typeof input.translation === "object" && LANGUAGE_RE.test(language)) {
    config.translation = { type: input.translation.type === "two_way" ? "two_way" : "one_way", target_language: language };
  }
  return config;
}

async function handleSession({ client, activation, ip, log, upstreamUrl }) {
  const key = sonioxKey();
  const startedAt = Date.now();
  let bytes = 0;
  let closed = false;
  let configSent = false;
  let upstream = null;
  /** Audio đến trước khi kết nối Soniox xong thì xếp hàng, không được mất. */
  const pending = [];
  let pendingBytes = 0;
  let sessionLimit = null;

  const finish = (reason) => {
    if (closed) return;
    closed = true;
    clearTimeout(sessionLimit);
    const seconds = Math.max(0, (Date.now() - startedAt) / 1000);
    if (seconds >= 0.5 || bytes > 0) {
      recordUsage({ userId: activation.user_id, activationId: activation.id, kind: "stt", seconds, bytes });
    }
    audit("stt_session", {
      userId: activation.user_id,
      activationId: activation.id,
      ip,
      detail: { seconds: Number(seconds.toFixed(2)), bytes, reason },
    });
  };

  sessionLimit = setTimeout(() => {
    sendJson(client, { error_message: "Phiên đã đạt giới hạn thời lượng cho phép." });
    client.close(1008, "session_limit");
  }, Math.max(1, config.maxSttSessionMinutes) * 60 * 1000);
  sessionLimit.unref?.();

  if (!key) {
    sendJson(client, { error_message: "Backend bản Windows chưa được cấu hình key Soniox." });
    client.close(1011, "not_configured");
    finish("not_configured");
    return;
  }

  const upstreamReady = (configJson) =>
    new Promise((resolve, reject) => {
      const socket = new WebSocket(upstreamUrl);
      const fail = (err) => {
        try {
          socket.terminate();
        } catch {
          /* đã chết */
        }
        reject(err);
      };
      socket.on("open", () => {
        socket.send(configJson);
        for (const chunk of pending.splice(0)) socket.send(chunk);
        pendingBytes = 0;
        resolve(socket);
      });
      socket.on("error", fail);
      socket.on("unexpected-response", (_req, response) => fail(new Error(`Soniox trả ${response.statusCode}`)));
    });

  client.on("message", (data, isBinary) => {
    if (closed) return;
    if (!isBinary) {
      const text = data.toString("utf8");
      if (!configSent) {
        configSent = true;
        let parsed = null;
        try {
          parsed = JSON.parse(text);
        } catch {
          sendJson(client, { error_message: "Cấu hình phiên không phải JSON hợp lệ." });
          client.close(1008, "bad_config");
          finish("bad_config");
          return;
        }
        if (parsed && typeof parsed === "object" && parsed.api_key) {
          // Client cố gửi key riêng: bỏ đi (không chuyển tiếp) và ghi audit.
          audit("stt_client_key_stripped", { userId: activation.user_id, activationId: activation.id, ip });
        }
        const configJson = JSON.stringify(sanitizeSonioxConfig(parsed ?? {}, { key }));
        upstreamReady(configJson)
          .then((socket) => {
            upstream = socket;
            socket.on("message", (payload, upstreamBinary) => {
              if (client.readyState !== WebSocket.OPEN) return;
              if (upstreamBinary) {
                client.send(payload, { binary: true });
                return;
              }
              // Phòng thủ: nếu nhà cung cấp có nhắc tới key thì không bao giờ đẩy ra client.
              let out = payload.toString("utf8");
              if (key && out.includes(key)) out = out.split(key).join("[redacted]");
              client.send(out);
            });
            socket.on("close", () => {
              finish("upstream_closed");
              if (client.readyState === WebSocket.OPEN) client.close(1000, "upstream_closed");
            });
            socket.on("error", (err) => {
              sendJson(client, { error_message: `Mất kết nối tới nhà cung cấp: ${err?.message ?? err}` });
              if (client.readyState === WebSocket.OPEN) client.close(1011, "upstream_error");
              finish("upstream_error");
            });
          })
          .catch((err) => {
            sendJson(client, { error_message: `Không mở được phiên nhận dạng: ${err?.message ?? err}` });
            client.close(1011, "upstream_unreachable");
            finish("upstream_unreachable");
          });
        return;
      }
      // Soniox: khung TEXT rỗng = kết thúc phiên. Khung TEXT khác bị từ chối.
      if (text.trim() === "") {
        if (upstream?.readyState === WebSocket.OPEN) upstream.send("");
        return;
      }
      sendJson(client, { error_message: "Chỉ khung cấu hình đầu tiên được phép là TEXT." });
      client.close(1008, "unexpected_text_frame");
      finish("unexpected_text_frame");
      return;
    }

    bytes += data.length;
    if (upstream?.readyState === WebSocket.OPEN) {
      upstream.send(data);
      return;
    }
    if (pendingBytes + data.length > MAX_PENDING_AUDIO_BYTES) {
      sendJson(client, { error_message: "Dữ liệu audio gửi tới quá nhanh." });
      client.close(1009, "audio_backlog");
      finish("audio_backlog");
      return;
    }
    pending.push(data);
    pendingBytes += data.length;
  });

  client.on("close", () => {
    finish("client_closed");
    try {
      upstream?.close();
    } catch {
      /* đã đóng */
    }
  });

  client.on("error", (err) => {
    log?.warn?.(`[flowdesk] lỗi socket client: ${err?.message ?? err}`);
    finish("client_error");
  });
}

/**
 * Gắn proxy vào http server. Xác thực TRƯỚC khi nâng cấp giao thức, nên request
 * sai nhận HTTP 401/403/429 bình thường thay vì một WebSocket chết khó chẩn đoán.
 */
export function attachSttProxy(server, { log = console, upstreamUrl = null } = {}) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });

  server.on("upgrade", (req, socket, head) => {
    let pathname = "/";
    let query = new URLSearchParams();
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      pathname = url.pathname;
      query = url.searchParams;
    } catch {
      rejectUpgrade(socket, 404, "no_route");
      return;
    }
    if (pathname !== "/v1/desktop/stt") {
      rejectUpgrade(socket, 404, "no_route");
      return;
    }

    const ip = clientIp(req);
    // Token qua header (app .NET) hoặc query (tiện cho test/công cụ).
    const token = bearerToken(req) ?? query.get("token");
    let activation = null;
    try {
      activation = requireActivation(token, { ip, action: "stt_open" });
    } catch (err) {
      rejectUpgrade(socket, err?.status ?? 401, err?.code ?? "unauthorized");
      return;
    }

    const source = entitlementStatus();
    if (source.available) {
      const decision = entitlementFor({ userId: activation.user_id });
      if (!decision.entitled) {
        audit("stt_refused_entitlement", { userId: activation.user_id, activationId: activation.id, ip, detail: { reason: decision.reason } });
        rejectUpgrade(socket, 403, `not_entitled_${decision.reason}`);
        return;
      }
    }

    const usage = usageThisMonth(activation.user_id);
    if (usage.exceeded) {
      audit("stt_refused_quota", { userId: activation.user_id, activationId: activation.id, ip, detail: { minutes: usage.minutes } });
      rejectUpgrade(socket, 429, "quota_exceeded");
      return;
    }

    wss.handleUpgrade(req, socket, head, (client) => {
      wss.emit("connection", client, req, activation);
    });
  });

  wss.on("connection", (client, req, activation) => {
    const ip = clientIp(req);
    log?.info?.(`[flowdesk] STT mở: user ${activation.user_id}, thiết bị ${activation.id}`);
    handleSession({ client, activation, ip, log, upstreamUrl: upstreamUrl ?? sonioxWsUrl() }).catch((err) => {
      log?.warn?.(`[flowdesk] phiên STT lỗi: ${err?.message ?? err}`);
      try {
        client.close(1011, "internal_error");
      } catch {
        /* đã đóng */
      }
    });
  });

  return wss;
}
