#!/usr/bin/env node
/**
 * Mã hoá lại toàn bộ secret trong CSDL sang khoá hiện tại.
 *
 * Vì sao cần: lần đổi tên thương hiệu đã đổi SALT trong `crypto.js`
 * (`flowgpt-secret-v1` → `fbuddy-secret-v1`), nên khoá AES dẫn xuất thay đổi và mọi
 * credential đã lưu thuộc "khoá cũ". `decryptSecret()` nay đọc được cả khoá cũ, nhưng
 * đó chỉ là đường tương thích — chạy script này để chuyển hết sang khoá mới rồi mới
 * được phép xoá `LEGACY_SALTS` trong `crypto.js`.
 *
 *   set -a; . /etc/fbuddy/fbuddy.env; set +a
 *   node ops/reencrypt-secrets.mjs              # xem trước, KHÔNG ghi
 *   node ops/reencrypt-secrets.mjs --apply      # ghi thật
 *
 * Nếu một phần dữ liệu mã hoá bằng SECRET cũ (không chỉ salt cũ) thì phải khai báo
 * thêm secret đó, nếu không script sẽ báo "không giải mã được":
 *   FBUDDY_LEGACY_SECRET=<secret cũ> node ops/reencrypt-secrets.mjs --apply
 */
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";

const APPLY = process.argv.includes("--apply");
const dbArgIndex = process.argv.indexOf("--db");
const DB = String(
  dbArgIndex !== -1 ? process.argv[dbArgIndex + 1] : process.env.FBUDDY_DB ?? process.env.FLOWGPT_DB ?? "/var/lib/fbuddy/fbuddy.db",
);
const BLOB = /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

if (!fs.existsSync(DB)) {
  console.error(`Không thấy CSDL: ${DB}\nĐặt đường dẫn bằng --db hoặc FBUDDY_DB=...`);
  process.exit(2);
}

const { decryptSecretInfo, encryptSecret } = await import("../server/src/crypto.js");
const hasLegacySecret = Boolean(process.env.FBUDDY_LEGACY_SECRET || process.env.FLOWGPT_SECRET);
console.log(`\n== Mã hoá lại secret (${APPLY ? "GHI THẬT" : "xem trước"}) ==`);
console.log(`CSDL: ${DB}`);
console.log(`Secret cũ khai báo: ${hasLegacySecret ? "có" : "không (chỉ đọc được phần cùng secret, khác salt)"}\n`);

const db = new DatabaseSync(DB);
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name);

const targets = [];

// 1) Cột kiểu `*_enc` (ví dụ providers.api_key_enc, mcp_servers.*_enc).
for (const table of tables) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((col) => col.name);
  for (const column of columns.filter((name) => name.endsWith("_enc"))) {
    for (const row of db.prepare(`SELECT rowid AS rid, ${column} AS blob FROM ${table} WHERE ${column} IS NOT NULL`).all()) {
      if (!BLOB.test(String(row.blob))) continue;
      targets.push({ table, column, rid: row.rid, blob: row.blob, label: `${table}#${row.rid}.${column}` });
    }
  }
  // 2) `app_settings` giấu blob trong `value_json` dưới khoá kiểu `resendApiKeyEnc`.
  if (columns.includes("key") && columns.includes("value_json")) {
    for (const row of db.prepare(`SELECT key, value_json FROM ${table}`).all()) {
      let blob = null;
      try {
        blob = JSON.parse(row.value_json);
      } catch {
        continue;
      }
      if (typeof blob !== "string" || !BLOB.test(blob)) continue;
      targets.push({ table, column: "value_json", key: row.key, blob, label: `${table}.${row.key}` });
    }
  }
}

let legacy = 0;
let unreadable = 0;
let migrated = 0;

for (const target of targets) {
  const info = decryptSecretInfo(target.blob);
  if (!info.plain) {
    unreadable += 1;
    console.log(`  ✖ ${target.label}: KHÔNG giải mã được (thiếu secret cũ?)`);
    continue;
  }
  if (!info.legacy) {
    console.log(`  · ${target.label}: đã ở khoá hiện tại`);
    continue;
  }
  legacy += 1;
  if (!APPLY) {
    console.log(`  → ${target.label}: sẽ mã hoá lại sang khoá hiện tại`);
    continue;
  }
  const next = encryptSecret(info.plain);
  if (target.key !== undefined) {
    db.prepare(`UPDATE ${target.table} SET value_json = ? WHERE key = ?`).run(JSON.stringify(next), target.key);
  } else {
    db.prepare(`UPDATE ${target.table} SET ${target.column} = ? WHERE rowid = ?`).run(next, target.rid);
  }
  migrated += 1;
  console.log(`  ✔ ${target.label}: đã mã hoá lại`);
}
db.close();

console.log(
  `\nTổng ${targets.length} giá trị mã hoá · ${legacy} thuộc khoá cũ` +
    (APPLY ? ` · đã chuyển ${migrated}` : " · chưa ghi gì (thêm --apply)") +
    (unreadable ? ` · ${unreadable} KHÔNG đọc được` : "") +
    "\n",
);
if (unreadable) console.log("Dữ liệu không đọc được cần secret cũ: FBUDDY_LEGACY_SECRET=<secret cũ>\n");
process.exitCode = unreadable ? 2 : 0;
