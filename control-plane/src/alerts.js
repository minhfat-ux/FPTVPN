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

const TELEGRAM_API = "https://api.telegram.org";
const DEFAULT_TIMEOUT_MS = 8000;

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
    .map((line) => `• ${line}`)
    .join("\n");
  const head = `${icon} ${String(title ?? "Alert").trim()}`;
  const stamp = at instanceof Date ? at.toISOString().replace("T", " ").slice(0, 16) + " UTC" : String(at);
  return body ? `${head}\n${body}\n\n_${stamp}_` : `${head}\n\n_${stamp}_`;
}

/**
 * Gửi 1 tin qua Telegram Bot API. Không ném lỗi.
 * @returns {Promise<{sent: boolean, reason?: string, messageId?: number|null}>}
 */
export async function sendTelegram(text, { env = process.env, fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const { telegram } = alertChannels(env);
  if (!telegram) {
    return { sent: false, reason: "telegram chưa cấu hình (thiếu TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID)" };
  }
  if (typeof fetchImpl !== "function") {
    return { sent: false, reason: "runtime không có fetch" };
  }

  const token = String(env.TELEGRAM_BOT_TOKEN).trim();
  const chatId = String(env.TELEGRAM_CHAT_ID).trim();
  const payload = JSON.stringify({
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1, Number(timeoutMs) || DEFAULT_TIMEOUT_MS));
  try {
    const res = await fetchImpl(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      signal: controller.signal,
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || body?.ok === false) {
      return { sent: false, reason: body?.description ?? `HTTP ${res.status}` };
    }
    return { sent: true, messageId: body?.result?.message_id ?? null };
  } catch (err) {
    const reason = err?.name === "AbortError" ? `timeout ${timeoutMs}ms` : (err?.message ?? String(err));
    return { sent: false, reason };
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
      log.log?.(`alert: đã gửi telegram — ${input?.title ?? "alert"}`);
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
