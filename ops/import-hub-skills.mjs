#!/usr/bin/env node
/**
 * Imports skill packs into the FlowGpt Skill Hub (chợ kỹ năng).
 *
 * Two input shapes are supported:
 *
 *   1. A Claude/CodeBuddy-style skill folder tree — every `SKILL.md` (or
 *      `skill.md`) becomes a hub skill. YAML frontmatter carries `name`,
 *      `description`, and optionally `category` / `price` / `tools`; the
 *      markdown body becomes the model instructions.
 *
 *   2. A JSON file — either an array of skill objects or `{ skills: [...] }`
 *      with `{ slug?, name, tagline?, description?, category?, icon?, price?,
 *      instructions?, tools?, state? }`.
 *
 * Usage (dry run by default — nothing is written without --apply):
 *
 *   node ops/import-hub-skills.mjs ./vendor/codebuddy-skills
 *   node ops/import-hub-skills.mjs ./skills.json --apply
 *   node ops/import-hub-skills.mjs ./skills.json --apply --price 2000 --state coming_soon
 *   node ops/import-hub-skills.mjs ./skills.json --apply --base http://127.0.0.1:7790/api
 *
 * The admin token is read from FLOWGPT_ADMIN_TOKEN, or from --token-file
 * (default %TEMP%/admin-token.txt). Existing slugs are UPDATEd, new ones are
 * POSTed, so re-running is safe. Output prints the exact admin-API calls made.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const args = process.argv.slice(2);

/** Options that take a value; everything else that is not `--flag` is the input path. */
const VALUE_OPTIONS = new Set(["price", "state", "base", "token-file", "category", "icon"]);
const options = new Map();
const positional = [];
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (!arg.startsWith("--")) {
    positional.push(arg);
    continue;
  }
  const name = arg.slice(2);
  if (VALUE_OPTIONS.has(name)) {
    options.set(name, args[index + 1] ?? null);
    index += 1;
  } else {
    options.set(name, true);
  }
}
const flag = (name, fallback = null) => (options.has(name) ? options.get(name) : fallback);
const has = (name) => options.get(name) === true;

const input = positional[0];
if (!input) {
  console.error("Thiếu đường dẫn đầu vào. Ví dụ: node ops/import-hub-skills.mjs ./skills.json --apply");
  process.exit(2);
}

const BASE = (flag("base", process.env.FLOWGPT_API_BASE ?? "https://flowgpt.meetflowai.site/api")).replace(/\/+$/, "");
const APPLY = has("apply");
const PRICE_OVERRIDE = flag("price") === null ? null : Math.max(0, Math.trunc(Number(flag("price")) || 0));
const STATE_OVERRIDE = flag("state");
const CATEGORY_OVERRIDE = flag("category");
const TOKEN_FILE = flag("token-file", path.join(os.tmpdir(), "admin-token.txt"));

function readToken() {
  if (process.env.FLOWGPT_ADMIN_TOKEN) return process.env.FLOWGPT_ADMIN_TOKEN.trim();
  if (fs.existsSync(TOKEN_FILE)) return readText(TOKEN_FILE).trim();
  console.error(`Không tìm thấy token admin. Đặt FLOWGPT_ADMIN_TOKEN hoặc ghi token vào ${TOKEN_FILE}`);
  process.exit(2);
}

// ------------------------------------------------------------------ parsing

/** Reads a text file as UTF-8 and drops a Windows BOM (Set-Content adds one). */
function readText(file) {
  return fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
}

/** "name: X" frontmatter lines (flat YAML only — enough for skill packs). */
function parseFrontmatter(source) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
  if (!match) return { data: {}, body: source };
  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const entry = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line.trim());
    if (!entry) continue;
    let value = entry[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (value.startsWith("[") && value.endsWith("]")) {
      data[entry[1]] = value
        .slice(1, -1)
        .split(",")
        .map((part) => part.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    } else {
      data[entry[1]] = value;
    }
  }
  return { data, body: source.slice(match[0].length) };
}

function firstSentence(text, max = 200) {
  const flat = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!flat) return "";
  const stop = flat.search(/[.!?]\s/);
  const cut = stop === -1 ? flat : flat.slice(0, stop + 1);
  return cut.length <= max ? cut : `${cut.slice(0, max - 1)}…`;
}

/** Derives a stable slug for matching existing rows on re-import. */
function slugify(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

const TOOL_ALIASES = {
  ppt: "generate_pptx",
  powerpoint: "generate_pptx",
  slides: "generate_pptx",
  excel: "generate_xlsx",
  xlsx: "generate_xlsx",
  spreadsheet: "generate_xlsx",
  data: "analyze_data",
  analysis: "analyze_data",
  image: "edit_image",
  files: "list_files",
};
const KNOWN_TOOLS = new Set(["generate_pptx", "generate_xlsx", "analyze_data", "edit_image", "list_files", "read_image", "xlsx_from_image"]);

function normaliseTools(raw) {
  const list = Array.isArray(raw) ? raw : String(raw ?? "").split(",");
  const out = [];
  for (const entry of list) {
    const key = String(entry).trim().toLowerCase();
    if (!key) continue;
    const name = KNOWN_TOOLS.has(key) ? key : TOOL_ALIASES[key];
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

/** Walks a directory tree collecting every SKILL.md / skill.md. */
function findSkillFiles(root) {
  const found = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/^skill\.md$/i.test(entry.name)) found.push(full);
    }
  };
  walk(root);
  return found;
}

