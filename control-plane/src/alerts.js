/**
 * Alert tự động qua Telegram cho chủ shop (đơn trả tiền, build iOS xong, node sập…).
 *
 * Vì sao cần module riêng: alert phải là "bắn rồi quên" — KHÔNG được làm chậm hay làm
 * hỏng luồng nghiệp vụ chính (webhook SePay, ký IPA, đăng ký thiết bị). Vì vậy mọi hàm
 * ở đây không bao giờ ném lỗi ra ngoài: thiếu cấu hình thì trả {sent:false, reason} và
 * ghi log, còn lỗi mạng thì bị timeout 8s rồi bỏ qua.
 *
 * Cấu hình (systemd drop-in của control plane, KHÔNG để trong repo):
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID   — xem docs/templates/VPNFlow_TelegramBot.md
 *
 * Bài học 16/09/2026: drop-in `alerts.conf` thiếu section `[Service]` nên systemd bỏ qua
 * toàn bộ biến ("Assignment outside of section") ⇒ CP không có token và alert im lặng
 * suốt. Vì vậy module này log RÕ lý do khi không gửi được, và `alertChannels()` để admin
 * kiểm tra cấu hình mà không cần đọc giá trị.
 */

import https from "node:https";

const TELEGRAM_API = "https://api.telegram.org";
const DEFAULT_TIMEOUT_MS = 8000;

/**
 * IP của Telegram: dùng khi DNS của VPS chỉ trả IPv6 mà máy không có IPv6.
 *
 * Vì sao cần: node-2 phân giải `api.telegram.org` ra IPv6 trước, undici (fetch) đi IPv6 rồi
 * "fetch failed" — trong khi `curl` cùng máy vẫn 200. Bot Telegram đã xử lý ca này từ 16/09
 * (xem `scripts/tg-bot/bot.mjs`: https.Agent({family:4}) rồi thử thẳng IP), nhưng `alerts.js`
 * thì chưa ⇒ **mọi alert/report tự động của control plane im lặng** (đơn trả tiền, khách đăng
 * ký máy mới, node sập, GFW watch, báo cáo 08:00/20:00). Log chỉ ghi "fetch failed".
 */
const TG_HOST = "api.telegram.org";
const TG_IPS = ["149.154.167.220", "149.154.166.110", "149.154.175.100"];

let ipv4Agent = null;

/** Agent buộc IPv4 (giống `curl -4`) — undici/fetch không có tuỳ chọn này. */
function telegramAgent() {
  if (!ipv4Agent) ipv4Agent = new https.Agent({ keepAlive: true, family: 4, timeout: 10_000 });
  return ipv4Agent;
}

/**
 * POST JSON qua node:https. `ip` = đi thẳng tới IP Telegram (SNI + kiểm tra chứng chỉ vẫn theo
 * tên miền thật), dùng khi cả DNS lẫn IPv4 đều có vấn đề.
 * @returns {Promise<{sent: boolean, reason?: string, messageId?: number|null, via: string}>}
 */
function postJsonViaHttps({ path, payload, timeoutMs, ip = null }) {
  const via = ip ? `https-ip:${ip}` : "https-ipv4";
  return new Promise((resolve) => {
    const options = {
      method: "POST",
      host: ip ?? TG_HOST,
      port: 443,
      path,
      agent: ip ? new https.Agent({ keepAlive: false, family: 4 }) : telegramAgent(),
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        Host: TG_HOST,
      },
      timeout: Math.max(1, timeoutMs),
    };
    if (ip) options.servername = TG_HOST; // SNI + verify theo tên miền
    const req = https.request(options, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        let body = null;
        try { body = JSON.parse(data); } catch { /* giữ null */ }
        if (res.statusCode >= 200 && res.statusCode < 300 && body?.ok !== false) {
          resolve({ sent: true, messageId: body?.result?.message_id ?? null, via });
        } else {
          resolve({ sent: false, reason: body?.description ?? `HTTP ${res.statusCode}`, via });
        }
      });
    });
    req.on("timeout", () => req.destroy(new Error(`timeout ${timeoutMs}ms`)));
    req.on("error", (err) => resolve({ sent: false, reason: err?.message ?? String(err), via }));
    req.write(payload);
    req.end();
  });
}

