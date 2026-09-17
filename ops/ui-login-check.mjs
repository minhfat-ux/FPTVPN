#!/usr/bin/env node
/**
 * Browser check of the passwordless login flow itself: types an email, reads
 * the on-screen code, types the code (which auto-submits) and expects the app
 * shell to appear. Runs against an instance with no mailer, where the code is
 * shown on screen — that is exactly the code path the auto-submit fix touches.
 *
 *   node ops/ui-login-check.mjs <url> <outDir> [port]
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
  const { data } = await send("Page.captureScreenshot", { format: "png" });
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

await send("Runtime.enable");
await send("Page.enable");
// Start from a clean session so we exercise the real login screen.
await send("Page.navigate", { url });
await waitFor("Boolean(document.querySelector('.auth-card'))", 20000, "login page");
await evaluate("localStorage.clear()");
await send("Page.reload", { ignoreCache: true });
await waitFor("Boolean(document.querySelector('.auth-card'))", 20000, "login page after reload");
console.log("1. Trang đăng nhập đã hiển thị");

const email = `login-check-${Date.now()}@fbuddy.local`;
await evaluate(`(() => {
  const input = document.querySelector('.auth-card input[type="email"]');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, ${JSON.stringify(email)});
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`);
await sleep(300);
await evaluate(`document.querySelector('.auth-card button[type="submit"]').click()`);
await waitFor("Boolean(document.querySelector('.auth-card .input-mono'))", 20000, "code step");
console.log(`2. Đã gửi yêu cầu mã cho ${email}`);

const code = await evaluate(`(() => {
  const nodes = [...document.querySelectorAll('.auth-card .mono')];
  const text = nodes.map((n) => n.textContent.trim()).find((t) => /^[0-9]{6}$/.test(t));
  return text ?? null;
})()`);
if (!code) throw new Error("Không đọc được mã hiển thị trên màn hình");
console.log(`3. Mã hiển thị trên màn hình: ${code}`);
await shot("10-login-code-step");

// Typing the 6th digit triggers the auto-submit path that was broken.
await evaluate(`(() => {
  const input = document.querySelector('.auth-card input.input-mono');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  for (const ch of ${JSON.stringify(code)}) {
    setter.call(input, (input.value ?? '') + ch);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  return input.value;
})()`);
console.log("4. Đã nhập đủ 6 số (auto-submit)");

try {
  await waitFor("Boolean(document.querySelector('.sidebar'))", 25000, "app shell");
  const who = await evaluate("document.querySelector('.sidebar-foot .small')?.textContent ?? ''");
  const role = await evaluate(
    "[...document.querySelectorAll('.sidebar-foot .tiny')].map((n) => n.textContent).join(' ')",
  );
  console.log(`  ✔ ĐĂNG NHẬP THÀNH CÔNG: ${who} — ${role.trim()}`);
  await shot("11-login-success");
} catch (err) {
  const shown = await evaluate("document.querySelector('.auth-card .error-text')?.textContent ?? '(không có thông báo)'");
  console.log(`  ✖ Đăng nhập thất bại — UI báo: ${shown}`);
  await shot("11-login-failed");
  problems.push(`login failed: ${shown}`);
}

console.log("\nKẾT QUẢ");
console.log(problems.length ? `  ✖ ${problems.length} vấn đề: ${problems.join(" | ")}` : "  ✔ luồng đăng nhập bằng mã chạy đúng");
ws.close();
process.exit(problems.length ? 1 : 0);
