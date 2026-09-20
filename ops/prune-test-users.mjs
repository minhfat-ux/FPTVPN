#!/usr/bin/env node
/**
 * Deletes throwaway accounts (and every row they own) created by the verification
 * scripts `ops/credit-explain-check.mjs` and `ops/ui-i18n-check.mjs`.
 *
 *   node ops/prune-test-users.mjs                      # xem trước (mặc định, không xoá)
 *   node ops/prune-test-users.mjs --apply              # xoá thật
 *   node ops/prune-test-users.mjs --apply --like=smoke+%
 *
 * Chạy trên server (đọc trực tiếp SQLite). Đây là dọn dẹp THẬT SỰ: xoá cả
 * conversations/messages/credit_ledger/audit của tài khoản test, không chỉ hàng users.
 */

import { DatabaseSync } from "node:sqlite";

const APPLY = process.argv.includes("--apply");
const PATTERNS = process.argv
  .filter((a) => a.startsWith("--like="))
  .map((a) => a.slice("--like=".length));
const patternsDefault = [
  "credit-explain+%",
  "apps-explain+%",
  "i18n-ui+%",
  "skills-check+%",
  "mobile-check+%",
  "sessions-check+%",
  "choice-e2e+%",
  "ocr-e2e+%",
  "tap-probe+%",
  "sepay-e2e+%",
  "smoke+%@fbuddy.local",
];
const patterns = PATTERNS.length ? PATTERNS : patternsDefault;
// Đường dẫn CSDL. Tên mới là FBUDDY_DB / fbuddy.db; FLOWGPT_DB và đường dẫn
// /var/lib/flowgpt vẫn được nhận trong lúc production chưa migrate (xem
// docs/RENAME-FBUDDY.md).
const DB = process.env.FBUDDY_DB ?? process.env.FLOWGPT_DB ?? "/var/lib/fbuddy/fbuddy.db";

const db = new DatabaseSync(DB);
const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table'")
  .all()
  .map((row) => row.name);

let accounts = 0;
for (const pattern of patterns) {
  const users = db.prepare("SELECT id, email FROM users WHERE email LIKE ?").all(pattern);
  for (const user of users) {
    accounts += 1;
    const conversationIds = db.prepare("SELECT id FROM conversations WHERE user_id = ?").all(user.id).map((r) => r.id);
    console.log(`\n${user.email} (${user.id}) — ${conversationIds.length} hội thoại`);
    for (const table of tables) {
      const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
      let removed = 0;
      if (columns.includes("user_id")) {
        removed += APPLY
          ? db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(user.id).changes
          : db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`).get(user.id).n;
      }
      for (const id of conversationIds) {
        if (!columns.includes("conversation_id")) continue;
        removed += APPLY
          ? db.prepare(`DELETE FROM ${table} WHERE conversation_id = ?`).run(id).changes
          : db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE conversation_id = ?`).get(id).n;
      }
      if (removed) console.log(`  ${APPLY ? "đã xoá" : "sẽ xoá"} ${removed} dòng ở ${table}`);
    }
    // `users` has an `id` column, not `user_id`, so it is handled explicitly.
    if (APPLY) db.prepare("DELETE FROM users WHERE id = ?").run(user.id);
  }
}

const orphans = db
  .prepare("SELECT COUNT(*) AS n FROM credit_ledger WHERE user_id NOT IN (SELECT id FROM users)")
  .get().n;
console.log(
  `\n${APPLY ? `Đã xoá ${accounts} tài khoản test.` : `Chạy lại với --apply để xoá thật ${accounts} tài khoản.`}` +
    `\nTài khoản còn lại trong DB: ${db.prepare("SELECT COUNT(*) AS n FROM users").get().n}` +
    ` (bút toán credit mồ côi: ${orphans}).`,
);
