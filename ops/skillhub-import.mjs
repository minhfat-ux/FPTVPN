#!/usr/bin/env node
/**
 * Nhập kỹ năng từ **SkillHub (Tencent)** vào chợ kỹ năng, qua Open API công khai.
 *
 * Khác `ops/import-hub-skills.mjs` (nhập từ thư mục `SKILL.md` hoặc JSON có sẵn),
 * script này *kéo* skill từ SkillHub về: tìm → lấy chi tiết → đọc `SKILL.md` → ghép
 * thành bản nháp của chợ → (tuỳ chọn) ghi vào chợ qua admin API.
 *
 *   node ops/skillhub-import.mjs --check                      # kiểm tra có gọi được API không
 *   node ops/skillhub-import.mjs --search "excel"             # xem 10 kết quả đầu
 *   node ops/skillhub-import.mjs --search "excel" --limit 30 --free
 *   node ops/skillhub-import.mjs --slug <slug>                # chạy thử: in bản nháp, KHÔNG ghi
 *   node ops/skillhub-import.mjs --slug <slug> --apply        # ghi vào chợ (tạo mới hoặc cập nhật)
 *   node ops/skillhub-import.mjs --slug a --slug b --apply --price-vnd 50000 --state coming_soon
 *
 * Biến môi trường:
 *   SKILLHUB_BASE_URL    mặc định https://api.skillhub.cn (đổi sang VPN/relay khi cần)
 *   SKILLHUB_API_KEY     khoá team của SkillHub (tuỳ chọn, chỉ dùng ở server)
 *   FBUDDY_ADMIN_TOKEN   token admin của chợ — hoặc FLOWGPT_ADMIN_TOKEN (tên cũ), hoặc --token-file
 *
 * ⚠️ Đo ngày 2026-09-18: API này **không gọi được** từ máy dev lẫn VPS production
 * (TCP 443 timeout tới EdgeOne, trong khi các site Trung Quốc khác vẫn 200) ⇒ cần
 * đường mạng sang Trung Quốc. Script này chạy được ngay khi có đường đó.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fetchSkillDraft, searchSkills, skillhubConfig, listCategories } from "../server/src/skills/skillhub.js";

const args = process.argv.slice(2);
const VALUE_OPTIONS = new Set(["search", "slug", "limit", "price-vnd", "state", "category", "base", "token-file", "json-out", "page", "translate"]);
const options = new Map();
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (!arg.startsWith("--")) continue;
  const name = arg.slice(2);
  if (VALUE_OPTIONS.has(name)) {
    const value = args[index + 1] ?? null;
    const current = options.get(name);
    // `--slug` lặp lại được để nhập nhiều skill một lượt.
    options.set(name, current === undefined ? value : [].concat(current, value));
    index += 1;
  } else {
    options.set(name, true);
  }
}
const flag = (name, fallback = null) => (options.has(name) ? options.get(name) : fallback);
const has = (name) => options.get(name) === true;
const list = (name) => {
  const value = flag(name);
  return value === null || value === undefined ? [] : [].concat(value);
};

const CONFIG = skillhubConfig();
const APPLY = has("apply");
const PRICE_VND = flag("price-vnd") === null ? 50000 : Math.max(0, Math.trunc(Number(flag("price-vnd")) || 0));
const STATE = flag("state");
const CATEGORY = flag("category");
const LIMIT = Math.min(100, Math.max(1, Number(flag("limit")) || 10));
const JSON_OUT = flag("json-out");
/** Ngôn ngữ cần dịch, ví dụ `--translate vi,en`. Dịch do SERVER làm (server có key AI). */
const TRANSLATE = String(flag("translate", "") ?? "")
  .split(",")
  .map((part) => part.trim().toLowerCase())
  .filter(Boolean);
const API_BASE = String(
  flag("base", process.env.FBUDDY_API_BASE ?? process.env.FLOWGPT_API_BASE ?? "http://127.0.0.1:7790/api"),
).replace(/\/+$/, "");

const ok = (message) => console.log(`  \u001b[32m✔\u001b[0m ${message}`);
const bad = (message) => console.log(`  \u001b[31m✖\u001b[0m ${message}`);
const info = (message) => console.log(`    ${message}`);

/** Cảnh báo chung khi không gọi được API — đây là lỗi sẽ gặp khi chưa có đường sang TQ. */
function networkHelp(error) {
  bad(error.message);
  info("Chẩn đoán: nếu DNS vẫn phân giải mà TCP 443 timeout thì dịch vụ chặn theo vùng IP.");
  info(`Cách xử lý: trỏ qua VPN/relay bằng  SKILLHUB_BASE_URL=<địa-chỉ-relay>  rồi chạy lại.`);
}

