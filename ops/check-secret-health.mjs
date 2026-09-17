#!/usr/bin/env node
/**
 * Chẩn đoán "mọi nhà cung cấp AI đều báo chưa có API key" trên production.
 *
 * NGUYÊN NHÂN ĐÃ GẶP (2026-09-18): `crypto.js` dẫn xuất khoá AES bằng
 * `scrypt(secret, SALT)` với SALT nằm trong code. Lần đổi tên thương hiệu đã đổi
 * `"flowgpt-secret-v1"` → `"fbuddy-secret-v1"`, tức **đổi khoá dẫn xuất dù biến môi
 * trường `*_SECRET` không đổi** ⇒ mọi API key đã lưu không giải mã được nữa, và
 * `decryptSecret()` trả `null` im lặng nên triệu chứng chỉ là "provider chưa có key".
 *
 * Script này phân biệt 3 tình trạng: giải mã được bằng khoá HIỆN TẠI · chỉ giải mã
 * được bằng khoá CŨ (cần mã hoá lại) · không giải mã được (thiếu secret cũ).
 *
 *   set -a; . /etc/fbuddy/fbuddy.env; set +a
 *   node ops/check-secret-health.mjs
 *   node ops/check-secret-health.mjs --secret-from /etc/flowgpt/flowgpt.env   # thử secret cũ
 */
import fs from "node:fs";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";

const args = process.argv.slice(2);
const valueOf = (name, fallback = null) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1] ?? null;
};

const secretFrom = valueOf("secret-from");
if (secretFrom) {
  if (!fs.existsSync(secretFrom)) {
    console.error(`Không thấy file env: ${secretFrom}`);
    process.exit(2);
  }
  const match = /^\s*(?:FBUDDY|FLOWGPT)_SECRET\s*=\s*(.+)\s*$/m.exec(fs.readFileSync(secretFrom, "utf8"));
  if (!match) {
    console.error(`Không thấy dòng *_SECRET trong ${secretFrom}`);
    process.exit(2);
  }
  // Đặt TRƯỚC khi import config.js vì config đọc env lúc import.
  process.env.FBUDDY_SECRET = match[1].trim().replace(/^["']|["']$/g, "");
  console.log(`\n(Secret lấy từ ${secretFrom} — chỉ cho lần chạy này, không sửa service)`);
}

const dbPath = String(valueOf("db", process.env.FBUDDY_DB ?? process.env.FLOWGPT_DB ?? "/var/lib/fbuddy/fbuddy.db"));
if (!fs.existsSync(dbPath)) {
  console.error(`Không thấy CSDL: ${dbPath}\nĐặt đường dẫn bằng --db hoặc FBUDDY_DB=...`);
  process.exit(2);
}

let decryptSecretInfo;
let config;
try {
  ({ decryptSecretInfo } = await import("../server/src/crypto.js"));
  ({ config } = await import("../server/src/config.js"));
} catch (error) {
  console.error(`Không nạp được module: ${error.message}`);
  console.error("Nhớ nạp biến môi trường trước:  set -a; . /etc/fbuddy/fbuddy.env; set +a");
  process.exit(2);
}

const fingerprint = (value) => crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 16);
const BLOB = /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

console.log(`\n== Sức khoẻ khoá mã hoá ==`);
console.log(`CSDL:            ${dbPath}`);
console.log(`Vân tay secret:  ${fingerprint(config.secret)} (không in secret)`);
console.log(`Secret cũ khai báo: ${process.env.FBUDDY_LEGACY_SECRET || process.env.FLOWGPT_SECRET ? "có" : "không"}\n`);

const db = new DatabaseSync(dbPath, { readOnly: true });
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name);

const found = [];
for (const table of tables) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((col) => col.name);
  for (const column of columns.filter((name) => name.endsWith("_enc"))) {
    for (const row of db.prepare(`SELECT rowid AS rid, ${column} AS blob FROM ${table} WHERE ${column} IS NOT NULL`).all()) {
      if (BLOB.test(String(row.blob))) found.push({ label: `${table}.${column}`, blob: row.blob });
    }
  }
  if (columns.includes("key") && columns.includes("value_json")) {
    for (const row of db.prepare(`SELECT key, value_json FROM ${table}`).all()) {
      let blob = null;
      try {
        blob = JSON.parse(row.value_json);
      } catch {
        continue;
      }
      if (typeof blob === "string" && BLOB.test(blob)) found.push({ label: `${table}.${row.key}`, blob });
    }
  }
}
db.close();

let current = 0;
let legacy = 0;
const unreadable = [];
for (const entry of found) {
  const info = decryptSecretInfo(entry.blob);
  if (!info.plain) {
    unreadable.push(entry.label);
    console.log(`  ✖ ${entry.label}: KHÔNG giải mã được`);
  } else if (info.legacy) {
    legacy += 1;
    console.log(`  ! ${entry.label}: đọc được bằng KHOÁ CŨ (cần mã hoá lại)`);
  } else {
    current += 1;
    console.log(`  ✔ ${entry.label}: khoá hiện tại`);
  }
}

console.log("");
if (!found.length) {
  console.log("CSDL chưa có giá trị mã hoá nào — không phải vấn đề khoá.");
} else if (!unreadable.length && !legacy) {
  console.log(`ĐẠT: ${current}/${found.length} giá trị dùng khoá hiện tại.`);
  console.log("Nếu app vẫn báo thiếu key thì key đã bị xoá/để trống, không phải sai khoá.");
} else if (!unreadable.length && legacy) {
  console.log(`TẠM ĐƯỢC: ${current} khoá hiện tại · ${legacy} còn ở khoá CŨ.`);
  console.log("App chạy được (nhờ đường tương thích), nhưng nên chuyển hết sang khoá mới:");
  console.log("    node ops/reencrypt-secrets.mjs --apply");
} else {
  console.log(`🚨 ${unreadable.length}/${found.length} giá trị KHÔNG giải mã được (${unreadable.join(", ")}).\n`);
  console.log(`Đúng dấu hiệu sự cố đổi tên: khoá dẫn xuất = scrypt(secret, SALT) và SALT đã đổi
theo tên thương hiệu ("flowgpt-secret-v1" → "fbuddy-secret-v1").

Cách xử lý:
  1. Code phải có đường tương thích: bản crypto.js hiện tại giữ LEGACY_SALTS để ĐỌC
     dữ liệu cũ (xem server/src/crypto.js). Nếu bản đang chạy chưa có, deploy bản đó.
  2. Nếu vẫn không đọc được thì secret cũng đã đổi — khai báo thêm secret cũ:
        FBUDDY_LEGACY_SECRET=<secret cũ> node ops/reencrypt-secrets.mjs --apply
     (secret cũ còn trong /etc/flowgpt/flowgpt.env nếu chưa bị ghi đè)
  3. Kiểm tra lại bằng chính script này; sau đó khởi động lại dịch vụ.
`);
}
process.exitCode = unreadable.length ? 2 : 0;
