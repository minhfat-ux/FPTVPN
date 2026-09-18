#!/usr/bin/env node
/**
 * NGHIỆM THU bản viết lại của 22 mục nhập từ nguồn bên thứ ba.
 *
 * Chạy TRÊN node-2 (đọc thẳng SQLite, không cần token):
 *
 *   node ops/verify-rewrite.mjs
 *   node ops/verify-rewrite.mjs --baseline /root/hub-baseline.json --json
 *
 * Kiểm tra từng mục:
 *   1. `price_vnd = 0` (chính sách: nội dung nguồn ngoài không bán — docs/CONTENT-POLICY.md)
 *   2. `instructions` có nội dung, 400–6000 ký tự
 *   3. Bản tiếng Việt (bản gốc) KHÔNG còn ký tự Trung Quốc
 *   4. Đã VIẾT LẠI thật: độ trùng trigram với bản dịch cũ (baseline) < 0.35
 *   5. Có bản tiếng Anh; bản tiếng Anh cũng sạch chữ Trung Quốc
 *
 * Thoát mã 1 nếu còn mục FAIL (dùng được trong CI/kiểm tra tay).
 */

import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";

const args = process.argv.slice(2);
const value = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const DB = value("db", "/var/lib/fbuddy/fbuddy.db");
const BASELINE = value("baseline", "/root/hub-baseline.json");
const AS_JSON = args.includes("--json");
const MAX_OVERLAP = Number(value("max-overlap", "0.35"));

/** 22 mục phải viết lại: 14 chuyên gia VN/ĐNA + 8 kỹ năng nhập từ Tencent. */
export const REWRITE_SLUGS = [
  // 14 chuyên gia (nhóm "Chuyên gia")
  "vietnam-finance-tax-expert", "vietnam-public-affairs",
  "sg-finance-tax", "sg-biz-dev", "sg-hr-admin-expert",
  "malaysia-finance-tax", "malaysia-legal", "malaysia-hr-admin", "malaysia-marketing",
  "indonesia-digital-law-expert", "indonesia-pa-expert", "indonesia-bd-expert",
  "thai-marketing-creative", "thailand-hr-admin",
  // 8 kỹ năng nhập từ Tencent/SkillHub
  "cmo", "one-person-company-plus", "sales-analyzer", "reverse-costing",
  "accountant", "ciabao", "corp-financial-analysis", "social-media-lead-generation",
];

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

/** Tỉ lệ trùng trigram (từ) giữa hai văn bản — càng thấp càng chứng tỏ viết lại thật. */
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

const db = new DatabaseSync(DB);
const rows = new Map(
  db.prepare("select id, slug, name, tagline, instructions, price_vnd, i18n_json, state from hub_skills").all()
    .map((row) => [row.slug, row]),
);
let baseline = { items: [] };
try {
  baseline = JSON.parse(fs.readFileSync(BASELINE, "utf8"));
} catch {
  console.error(`! Không đọc được baseline ${BASELINE} — bỏ qua kiểm tra "viết lại thật" (mục 4).`);
}
const baselineBySlug = new Map((baseline.items ?? []).map((item) => [item.slug, item]));

const i18nOf = (row) => {
  const raw = row.i18n_json;
  if (!raw) return {};
  try { return typeof raw === "string" ? JSON.parse(raw) ?? {} : raw; } catch { return {}; }
};

const report = [];
for (const slug of REWRITE_SLUGS) {
  const row = rows.get(slug);
  if (!row) {
    report.push({ slug, verdict: "FAIL", reasons: ["không có trong chợ"], overlap: null, length: 0 });
    continue;
  }
  const reasons = [];
  const instructions = String(row.instructions ?? "").trim();
  const old = baselineBySlug.get(slug)?.instructions ?? "";
  const overlap = old ? trigramOverlap(instructions, old) : null;

  if (Number(row.price_vnd) !== 0) reasons.push(`còn giá ${row.price_vnd}đ (phải 0)`);
  if (instructions.length < 400) reasons.push(`instructions quá ngắn (${instructions.length})`);
  if (instructions.length > 6000) reasons.push(`instructions quá dài (${instructions.length})`);
  if (hasCjk(instructions)) reasons.push("bản tiếng Việt còn ký tự Trung Quốc");
  if (hasCjk(row.tagline) || hasCjk(row.name)) reasons.push("name/tagline còn ký tự Trung Quốc");
  if (overlap !== null && overlap >= MAX_OVERLAP) {
    reasons.push(`trùng ${(overlap * 100).toFixed(0)}% với bản dịch cũ (ngưỡng ${MAX_OVERLAP * 100}%) — chưa viết lại thật`);
  }
  const en = i18nOf(row).en;
  if (!en || !String(en.instructions ?? en.tagline ?? "").trim()) reasons.push("thiếu bản tiếng Anh (i18n.en)");
  else if (hasCjk(en.instructions)) reasons.push("bản tiếng Anh còn ký tự Trung Quốc");

  report.push({
    slug,
    verdict: reasons.length ? "FAIL" : "PASS",
    reasons,
    overlap: overlap === null ? null : Number(overlap.toFixed(3)),
    length: instructions.length,
  });
}

if (AS_JSON) {
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), maxOverlap: MAX_OVERLAP, report }, null, 1));
} else {
  console.log(`\n== NGHIỆM THU viết lại (${REWRITE_SLUGS.length} mục) — ${DB} ==\n`);
  for (const item of report) {
    const tag = item.verdict === "PASS" ? "✓ PASS" : "✗ FAIL";
    const overlap = item.overlap === null ? "  n/a" : `${(item.overlap * 100).toFixed(0)}%`.padStart(5);
    console.log(`${tag}  ${overlap}  ${String(item.length).padStart(5)} ký tự  ${item.slug}`);
    for (const reason of item.reasons) console.log(`        - ${reason}`);
  }
  const failed = report.filter((item) => item.verdict === "FAIL").length;
  console.log(`\nKết quả: ${report.length - failed}/${report.length} PASS, ${failed} FAIL.`);
  console.log(failed ? "→ Còn phải viết lại. Nội dung nguồn ngoài vẫn phải để miễn phí." : "→ Đã sạch: có thể cân nhắc thu phí sau (chỉ với nội dung tự viết).");
}
process.exit(report.some((item) => item.verdict === "FAIL") ? 1 : 0);