// ------------------------------------------------------------------- --check

if (has("check")) {
  console.log(`\n== Kiểm tra SkillHub API (${CONFIG.baseUrl}) ==\n`);
  const started = Date.now();
  try {
    const { total, skills } = await searchSkills({ pageSize: 1, sortBy: "downloads" });
    ok(`gọi được API sau ${Date.now() - started} ms — SkillHub báo ${total.toLocaleString("vi-VN")} skill`);
    if (skills[0]) info(`ví dụ: ${skills[0].slug} — ${skills[0].name ?? skills[0].displayName ?? ""}`);
    const categories = await listCategories().catch(() => null);
    if (categories?.items?.length) ok(`${categories.items.length} danh mục cấp 1 (dùng được cho --category)`);
    ok(`X-API-Key: ${CONFIG.apiKey ? "đã cấu hình" : "chưa cấu hình (hiện chưa bắt buộc)"}`);
  } catch (error) {
    networkHelp(error);
    process.exitCode = 1;
  }
  process.exit(process.exitCode ?? 0);
}

// ------------------------------------------------------------------ --search

if (flag("search") !== null) {
  const keyword = String(flag("search"));
  console.log(`\n== Tìm "${keyword}" trên SkillHub (${CONFIG.baseUrl}) ==\n`);
  try {
    const { total, skills } = await searchSkills({
      keyword,
      pageSize: LIMIT,
      page: Number(flag("page")) || 1,
      free: has("free"),
      category: CATEGORY ?? undefined,
    });
    ok(`${total.toLocaleString("vi-VN")} kết quả, hiện ${skills.length}`);
    console.log("");
    for (const skill of skills) {
      const labels = skill.labels && Object.keys(skill.labels).length ? ` [${Object.entries(skill.labels).map(([k, v]) => `${k}=${v}`).join(" ")}]` : "";
      const key = skill.labels?.requires_api_key === "true" ? " ⚠ cần API key" : "";
      console.log(`  ${skill.slug}`);
      console.log(`    ${skill.name ?? ""} · ${skill.category ?? "?"} · ${(skill.downloads ?? 0).toLocaleString("vi-VN")} lượt tải · v${skill.version ?? "?"}${labels}${key}`);
      if (skill.description_zh ?? skill.description) info(String(skill.description_zh ?? skill.description).slice(0, 120));
    }
    console.log(`\nNhập thử một skill:  node ops/skillhub-import.mjs --slug <slug>`);
    console.log(`Nhập thật:          node ops/skillhub-import.mjs --slug <slug> --apply --price-vnd ${PRICE_VND}\n`);
  } catch (error) {
    networkHelp(error);
    process.exitCode = 1;
  }
  process.exit(process.exitCode ?? 0);
}

// -------------------------------------------------------------------- import

const slugs = list("slug");
if (!slugs.length) {
  console.error(
    "Cần một trong các chế độ:\n" +
      "  --check                     kiểm tra gọi được API chưa\n" +
      '  --search "<từ khoá>"         tìm skill\n' +
      "  --slug <slug> [--apply]     nhập một (hoặc nhiều) skill vào chợ\n",
  );
  process.exit(2);
}

function readToken() {
  if (process.env.FBUDDY_ADMIN_TOKEN) return process.env.FBUDDY_ADMIN_TOKEN.trim();
  if (process.env.FLOWGPT_ADMIN_TOKEN) return process.env.FLOWGPT_ADMIN_TOKEN.trim();
  const file = flag("token-file", path.join(os.tmpdir(), "admin-token.txt"));
  if (fs.existsSync(file)) return fs.readFileSync(file, "utf8").trim();
  console.error(`Không tìm thấy token admin. Đặt FBUDDY_ADMIN_TOKEN (hoặc FLOWGPT_ADMIN_TOKEN) hoặc ghi token vào ${file}`);
  process.exit(2);
}

