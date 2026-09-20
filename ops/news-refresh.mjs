#!/usr/bin/env node
/**
 * CẬP NHẬT TIN TỨC HẰNG NGÀY cho fBuddy.
 *
 *   node ops/news-refresh.mjs                 # lấy tin trong 36 giờ gần nhất
 *   node ops/news-refresh.mjs --hours 72      # rộng hơn
 *   node ops/news-refresh.mjs --dry-run       # chỉ in, không ghi DB
 *
 * Nguồn: RSS của báo chính thống Việt Nam + nguồn AI/công nghệ thế giới. Dùng RSS vì đó là kênh
 * chính thức các toà soạn phát cho máy đọc — không phải đọc lén HTML rồi parse, nên ít gãy và
 * không vượt rào kỹ thuật của họ.
 *
 * Chạy bằng systemd timer (fbuddy-news.timer, 2 lần/ngày). Ghi vào bảng `news_items`.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";

const args = process.argv.slice(2);
const value = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const DRY = args.includes("--dry-run");
const HOURS = Number(value("hours", 36)) || 36;

const ENV_FILE = "/etc/fbuddy/fbuddy.env";
function loadEnv(file) {
  const out = {};
  try {
    for (const raw of fs.readFileSync(file, "utf8").split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq > 0) out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim().replace(/^"|"$/g, "");
    }
  } catch { /* không có file thì dùng env sẵn có */ }
  return out;
}
const env = { ...loadEnv(ENV_FILE), ...process.env };
const DATA_DIR = env.FBUDDY_DATA_DIR || "/var/lib/fbuddy";
const DB = env.FBUDDY_DB || `${DATA_DIR}/fbuddy.db`;

/**
 * Bảng nguồn. Mỗi nguồn: tên hiển thị, RSS, nhóm chủ đề. Cố ý chọn báo lớn/có toà soạn thật và
 * các blog kỹ thuật chính chủ của hãng AI — không lấy trang tổng hợp không rõ nguồn.
 */
const SOURCES = [
  // ---- Việt Nam (báo lớn, có toà soạn thật)
  { name: "VnExpress · Tin mới nhất", url: "https://vnexpress.net/rss/tin-moi-nhat.rss", topic: "vn", limit: 25 },
  { name: "VnExpress · Số hoá", url: "https://vnexpress.net/rss/so-hoa.rss", topic: "tech", limit: 20 },
  { name: "VnExpress · Kinh doanh", url: "https://vnexpress.net/rss/kinh-doanh.rss", topic: "vn", limit: 20 },
  { name: "Tuổi Trẻ · Tin mới nhất", url: "https://tuoitre.vn/rss/tin-moi-nhat.rss", topic: "vn", limit: 25 },
  { name: "Thanh Niên · Trang chủ", url: "https://thanhnien.vn/rss/home.rss", topic: "vn", limit: 25 },
  { name: "VietnamPlus (TTXVN)", url: "https://www.vietnamplus.vn/rss/home.rss", topic: "vn", limit: 25 },
  { name: "Nhân Dân", url: "https://nhandan.vn/rss/home.rss", topic: "vn", limit: 25 },
  // ---- AI / công nghệ thế giới (nguồn chính chủ của hãng + báo công nghệ lớn)
  { name: "OpenAI News", url: "https://openai.com/news/rss.xml", topic: "ai", limit: 10 },
  { name: "Google DeepMind", url: "https://deepmind.google/discover/blog/rss.xml", topic: "ai", limit: 10 },
  { name: "Hugging Face Blog", url: "https://huggingface.co/blog/feed.xml", topic: "ai", limit: 10 },
  { name: "TechCrunch · AI", url: "https://techcrunch.com/category/artificial-intelligence/feed/", topic: "ai", limit: 15 },
  { name: "The Verge · AI", url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml", topic: "ai", limit: 15 },
  { name: "MIT Technology Review", url: "https://www.technologyreview.com/feed/", topic: "tech", limit: 12 },
  { name: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/index", topic: "tech", limit: 12 },
  { name: "Hacker News", url: "https://hnrss.org/frontpage", topic: "tech", limit: 15 },
];

/**
 * Nguồn đã BỎ sau khi dò thật (2026-09-20) — ghi lại để lần sau không thêm lại rồi mất công:
 *   vietnamnet.vn/rss/*        → 404/301, toà soạn đã bỏ RSS
 *   chinhphu.vn/rss/*          → 404. Tin chính phủ vẫn tra được qua researcher hồ sơ "chinh-phu"
 *                                (danh sách trắng .gov.vn + vanban.chinhphu.vn) chứ không qua RSS.
 *   vneconomy.vn/rss/*         → feed rỗng (249 byte)
 *   rss.arxiv.org / export.arxiv.org/rss/cs.AI → feed rỗng; câu hỏi về bài báo AI đã có researcher
 *                                gọi thẳng arXiv API khi cần.
 *   anthropic.com/rss.xml      → 404 (hãng không phát RSS)
 *   venturebeat.com/.../feed/  → 429 liên tục
 */

const clean = (text = "") =>
  String(text)
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

/** Đọc RSS/Atom bằng regex — đủ dùng, không cần thêm thư viện. */
function parseFeed(xml) {
  const items = [];
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
  for (const block of blocks) {
    const pick = (tag) => {
      const match = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i").exec(block);
      return match ? clean(match[1]) : "";
    };
    const linkMatch = /<link[^>]*href="([^"]+)"/i.exec(block);
    const url = linkMatch ? linkMatch[1] : pick("link");
    const title = pick("title");
    if (!title || !url) continue;
    const date = pick("pubDate") || pick("published") || pick("updated") || pick("dc:date");
    items.push({
      title,
      url,
      summary: (pick("description") || pick("summary") || "").slice(0, 600),
      published: date ? new Date(date) : new Date(),
    });
  }
  return items;
}

