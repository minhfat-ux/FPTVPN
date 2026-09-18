import { config } from "./config.js";
import { get, run } from "./db.js";
import { newId, nowIso } from "./util.js";

/**
 * Đo mức dùng để áp hạn mức audio/tháng cho từng user (§3.5).
 * Lớp WS proxy gọi `recordUsage` khi một phiên STT kết thúc; `/me` và `/session`
 * đọc `usageThisMonth` để biết còn bao nhiêu phút.
 */

export function monthStartIso(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export function recordUsage({ userId, activationId = null, kind, seconds = 0, bytes = 0, tokens = 0 }) {
  if (!userId || !kind) return null;
  const id = newId("use");
  run(
    `INSERT INTO desk_usage (id, user_id, activation_id, kind, seconds, bytes, tokens, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    userId,
    activationId,
    String(kind),
    Math.max(0, Number(seconds) || 0),
    Math.max(0, Math.trunc(Number(bytes) || 0)),
    Math.max(0, Math.trunc(Number(tokens) || 0)),
    nowIso(),
  );
  return { id, userId, kind };
}

export function usageThisMonth(userId, now = new Date()) {
  const since = monthStartIso(now);
  const row = get(
    `SELECT COALESCE(SUM(seconds), 0) AS seconds, COALESCE(SUM(tokens), 0) AS tokens, COUNT(*) AS events
       FROM desk_usage WHERE user_id = ? AND created_at >= ?`,
    userId,
    since,
  );
  const seconds = Number(row?.seconds ?? 0);
  const limitMinutes = Math.max(0, config.maxSttMinutesPerMonth);
  const minutes = seconds / 60;
  return {
    since,
    seconds,
    minutes: Number(minutes.toFixed(3)),
    limitMinutes,
    remainingMinutes: Number(Math.max(0, limitMinutes - minutes).toFixed(3)),
    exceeded: limitMinutes > 0 && minutes >= limitMinutes,
    events: Number(row?.events ?? 0),
    tokens: Number(row?.tokens ?? 0),
  };
}
