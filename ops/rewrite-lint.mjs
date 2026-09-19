#!/usr/bin/env node
/**
 * LINT nội dung viết lại trước khi áp dụng — chạy được ở MÁY (không cần API/node-2).
 *
 *   node ops/rewrite-lint.mjs ops/rewrite-parts/skills-a.json
 *   node ops/rewrite-lint.mjs ops/rewrite-content.json
 *
 * Kiểm tra đúng các điều kiện của `ops/rewrite-apply.mjs` + `ops/verify-rewrite.mjs`:
 *   1. instructions (vi) 400–6000 ký tự, không ký tự Trung Quốc
 *   2. name/tagline không ký tự Trung Quốc; tagline có nội dung
 *   3. có i18n.en (instructions) sạch chữ Trung Quốc; en.instructions khác độ dài bản vi
 *   4. có i18n.zh
 *   5. độ trùng trigram (từ) với bản dịch cũ trong ops/.rewrite-baseline.json < 0.35
 *
 * Thoát mã 1 nếu còn mục FAIL.
 */
import fs from "node:fs";
import path from "node:path";

const CJK = /[\u3400-\u9fff\uf900-\ufaff]/;
const hasCjk = (text) => CJK.test(String(text ?? ""));
const normalise = (text) =>
  String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

function trigramOverlap(a, b) {
  const grams = (text) => {
    const words = normalise(text).split(" ").filter(Boolean);
    const set = new Set();
    for (let i = 0; i + 2 < words.length; i += 1) set.add(words.slice(i, i + 3).join(" "));
    return set;
  };
  const left = grams(a);
  const right = grams(b);
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const gram of left) if (right.has(gram)) shared += 1;
  return shared / left.size;
}

const file = process.argv[2];
if (!file) {
  console.error("Dùng: node ops/rewrite-lint.mjs <file.json>");
  process.exit(2);
}
const content = JSON.parse(fs.readFileSync(file, "utf8"));
let baseline = { items: [] };
try {
  baseline = JSON.parse(fs.readFileSync("ops/.rewrite-baseline.json", "utf8"));
} catch {
  console.error("! Không đọc được ops/.rewrite-baseline.json — bỏ qua kiểm tra trùng lặp (mục 5).");
}
const oldBySlug = new Map((baseline.items ?? []).map((item) => [item.slug, String(item.instructions ?? "")]));

const slugs = Object.keys(content).filter((slug) => !slug.startsWith("_"));
let failed = 0;
for (const slug of slugs) {
  const entry = content[slug] ?? {};
  const problems = [];
  const instructions = String(entry.instructions ?? "").trim();
  if (instructions.length < 400) problems.push(`instructions quá ngắn (${instructions.length} < 400)`);
  if (instructions.length > 6000) problems.push(`instructions quá dài (${instructions.length} > 6000)`);
  if (hasCjk(instructions)) problems.push("instructions (vi) còn ký tự Trung Quốc");
  if (!String(entry.tagline ?? "").trim()) problems.push("thiếu tagline");
  if (hasCjk(entry.tagline)) problems.push("tagline còn ký tự Trung Quốc");
  if (hasCjk(entry.name)) problems.push("name còn ký tự Trung Quốc");
  const i18n = entry.i18n ?? {};
  if (!i18n.en?.instructions) problems.push("thiếu i18n.en.instructions");
  else if (hasCjk(i18n.en.instructions)) problems.push("i18n.en.instructions còn ký tự Trung Quốc");
  if (i18n.en?.instructions && String(i18n.en.instructions).length === instructions.length) {
    problems.push("i18n.en dài y hệt bản vi — nghi chép");
  }
  if (!i18n.zh?.instructions) problems.push("thiếu i18n.zh.instructions");
  const old = oldBySlug.get(slug);
  const overlap = old ? trigramOverlap(instructions, old) : null;
  if (overlap !== null && overlap >= 0.35) {
    problems.push(`trùng ${(overlap * 100).toFixed(0)}% với bản cũ (ngưỡng 35%)`);
  }
  const tag = problems.length ? "✗ FAIL" : "✓ PASS";
  const ov = overlap === null ? " n/a" : `${(overlap * 100).toFixed(0)}%`.padStart(4);
  console.log(`${tag}  ${ov}  vi=${String(instructions.length).padStart(4)} en=${String(String(i18n.en?.instructions ?? "").length).padStart(4)} zh=${String(String(i18n.zh?.instructions ?? "").length).padStart(4)}  ${slug}`);
  for (const problem of problems) console.log(`        - ${problem}`);
  if (problems.length) failed += 1;
}
console.log(`\n${slugs.length - failed}/${slugs.length} PASS${failed ? `, ${failed} FAIL` : ""} — ${path.basename(file)}`);
process.exit(failed ? 1 : 0);
