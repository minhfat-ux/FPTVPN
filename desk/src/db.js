import { DatabaseSync } from "node:sqlite";
import { config, ensureDirs } from "./config.js";
import { nowIso } from "./util.js";

/**
 * DB riêng của flowdesk (`desk.db`).
 *
 * Cố ý KHÔNG dùng chung file với `fbuddy.db`: service này phát mã kích hoạt và
 * ghi log sử dụng, nên nó cần quyền ghi — mà quyền ghi vào DB của app đang chạy
 * là thứ tuyệt đối tránh. Quyền sử dụng thì đọc từ `fbuddy.db` qua kết nối
 * read-only (xem `entitlement.js`).
 */

const SCHEMA = `
-- Một mã kích hoạt đã phát cho một user (gắn với một đơn đã trả tiền nếu có).
-- Chỉ lưu HMAC của mã, KHÔNG lưu mã gốc: mất DB cũng không lộ mã của khách.
CREATE TABLE IF NOT EXISTS desk_invitations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  email TEXT,
  order_id TEXT,
  code_hash TEXT NOT NULL,
  code_hint TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  revoke_reason TEXT,
  uses INTEGER NOT NULL DEFAULT 0,
  max_uses INTEGER NOT NULL DEFAULT 3,
  last_used_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_desk_invitations_user ON desk_invitations(user_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_desk_invitations_hash ON desk_invitations(code_hash);

-- Một dòng cho mỗi thiết bị đã kích hoạt. Đây là thứ thu hồi được: token phiên
-- chỉ có giá trị khi dòng tương ứng chưa bị revoked.
CREATE TABLE IF NOT EXISTS desk_activations (
  id TEXT PRIMARY KEY,
  invitation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  order_id TEXT,
  code_hash TEXT NOT NULL,
  device_id TEXT,
  device_label TEXT,
  activated_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  revoked_at TEXT,
  revoked_reason TEXT,
  ip TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_desk_activations_user ON desk_activations(user_id, activated_at DESC);
CREATE INDEX IF NOT EXISTS idx_desk_activations_invitation ON desk_activations(invitation_id);
CREATE INDEX IF NOT EXISTS idx_desk_activations_device ON desk_activations(invitation_id, device_id);

-- Đếm mức dùng để áp hạn mức audio/tháng (lớp WS proxy ghi vào, xem §3.5).
CREATE TABLE IF NOT EXISTS desk_usage (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  activation_id TEXT,
  kind TEXT NOT NULL,
  seconds REAL NOT NULL DEFAULT 0,
  bytes INTEGER NOT NULL DEFAULT 0,
  tokens INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_desk_usage_user ON desk_usage(user_id, created_at DESC);

-- Nhật ký mọi lần cấp quyền / thu hồi / kích hoạt thất bại.
CREATE TABLE IF NOT EXISTS desk_audit (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  user_id TEXT,
  invitation_id TEXT,
  activation_id TEXT,
  ip TEXT,
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_desk_audit_created ON desk_audit(created_at DESC);
`;

ensureDirs();
export const db = new DatabaseSync(config.dbFile);

export function initDb() {
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA busy_timeout = 5000;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  return db;
}

/** Chạy trong một transaction — dùng cho các bước phải "hoặc cùng xong, hoặc không". */
export function withTransaction(fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* transaction đã bị đóng */
    }
    throw err;
  }
}

export function run(sql, ...params) {
  return db.prepare(sql).run(...params);
}

export function get(sql, ...params) {
  return db.prepare(sql).get(...params) ?? null;
}

export function all(sql, ...params) {
  return db.prepare(sql).all(...params);
}

/** Audit không bao giờ được làm gãy đường request. */
export function audit(action, { userId = null, invitationId = null, activationId = null, ip = null, detail = {} } = {}) {
  try {
    run(
      `INSERT INTO desk_audit (id, action, user_id, invitation_id, activation_id, ip, detail_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      `aud_${Math.random().toString(16).slice(2, 14)}${Date.now().toString(16)}`,
      action,
      userId,
      invitationId,
      activationId,
      ip,
      JSON.stringify(detail ?? {}),
      nowIso(),
    );
  } catch {
    /* bỏ qua */
  }
}

export function recentAudit(limit = 50) {
  return all(`SELECT * FROM desk_audit ORDER BY created_at DESC LIMIT ?`, Math.max(1, Math.min(500, limit)));
}
