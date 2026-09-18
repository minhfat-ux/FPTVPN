#!/usr/bin/env node
/**
 * Kéo nội dung thật của toàn bộ skill + expert từ kho WorkBuddy về máy.
 *
 *   node ops/workbuddy-fetch.mjs                       # kéo hết (295 skill + 410 expert)
 *   node ops/workbuddy-fetch.mjs --kind experts        # chỉ expert
 *   node ops/workbuddy-fetch.mjs --limit 20 --out /tmp/x.json
 *
 * Nguồn: kho cộng đồng `infometa/workbuddyskills` (đồng bộ từ chợ công khai WorkBuddy),
 * metadata đã bóc sẵn ở `ops/workbuddy-catalog.json`.
 *
 * Mỗi mục lấy: `skills/<slug>/SKILL.md` (hoặc README.md); với expert là `README.md`,
 * thiếu thì lấy agent đầu tiên trong `agents/`. Không gọi AI, không ghi vào chợ —
 * chỉ tạo file nội dung để bước nhập/dịch dùng lại.
 */
import fs from "node:fs/promises";

const RAW = "https://raw.githubusercontent.com/infometa/workbuddyskills/main";
const CATALOG = "ops/workbuddy-catalog.json";
const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1] ?? null;
};
const KIND = flag("kind", "all");
const LIMIT = Number(flag("limit")) || 0;
const OUT = flag("out", "ops/workbuddy-content.json");
const CONCURRENCY = Math.max(1, Number(flag("concurrency")) || 6);

const catalog = JSON.parse(await fs.readFile(CATALOG, "utf8"));
let items = [];
for (const [kind, list] of Object.entries(catalog)) {
  if (!list?.length) continue;
  if (KIND !== "all" && kind !== KIND) continue;
  items.push(...list.map((entry) => ({ ...entry, kind: kind.replace(/s$/, "") })));
}
if (LIMIT) items = items.slice(0, LIMIT);
console.log(`Kéo ${items.length} mục từ ${RAW} …\n`);

async function getText(path) {
  const res = await fetch(`${RAW}/${path}`, { redirect: "follow" });
  if (!res.ok) return null;
  const text = await res.text();
  return text?.trim() || null;
}

/** Tệp định nghĩa của một mục, thử lần lượt theo thứ tự ưu tiên. */
async function fetchBody(item) {
  const candidates =
    item.kind === "expert"
      ? [`experts/${item.slug}/README.md`, `experts/${item.slug}/SKILL.md`]
      : [`skills/${item.slug}/SKILL.md`, `skills/${item.slug}/README.md`];
  for (const path of candidates) {
    const text = await getText(path);
    if (text) return { text, path };
  }
  // Expert nhiều agent: lấy agent đầu tiên làm thân bài.
  if (item.kind === "expert") {
    const listing = await fetch(`https://api.github.com/repos/infometa/workbuddyskills/contents/experts/${item.slug}/agents`, {
      headers: { Accept: "application/vnd.github+json", ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) },
    }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const first = Array.isArray(listing)?.find((f) => f.name.endsWith(".md"));
    if (first) {
      const text = await getText(`experts/${item.slug}/agents/${first.name}`);
      if (text) return { text, path: `experts/${item.slug}/agents/${first.name}` };
    }
  }
  return { text: null, path: null };
}

const results = [];
let fetched = 0, missing = 0, cursor = 0;
const workers = Array.from({ length: CONCURRENCY }, async () => {
  while (cursor < items.length) {
    const item = items[cursor++];
    try {
      const { text, path } = await fetchBody(item);
      if (text) {
        fetched += 1;
        results.push({ ...item, sourceFile: path, sourceUrl: `${RAW}/${path}`, body: text.slice(0, 12000), bodyLength: text.length });
        if (fetched % 25 === 0) console.log(`  … đã lấy ${fetched}/${items.length}`);
      } else {
        missing += 1;
        results.push({ ...item, sourceFile: null, body: null });
      }
    } catch (err) {
      missing += 1;
      results.push({ ...item, sourceFile: null, body: null, error: String(err?.message ?? err).slice(0, 120) });
    }
  }
});
await Promise.all(workers);

results.sort((a, b) => (a.kind === b.kind ? a.slug.localeCompare(b.slug) : a.kind.localeCompare(b.kind)));
await fs.writeFile(OUT, `${JSON.stringify(results, null, 1)}\n`);
const withBody = results.filter((r) => r.body);
const avg = withBody.length ? Math.round(withBody.reduce((n, r) => n + r.bodyLength, 0) / withBody.length) : 0;
console.log(`\nXong: ${fetched} mục có nội dung · ${missing} không lấy được · độ dài trung bình ${avg.toLocaleString("vi-VN")} ký tự`);
console.log(`Đã ghi ${OUT} (${(JSON.stringify(results).length / 1024 / 1024).toFixed(1)} MB)`);
for (const kind of ["skill", "expert"]) {
  const list = results.filter((r) => r.kind === kind);
  console.log(`  ${kind}: ${list.length} mục · có nội dung ${list.filter((r) => r.body).length} · dùng ngay ${list.filter((r) => !r.needsSetup).length}`);
}
process.exitCode = missing > items.length * 0.2 ? 1 : 0;
