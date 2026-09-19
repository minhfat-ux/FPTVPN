#!/usr/bin/env node
/**
 * Áp phân loại chợ kỹ năng (kind + origin) từ `ops/hub-taxonomy.json` vào DB.
 *
 *   node ops/hub-taxonomy-apply.mjs            # chạy thử: chỉ in ra sẽ đổi gì
 *   node ops/hub-taxonomy-apply.mjs --apply    # ghi thật
 *   node ops/hub-taxonomy-apply.mjs --db /var/lib/fbuddy/fbuddy.db --apply
 *
 * Vì sao cần file này chứ không sửa tay trong DB: phân loại là DỮ LIỆU có ý nghĩa pháp lý
 * (origin=clone thì không được bán — docs/CONTENT-POLICY.md §3.1), nên nó phải nằm trong git,
 * xem lại được, và chạy lại được trên máy khác.
 *
 * An toàn: mục origin=clone mà đang có giá > 0 sẽ bị hạ về 0 và in ra danh sách — không để lại
 * trạng thái bán nội dung nguồn ngoài.
 */
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const value = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const DB = value("db", process.env.FBUDDY_DB || "/var/lib/fbuddy/fbuddy.db");
const FILE = value("file", path.join("ops", "hub-taxonomy.json"));

const taxonomy = JSON.parse(fs.readFileSync(FILE, "utf8"));
const own = new Set(taxonomy.own ?? []);
const experts = new Set(taxonomy.experts ?? []);

const db = new DatabaseSync(DB);
const columns = new Set(db.prepare("PRAGMA table_info(hub_skills)").all().map((row) => row.name));
for (const column of ["kind", "origin"]) {
  if (!columns.has(column)) {
    console.error(`! Bảng hub_skills chưa có cột \`${column}\`. Khởi động lại server một lần để nó tự thêm cột, rồi chạy lại.`);
    process.exit(1);
  }
}

const rows = db.prepare("SELECT id, slug, name, category, kind, origin, price_vnd FROM hub_skills ORDER BY slug").all();
const update = db.prepare("UPDATE hub_skills SET kind = ?, origin = ?, price_vnd = ?, price = ? WHERE id = ?");

let changed = 0;
let priceDropped = 0;
const missing = new Set([...own, ...experts]);
const seen = new Set();

console.log(`== Phân loại chợ kỹ năng — ${DB} ==`);
console.log(`Nguồn: ${FILE} · own=${own.size} · experts=${experts.size} · tổng mục trong DB=${rows.length}\n`);

for (const row of rows) {
  const origin = own.has(row.slug) ? "own" : "clone";
  const kind = experts.has(row.slug) ? "expert" : "skill";
  seen.add(row.slug);
  // Nội dung clone về không được bán: hạ giá ngay trong cùng lượt ghi.
  const priceVnd = origin === "clone" ? 0 : Number(row.price_vnd ?? 0);
  const dropped = origin === "clone" && Number(row.price_vnd ?? 0) > 0;
  const same = row.kind === kind && row.origin === origin && Number(row.price_vnd ?? 0) === priceVnd;
  const note = `${kind}/${origin}${dropped ? ` · HẠ GIÁ ${row.price_vnd} → 0` : ""}`;
  if (same) continue;
  changed += 1;
  if (dropped) priceDropped += 1;
  console.log(`  ${APPLY ? "đổi" : "sẽ đổi"}: ${row.slug.padEnd(32)} ${String(row.kind)}/${String(row.origin)} → ${note}`);
  if (APPLY) update.run(kind, origin, priceVnd, 0, row.id);
}

for (const slug of missing) {
  if (!seen.has(slug)) console.log(`  ! trong file phân loại nhưng KHÔNG có trong DB: ${slug}`);
}

console.log(
  `\n${APPLY ? "Đã áp" : "Sẽ áp"}: ${changed} mục${priceDropped ? ` (hạ giá ${priceDropped} mục clone về)` : ""}` +
    `${changed ? "" : " — không có gì thay đổi"}`,
);
if (!APPLY) console.log("Chạy lại với --apply để ghi thật.");