/** Sửa chuỗi bị "vỡ font" do bên gửi mã hoá sai (UTF-8 bị đọc như latin-1 hoặc CP1252 rồi gửi tiếp). */
const MOJIBAKE_MARKERS = /(?:Ã|Â|Ä|Å)[\u0080-\u00BF]|áº|á»|â€|ï»¿/g;

/**
 * Bảng ngược của CP1252 cho vùng 0x80–0x9F.
 *
 * Cần vì Windows thường giải mã UTF-8 bằng **CP1252** (0x91 → ‘, 0x83 → ƒ, 0x87 → ‡ …), không
 * phải latin-1. Khi đó `Buffer.from(text, "latin1")` không dựng lại được byte gốc (ký tự > 0xFF
 * bị cắt thành byte thấp) nên bản sửa sinh U+FFFD và bị bỏ qua — chuỗi vẫn vỡ font.
 */
const CP1252_REVERSE = new Map([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84], [0x2026, 0x85],
  [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88], [0x2030, 0x89], [0x0160, 0x8a],
  [0x2039, 0x8b], [0x0152, 0x8c], [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92],
  [0x201c, 0x93], [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b], [0x0153, 0x9c],
  [0x017e, 0x9e], [0x0178, 0x9f],
]);

/**
 * Chuỗi chỉ gồm ký tự <= U+00FF? Chỉ khi đó nó mới có thể là kết quả của việc đọc UTF-8 như latin-1;
 * ngược lại `Buffer.from(value, "latin1")` sẽ cắt cụt ký tự thật (> U+00FF) và phá chuỗi.
 */
function isLatin1(value) {
  for (let i = 0; i < value.length; i += 1) {
    if (value.charCodeAt(i) > 0xff) return false;
  }
  return true;
}

/**
 * Dựng lại byte gốc khi chuỗi đã bị đọc như CP1252.
 * @returns {Buffer|null} null nếu có ký tự nằm ngoài CP1252 (không thể là mojibake CP1252).
 */
function cp1252Bytes(value) {
  const out = Buffer.allocUnsafe(value.length);
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0xff) {
      out[i] = code;
      continue;
    }
    const mapped = CP1252_REVERSE.get(code);
    if (mapped === undefined) return null;
    out[i] = mapped;
  }
  return out;
}

/**
 * "BÃ¡o cÃ¡o" (UTF-8 bị đọc như latin-1) → "Báo cáo".
 * "KhÃ¡ch Ä‘Äƒng kÃ½" (UTF-8 bị đọc như CP1252 — kiểu Windows) → "Khách đăng ký".
 *
 * Chỉ sửa khi CHẮC CHẮN: chuỗi phải có dấu hiệu mojibake, bản sửa phải sạch hơn (ít dấu hiệu
 * hơn, không sinh ký tự thay thế U+FFFD) và không dài hơn bản gốc. Chuỗi đã đúng thì trả nguyên
 * (kể cả tiếng Việt có dấu bình thường).
 *
 * Lưu ý: trường hợp mất dữ liệu thật (bên gửi đã thay dấu bằng "?") thì KHÔNG cứu được — phải
 * sửa phía gửi.
 */
export function repairMojibake(text) {
  const value = String(text ?? "");
  if (!value) return value;
  const before = (value.match(MOJIBAKE_MARKERS) ?? []).length;
  if (before === 0) return value;

  const candidates = [];
  if (isLatin1(value)) {
    try {
      candidates.push(Buffer.from(value, "latin1").toString("utf8"));
    } catch {
      /* bỏ qua: thử tiếp ứng viên khác */
    }
  }
  const bytes = cp1252Bytes(value);
  if (bytes) candidates.push(bytes.toString("utf8"));

  let best = value;
  let bestMarkers = before;
  for (const candidate of candidates) {
    if (candidate.includes("\uFFFD")) continue;
    const markers = (candidate.match(MOJIBAKE_MARKERS) ?? []).length;
    if (markers < bestMarkers && candidate.length <= value.length) {
      best = candidate;
      bestMarkers = markers;
    }
  }
  return best;
}

