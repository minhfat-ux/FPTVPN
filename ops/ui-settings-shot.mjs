#!/usr/bin/env node
/**
 * Screenshots the Settings surface (providers + MCP) and reports what actions
 * exist there, so we can point the owner at the exact place. Also verifies that
 * a magic link switches accounts while a session is already open.
 *
 *   node ops/ui-settings-shot.mjs <magicLinkUrl> <outDir> [port]
 */

import fs from "node:fs";
import path from "node:path";

const [url, outDir, portArg] = process.argv.slice(2);
const PORT = Number(portArg ?? 9222);
fs.mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = targets.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});
let nextId = 0;
const pending = new Map();
const problems = [];
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    return;
  }
  if (msg.method === "Runtime.exceptionThrown") problems.push(msg.params?.exceptionDetails?.exception?.description ?? "exception");
};
function send(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => pending.has(id) && (pending.delete(id), reject(new Error(`${method} timeout`))), 45000);
  });
}
async function evaluate(expression) {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? "eval failed");
  return r.result?.value;
}
async function shot(name) {
  const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(data, "base64"));
  console.log(`  📸 ${name}.png`);
}
async function waitFor(expr, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (await evaluate(expr)) return true;
    } catch {}
    await sleep(300);
  }
  throw new Error(`timeout: ${label}`);
}
async function clickByText(text) {
  const ok = await evaluate(`(() => {
    const nodes = [...document.querySelectorAll('button, a, [role="button"], .tab, .nav-item')];
    const t = nodes.find((n) => (n.textContent || '').includes(${JSON.stringify(text)}));
    if (!t) return false;
    t.scrollIntoView({ block: 'center' });
    t.click();
    return true;
  })()`);
  if (!ok) throw new Error(`không tìm thấy phần tử "${text}"`);
  await sleep(1000);
}

await send("Runtime.enable");
await send("Page.enable");

console.log("1. Mở magic link (đang có phiên đăng nhập khác)");
await send("Page.navigate", { url });
await waitFor("Boolean(document.querySelector('.sidebar'))", 30000, "sidebar");
const who = await evaluate("document.querySelector('.sidebar-foot .small')?.textContent ?? ''");
const role = await evaluate("[...document.querySelectorAll('.sidebar-foot .tiny')].map((n) => n.textContent).join(' ')");
console.log(`  ✔ tài khoản hiện tại: ${who} — ${role.trim()}`);

console.log("2. Vào Cài đặt → MCP server");
await clickByText("Cài đặt");
await waitFor("Boolean(document.querySelector('.tabs'))", 20000, "settings tabs");
const tabs = await evaluate("[...document.querySelectorAll('.tab')].map((t) => t.textContent.trim())");
console.log(`  ✔ các tab: ${tabs.join(" | ")}`);
await shot("20-settings-providers");

await clickByText("MCP server");
await sleep(800);
const mcpInfo = await evaluate(`({
  buttons: [...document.querySelectorAll('.page-inner button')].map((b) => b.textContent.trim()).filter(Boolean).slice(0, 12),
  empty: document.querySelector('.page-inner .empty')?.innerText ?? null,
  servers: [...document.querySelectorAll('.page-inner .card-title')].map((c) => c.textContent.trim()).slice(0, 8)
})`);
console.log(`  ✔ nút trên tab MCP: ${(mcpInfo?.buttons ?? []).join(" | ") || "(không có)"}`);
console.log(`  ✔ thẻ đang có: ${(mcpInfo?.servers ?? []).join(" | ") || "(chưa có server nào)"}`);
await shot("21-settings-mcp");

console.log("3. Mở hộp thoại thêm MCP server");
try {
  await clickByText("Thêm");
  await sleep(700);
  const modal = await evaluate(`({
    open: Boolean(document.querySelector('.modal')),
    fields: [...document.querySelectorAll('.modal .label')].map((l) => l.textContent.trim()).slice(0, 8)
  })`);
  console.log(`  ✔ modal: ${modal?.open ? "mở được" : "KHÔNG mở"} — trường: ${(modal?.fields ?? []).join(", ")}`);
  await shot("22-settings-mcp-modal");
} catch (err) {
  console.log(`  ⚠ ${err.message}`);
}

console.log("\nKẾT QUẢ");
console.log(problems.length ? `  ✖ lỗi runtime: ${problems.slice(0, 3).join(" | ")}` : "  ✔ không có exception");
ws.close();
process.exit(problems.length ? 1 : 0);
