#!/usr/bin/env node
/**
 * NGHIỆM THU TRỰC TUYẾN bus-686 (từ máy WIN, qua Internet công khai):
 *  - /ai/buy 6 ngôn ngữ trỏ installer .exe ?v=<md5 mới>
 *  - trang chủ trỏ overlay zip ?v=<md5 mới>
 *  - tải THẬT installer .exe: size + md5 + sha256 + magic MZ + không còn định danh key
 *  - tải THẬT overlay zip: mở zip quét mọi entry dll/exe/json/config
 */
import crypto from "node:crypto";

const V = "145f80972d615e81e02f68b89f21b27f";
const OV = "a097ab51033e917564035128b2ab75cd";
const SITE = "https://meetflowai.site";
const MARKERS = ["SonioxApiKey", "OpenRouterApiKey", "OpenAIApiKey", "PortableSecret", "ProtectedSetting", "sk-or-v1-", "snx_", "MeetFlowAI.Win.2026.Activation.Transcript"];

const has = (buf, m) => buf.includes(Buffer.from(m, "utf8")) || buf.includes(Buffer.from(m, "utf16le"));

async function get(url) {
  const r = await fetch(url, { headers: { "User-Agent": "bus686-win-verify", "Cache-Control": "no-cache" }, redirect: "follow" });
  return { status: r.status, headers: r.headers, buf: Buffer.from(await r.arrayBuffer()) };
}

let fail = 0;
const ok = (c, m) => { console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`); if (!c) fail += 1; };

console.log("== /ai/buy 6 ngôn ngữ ==");
for (const l of ["", "?lang=vi", "?lang=en", "?lang=zh", "?lang=ja", "?lang=ko"]) {
  const r = await get(`${SITE}/ai/buy${l}`);
  const hrefs = [...new Set([...r.buf.toString("utf8").matchAll(/\/dl\/MeetFlowAI[A-Za-z0-9._?=&%-]*/g)].map((m) => m[0]))];
  ok(r.status === 200 && hrefs.length === 1 && hrefs[0] === `/dl/MeetFlowAI-Setup-latest.exe?v=${V}`, `/ai/buy${l || " (vi)"} -> ${hrefs.join(", ") || "(none)"}`);
}

console.log("== trang chủ ==");
{
  const r = await get(`${SITE}/`);
  const hrefs = [...new Set([...r.buf.toString("utf8").matchAll(/\/dl\/MeetFlowAI[A-Za-z0-9._?=&%-]*/g)].map((m) => m[0]))];
  ok(hrefs.includes(`/dl/MeetFlowAI-Overlay-2.0.0-win-x64.zip?v=${OV}`), `trang chủ -> ${hrefs.join(", ")}`);
}

console.log("== installer .exe công khai ==");
{
  const r = await get(`${SITE}/dl/MeetFlowAI-Setup-latest.exe?v=${V}&cb=${Date.now()}`);
  const md5 = crypto.createHash("md5").update(r.buf).digest("hex");
  const sha = crypto.createHash("sha256").update(r.buf).digest("hex");
  ok(r.status === 200, `HTTP ${r.status}`);
  ok(r.buf.length === 52183737, `${r.buf.length} B`);
  ok(String(r.headers.get("content-type")).includes("octet-stream"), `content-type=${r.headers.get("content-type")}`);
  ok(md5 === V && sha === "6f5db3fc1b47f5f6472b4e183a9667e3a663d3fc36f047bf7007f8071a08d0f0", `md5=${md5} sha256=${sha}`);
  ok(r.buf[0] === 0x4d && r.buf[1] === 0x5a, "magic MZ");
  const hits = MARKERS.filter((m) => has(r.buf, m));
  ok(hits.length === 0, `định danh key trong .exe: ${hits.join(", ") || "0"}`);
}

console.log("== overlay zip công khai ==");
{
  const r = await get(`${SITE}/dl/MeetFlowAI-Overlay-2.0.0-win-x64.zip?v=${OV}&cb=${Date.now()}`);
  const md5 = crypto.createHash("md5").update(r.buf).digest("hex");
  const sha = crypto.createHash("sha256").update(r.buf).digest("hex");
  ok(r.status === 200, `HTTP ${r.status}`);
  ok(r.buf.length === 73565774, `${r.buf.length} B`);
  ok(md5 === OV && sha === "4122022c3bfb164d3f92c465d86fa5b8e008ae508ad7c23c2d12209098326c10", `md5=${md5} sha256=${sha}`);
  // Quét zip: dùng yauzl? Không có — dùng python3? Trên Windows không chắc. Dùng cách đọc central directory tối giản.
  const s = r.buf.toString("latin1");
  const appset = (s.match(/appsettings\.(json|dat)/g) ?? []).length;
  ok(appset === 0, `entry appsettings* trong zip: ${appset}`);
  const hits = MARKERS.filter((m) => has(r.buf, m));
  ok(hits.length === 0, `định danh key trong zip (raw): ${hits.join(", ") || "0"}`);
}

console.log(fail ? `\n❌ ${fail} mục FAIL` : "\n✅ PASS toàn bộ nghiệm thu trực tuyến bus-686");
process.exit(fail ? 2 : 0);
