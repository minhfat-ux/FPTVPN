import { config } from "./config.js";
import { all, get, run, audit } from "./db.js";
import { base64url, fromBase64url, hmacHex, nowIso, safeEqual, unauthorized } from "./util.js";

/**
 * Token phiên của app Windows.
 *
 * Token chỉ là "chứng minh" — quyền thật nằm ở dòng `desk_activations`: token
 * mang `aid`, và mỗi lần dùng đều tra lại dòng đó. Nhờ vậy thu hồi một thiết bị
 * có hiệu lực ngay, không phải chờ token hết hạn.
 *
 * Token ngắn hạn (mặc định 45 phút) + `/v1/desktop/session` để gia hạn. App
 * KHÔNG bao giờ giữ key Soniox/OpenRouter — chỉ giữ token này.
 */

const TOKEN_VERSION = "d1";

function sign(payloadB64) {
  return base64url(hmacHex(config.secret, `session:${payloadB64}`));
}

export function issueSession({ activationId, userId, ttlMin = config.sessionTtlMin }) {
  const iat = Date.now();
  const ttl = Math.max(1, Number(ttlMin) || config.sessionTtlMin);
  const exp = iat + ttl * 60 * 1000;
  const payload = { v: TOKEN_VERSION, aid: activationId, uid: userId, iat, exp };
  const payloadB64 = base64url(JSON.stringify(payload));
  return {
    token: `${payloadB64}.${sign(payloadB64)}`,
    expiresAt: new Date(exp).toISOString(),
    expiresInSec: Math.round((exp - iat) / 1000),
    activationId,
    userId,
  };
}

export function verifySessionToken(token) {
  const raw = String(token ?? "").trim();
  const [payloadB64, signature] = raw.split(".");
  if (!payloadB64 || !signature) return { ok: false, reason: "malformed" };
  if (!safeEqual(signature, sign(payloadB64))) return { ok: false, reason: "bad_signature" };
  let payload = null;
  try {
    payload = JSON.parse(fromBase64url(payloadB64).toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (payload?.v !== TOKEN_VERSION || !payload.aid) return { ok: false, reason: "malformed" };
  if (!Number.isFinite(payload.exp) || payload.exp <= Date.now()) return { ok: false, reason: "expired" };
  return { ok: true, payload };
}

export function getActivation(id) {
  return get("SELECT * FROM desk_activations WHERE id = ?", id);
}

export function publicActivation(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    orderId: row.order_id ?? null,
    deviceId: row.device_id ?? null,
    deviceLabel: row.device_label ?? null,
    activatedAt: row.activated_at,
    lastSeenAt: row.last_seen_at,
    revokedAt: row.revoked_at ?? null,
    revokeReason: row.revoke_reason ?? null,
    ip: row.ip ?? null,
  };
}

/**
 * Xác thực token → dòng activation còn sống. Ném 401 (không lộ lý do cụ thể
 * ra ngoài, chỉ ghi audit) nếu token sai/hết hạn/đã thu hồi.
 */
export function requireActivation(token, { ip = null, action = "session_auth" } = {}) {
  const verified = verifySessionToken(token);
  if (!verified.ok) {
    audit(`${action}_failed`, { ip, detail: { reason: verified.reason } });
    throw unauthorized("Token phiên không hợp lệ hoặc đã hết hạn", `session_${verified.reason}`);
  }
  const row = getActivation(verified.payload.aid);
  if (!row || row.revoked_at || row.user_id !== verified.payload.uid) {
    audit(`${action}_failed`, {
      ip,
      activationId: verified.payload.aid,
      userId: verified.payload.uid,
      detail: { reason: row ? "revoked" : "unknown_activation" },
    });
    throw unauthorized("Thiết bị đã bị thu hồi quyền", "activation_revoked");
  }
  return row;
}

/** Gia hạn token — chỉ khi thiết bị chưa bị thu hồi. */
export function refreshSession(token, opts = {}) {
  const row = requireActivation(token, { ...opts, action: "session_refresh" });
  touchActivation(row.id);
  const session = issueSession({ activationId: row.id, userId: row.user_id });
  audit("session_refreshed", { userId: row.user_id, activationId: row.id, ip: opts.ip ?? null });
  return { session, activation: publicActivation(row) };
}

export function revokeActivation({ id, reason = "revoked", actor = "admin" }) {
  const row = getActivation(id);
  if (!row) return null;
  if (row.revoked_at) return publicActivation(row);
  run("UPDATE desk_activations SET revoked_at = ?, revoked_reason = ?, updated_at = ? WHERE id = ?", nowIso(), reason, nowIso(), id);
  audit("activation_revoked", { userId: row.user_id, activationId: id, detail: { reason, actor } });
  return publicActivation(getActivation(id));
}

export function listActivations({ userId = null, invitationId = null, limit = 100 } = {}) {
  const capped = Math.max(1, Math.min(500, Number(limit) || 100));
  const clauses = [];
  const params = [];
  if (userId) {
    clauses.push("user_id = ?");
    params.push(userId);
  }
  if (invitationId) {
    clauses.push("invitation_id = ?");
    params.push(invitationId);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return all(`SELECT * FROM desk_activations ${where} ORDER BY activated_at DESC LIMIT ?`, ...params, capped).map(
    publicActivation,
  );
}

/** Cập nhật `last_seen_at` nhưng tối đa 1 lần/phút để không ghi DB liên tục. */
export function touchActivation(id) {
  const row = getActivation(id);
  if (!row) return;
  const last = Date.parse(row.last_seen_at ?? 0);
  if (Number.isFinite(last) && Date.now() - last < 60_000) return;
  run("UPDATE desk_activations SET last_seen_at = ?, updated_at = ? WHERE id = ?", nowIso(), nowIso(), id);
}