const LEVEL_ICON = {
  info: "ℹ️",
  ok: "✅",
  warn: "⚠️",
  error: "🚨",
};

/** Kênh alert đang bật (không trả về giá trị token). */
export function alertChannels(env = process.env) {
  const token = String(env.TELEGRAM_BOT_TOKEN ?? "").trim();
  const chatId = String(env.TELEGRAM_CHAT_ID ?? "").trim();
  return {
    telegram: Boolean(token && chatId),
    telegramChatId: chatId || null,
    email: String(env.ALERT_EMAIL ?? "").trim() || null,
  };
}

/** Nội dung tin nhắn: tiêu đề + các dòng, có icon theo mức. */
export function renderAlertText({ title, lines = [], level = "info", at = new Date() } = {}) {
  const icon = LEVEL_ICON[level] ?? LEVEL_ICON.info;
  const body = (Array.isArray(lines) ? lines : [lines])
    .filter((line) => line !== undefined && line !== null && String(line).length > 0)
    .map((line) => `• ${repairMojibake(line)}`)
    .join("\n");
  const head = `${icon} ${repairMojibake(String(title ?? "Alert").trim())}`;
  const stamp = at instanceof Date ? at.toISOString().replace("T", " ").slice(0, 16) + " UTC" : String(at);
  return body ? `${head}\n${body}\n\n_${stamp}_` : `${head}\n\n_${stamp}_`;
}

/**
 * Gửi 1 tin qua Telegram Bot API. Không ném lỗi.
 * @returns {Promise<{sent: boolean, reason?: string, messageId?: number|null}>}
 */
