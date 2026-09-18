#!/usr/bin/env node
/**
 * GOM các mảnh viết lại (`ops/rewrite-parts/<slug>.json`) thành `ops/rewrite-content.json`.
 *
 *   node ops/rewrite-assemble.mjs            # gom + báo thiếu mục nào
 *   node ops/rewrite-assemble.mjs --check    # chỉ báo, không ghi
 *
 * An toàn khi nhiều agent chạy song song:
 *   - Đọc file đích cũ (nếu có) và GIỮ các slug không có trong mảnh mới ⇒ không nuốt mất việc
 *     của agent khác.
 *   - Ghi kiểu nguyên tử (ghi .tmp rồi rename) ⇒ không bao giờ để lại file JSON cụt.
 */
import fs from "node:fs";
import path from "node:path";

export const SLUGS = [
  "vietnam-finance-tax-expert", "vietnam-public-affairs",
  "sg-finance-tax", "sg-biz-dev", "sg-hr-admin-expert",
  "malaysia-finance-tax", "malaysia-legal", "malaysia-hr-admin", "malaysia-marketing",
  "indonesia-digital-law-expert", "indonesia-pa-expert", "indonesia-bd-expert",
  "thai-marketing-creative", "thailand-hr-admin",
  "cmo", "one-person-company-plus", "sales-analyzer", "reverse-costing",
  "accountant", "ciabao", "corp-financial-analysis", "social-media-lead-generation",
];

const PARTS_DIR = path.join("ops", "rewrite-parts");
const TARGET = path.join("ops", "rewrite-content.json");
const CHECK_ONLY = process.argv.includes("--check");

const readJson = (file) => {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
};

/** `--base <file>` (lặp được): file gộp cũ để GIỮ những slug mảnh mới không có. */
const baseFiles = [];
for (let i = 0; i < process.argv.length; i += 1) {
  if (process.argv[i] === "--base" && process.argv[i + 1]) baseFiles.push(process.argv[i + 1]);
}
if (fs.existsSync(TARGET)) baseFiles.push(TARGET);

const merged = {};
for (const file of baseFiles) {
  const existing = readJson(file);
  if (!existing) continue;
  let kept = 0;
  for (const [slug, entry] of Object.entries(existing)) {
    if (!SLUGS.includes(slug) || !entry || typeof entry !== "object") continue;
    merged[slug] = entry;
    kept += 1;
  }
  console.log(`· nền ${file}: giữ ${kept} mục`);
}

const partFiles = fs.existsSync(PARTS_DIR)
  ? fs.readdirSync(PARTS_DIR).filter((name) => name.endsWith(".json")).sort()
  : [];
let fromParts = 0;
for (const name of partFiles) {
  const data = readJson(path.join(PARTS_DIR, name));
  if (!data) {
    console.log(`! bỏ qua ${name} (JSON hỏng)`);
    continue;
  }
  for (const [slug, entry] of Object.entries(data)) {
    if (!SLUGS.includes(slug) || !entry || typeof entry !== "object") continue;
    merged[slug] = entry;
    fromParts += 1;
  }
  console.log(`· ${name}: ${Object.keys(data).filter((s) => SLUGS.includes(s)).length} mục`);
}
if (fromParts) console.log(`· từ mảnh: ${fromParts} mục`);

const ordered = {};
for (const slug of SLUGS) if (merged[slug]) ordered[slug] = merged[slug];
for (const slug of Object.keys(merged)) if (!ordered[slug]) ordered[slug] = merged[slug];

const missing = SLUGS.filter((slug) => !ordered[slug]);
console.log(`\nCó ${SLUGS.length - missing.length}/${SLUGS.length} mục.`);
if (missing.length) console.log(`Còn thiếu: ${missing.join(", ")}`);

if (CHECK_ONLY) {
  console.log("(--check: không ghi)");
  process.exit(missing.length ? 1 : 0);
}

const tmp = `${TARGET}.tmp`;
fs.writeFileSync(tmp, `${JSON.stringify(ordered, null, 1)}\n`);
fs.renameSync(tmp, TARGET);
console.log(`Đã ghi ${TARGET} (${fs.statSync(TARGET).size} byte).`);
process.exit(missing.length ? 1 : 0);
