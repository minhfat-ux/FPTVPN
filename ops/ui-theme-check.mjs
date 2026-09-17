#!/usr/bin/env node
/**
 * Chụp + kiểm tra theme "FlowTech Signature" trên các trang thật.
 *   node ops/ui-theme-check.mjs [url] [outDir] [port] [adminToken]
 */
import fs from "node:fs";
import path from "node:path";

const [url = "https://flowgpt.meetflowai.site", outDir = "ops/ui-out-theme", portArg, tokenArg] = process.argv.slice(2);
const PORT = Number(portArg ?? 9224);
const token = tokenArg ?? process.env.FLOWGPT_ADMIN_TOKEN ?? "";
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
const errors = [];
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    return;
  }
  if (msg.method === "Runtime.exceptionThrown") errors.push(msg.params?.exceptionDetails?.exception?.description?.split("\n")[0] ?? "exception");
  if (msg.method === "Runtime.consoleAPICalled" && msg.params?.type === "error") {
    const text = (msg.params.args ?? []).map((a) => a.value ?? a.description ?? "").join(" ");
    if (!/401|403|404|Failed to load resource/i.test(text)) errors.push(text.slice(0, 160));
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
async function goto(view, readyExpr) {
  await send("Page.navigate", { url: `${url}/?view=${view}` });
  await waitFor(readyExpr, 25000, view);
  await sleep(1200);
}

await send("Runtime.enable");
await send("Page.enable");
await send("Page.navigate", { url });
await sleep(3000);
await evaluate(`localStorage.setItem("flowgpt.token", ${JSON.stringify(token)}); localStorage.setItem("flowgpt.locale","vi"); localStorage.removeItem("flowgpt.ecosystem.banner"); localStorage.removeItem("flowgpt:promo:apps:v1");`);
await send("Page.navigate", { url });
await waitFor("Boolean(document.querySelector('.chat-shell'))", 25000, "khung chat");
await sleep(2000);
// Tắt popup quảng cáo để chụp phần app.
await evaluate(`document.querySelector('.fg-promo__close')?.click()`);
await sleep(600);

// 1. Banner hệ sinh thái + nút gradient.
const chat = await evaluate(`(() => {
  const banner = document.querySelector('.eco-banner');
  const primary = document.querySelector('.btn-primary');
  const style = primary ? getComputedStyle(primary) : null;
  return {
    banner: Boolean(banner),
    bannerText: banner?.innerText?.replace(/\\s+/g, ' ').slice(0, 140) ?? null,
    links: banner ? [...banner.querySelectorAll('a')].map((a) => a.href).slice(0, 6) : [],
    primaryGradient: style ? /linear-gradient/.test(style.backgroundImage) : false,
    primaryColor: style?.color ?? null,
  };
})()`);
info(`banner: ${chat.banner ? "có" : "KHÔNG"} · ${chat.bannerText}`);
info(`link tải trong banner: ${chat.links.join(" | ")}`);
if (chat.banner) ok("banner tải app hệ sinh thái có trên giao diện chat");
else bad("không thấy banner hệ sinh thái");
if (chat.links.some((href) => /VPNFlow|meetflowai|apps\.apple/i.test(href))) ok("banner có link tải app thật");
else bad("banner thiếu link tải");
if (chat.primaryGradient) ok(`nút chính dùng gradient thương hiệu (chữ ${chat.primaryColor})`);
else bad("nút chính chưa dùng gradient");
await shot("97-theme-chat");

// 2. Trang nạp token: card gói có viền gradient + nền navy.
await goto("topup", "Boolean(document.querySelector('.topup-package'))");
const topup = await evaluate(`(() => {
  const card = document.querySelector('.topup-package');
  const before = card ? getComputedStyle(card, '::before') : null;
  const price = document.querySelector('.topup-package .topup-price, .topup-package strong')?.innerText ?? null;
  return {
    hasCard: Boolean(card),
    ring: before ? /linear-gradient/.test(before.backgroundImage) : false,
    radius: card ? getComputedStyle(card).borderTopLeftRadius : null,
    animation: card ? getComputedStyle(card).animationName : null,
    price,
  };
})()`);
info(`gói nạp: viền gradient=${topup.ring} · radius=${topup.radius} · animation=${topup.animation} · giá=${topup.price}`);
if (topup.hasCard && topup.ring) ok("card gói nạp có viền gradient 1px theo theme");
else bad("card gói nạp chưa có viền gradient");
if (topup.animation === "sig-rise") ok("card có animation xuất hiện (sig-rise)");
else bad(`animation sai: ${topup.animation}`);
await shot("98-theme-topup");

// 3. Cài đặt → Hệ thống: panel giá + card viền gradient.
// Điều hướng bằng menu (giống người dùng) thay vì ?view= để không phụ thuộc router.
async function openFromSidebar(labelPattern, readyExpr) {
  await evaluate(`[...document.querySelectorAll('.nav-item')].find((n) => ${labelPattern}.test(n.innerText))?.click()`);
  await waitFor(readyExpr, 25000, `view ${labelPattern}`);
  await sleep(1200);
}

await openFromSidebar("/Cài đặt|Settings|设置/", "Boolean(document.querySelector('.tabs'))");
await evaluate(`[...document.querySelectorAll('.tabs button')].find((b) => /Hệ thống/.test(b.innerText))?.click()`);
await sleep(1500);
await waitFor("Boolean(document.querySelector('.price-panel'))", 20000, "panel giá");
const panel = await evaluate(`(() => {
  const el = document.querySelector('.price-panel');
  const before = getComputedStyle(el, '::before');
  return { ring: /linear-gradient/.test(before.backgroundImage), animation: getComputedStyle(el).animationName };
})()`);
if (panel.ring) ok("panel giá có viền gradient");
else bad("panel giá chưa có viền gradient");
await shot("99-theme-settings");

// 4. Chợ kỹ năng.
await openFromSidebar("/Chợ kỹ năng|Skill|技能/", "Boolean(document.querySelector('.hub-card, .page-inner'))");
await sleep(800);
await shot("100-theme-hub");
ok("đã chụp trang chợ kỹ năng");

console.log(errors.length ? `  ✖ ${errors.length} lỗi console: ${errors.slice(0, 3).join(" | ")}` : "  ✔ không có lỗi console");
failures += errors.length;
console.log(`\n${failures ? `\u001b[31m${failures} mục chưa đạt\u001b[0m` : "\u001b[32mĐẠT HẾT\u001b[0m"}`);
ws.close();
process.exit(failures ? 1 : 0);
