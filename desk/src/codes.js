import crypto from "node:crypto";
import { config } from "./config.js";
import { all, get, run, withTransaction, audit } from "./db.js";
import { hmacHex, newId, nowIso, badRequest, notFound } from "./util.js";

/**
 * Mã kích hoạt (activation code).
 *
 *  - Sinh từ bảng chữ Crockford base32 (bỏ I, L, O, U) nên đọc qua điện thoại
 *    không lẫn; định dạng `FBW-XXXX-XXXX-XXXX` = 60 bit.
 *  - CHỈ lưu HMAC-SHA256 của mã. Không có cách nào đọc ngược mã từ DB.
 *  - Mỗi (user, đơn) có đúng MỘT mã còn hiệu lực; phát mã mới = thu hồi mã cũ.
 *  - Mã dùng được cho tối đa `DESK_MAX_DEVICES_PER_CODE` thiết bị; hết hạn sau
 *    `DESK_CODE_TTL_DAYS` ngày. Mọi lần phát/thu hồi/dùng đều vào `desk_audit`.
 */

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const CODE_PREFIX = "FBW";
export const CODE_LENGTH = 12;

export function generateCode() {
  let body = "";
  for (let i = 0; i < CODE_LENGTH; i += 1) body += ALPHABET[crypto.randomInt(0, ALPHABET.length)];
  return `${CODE_PREFIX}-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}`;
}

/** Chuẩn hoá input người dùng dán vào (khoảng trắng, gạch, nhầm O/0, I/1). */
export function normalizeCode(input) {
  let raw = String(input ?? "")
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "");
  if (raw.startsWith(CODE_PREFIX)) raw = raw.slice(CODE_PREFIX.length);
  return raw.replace(/O/g, "0").replace(/[IL]/g, "1");
}

export function isWellFormedCode(input) {
  const raw = normalizeCode(input);
  if (raw.length !== CODE_LENGTH) return false;
  return [...raw].every((char) => ALPHABET.includes(char));
}

export function hashCode(code) {
  return hmacHex(config.secret, `invite:${normalizeCode(code)}`);
}

function codeHint(code) {
  return normalizeCode(code).slice(-4);
}

export function publicInvitation(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    email: row.email ?? null,
    orderId: row.order_id ?? null,
    codeHint: row.code_hint,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at ?? null,
    revokeReason: row.revoke_reason ?? null,
    uses: Number(row.uses ?? 0),
    maxUses: Number(row.max_uses ?? 0),
    lastUsedAt: row.last_used_at ?? null,
  };
}

export function getInvitation(id) {
  return get("SELECT * FROM desk_invitations WHERE id = ?", id);
}

export function findInvitationByCode(code) {
  return get("SELECT * FROM desk_invitations WHERE code_hash = ? LIMIT 1", hashCode(code));
}

/** Mã còn hiệu lực cho (user, đơn) — dùng để không phát trùng. */
export function activeInvitation({ userId, orderId = null }) {
  return get(
    `SELECT * FROM desk_invitations
      WHERE user_id = ? AND IFNULL(order_id, '') = IFNULL(?, '') AND revoked_at IS NULL
      ORDER BY issued_at DESC LIMIT 1`,
    userId,
    orderId,
  );
}

export function revokeInvitation({ id, reason = "revoked", actor = "admin" }) {
  const row = getInvitation(id);
  if (!row) throw notFound("Không tìm thấy mã kích hoạt");
  if (row.revoked_at) return publicInvitation(row);
  run("UPDATE desk_invitations SET revoked_at = ?, revoke_reason = ?, updated_at = ? WHERE id = ?", nowIso(), reason, nowIso(), id);
  audit("invitation_revoked", { userId: row.user_id, invitationId: id, detail: { reason, actor } });
  return publicInvitation(getInvitation(id));
}

/**
 * Phát (hoặc xoay) mã cho một user đã có đơn `paid`.
 *
 * Trả về mã gốc ĐÚNG MỘT LẦN — sau đó chỉ còn `codeHint`. Vì vậy email là kênh
 * chính; trang `?view=desktop` muốn hiện lại mã thì gọi lại hàm này (mã cũ bị thu hồi).
 */
export function issueInvitation({ userId, email = null, orderId = null, actor = "system", reason = "issued" }) {
  if (!userId) throw badRequest("Thiếu userId");
  const ttlDays = Math.max(1, config.codeTtlDays);
  const maxUses = Math.max(1, config.maxDevicesPerCode);
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();

  return withTransaction(() => {
    // Mã cũ của cùng (user, đơn) bị thu hồi trước khi phát mã mới.
    run(
      `UPDATE desk_invitations SET revoked_at = ?, revoke_reason = 'rotated', updated_at = ?
        WHERE user_id = ? AND IFNULL(order_id, '') = IFNULL(?, '') AND revoked_at IS NULL`,
      nowIso(),
      nowIso(),
      userId,
      orderId,
    );

    let code = generateCode();
    for (let attempt = 0; attempt < 5 && get("SELECT 1 AS x FROM desk_invitations WHERE code_hash = ?", hashCode(code)); attempt += 1) {
      code = generateCode();
    }
    const id = newId("inv");
    const now = nowIso();
    run(
      `INSERT INTO desk_invitations
         (id, user_id, email, order_id, code_hash, code_hint, issued_at, expires_at, uses, max_uses, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      id,
      userId,
      email,
      orderId,
      hashCode(code),
      codeHint(code),
      now,
      expiresAt,
      maxUses,
      now,
      now,
    );
    audit("invitation_issued", { userId, invitationId: id, detail: { orderId, actor, reason, ttlDays, maxUses } });
    return { invitation: publicInvitation(getInvitation(id)), code };
  });
}

/** Kiểm tra một mã có dùng được không (không tiêu hao lượt). */
export function checkInvitation(row, now = Date.now()) {
  if (!row) return { ok: false, reason: "not_found" };
  if (row.revoked_at) return { ok: false, reason: "revoked" };
  if (Date.parse(row.expires_at) <= now) return { ok: false, reason: "expired" };
  if (Number(row.uses ?? 0) >= Number(row.max_uses ?? 0)) return { ok: false, reason: "exhausted" };
  return { ok: true, reason: null };
}

/** Ghi nhận một lượt dùng (đã kiểm tra quyền trước đó). */
export function consumeInvitationUse(id) {
  run("UPDATE desk_invitations SET uses = uses + 1, last_used_at = ?, updated_at = ? WHERE id = ?", nowIso(), nowIso(), id);
  return getInvitation(id);
}

export function listInvitations({ userId = null, limit = 50 } = {}) {
  const capped = Math.max(1, Math.min(200, Number(limit) || 50));
  const rows = userId
    ? all("SELECT * FROM desk_invitations WHERE user_id = ? ORDER BY issued_at DESC LIMIT ?", userId, capped)
    : all("SELECT * FROM desk_invitations ORDER BY issued_at DESC LIMIT ?", capped);
  return rows.map(publicInvitation);
}

/** Số lượt kích hoạt thất bại gần đây của một IP (để chặn dò mã). */
export function failedAttemptsByIp(ip, sinceIso) {
  const row = get(
    `SELECT COUNT(*) AS n FROM desk_audit
      WHERE action = 'activation_failed' AND ip = ? AND created_at >= ?`,
    ip,
    sinceIso,
  );
  return Number(row?.n ?? 0);
}
