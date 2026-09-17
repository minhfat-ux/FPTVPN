#!/usr/bin/env node
/**
 * Kiểm tra FONT của popup quảng cáo — kể cả khi CSS của app không tải được.
 *
 *   node ops/ui-promo-font-check.mjs [url] [outDir] [port]
 *
 * Vì sao: popup hiện trước khi bundle React chạy. Nếu nó inherit font từ trang và
 * CSS của app chưa tới (mạng chậm, cache, bị chặn), Windows/iOS rơi về font mặc
 * định (Times) → "lỗi font". Test này chặn hẳn CSS của app để chứng minh popup vẫn
 * dùng font sans-serif có đủ dấu tiếng Việt, và không còn weight giả-bold 750/650.
 */

import fs from "node:fs";
import path from "node:path";

const [url = "https://fbuddy.meetflowai.site", outDir = "ops/ui-out-promo", portArg] = process.argv.slice(2);
const PORT = Number(portArg ?? 9224);
fs.mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
const ok = (m) => console.log(`  \u001b[32m✔\u001b[0m ${m}`);
const bad = (m) => {
  failures += 1;
  console.log(`  \u001b[31m✖\u001b[0m ${m}`);
};
const info = (m) => console.log(`    ${m}`);

const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = targets.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = rej;
});
let nextId = 0;
const pending = new Map();
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
  }
};
function send(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => pending.has(id) && (pending.delete(id), reject(new Error(`${method} timeout`))), 30000);
  });
}
const evaluate = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? "eval failed");
  return r.result?.value;
};
async function shot(name) {
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(data, "base64"));
  console.log(`  📸 ${name}.png`);
}
async function waitFor(expr, timeout = 25000, label = expr) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluate(expr)) return true;
    await sleep(300);
  }
  throw new Error(`hết thời gian chờ: ${label}`);
}

const READ_POPUP = `(() => {
  const card = document.querySelector('.fg-promo');
  if (!card) return null;
  const title = card.querySelector('.fg-promo__title');
  const btn = card.querySelector('.fg-btn');
  const foot = card.querySelector('.fg-promo__link, .fg-link');
  const pick = (el) => {
    if (!el) return null;
    const style = getComputedStyle(el);
    return { family: style.fontFamily, weight: style.fontWeight, size: style.fontSize };
  };
  return {
    card: pick(card),
    title: pick(title),
    button: pick(btn),
    link: pick(foot),
    text: card.innerText.replace(/\\s+/g, " ").slice(0, 160),
    fullText: card.innerText,
    appCssLoaded: getComputedStyle(document.body).fontFamily.includes('Inter'),
  };
})()`;

await send("Runtime.enable");
await send("Page.enable");
await send("Network.enable");

// Lần 1: bình thường.
await send("Page.navigate", { url });
await evaluate(`localStorage.removeItem("fbuddy:promo:apps:v1")`);
await send("Page.navigate", { url });
await waitFor("Boolean(document.querySelector('.fg-promo'))", 25000, "popup hiện");
await sleep(600);
const normal = await evaluate(READ_POPUP);
info(`bình thường — card: ${normal.card.family}`);
info(`             title: w=${normal.title.weight} · nút: w=${normal.button.weight}`);
const SANS = /Inter|Segoe UI|system-ui|Helvetica|Noto Sans|Roboto|Arial|sans-serif/i;
if (SANS.test(normal.card.family)) ok("popup khai báo font sans-serif có dấu tiếng Việt");
else bad(`font popup không đúng: ${normal.card.family}`);
if (normal.title.weight === "700" && normal.button.weight === "600") ok("chỉ dùng weight tĩnh (700/600) — hết giả-bold khác nhau tuỳ máy");
else bad(`còn weight lạ: title=${normal.title.weight}, button=${normal.button.weight}`);
if (/Để sau|Không hiện lại/.test(normal.fullText) && !/(Ã|Â|á»|áº|â€)/.test(normal.fullText)) ok("chữ trong popup đúng tiếng Việt");
else bad(`chữ lỗi: ${normal.text}`);
await shot("95-promo-font-normal");

// Lần 2: CHẶN CSS của app — mô phỏng máy tải chậm / CSS bị chặn.
await send("Network.setBlockedURLs", { urls: ["*/assets/index-*.css", "*/assets/*.css"] });
await evaluate(`localStorage.removeItem("fbuddy:promo:apps:v1")`);
await send("Page.navigate", { url });
await waitFor("Boolean(document.querySelector('.fg-promo'))", 25000, "popup hiện (CSS app bị chặn)");
await sleep(600);
const blocked = await evaluate(READ_POPUP);
info(`CSS app bị chặn — body font: ${await evaluate("getComputedStyle(document.body).fontFamily")}`);
info(`                   card font: ${blocked.card.family}`);
if (SANS.test(blocked.card.family)) ok("popup vẫn dùng font sans-serif dù CSS app không tải được");
else bad(`popup rơi về font mặc định: ${blocked.card.family}`);
if (blocked.title.weight === "700") ok("weight vẫn đúng khi thiếu CSS app");
else bad(`weight sai khi thiếu CSS app: ${blocked.title.weight}`);
await shot("96-promo-font-app-css-blocked");
await send("Network.setBlockedURLs", { urls: [] });

console.log(`\n${failures ? `\u001b[31m${failures} mục chưa đạt\u001b[0m` : "\u001b[32mĐẠT HẾT\u001b[0m"}`);
ws.close();
process.exit(failures ? 1 : 0);
