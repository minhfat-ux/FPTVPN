import crypto from "node:crypto";

/** Tiện ích dùng chung cho flowdesk (service tách rời, không import gì từ `server/`). */

export function nowIso() {
  return new Date().toISOString();
}

export function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(12).toString("hex")}`;
}

/** Lỗi có mã HTTP — `app.js` dịch thành response, không bao giờ lộ stack ra ngoài. */
export class HttpError extends Error {
  constructor(status, message, code = null) {
    super(message);
    this.status = status;
    this.code = code ?? `http_${status}`;
  }
}

export function badRequest(message, code) {
  return new HttpError(400, message, code);
}

export function unauthorized(message = "Cần xác thực", code = "unauthorized") {
  return new HttpError(401, message, code);
}

export function forbidden(message = "Không có quyền", code = "forbidden") {
  return new HttpError(403, message, code);
}

export function notFound(message = "Không tìm thấy", code = "not_found") {
  return new HttpError(404, message, code);
}

export function tooMany(message = "Quá nhiều yêu cầu", code = "rate_limited") {
  return new HttpError(429, message, code);
}

export function unavailable(message = "Service chưa sẵn sàng", code = "unavailable") {
  return new HttpError(503, message, code);
}

export function base64url(buffer) {
  return Buffer.from(buffer).toString("base64url");
}

export function fromBase64url(text) {
  return Buffer.from(String(text), "base64url");
}

export function hmacHex(key, data) {
  return crypto.createHmac("sha256", key).update(data).digest("hex");
}

export function sha256Hex(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

/** So sánh chuỗi không rò rỉ thời gian (dùng cho token admin). */
export function safeEqual(a, b) {
  const left = Buffer.from(String(a ?? ""));
  const right = Buffer.from(String(b ?? ""));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function intOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Mọi thứ trả ra client đều đi qua đây — cắt bớt và bỏ ký tự điều khiển. */
export function shortText(value, max = 120) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, max);
}
