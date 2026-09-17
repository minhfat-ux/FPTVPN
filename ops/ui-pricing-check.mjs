#!/usr/bin/env node
/**
 * Kiểm tra panel cấu hình giá credit (Cài đặt → Hệ thống) trong trình duyệt thật.
 *
 *   node ops/ui-pricing-check.mjs <url> <outDir> [port] [adminToken]
 *
 * Khẳng định: ô "giá 1 credit" có mặt và đúng giá trị đang chạy, các gói hiện giá
 * tự tính, và quy đổi "1 lượt chat ≈ bao nhiêu tiền" khớp với API.
 */

import fs from "node:fs";
import path from "node:path";

const [url = "https://fbuddy.meetflowai.site", outDir = "ops/ui-out-pricing", portArg, tokenArg] =
  process.argv.slice(2);
const PORT = Number(portArg ?? 9224);
const API = `${url.replace(/\/+$/, "")}/api`;
const token = tokenArg ?? process.env.FBUDDY_ADMIN_TOKEN ?? "";
fs.mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
const ok = (m) => console.log(`  \u001b[32m✔\u001b[0m ${m}`);
const bad = (m) => {
  failures += 1;
  console.log(`  \u001b[31m✖\u001b[0m ${m}`);
};
const info = (m) => console.log(`    ${m}`);

// 1. API trước: giá đang chạy là gì.
const settings = await fetch(`${API}/settings/app`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());
const app = settings.settings ?? {};
info(`API: vndPerCredit = ${app.vndPerCredit}, gói = ${(app.topupPackages ?? []).length}`);
if (app.vndPerCredit > 0) ok(`API trả giá 1 credit = ${app.vndPerCredit}đ`);
else bad("API không có vndPerCredit");

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
  if (msg.method === "Runtime.exceptionThrown") {
    errors.push(msg.params?.exceptionDetails?.exception?.description?.split("\n")[0] ?? "exception");
  }
  if (msg.method === "Runtime.consoleAPICalled" && msg.params?.type === "error") {
    const text = (msg.params.args ?? []).map((a) => a.value ?? a.description ?? "").join(" ");
    if (!/401|403|404|Failed to load resource/i.test(text)) errors.push(text.slice(0, 200));
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

await send("Runtime.enable");
await send("Page.enable");
await send("Page.navigate", { url });
await sleep(3500);
await evaluate(`localStorage.setItem("fbuddy.token", ${JSON.stringify(token)}); localStorage.setItem("fbuddy.locale", "vi");`);
await send("Page.navigate", { url });
await waitFor("Boolean(document.querySelector('.sidebar'))", 25000, "app shell");
await sleep(1200);
// Vào Cài đặt → Hệ thống.
await evaluate(`[...document.querySelectorAll('.nav-item')].find((n) => /Cài đặt|Settings|设置/.test(n.innerText))?.click()`);
await sleep(1500);
await evaluate(`[...document.querySelectorAll('.tabs button')].find((b) => /Hệ thống|System|系统/.test(b.innerText))?.click()`);
await sleep(1200);
await waitFor("Boolean(document.querySelector('.price-panel'))", 20000, "panel giá credit");

const panel = await evaluate(`(() => {
  const inputs = [...document.querySelectorAll('.price-panel input[type=number]')];
  const tiers = [...document.querySelectorAll('.price-tier')].map((row) => {
    const values = [...row.querySelectorAll('input')].map((i) => i.value);
    const note = row.querySelector('.price-tier-value')?.textContent?.trim() ?? '';
    return { name: values[0], credits: values[1], bonus: values[2], price: values[3], note };
  });
  return {
    priceInput: inputs[0]?.value ?? null,
    readout: document.querySelector('.price-readout')?.innerText?.replace(/\\s+/g, ' ') ?? null,
    signup: [...document.querySelectorAll('.price-panel .tiny.faint')].map((n) => n.innerText.trim()).find((t) => /credit/.test(t)) ?? null,
    tiers,
  };
})()`);

info(`ô giá 1 credit: ${panel.priceInput}`);
info(`quy đổi: ${panel.readout}`);
info(`tặng đăng nhập: ${panel.signup}`);
for (const tier of panel.tiers) info(`gói ${tier.name}: ${tier.credits} credit (+${tier.bonus}) → ${tier.price || "(tự tính)"} · ${tier.note}`);

if (String(panel.priceInput) === String(app.vndPerCredit)) ok("ô giá khớp với cấu hình đang chạy");
else bad(`ô giá (${panel.priceInput}) khác cấu hình (${app.vndPerCredit})`);
if (panel.tiers.length === (app.topupPackages ?? []).length && panel.tiers.length > 0) ok(`${panel.tiers.length} gói hiện trong panel`);
else bad(`số gói trong panel (${panel.tiers.length}) không khớp API (${(app.topupPackages ?? []).length})`);
if (/credit/.test(panel.readout ?? "") && /đ/.test(panel.readout ?? "")) ok("có quy đổi credit → tiền cho một lượt chat");
else bad("thiếu quy đổi tiền mỗi lượt chat");
await shot("90-pricing-panel");

console.log(errors.length ? `  ✖ ${errors.length} lỗi console: ${errors.slice(0, 3).join(" | ")}` : "  ✔ không có lỗi console");
failures += errors.length;
console.log(`\n${failures ? `\u001b[31m${failures} mục chưa đạt\u001b[0m` : "\u001b[32mĐẠT HẾT\u001b[0m"}`);
ws.close();
process.exit(failures ? 1 : 0);
