import { all, count, getById, insert, update } from "./db.js";
import { nowIso } from "./util.js";

/**
 * Per-device login sessions.
 *
 * The JWT stays stateless, but it carries a session id (`sid`) that points at a
 * row here. That gives the product the behaviour people expect from a chat app:
 * signing in on the phone does **not** sign the laptop out, every device shows up
 * in "Thiết bị đang đăng nhập", and one device can be kicked without touching the
 * others. Password changes and "đăng xuất mọi thiết bị" revoke everything.
 *
 * Tokens issued before this table existed have no `sid`; they are still accepted
 * until they expire (nobody gets logged out by the deploy) but they cannot be
 * revoked individually — a `token_version` bump still kills them.
 */

/** Matches `signToken`'s default TTL so a session never outlives its token. */
export const SESSION_TTL_SEC = 60 * 60 * 24 * 30;
/** Oldest sessions beyond this are revoked automatically (keeps the list sane). */
export const MAX_SESSIONS_PER_USER = 20;
/** `last_seen_at` is written at most this often per session. */
const TOUCH_INTERVAL_MS = 60 * 1000;

const LAST_TOUCH = new Map();

/**
 * "Chrome · Windows" from a user agent. Returns null when unrecognised so the UI
 * can show its own localized "unknown device" instead of a made-up name.
 */
export function deviceLabel(userAgent) {
  const ua = String(userAgent ?? "");
  if (!ua) return null;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Chrome\/|CriOS/.test(ua)
        ? "Chrome"
        : /Firefox\/|FxiOS/.test(ua)
          ? "Firefox"
          : /Safari\//.test(ua)
            ? "Safari"
            : null;
  const os = /Windows NT/.test(ua)
    ? "Windows"
    : /iPhone|iPad|iPod/.test(ua)
      ? "iOS"
      : /Android/.test(ua)
        ? "Android"
        : /Macintosh|Mac OS X/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : null;
  const label = [browser, os].filter(Boolean).join(" · ");
  return label || null;
}

function expiresAt() {
  return new Date(Date.now() + SESSION_TTL_SEC * 1000).toISOString();
}

/** Trims the session list: expired rows go, then the oldest overflow is revoked. */
function pruneSessions(userId) {
  const rows = all("auth_sessions", "user_id = ?", [userId], { order: "created_at DESC" });
  const now = Date.now();
  for (const row of rows) {
    if (row.revoked_at) continue;
    if (row.expires_at && Date.parse(row.expires_at) < now) {
      update("auth_sessions", row.id, { revoked_at: nowIso(), revoked_reason: "expired" });
    }
  }
  const active = rows.filter((row) => !row.revoked_at && (!row.expires_at || Date.parse(row.expires_at) >= now));
  for (const row of active.slice(MAX_SESSIONS_PER_USER)) {
    update("auth_sessions", row.id, { revoked_at: nowIso(), revoked_reason: "too_many_sessions" });
  }
}

/** Opens a session for one device and returns it (the caller signs a token with its id). */
export function createSession({ userId, ip = null, userAgent = null }) {
  pruneSessions(userId);
  return insert("auth_sessions", {
    user_id: userId,
    label: deviceLabel(userAgent),
    ip: ip ? String(ip).slice(0, 60) : null,
    user_agent: userAgent ? String(userAgent).slice(0, 300) : null,
    last_seen_at: nowIso(),
    expires_at: expiresAt(),
  });
}

/** True when the session exists, belongs to the user and is still usable. */
export function isSessionActive(sessionId, userId) {
  const row = getById("auth_sessions", sessionId);
  if (!row || row.user_id !== userId) return false;
  if (row.revoked_at) return false;
  if (row.expires_at && Date.parse(row.expires_at) < Date.now()) return false;
  return true;
}

/** Throttled `last_seen_at` so every request does not turn into a write. */
export function touchSession(sessionId) {
  const last = LAST_TOUCH.get(sessionId) ?? 0;
  const now = Date.now();
  if (now - last < TOUCH_INTERVAL_MS) return;
  LAST_TOUCH.set(sessionId, now);
  try {
    update("auth_sessions", sessionId, { last_seen_at: nowIso() });
  } catch {
    /* the session disappeared between the check and the write */
  }
}

export function publicSession(row, currentSessionId = null) {
  return {
    id: row.id,
    label: row.label ?? null,
    ip: row.ip ?? null,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at ?? row.created_at,
    expiresAt: row.expires_at ?? null,
    current: currentSessionId ? row.id === currentSessionId : false,
  };
}

/** Active sessions, newest first, with the calling device marked. */
export function listSessions(userId, currentSessionId = null) {
  pruneSessions(userId);
  return all("auth_sessions", "user_id = ? AND revoked_at IS NULL", [userId], {
    order: "created_at DESC",
    limit: 50,
  }).map((row) => publicSession(row, currentSessionId));
}

export function activeSessionCount(userId) {
  return count("auth_sessions", "user_id = ? AND revoked_at IS NULL", [userId]);
}

/** Revokes one session. `userId` null = internal/system callers. */
export function revokeSession({ sessionId, userId = null, reason = "logout" }) {
  const row = getById("auth_sessions", sessionId);
  if (!row) return { ok: false, revoked: false };
  if (userId && row.user_id !== userId) return { ok: false, revoked: false };
  if (row.revoked_at) return { ok: true, revoked: false, alreadyRevoked: true };
  update("auth_sessions", row.id, { revoked_at: nowIso(), revoked_reason: reason });
  LAST_TOUCH.delete(row.id);
  return { ok: true, revoked: true };
}

/** "Đăng xuất mọi thiết bị khác" — keeps the calling device signed in. */
export function revokeOtherSessions({ userId, keepSessionId = null, reason = "revoked_by_user" }) {
  let revoked = 0;
  for (const row of all("auth_sessions", "user_id = ? AND revoked_at IS NULL", [userId])) {
    if (keepSessionId && row.id === keepSessionId) continue;
    update("auth_sessions", row.id, { revoked_at: nowIso(), revoked_reason: reason });
    LAST_TOUCH.delete(row.id);
    revoked += 1;
  }
  return { revoked };
}

/** Password change / admin action: every device has to sign in again. */
export function revokeAllSessions(userId, reason = "password_changed") {
  const { revoked } = revokeOtherSessions({ userId, keepSessionId: null, reason });
  return { revoked };
}
