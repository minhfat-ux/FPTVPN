import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config.js";

/**
 * Quyền sử dụng bản Windows = có ít nhất một đơn nạp token `status = 'paid'`
 * trong DB của fBuddy.
 *
 * Nguyên tắc:
 *  - CHỈ ĐỌC. Kết nối mở ở chế độ read-only; nếu môi trường không cho (SQLite WAL
 *    đôi khi cần tạo file `-shm`), mở bình thường rồi khoá bằng `PRAGMA query_only`.
 *  - Hỏng nguồn quyền ⇒ ĐÓNG (không cấp quyền), và `/health` báo rõ. Không bao
 *    giờ "mở tạm cho khách dùng" khi không đọc được DB.
 *  - Không cache kết quả: một đơn vừa được duyệt phải có hiệu lực ngay.
 */

let handle = null;

function connect() {
  if (handle) return handle;
  const file = config.fbuddyDbFile;
  if (!fs.existsSync(file)) {
    handle = { db: null, error: "fbuddy_db_missing", file };
    return handle;
  }
  try {
    handle = { db: new DatabaseSync(file, { readOnly: true }), error: null, file };
  } catch (err) {
    try {
      const db = new DatabaseSync(file);
      db.exec("PRAGMA query_only = ON;");
      handle = { db, error: null, file, note: `readOnly_mở_không_được: ${err?.message ?? err}` };
    } catch (err2) {
      handle = { db: null, error: `fbuddy_db_unreadable: ${err2?.message ?? err2}`, file };
    }
  }
  if (handle.db) {
    try {
      handle.db.exec("PRAGMA busy_timeout = 5000;");
    } catch {
      /* pragma chỉ là tối ưu */
    }
  }
  return handle;
}

/** Đóng kết nối (test dùng để trỏ sang DB khác). */
export function closeEntitlement() {
  try {
    handle?.db?.close();
  } catch {
    /* đã đóng */
  }
  handle = null;
}

export function entitlementStatus() {
  const { db, error, file, note } = connect();
  if (!db) return { available: false, file, error };
  try {
    const hasTable = Boolean(
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'topup_orders'").get(),
    );
    return { available: hasTable, file, error: hasTable ? null : "topup_orders_missing", note: note ?? null };
  } catch (err) {
    return { available: false, file, error: `fbuddy_db_query_failed: ${err?.message ?? err}` };
  }
}

function publicOrder(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    email: row.email ?? null,
    packageName: row.package_name ?? null,
    tokens: Number(row.tokens ?? 0),
    amountVnd: Number(row.amount_vnd ?? 0),
    paidAt: row.paid_at ?? null,
    confirmedBy: row.confirmed_by ?? null,
  };
}

/**
 * Đơn đã trả tiền gần nhất của user (hoặc đúng `orderId` nếu được chỉ định).
 * `orderId` chỉ được coi là hợp lệ khi nó thuộc chính user đó.
 */
export function paidOrder({ userId, orderId = null }) {
  const { db } = connect();
  if (!db || !userId) return null;
  try {
    if (orderId) {
      const row = db
        .prepare("SELECT * FROM topup_orders WHERE id = ? AND user_id = ? AND status = 'paid' LIMIT 1")
        .get(String(orderId), String(userId));
      if (row) return publicOrder(row);
    }
    const row = db
      .prepare(
        "SELECT * FROM topup_orders WHERE user_id = ? AND status = 'paid' ORDER BY COALESCE(paid_at, created_at) DESC LIMIT 1",
      )
      .get(String(userId));
    return publicOrder(row);
  } catch {
    return null;
  }
}

/**
 * Kết quả quyết định quyền — luôn kèm lý do để log/audit đọc được.
 * `source` cho biết vì sao bị từ chối, KHÔNG trả ra client.
 */
export function entitlementFor({ userId, orderId = null }) {
  const status = entitlementStatus();
  if (!status.available) return { entitled: false, order: null, reason: status.error ?? "entitlement_unavailable" };
  if (!userId) return { entitled: false, order: null, reason: "missing_user" };
  const order = paidOrder({ userId, orderId });
  if (!order) return { entitled: false, order: null, reason: orderId ? "order_not_paid" : "no_paid_order" };
  return { entitled: true, order, reason: null };
}

export function userById(userId) {
  const { db } = connect();
  if (!db || !userId) return null;
  try {
    const row = db.prepare("SELECT id, email, name, role FROM users WHERE id = ? LIMIT 1").get(String(userId));
    return row ? { id: row.id, email: row.email ?? null, name: row.name ?? null, role: row.role ?? "user" } : null;
  } catch {
    return null;
  }
}

export function userByEmail(email) {
  const { db } = connect();
  if (!db || !email) return null;
  try {
    const row = db
      .prepare("SELECT id, email, name, role FROM users WHERE lower(email) = lower(?) LIMIT 1")
      .get(String(email));
    return row ? { id: row.id, email: row.email ?? null, name: row.name ?? null, role: row.role ?? "user" } : null;
  } catch {
    return null;
  }
}