async function admin(method, apiPath, body, token) {
  const response = await fetch(`${API_BASE}${apiPath}`, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${apiPath} → ${response.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

/**
 * Nhờ SERVER dịch prompt pack (server giữ key AI; máy chạy script không cần key).
 * Trả `{ vi: {...}, en: {...} }` — ngôn ngữ nào lỗi thì thiếu ở đó, kèm cảnh báo.
 */
async function translateViaServer(fields) {
  const response = await fetch(`${API_BASE}/admin/skillhub/translate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ fields, targets: TRANSLATE }),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
  return payload;
}

/** Chỉ gửi đúng các trường chợ hiểu — phần thừa (warnings, nguồn…) ở lại log/manifest. */
function hubPayload(draft) {
  return {
    slug: draft.slug,
    name: draft.name,
    tagline: draft.tagline,
    description: draft.description,
    category: draft.category,
    icon: draft.icon,
    priceVnd: draft.priceVnd,
    state: draft.state,
    instructions: draft.instructions,
    tools: draft.tools,
  };
}

// Dịch cũng đi qua admin API nên cần token ngay cả khi chỉ chạy thử.
const token = APPLY || TRANSLATE.length ? readToken() : null;
let existing = [];
if (APPLY) {
  try {
    ({ items: existing } = await admin("GET", "/admin/hub", undefined, token));
  } catch (error) {
    console.error(`Không đọc được chợ kỹ năng (${API_BASE}): ${error.message}`);
    process.exit(1);
  }
}
const bySlug = new Map(existing.map((item) => [item.slug, item]));

console.log(`\n== ${APPLY ? "NHẬP" : "CHẠY THỬ"} ${slugs.length} skill từ SkillHub → chợ (${API_BASE}) ==`);
info(`SkillHub: ${CONFIG.baseUrl} · giá ${PRICE_VND.toLocaleString("vi-VN")}đ · trạng thái ${STATE ?? "tự quyết theo skill"}\n`);

const drafts = [];
let failures = 0;

for (const slug of slugs) {
  try {
    const draft = await fetchSkillDraft(slug, { priceVnd: PRICE_VND, state: STATE ?? undefined, category: CATEGORY ?? undefined });
    drafts.push(draft);

    const existingRow = bySlug.get(draft.slug);
    const label = `${existingRow ? "cập nhật" : "tạo mới"} ${draft.slug} — ${draft.name}`;
    ok(`${label} · ${draft.category} · ${draft.priceVnd.toLocaleString("vi-VN")}đ · ${draft.state}`);
    info(`chỉ dẫn ${draft.instructions.length.toLocaleString("vi-VN")} ký tự${draft.instructionsTruncated ? ` (gốc ${draft.originalLength.toLocaleString("vi-VN")} — ĐÃ CẮT cho vừa trần 6.000)` : ""}`);
    if (draft.tools.length) info(`công cụ: ${draft.tools.join(", ")}`);
    else info("công cụ: (không có — skill thuần chỉ dẫn)");
    if (draft.version) info(`nguồn: skillhub.cn/${draft.skillhubSlug}@${draft.version} · ${draft.downloads.toLocaleString("vi-VN")} lượt tải`);
    for (const warning of draft.warnings) console.log(`    \u001b[33m!\u001b[0m ${warning}`);

    // Dịch trước khi ghi (nếu được yêu cầu). Bản tiếng Việt là bản bán trong chợ.
    if (TRANSLATE.length && draft.instructions) {
      try {
        const { translations, warnings: translateWarnings } = await translateViaServer({
          name: draft.name,
          tagline: draft.tagline,
          description: draft.description,
          instructions: draft.instructions,
        });
        for (const warning of translateWarnings ?? []) info(`dịch: ${warning}`);
        const primary = translations.vi ?? translations[TRANSLATE[0]];
        if (primary) {
          draft.translations = translations;
          draft.sourceLanguage = { instructions: draft.instructions.length };
          draft.name = primary.name;
          draft.tagline = primary.tagline;
          draft.description = primary.description;
          draft.instructions = primary.instructions;
          info(`đã dịch sang ${Object.keys(translations).join(", ")} bằng ${primary.model} · chỉ dẫn ${draft.instructions.length.toLocaleString("vi-VN")} ký tự`);
          for (const warning of primary.warnings ?? []) console.log(`    \u001b[33m!\u001b[0m ${warning}`);
        } else {
          info("không nhận được bản dịch nào — giữ nguyên bản gốc");
        }
      } catch (error) {
        bad(`dịch lỗi (giữ nguyên bản gốc): ${error.message}`);
      }
    }

    if (APPLY) {
      const payload = hubPayload(draft);
      if (existingRow) await admin("PATCH", `/admin/hub/${existingRow.id}`, payload, token);
      else await admin("POST", "/admin/hub", payload, token);
      ok(`đã ghi vào chợ`);
    }
  } catch (error) {
    failures += 1;
    bad(`${slug}: ${error.message}`);
  }
}

if (JSON_OUT && drafts.length) {
  fs.writeFileSync(JSON_OUT, `${JSON.stringify(drafts, null, 2)}\n`);
  ok(`đã ghi bản nháp + nguồn gốc ra ${JSON_OUT}`);
}

console.log("");
if (!APPLY) {
  console.log("Chưa ghi gì cả. Thêm --apply để nhập thật vào chợ.\n");
} else {
  console.log(`Xong: ${drafts.length - failures} skill · ${failures} lỗi.\n`);
}
process.exitCode = failures ? 1 : 0;
