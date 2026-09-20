#!/usr/bin/env node
/**
 * Áp dụng bản VIẾT LẠI (không phải bản dịch) cho các mục nhập từ nguồn bên thứ ba.
 *
 * Vì sao cần: `instructions` hiện tại của 22 mục này là bản dịch gần nguyên văn từ
 * WorkBuddy/SkillHub — nội dung thuộc tác giả gốc + Tencent, không được bán lại và
 * cũng không nên phát hành nguyên dạng. Xem `docs/CONTENT-POLICY.md`.
 *
 * Cách dùng (mặc định CHẠY THỬ, không ghi gì):
 *
 *   node ops/rewrite-apply.mjs --file ops/rewrite-content.json
 *   node ops/rewrite-apply.mjs --file ops/rewrite-content.json --apply
 *   node ops/rewrite-apply.mjs --file ops/rewrite-content.json --only vietnam-finance-tax-expert --apply
 *
 * Token admin: FBUDDY_ADMIN_TOKEN (hoặc FLOWGPT_ADMIN_TOKEN), hoặc --token-file
 * (mặc định %TEMP%/admin-token.txt — cùng quy ước với ops/import-hub-skills.mjs).
 *
 * Định dạng `ops/rewrite-content.json`:
 * {
 *   "<slug>": {
 *     "name":        "tên tiếng Việt (tuỳ chọn)",
 *     "tagline":     "một câu",
 *     "description": "2-4 câu",
 *     "instructions":"toàn bộ chỉ dẫn viết lại, 400-6000 ký tự",
 *     "i18n": { "en": { "name": "…", "tagline": "…", "description": "…", "instructions": "…" },
 *               "zh": { … } }
 *   }
 * }
 *
 * Script LUÔN gửi kèm `priceVnd: 0` — nội dung nguồn ngoài không được bán (CONTENT-POLICY).
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const VALUE_OPTIONS = new Set(["file", "only", "base", "token-file"]);
const flags = new Set();
const options = new Map();
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (!arg.startsWith("--")) continue;
  const name = arg.slice(2);
  if (VALUE_OPTIONS.has(name)) {
    options.set(name, args[i + 1]);
    i += 1;
  } else {
    flags.add(name);
  }
}
const opt = (name, fallback = null) => (options.has(name) ? options.get(name) : fallback);

const APPLY = flags.has("apply");
const FILE = opt("file", "ops/rewrite-content.json");
const ONLY = opt("only");
const API_BASE = String(opt("base", process.env.FBUDDY_API_BASE ?? "http://127.0.0.1:7790/api")).replace(/\/$/, "");
const TOKEN_FILE = opt("token-file", path.join(os.tmpdir(), "admin-token.txt"));

function readToken() {
  for (const key of ["FBUDDY_ADMIN_TOKEN", "FLOWGPT_ADMIN_TOKEN"]) {
    if (process.env[key]) return process.env[key].trim();
  }
  try {
    return fs.readFileSync(TOKEN_FILE, "utf8").trim();
  } catch {
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

/** Ký tự CJK — bản tiếng Việt/tiếng Anh không được chứa (bản zh thì phải có). */
const CJK = /[\u3400-\u9fff\uf900-\ufaff]/;
const hasCjk = (text) => CJK.test(String(text ?? ""));

function validate(slug, entry) {
  const problems = [];
  const instructions = String(entry.instructions ?? "").trim();
  if (!instructions) problems.push("thiếu `instructions`");
  else if (instructions.length < 400) problems.push(`instructions quá ngắn (${instructions.length} < 400)`);
  else if (instructions.length > 6000) problems.push(`instructions quá dài (${instructions.length} > 6000, sẽ bị cắt)`);
  if (!String(entry.tagline ?? "").trim()) problems.push("thiếu `tagline`");
  if (hasCjk(instructions)) problems.push("instructions (bản gốc vi) còn ký tự Trung Quốc");
  if (hasCjk(entry.tagline)) problems.push("tagline còn ký tự Trung Quốc");
  if (hasCjk(entry.name)) problems.push("name còn ký tự Trung Quốc");
  const i18n = entry.i18n ?? {};
  if (!i18n.en) problems.push("thiếu bản tiếng Anh (`i18n.en`)");
  else if (hasCjk(i18n.en.instructions) || hasCjk(i18n.en.tagline)) problems.push("bản tiếng Anh còn ký tự Trung Quốc");
  if (!i18n.zh) problems.push("thiếu bản tiếng Trung (`i18n.zh`) — viết mới, KHÔNG chép lại bản gốc");
  for (const lang of Object.keys(i18n)) {
    if (instructions && String(i18n[lang]?.instructions ?? "").length === instructions.length) {
      problems.push(`i18n.${lang}.instructions dài y hệt bản gốc — nghi là chép chứ không viết lại`);
    }
  }
  return problems;
}

