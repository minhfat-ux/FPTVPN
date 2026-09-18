/**
 * Cột bổ sung cho tính năng mới, tách khỏi `db.js` (`ADDED_COLUMNS`) vì file đó đang
 * được một phiên khác sửa. Idempotent — chạy lại vô hại.
 *
 *   hub_skills.i18n_json : bản dịch tên/mô tả/chỉ dẫn theo ngôn ngữ, dạng
 *                          `{ en: { name, tagline, description, instructions }, zh: {…} }`.
 *                          Bản gốc trong các cột thường là tiếng Việt.
 *   users.locale         : ngôn ngữ người dùng chọn (vi/en/zh) — để lượt chat lấy đúng
 *                          bản chỉ dẫn của kỹ năng.
 *
 * Khi `db.js` rảnh thì gộp hai dòng dưới vào `ADDED_COLUMNS` rồi xoá file này.
 */
import { db } from "./db.js";

const COLUMNS = [
  { table: "hub_skills", column: "i18n_json", definition: "TEXT" },
  { table: "users", column: "locale", definition: "TEXT" },
];

export function ensureExtraColumns() {
  const added = [];
  for (const { table, column, definition } of COLUMNS) {
    const exists = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
      .get(table);
    if (!exists) continue;
    const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name);
    if (columns.includes(column)) continue;
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    added.push(`${table}.${column}`);
  }
  return added;
}
