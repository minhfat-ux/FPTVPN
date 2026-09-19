#!/usr/bin/env node
/**
 * Nhập 21 mục GIÁO DỤC (nội dung do mình viết lại) vào chợ fBuddy, nhóm "Giáo dục".
 *
 *   node ops/education-import.mjs                     # chạy thử (mặc định, không ghi)
 *   node ops/education-import.mjs --apply             # ghi thật
 *   node ops/education-import.mjs --only ket-prep-team --apply
 *
 * Khác `workbuddy-import.mjs`: script này gửi thẳng nội dung ĐÃ VIẾT LẠI
 * (`ops/rewrite-education.json`, gồm cả `i18n` en/zh) nên KHÔNG gọi API dịch.
 *
 * Vì sao vẫn `priceVnd: 0`: chủ đề/chức năng dựa trên nguồn bên thứ ba ⇒ giữ miễn phí
 * theo docs/CONTENT-POLICY.md §3.1 (muốn thu phí phải là nội dung tự viết 100%).
 *
 * Token: FBUDDY_ADMIN_TOKEN | FLOWGPT_ADMIN_TOKEN, hoặc --token-file.
 * Mặc định trỏ API nội bộ node-2 http://127.0.0.1:7790/api (đặt --base để đổi).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const VALUE_OPTIONS = new Set(["file", "only", "base", "token-file", "category"]);
const flags = new Set();
const options = new Map();
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (!arg.startsWith("--")) continue;
  const name = arg.slice(2);
  if (VALUE_OPTIONS.has(name)) { options.set(name, args[i + 1]); i += 1; } else { flags.add(name); }
}
const opt = (name, fallback = null) => (options.has(name) ? options.get(name) : fallback);

const APPLY = flags.has("apply");
const FILE = opt("file", "ops/rewrite-education.json");
const ONLY = opt("only");
const CATEGORY = opt("category", "Giáo dục");
const API_BASE = String(opt("base", process.env.FBUDDY_API_BASE ?? "http://127.0.0.1:7790/api")).replace(/\/+$/, "");
const TOKEN_FILE = opt("token-file", path.join(os.tmpdir(), "admin-token.txt"));

function readToken() {
  for (const key of ["FBUDDY_ADMIN_TOKEN", "FLOWGPT_ADMIN_TOKEN"]) {
    if (process.env[key]) return process.env[key].trim();
  }
  try { return fs.readFileSync(TOKEN_FILE, "utf8").trim(); } catch {
    console.error(`Không tìm thấy token admin. Đặt FBUDDY_ADMIN_TOKEN hoặc ghi token vào ${TOKEN_FILE}`);
    process.exit(2);
  }
}

async function api(method, apiPath, body, token) {
  const response = await fetch(`${API_BASE}${apiPath}`, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${apiPath} → ${response.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

const CJK = /[\u3400-\u9fff\uf900-\ufaff]/;
const hasCjk = (text) => CJK.test(String(text ?? ""));

/** Kiểm tra tối thiểu trước khi ghi — trùng bộ kiểm với ops/rewrite-apply.mjs. */
function validate(entry) {
  const problems = [];
  const instructions = String(entry.instructions ?? "").trim();
  if (!instructions) problems.push("thiếu `instructions`");
  else if (instructions.length < 400) problems.push(`instructions quá ngắn (${instructions.length} < 400)`);
  else if (instructions.length > 6000) problems.push(`instructions quá dài (${instructions.length} > 6000)`);
  if (!String(entry.tagline ?? "").trim()) problems.push("thiếu `tagline`");
  if (hasCjk(instructions) || hasCjk(entry.tagline) || hasCjk(entry.name)) problems.push("bản vi còn ký tự Trung Quốc");
  const i18n = entry.i18n ?? {};
  if (!i18n.en) problems.push("thiếu i18n.en");
  else if (hasCjk(i18n.en.instructions) || hasCjk(i18n.en.tagline)) problems.push("i18n.en còn ký tự Trung Quốc");
  if (!i18n.zh) problems.push("thiếu i18n.zh");
  return problems;
}

const content = JSON.parse(fs.readFileSync(FILE, "utf8"));
let slugs = Object.keys(content).filter((slug) => !slug.startsWith("_"));
if (ONLY) slugs = slugs.filter((slug) => slug === ONLY);
if (!slugs.length) { console.error(`Không có mục nào trong ${FILE}${ONLY ? ` khớp --only ${ONLY}` : ""}.`); process.exit(2); }

const token = readToken();
const existing = await api("GET", "/admin/hub?lang=vi", null, token);
const bySlug = new Map((existing.items ?? []).map((item) => [item.slug, item]));

console.log(`\n== ${APPLY ? "NHẬP" : "CHẠY THỬ"} ${slugs.length} mục giáo dục → ${API_BASE} (nhóm "${CATEGORY}", giá 0) ==\n`);
let created = 0, updated = 0, failed = 0;
for (const slug of slugs) {
  const entry = content[slug];
  const problems = validate(entry);
  const row = bySlug.get(slug);
  const payload = {
    slug,
    name: String(entry.name ?? slug).slice(0, 120),
    tagline: String(entry.tagline ?? "").slice(0, 200),
    description: String(entry.description ?? "").slice(0, 2000),
    category: CATEGORY,
    icon: "sparkles",
    priceVnd: 0,
    state: "published",
    instructions: String(entry.instructions ?? "").slice(0, 6000),
    tools: [],
    i18n: entry.i18n ?? {},
  };
  if (problems.length) {
    failed += 1;
    console.log(`✗ ${slug} — ${problems.join("; ")}`);
    continue;
  }
  if (!APPLY) {
    console.log(`· ${slug.padEnd(34)} ${row ? "cập nhật" : "TẠO MỚI"}  ${payload.instructions.length} ký tự vi`);
    continue;
  }
  try {
    if (row) { await api("PATCH", `/admin/hub/${encodeURIComponent(row.id)}`, payload, token); updated += 1; }
    else { await api("POST", "/admin/hub", payload, token); created += 1; }
    console.log(`✔ ${slug.padEnd(34)} ${row ? "đã cập nhật" : "đã tạo"}`);
  } catch (error) {
    failed += 1;
    console.log(`✖ ${slug}: ${String(error.message).slice(0, 200)}`);
  }
}
console.log(`\n${APPLY ? `Xong: ${created} tạo mới · ${updated} cập nhật · ${failed} lỗi` : `Chưa ghi gì (thêm --apply). ${failed} mục lỗi kiểm tra.`}`);
process.exitCode = failed ? 1 : 0;