const raw = fs.readFileSync(FILE, "utf8");
const content = JSON.parse(raw);
const slugs = Object.keys(content).filter((slug) => !slug.startsWith("_"));
const targets = ONLY ? slugs.filter((slug) => slug === ONLY) : slugs;
if (!targets.length) {
  console.error(`Không có mục nào để áp dụng trong ${FILE}${ONLY ? ` khớp --only ${ONLY}` : ""}.`);
  process.exit(2);
}

const token = readToken();
const { items } = await api("GET", "/admin/hub?lang=vi", null, token);
const bySlug = new Map((items ?? []).map((item) => [item.slug, item]));

console.log(`\n== ${APPLY ? "ÁP DỤNG" : "CHẠY THỬ"} ${targets.length} mục viết lại → ${API_BASE} ==\n`);
let failed = 0;
for (const slug of targets) {
  const entry = content[slug] ?? {};
  const row = bySlug.get(slug);
  const problems = validate(slug, entry);

  // Slug chưa có trong chợ (mục MỚI, ví dụ 21 mục giáo dục) → TẠO mới thay vì cập nhật.
  if (!row) {
    console.log(`${problems.length ? "!" : "＋"} ${slug}  (mới) → tạo category "${entry.category ?? "Giáo dục"}"`);
    for (const problem of problems) console.log(`    - ${problem}`);
    if (problems.length) { failed += 1; continue; }
    if (!APPLY) { console.log("    (chạy thử — thêm --apply để tạo)"); continue; }
    const created = await api("POST", "/admin/hub", {
      slug,
      name: String(entry.name ?? slug).slice(0, 120),
      tagline: String(entry.tagline ?? "").slice(0, 200),
      description: String(entry.description ?? "").slice(0, 2000),
      category: entry.category ?? "Giáo dục",
      icon: entry.icon ?? "sparkles",
      instructions: String(entry.instructions).slice(0, 6000),
      ...(entry.i18n ? { i18n: entry.i18n } : {}),
      priceVnd: 0,
      state: entry.state ?? "published",
    }, token);
    console.log(`    → đã TẠO (id ${created?.skill?.id ?? "?"})`);
    continue;
  }

  const before = String(row.instructions ?? "").length;
  const after = String(entry.instructions ?? "").trim().length;
  console.log(`${problems.length ? "!" : "✓"} ${slug}  ${before} → ${after} ký tự  (${row.name})`);
  for (const problem of problems) console.log(`    - ${problem}`);
  if (problems.length || !APPLY) {
    if (!APPLY && !problems.length) console.log("    (chạy thử — thêm --apply để ghi)");
    if (problems.length) failed += 1;
    continue;
  }
  await api("PATCH", `/admin/hub/${encodeURIComponent(row.id)}`, {
    ...(entry.name ? { name: String(entry.name).slice(0, 120) } : {}),
    tagline: String(entry.tagline).slice(0, 200),
    ...(entry.description ? { description: String(entry.description).slice(0, 2000) } : {}),
    instructions: String(entry.instructions).slice(0, 6000),
    ...(entry.i18n ? { i18n: entry.i18n } : {}),
    priceVnd: 0,
  }, token);
  console.log("    → đã ghi");
}
console.log(`\n${failed ? `CÓ ${failed} mục cần sửa` : "Không có lỗi kiểm tra"}. ${APPLY ? "" : "Chưa ghi gì (thêm --apply)."}`);
process.exit(failed ? 1 : 0);