async function fetchFeed(source) {
  const res = await fetch(source.url, {
    headers: {
      // UA nói rõ mình là ai — nhiều toà soạn chặn UA rỗng hoặc UA lạ.
      "User-Agent": "fBuddy-news/1.0 (+https://fbuddy.meetflowai.site; cap nhat tin cho tro ly)",
      Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseFeed(await res.text());
}

const cutoff = Date.now() - HOURS * 3600 * 1000;
const db = new DatabaseSync(DB);
db.exec(`CREATE TABLE IF NOT EXISTS news_items (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, url TEXT NOT NULL, source TEXT NOT NULL,
  topic TEXT NOT NULL DEFAULT 'chung', summary TEXT, published_at TEXT NOT NULL, fetched_at TEXT NOT NULL,
  UNIQUE(url));
CREATE INDEX IF NOT EXISTS idx_news_published ON news_items(published_at DESC);`);

const insert = db.prepare(
  `INSERT INTO news_items (id, title, url, source, topic, summary, published_at, fetched_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)
   ON CONFLICT(url) DO UPDATE SET title = excluded.title, summary = excluded.summary,
     published_at = excluded.published_at, fetched_at = excluded.fetched_at`,
);

let added = 0;
let failed = 0;
const perSource = [];
for (const source of SOURCES) {
  try {
    const items = (await fetchFeed(source))
      .filter((item) => item.published.getTime() >= cutoff)
      .sort((a, b) => b.published - a.published)
      .slice(0, source.limit ?? 25);
    for (const item of items) {
      const id = `news_${crypto.createHash("sha1").update(item.url).digest("hex").slice(0, 16)}`;
      if (!DRY) {
        insert.run(id, item.title.slice(0, 300), item.url.slice(0, 500), source.name, source.topic, item.summary, item.published.toISOString(), new Date().toISOString());
      }
      added += 1;
    }
    perSource.push(`${source.name}: ${items.length}`);
    console.log(`  ✓ ${source.name.padEnd(28)} ${String(items.length).padStart(3)} tin`);
  } catch (error) {
    failed += 1;
    perSource.push(`${source.name}: LỖI`);
    console.log(`  ✗ ${source.name.padEnd(28)} lỗi: ${String(error?.message ?? error).slice(0, 70)}`);
  }
}

const counts = db.prepare("SELECT topic, COUNT(*) c FROM news_items GROUP BY topic").all();
console.log(`\nTổng lấy được lần này: ${added} tin (${DRY ? "chạy khô" : "đã ghi DB"}) · nguồn lỗi: ${failed}/${SOURCES.length}`);
console.log("Trong DB theo nhóm:", counts.map((row) => `${row.topic}=${row.c}`).join(" · "));
const oldest = db.prepare("SELECT MIN(published_at) a FROM news_items").get()?.a;
const newest = db.prepare("SELECT MAX(published_at) a FROM news_items").get()?.a;
console.log(`Dải thời gian: ${String(oldest).slice(0, 16)} → ${String(newest).slice(0, 16)}`);
if (failed === SOURCES.length) {
  console.error("! TẤT CẢ nguồn đều lỗi — kiểm tra mạng/DNS của máy chủ.");
  process.exit(1);
}