export async function sendTelegram(text, { env = process.env, fetchImpl = null, httpsImpl = null, directIps = TG_IPS, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const { telegram } = alertChannels(env);
  if (!telegram) {
    return { sent: false, reason: "telegram chưa cấu hình (thiếu TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID)", via: null };
  }

  const token = String(env.TELEGRAM_BOT_TOKEN).trim();
  const chatId = String(env.TELEGRAM_CHAT_ID).trim();
  const payload = JSON.stringify({
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  });
  const path = `/bot${token}/sendMessage`;
  const budget = Math.max(1, Number(timeoutMs) || DEFAULT_TIMEOUT_MS);

  // Test/dev bơm fetchImpl (và KHÔNG bơm httpsImpl) ⇒ chỉ dùng đúng cái đó, không rơi sang mạng thật.
  if (typeof fetchImpl === "function" && typeof httpsImpl !== "function") {
    return await viaFetch(fetchImpl, { path, payload, timeoutMs: budget });
  }
  const postJson = typeof httpsImpl === "function" ? httpsImpl : postJsonViaHttps;

  // 1) fetch: nhanh, nhưng trên node-2 (DNS chỉ trả IPv6) undici hay trả "fetch failed".
  const fetchAttempt = typeof fetchImpl === "function" ? fetchImpl : globalThis.fetch;
  if (typeof fetchAttempt === "function") {
    const attempt = await viaFetch(fetchAttempt, { path, payload, timeoutMs: budget });
    if (attempt.sent) return attempt;
    if (attempt.reason && attempt.reason !== "fetch failed") return { ...attempt, via: "fetch" };
    // "fetch failed" = ca IPv6 ⇒ đi tiếp xuống các đường IPv4 bên dưới.
  }

  // 2) node:https buộc IPv4 (giống `curl -4`).
  const ipv4 = await postJson({ path, payload, timeoutMs: budget });
  if (ipv4.sent) return ipv4;

  // 3) Thử thẳng IP của Telegram (DNS có vấn đề thì vẫn gửi được).
  for (const ip of directIps ?? TG_IPS) {
    const viaIp = await postJson({ path, payload, timeoutMs: budget, ip });
    if (viaIp.sent) return viaIp;
  }
  return { sent: false, reason: `fetch failed; ${ipv4.reason ?? "IPv4 lỗi"}; thử ${(directIps ?? TG_IPS).length} IP Telegram đều lỗi`, via: null };
}

/** Đường fetch (giữ nguyên hành vi cũ + AbortController để không treo luồng nghiệp vụ). */
async function viaFetch(fetchImpl, { path, payload, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`https://api.telegram.org${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      signal: controller.signal,
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || body?.ok === false) {
      return { sent: false, reason: body?.description ?? `HTTP ${res.status}`, via: "fetch" };
    }
    return { sent: true, messageId: body?.result?.message_id ?? null, via: "fetch" };
  } catch (err) {
    const reason = err?.name === "AbortError" ? `timeout ${timeoutMs}ms` : (err?.message ?? String(err));
    return { sent: false, reason, via: "fetch" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Bắn 1 alert (hiện tại: Telegram). Không bao giờ ném lỗi ra luồng gọi.
 *
 * @param {object} input
 * @param {string} input.title
 * @param {string[]} [input.lines]
 * @param {"info"|"ok"|"warn"|"error"} [input.level]
 * @param {object} [deps] - env/fetch/log/timeoutMs để test.
 * @returns {Promise<{sent: boolean, reason?: string, text: string}>}
 */
export async function sendAlert(input, deps = {}) {
  const log = deps.log ?? console;
  const text = renderAlertText(input);
  try {
    const result = await sendTelegram(text, deps);
    if (result.sent) {
      log.log?.(`alert: đã gửi telegram (đường ${result.via ?? "fetch"}) — ${input?.title ?? "alert"}`);
    } else {
      log.warn?.(`alert: KHÔNG gửi được (${result.reason}) — ${input?.title ?? "alert"}`);
    }
    return { ...result, text };
  } catch (err) {
    // Phòng thủ 2 lớp: sendTelegram đã bắt lỗi, nhưng alert không được phép làm sập luồng chính.
    log.error?.(`alert: lỗi không mong đợi — ${err?.message ?? err}`);
    return { sent: false, reason: err?.message ?? String(err), text };
  }
}

/**
 * Nội dung alert khi KHÁCH ĐĂNG KÝ MÁY MỚI (thiết bị mới của một account thật).
 * Chỉ gọi cho device có `userId` (khách hàng), không gọi cho thiết bị test/probe.
 */
export function deviceRegisteredAlert({ platform, name, email, ip, node, replaced = null } = {}) {
  const lines = [
    `Nền tảng: ${platform || "không rõ"}`,
    `Thiết bị: ${name || "(không tên)"}`,
    `Tài khoản: ${email || "(chưa map tài khoản)"}`,
    ip ? `IP trong tunnel: ${ip}` : null,
    node ? `Node: ${node}` : null,
    replaced ? `Thay thế slot của: ${replaced}` : null,
  ].filter(Boolean);
  return {
    title: "Khách đăng ký máy mới",
    level: "info",
    lines,
  };
}

/**
 * Nội dung alert XÁC NHẬN HOÁ ĐƠN cho khách (sau khi đơn được kích hoạt).
 * `mailSent=false` ⇒ hoá đơn chưa tới hộp thư khách (thường do mailer/Resend) — mức warn
 * vì khách đã trả tiền mà không nhận được xác nhận.
 */
export function invoiceConfirmedAlert({ orderCode, email, plan, amount, days, expiresAt, mailSent = true, product = "VPNFlow Premium" } = {}) {
  const lines = [
    `Mã đơn: ${orderCode}`,
    `Khách: ${email}`,
    `Gói: ${plan}${days ? ` (${days} ngày)` : ""}`,
    amount ? `Số tiền: ${Number(amount).toLocaleString("vi-VN")}đ` : null,
    expiresAt ? `Hết hạn: ${String(expiresAt).slice(0, 10)}` : null,
    `Kênh: ${product}`,
    mailSent ? "Hoá đơn: đã gửi email cho khách" : "⚠️ Hoá đơn: KHÔNG gửi được email cho khách",
  ].filter(Boolean);
  return {
    title: "Xác nhận hoá đơn cho khách",
    level: mailSent ? "ok" : "warn",
    lines,
  };
}
