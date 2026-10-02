// TG-VIBECODE / bus #693 — "test lại bản mới nhất meetflowAI trên máy thật" (máy WIN, 02/10/2026).
// Kiểm cái người dùng THẬT tải: link trên /ai/buy (5 ngôn ngữ) -> tải file -> md5/sha256 -> MOTW.
// Chạy: node ops/_scratch/win-real-machine-test.mjs
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const BASE = "https://meetflowai.site";
const OUT_DIR = path.resolve("dist", "tg-vibecode-real-test");
fs.mkdirSync(OUT_DIR, { recursive: true });

const langs = ["", "?lang=vi", "?lang=en", "?lang=zh", "?lang=ja", "?lang=ko"];
const report = { at: new Date().toISOString(), base: BASE, pages: [], download: {}, motw: null };

function windowsHref(html) {
  const out = new Set();
  for (const m of html.matchAll(/https?:\/\/[^"'\s<>]*MeetFlowAI-Setup[^"'\s<>]*/g)) out.add(m[0]);
  return [...out];
}

for (const q of langs) {
  const url = `${BASE}/ai/buy${q}`;
  const r = await fetch(url, { redirect: "follow" });
  const html = await r.text();
  report.pages.push({ url, status: r.status, windowsHrefs: windowsHref(html) });
}

const href = report.pages.flatMap((p) => p.windowsHrefs)[0] ?? `${BASE}/dl/MeetFlowAI-Setup-latest.exe`;
report.chosenHref = href;

const head = await fetch(href, { method: "HEAD", redirect: "follow" });
report.download.head = {
  status: head.status,
  contentLength: Number(head.headers.get("content-length") ?? 0),
  contentType: head.headers.get("content-type"),
  lastModified: head.headers.get("last-modified"),
  cfCache: head.headers.get("cf-cache-status"),
};

const buf = Buffer.from(await (await fetch(href, { redirect: "follow" })).arrayBuffer());
const file = path.join(OUT_DIR, "MeetFlowAI-Setup-latest.exe");
fs.writeFileSync(file, buf);
report.download.file = {
  path: file,
  bytes: buf.length,
  md5: crypto.createHash("md5").update(buf).digest("hex"),
  sha256: crypto.createHash("sha256").update(buf).digest("hex"),
  magic: buf.subarray(0, 2).toString("latin1"),
  hasInnoString: buf.includes(Buffer.from("Inno Setup")),
};

try {
  report.motw = fs.readFileSync(`${file}:Zone.Identifier`, "utf8").trim();
} catch (e) {
  report.motw = `(none: ${e.code})`;
}

console.log(JSON.stringify(report, null, 2));