function fromSkillFile(file) {
  const { data, body } = parseFrontmatter(readText(file));
  const folder = path.basename(path.dirname(file));
  const name = String(data.name ?? "").trim() || folder.replace(/[-_]+/g, " ");
  const description = String(data.description ?? "").trim();
  // A skill body may open with a heading that duplicates the name — skip it.
  const instructions = body.replace(/^\s*#\s+.*\r?\n+/, "").trim();
  return {
    slug: slugify(data.slug ?? folder ?? name),
    name,
    tagline: firstSentence(description || instructions),
    description: description || firstSentence(instructions, 400),
    category: data.category,
    icon: data.icon,
    price: data.price,
    tools: data.tools,
    state: data.state,
    instructions,
  };
}

function fromJsonFile(file) {
  const parsed = JSON.parse(readText(file));
  const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.skills) ? parsed.skills : [parsed];
  return list.map((entry) => ({
    slug: slugify(entry.slug ?? entry.name ?? ""),
    name: String(entry.name ?? "").trim(),
    tagline: entry.tagline,
    description: entry.description,
    category: entry.category,
    icon: entry.icon,
    price: entry.price,
    tools: entry.tools,
    state: entry.state,
    instructions: entry.instructions ?? "",
  }));
}

// ------------------------------------------------------------------ network

async function json(method, apiPath, body, token) {
  const response = await fetch(`${BASE}${apiPath}`, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${apiPath} → ${response.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

// --------------------------------------------------------------------- main

const absolute = path.resolve(input);
if (!fs.existsSync(absolute)) {
  console.error(`Không thấy đường dẫn: ${absolute}`);
  process.exit(2);
}

const stat = fs.statSync(absolute);
const drafts = stat.isDirectory() ? findSkillFiles(absolute).map(fromSkillFile) : fromJsonFile(absolute);

if (!drafts.length) {
  console.error(`Không tìm thấy skill nào trong ${absolute}`);
  process.exit(2);
}

const cleaned = [];
for (const draft of drafts) {
  if (!draft.name) {
    console.warn(`  ! bỏ qua một mục không có tên (${draft.slug || "?"})`);
    continue;
  }
  cleaned.push({
    slug: draft.slug || slugify(draft.name),
    name: draft.name.slice(0, 120),
    tagline: String(draft.tagline ?? "").slice(0, 200),
    description: String(draft.description ?? "").slice(0, 2000),
    category: CATEGORY_OVERRIDE ?? draft.category ?? "Khác",
    icon: String(draft.icon ?? "sparkles").slice(0, 40),
    price: PRICE_OVERRIDE ?? Math.max(0, Math.trunc(Number(draft.price) || 0)),
    state: STATE_OVERRIDE ?? draft.state ?? "published",
    instructions: String(draft.instructions ?? "").slice(0, 6000),
    tools: normaliseTools(draft.tools),
  });
}

const token = readToken();
let items = [];
try {
  ({ items } = await json("GET", "/admin/hub", undefined, token));
} catch (error) {
  // A dry run only needs the live list to label create vs update, so it can
  // still preview offline. Writing anything requires a reachable API.
  if (APPLY) {
    console.error(`Không gọi được admin API (${BASE}): ${error.message}`);
    process.exit(1);
  }
  console.warn(`  ! không đọc được danh sách hiện có (${error.message}) — coi như tạo mới\n`);
}
const bySlug = new Map(items.map((item) => [item.slug, item]));

console.log(`${APPLY ? "IMPORT" : "DRY RUN"} · ${cleaned.length} skill · ${BASE}`);
console.log(`Đã có ${items.length} skill trong chợ.\n`);

let created = 0;
let updated = 0;
let skipped = 0;

for (const draft of cleaned) {
  const existing = bySlug.get(draft.slug);
  const vnd = draft.price ? ` · ${draft.price.toLocaleString("vi-VN")} token` : " · miễn phí";
  const tools = draft.tools.length ? ` · tool: ${draft.tools.join(", ")}` : "";
  const label = `${existing ? "update" : "create"} ${draft.slug} — ${draft.name}${vnd}${tools}`;
  if (!APPLY) {
    console.log(`  · ${label}`);
    continue;
  }
  try {
    if (existing) {
      const changes = { ...draft };
      delete changes.slug;
      await json("PATCH", `/admin/hub/${existing.id}`, changes, token);
      updated += 1;
      console.log(`  ✔ ${label}`);
    } else {
      const { skill } = await json("POST", "/admin/hub", draft, token);
      bySlug.set(skill.slug, skill);
      created += 1;
      console.log(`  ✔ ${label}`);
    }
  } catch (error) {
    skipped += 1;
    console.error(`  ✖ ${label}\n      ${error.message}`);
  }
}

if (APPLY) {
  console.log(`\nXong: ${created} tạo mới · ${updated} cập nhật · ${skipped} lỗi.`);
} else {
  console.log("\nChưa ghi gì cả. Thêm --apply để nhập thật.");
}
// `process.exit()` here trips a libuv assertion on Windows while fetch sockets
// are still closing, so set the code and let the loop drain instead.
process.exitCode = skipped ? 1 : 0;
