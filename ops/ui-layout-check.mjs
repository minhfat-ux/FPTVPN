#!/usr/bin/env node
/**
 * Layout regression check: long titles / long unbreakable strings must not widen
 * the sidebar or the chat column (the reported "vỡ layout" bug).
 *
 * Creates a conversation whose title is one 200-character token, sends a message
 * containing a long URL, then measures scrollWidth vs clientWidth of every
 * scrolling container. Chrome must already run with --remote-debugging-port and
 * the page must be logged in on the instance under test.
 *
 *   node ops/ui-layout-check.mjs <appUrl> <outDir> [port]
 */

import fs from "node:fs";
import path from "node:path";

const [appUrl, outDir, portArg] = process.argv.slice(2);
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
    setTimeout(() => pending.has(id) && (pending.delete(id), reject(new Error(`${method} timeout`))), 30000);
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
await send("Page.navigate", { url: appUrl });
await waitFor("Boolean(document.querySelector('.sidebar'))", 30000, "sidebar");
console.log("1. Đã vào app");

// A single 200-char token is the worst case for a flex row with ellipsis.
const uglyTitle = `Bao-cao-${"X".repeat(190)}`;
const created = await evaluate(`(async () => {
  const token = localStorage.getItem('fbuddy.token');
  const res = await fetch('/api/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ title: ${JSON.stringify(uglyTitle)}, skill: 'chat' })
  });
  return res.ok ? (await res.json()).conversation.title.length : -1;
})()`);
console.log(`2. Đã tạo hội thoại với tiêu đề dài ${created} ký tự (1 token, không khoảng trắng)`);

await evaluate("document.querySelector('.sidebar .btn-icon')?.click()");
await sleep(300);
// Reload the conversation list so the new row is rendered.
await evaluate("window.dispatchEvent(new Event('focus'))");
await evaluate(`(async () => {
  const token = localStorage.getItem('fbuddy.token');
  await fetch('/api/conversations', { headers: { Authorization: 'Bearer ' + token } });
  return true;
})()`);
await send("Page.reload", { ignoreCache: false });
await waitFor("Boolean(document.querySelector('.conv-item'))", 20000, "conv items");
await sleep(800);
await shot("30-sidebar-long-title");

const measure = await evaluate(`(() => {
  const box = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    return { selector: sel, clientWidth: el.clientWidth, scrollWidth: el.scrollWidth, overflowX: el.scrollWidth - el.clientWidth };
  };
  const title = document.querySelector('.conv-item .conv-title');
  return {
    containers: [
      box('.sidebar'),
      box('.sidebar-scroll'),
      box('.app'),
      box('.main'),
      box('.chat-scroll'),
      box('.topbar')
    ].filter(Boolean),
    title: title ? { clientWidth: title.clientWidth, scrollWidth: title.scrollWidth, ellipsisApplied: title.scrollWidth > title.clientWidth } : null,
    docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    bodyOverflow: document.body.scrollWidth - document.body.clientWidth
  };
})()`);

console.log("3. Đo tràn ngang (overflowX > 0 là lỗi):");
let bad = 0;
for (const container of measure.containers) {
  const ok = container.overflowX <= 1;
  if (!ok) bad += 1;
  console.log(`   ${ok ? "✔" : "✖"} ${container.selector.padEnd(16)} client=${container.clientWidth} scroll=${container.scrollWidth} tràn=${container.overflowX}`);
}
console.log(`   ${measure.title?.ellipsisApplied ? "✔" : "⚠"} tiêu đề dài được cắt bằng ellipsis (client=${measure.title?.clientWidth}, scroll=${measure.title?.scrollWidth})`);
console.log(`   ${Math.abs(measure.docOverflow) <= 1 ? "✔" : "✖"} tràn ngang toàn trang: ${measure.docOverflow}px`);

// Now the chat column with a long unbroken string in a user message.
console.log("4. Gửi tin nhắn chứa URL rất dài rồi đo lại");
const longText = `https://example.com/${"a".repeat(320)}`;
await evaluate(`(() => {
  const ta = document.querySelector('.composer textarea');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  setter.call(ta, ${JSON.stringify(longText)});
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`);
await sleep(300);
await evaluate("document.querySelector('.composer button.btn-primary')?.click()");
await sleep(4000);
await shot("31-chat-long-string");

const after = await evaluate(`(() => {
  const box = (sel) => { const el = document.querySelector(sel); return el ? el.scrollWidth - el.clientWidth : null; };
  return {
    chatScroll: box('.chat-scroll'),
    main: box('.main'),
    doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    bubble: box('.msg-user .msg-bubble')
  };
})()`);
console.log(`   ${(after.chatScroll ?? 0) <= 1 ? "✔" : "✖"} .chat-scroll tràn=${after.chatScroll}`);
console.log(`   ${(after.main ?? 0) <= 1 ? "✔" : "✖"} .main tràn=${after.main}`);
console.log(`   ${Math.abs(after.doc ?? 0) <= 1 ? "✔" : "✖"} toàn trang tràn=${after.doc}`);

console.log("\nKẾT QUẢ");
console.log(bad === 0 ? "  ✔ không có container nào tràn ngang" : `  ✖ ${bad} container tràn ngang`);
console.log(problems.length ? `  ✖ lỗi runtime: ${problems.slice(0, 3).join(" | ")}` : "  ✔ không có exception");
ws.close();
process.exit(bad === 0 && problems.length === 0 ? 0 : 1);
