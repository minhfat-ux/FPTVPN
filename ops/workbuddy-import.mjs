#!/usr/bin/env node
/**
 * Nhập skill/expert WorkBuddy (đã chọn lọc) vào chợ fBuddy, kèm dịch sang tiếng Việt.
 *
 *   FBUDDY_ADMIN_TOKEN=… node ops/workbuddy-import.mjs --sea --kind expert --apply
 *   node ops/workbuddy-import.mjs --group marketing --limit 20            # chạy thử
 *   node ops/workbuddy-import.mjs --sea --instructions --apply --translate vi,en
 *
 * Cờ:
 *   --sea                chỉ lấy mục liên quan Việt Nam/Đông Nam Á
 *   --kind expert|skill  lọc theo loại
 *   --group <tên nhóm>   lọc theo nhóm (marketing, finance, sales, ppt, …)
 *   --only-free          chỉ lấy mục không cần API key/đăng nhập
 *   --limit N            giới hạn số mục
 *   --instructions       DỊCH cả phần chỉ dẫn (mặc định chỉ dịch tên/mô tả)
 *   --translate vi,en,zh ngôn ngữ cần dịch (mặc định vi)
 *   --price-vnd          giá bán (mặc định 50000)
 *   --apply              ghi thật (mặc định chạy thử)
 */
import fs from "node:fs/promises";

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1] ?? null;
};
const has = (name) => args.includes(`--${name}`);
const BASE = String(flag("base", process.env.FBUDDY_API_BASE ?? "https://fbuddy.meetflowai.site/api")).replace(/\/+$/, "");
const TOKEN = process.env.FBUDDY_ADMIN_TOKEN ?? process.env.FLOWGPT_ADMIN_TOKEN ?? "";
const APPLY = has("apply");
const TRANS = String(flag("translate", "vi")).split(",").map((s) => s.trim()).filter(Boolean);
const DO_INSTRUCTIONS = has("instructions");
const PRICE = Math.max(0, Math.trunc(Number(flag("price-vnd")) || 50000));
const LIMIT = Number(flag("limit")) || 0;

const SKILL_CATEGORY = { marketing: "Nội dung", sales: "Bán hàng", finance: "Dữ liệu", ppt: "Văn phòng", researcher: "Dữ liệu", expert: "Chuyên gia", "giáo dục trẻ": "Giáo dục", "giải toán": "Giáo dục", "ngoại ngữ": "Giáo dục" };

const api = async (method, path, body) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), Authorization: `Bearer ${TOKEN}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${(json?.error?.message ?? text).slice(0, 140)}`);
  return json;
};

/** Bỏ frontmatter + ký tự điều khiển; cắt theo trần của chợ. */
const cleanBody = (body) =>
  String(body ?? "").replace(/^---[\s\S]*?---\r?\n/, "").replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, 6000);

const items = JSON.parse(await fs.readFile("ops/workbuddy-curated.json", "utf8"));
let picked = items;
if (has("sea")) picked = picked.filter((i) => i.seaSpecific);
if (flag("kind")) picked = picked.filter((i) => i.kind === flag("kind"));
if (flag("group")) picked = picked.filter((i) => i.groups.includes(flag("group")));
if (has("only-free")) picked = picked.filter((i) => !i.needsSetup);
if (LIMIT) picked = picked.slice(0, LIMIT);

console.log(`\n== ${APPLY ? "NHẬP" : "CHẠY THỬ"} ${picked.length} mục WorkBuddy → ${BASE} ==`);
console.log(`   dịch: ${TRANS.join(", ")}${DO_INSTRUCTIONS ? " (cả chỉ dẫn)" : " (chỉ tên/mô tả)"} · giá ${PRICE.toLocaleString("vi-VN")}đ\n`);

const existing = APPLY ? (await api("GET", "/admin/hub")).items : [];
const bySlug = new Map(existing.map((i) => [i.slug, i]));
const manifest = [];
let ok = 0, failed = 0;

for (const item of picked) {
  const category = item.kind === "expert" ? "Chuyên gia" : (SKILL_CATEGORY[item.groups[0]] ?? "Khác");
  let name = item.name || item.slug;
  let tagline = item.purpose || "";
  let description = item.purpose || "";
  let instructions = cleanBody(item.body);
  const warnings = [];

  if (TRANS.length && DO_INSTRUCTIONS) {
    try {
      const r = await api("POST", "/admin/skillhub/translate", {
        fields: { name, tagline, description, instructions }, targets: TRANS,
      });
      const primary = r.translations.vi ?? r.translations[TRANS[0]];
      if (primary) {
        name = primary.name || name; tagline = primary.tagline || tagline;
        description = primary.description || description; instructions = primary.instructions || instructions;
        warnings.push(...(primary.warnings ?? []));
      }
      for (const w of r.warnings ?? []) warnings.push(w);
    } catch (err) { warnings.push(`dịch lỗi: ${err.message}`); }
  }

  const state = item.needsSetup ? "coming_soon" : "published";
  const label = `${item.kind === "expert" ? "[expert]" : "[skill] "} ${item.slug}`;
  if (!APPLY) {
    console.log(`  · ${label.padEnd(46)} ${category.padEnd(11)} ${state.padEnd(11)} ${item.needsSetup ? "cần key" : "dùng ngay"}`);
    continue;
  }
  try {
    const payload = { slug: item.slug, name: name.slice(0, 120), tagline: tagline.slice(0, 200), description: description.slice(0, 2000), category, icon: "sparkles", priceVnd: PRICE, state, instructions, tools: [] };
    const row = bySlug.get(item.slug);
    const out = row ? await api("PATCH", `/admin/hub/${row.id}`, payload) : await api("POST", "/admin/hub", payload);
    ok += 1;
    console.log(`  ✔ ${label.padEnd(46)} ${category.padEnd(11)} ${state.padEnd(11)} ${name.slice(0, 34)}`);
    for (const w of warnings) console.log(`      ! ${w}`);
    manifest.push({ ...item, hubId: out.skill.id, category, state, priceVnd: PRICE, translatedName: name });
  } catch (err) {
    failed += 1;
    console.log(`  ✖ ${label}: ${err.message}`);
  }
}

if (APPLY && manifest.length) {
  await fs.writeFile("ops/workbuddy-imported.json", `${JSON.stringify(manifest, null, 1)}\n`);
  console.log(`\nđã ghi ops/workbuddy-imported.json (${manifest.length} mục)`);
}
console.log(`\n${APPLY ? `Xong: ${ok} nhập · ${failed} lỗi` : "Chưa ghi gì — thêm --apply để nhập thật"}\n`);
process.exitCode = failed ? 1 : 0;
