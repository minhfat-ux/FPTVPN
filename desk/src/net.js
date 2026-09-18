import { config } from "./config.js";

/** Tiện ích đọc thông tin từ request HTTP (dùng chung cho app.js và lớp WS). */

export function clientIp(req) {
  if (config.trustProxy) {
    const forwarded = req.headers["x-forwarded-for"];
    const first = Array.isArray(forwarded) ? forwarded[0] : String(forwarded ?? "").split(",")[0];
    if (first && first.trim()) return first.trim().slice(0, 64);
  }
  return String(req.socket?.remoteAddress ?? "unknown").slice(0, 64);
}

/** `Authorization: Bearer <token>` — app Windows gửi token qua header này. */
export function bearerToken(req) {
  const header = req.headers?.authorization ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(String(header).trim());
  return match ? match[1].trim() : null;
}
