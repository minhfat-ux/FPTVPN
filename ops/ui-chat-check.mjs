#!/usr/bin/env node
/**
 * Drives a real chat turn in the browser (CDP) and checks that the streaming
 * assistant turn renders tool cards + artifact cards. Chrome must already run
 * with --remote-debugging-port and the app must be logged in.
 *
 *   node ops/ui-chat-check.mjs <url> <outDir> [port]
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
  if (msg.method === "Runtime.exceptionThrown") {
    problems.push(msg.params?.exceptionDetails?.exception?.description ?? "unknown exception");
  }
  if (msg.method === "Runtime.consoleAPICalled" && msg.params?.type === "error") {
    problems.push((msg.params.args ?? []).map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 240));
  }
};
function send(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => pending.has(id) && (pending.delete(id), reject(new Error(`${method} timeout`))), 60000);
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
async function waitFor(expression, timeoutMs = 30000, label = expression) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (await evaluate(expression)) return true;
    } catch {}
    await sleep(400);
  }
  throw new Error(`timeout: ${label}`);
}

await send("Runtime.enable");
await send("Page.enable");
await send("Page.navigate", { url });
await waitFor("Boolean(document.querySelector('.composer textarea'))", 30000, "composer");

console.log("1. Chuẩn bị provider Demo qua API trong trang");
const provider = await evaluate(`(async () => {
  const token = localStorage.getItem('fbuddy.token');
  const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };
  const list = await (await fetch('/api/settings/providers', { headers })).json();
  const enabled = (list.items || []).find((p) => p.enabled);
  if (enabled) return { id: enabled.id, name: enabled.name, reused: true };
  const created = await (await fetch('/api/settings/providers', {
    method: 'POST', headers, body: JSON.stringify({ name: 'Demo (UI check)', kind: 'mock' })
  })).json();
  return { id: created.provider?.id, name: created.provider?.name, reused: false };
})()`);
console.log(`  ✔ provider: ${provider?.name} (${provider?.reused ? "đã có" : "mới tạo"})`);

console.log("2. Chọn skill PPT và gửi yêu cầu");
const chipFound = await evaluate(`(() => {
  const chip = [...document.querySelectorAll('.chip')].find((c) => c.textContent.includes('Làm PPT'));
  if (!chip) return false;
  chip.click();
  return true;
})()`);
if (!chipFound) throw new Error('Không tìm thấy chip "Làm PPT"');
await sleep(500);
const chipActive = await evaluate(
  `[...document.querySelectorAll('.chip')].some((c) => c.className.includes('active') && c.textContent.includes('Làm PPT'))`,
);
console.log(chipActive ? "  ✔ skill Làm PPT đang được chọn" : "  ⚠ chip chưa chuyển sang trạng thái active");
await sleep(500);
await evaluate(`(() => {
  const ta = document.querySelector('.composer textarea');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  setter.call(ta, 'Làm slide 3 trang giới thiệu fBuddy cho khách hàng');
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`);
await sleep(300);
await shot("07-chat-composer-ready");
await evaluate(`(() => {
  const c = document.querySelector('.composer');
  const btn = c.querySelector('button.btn-primary');
  btn.click();
  return true;
})()`);

console.log("3. Chờ tool card + artifact card xuất hiện");
let sawTool = false;
let sawArtifact = false;
for (let i = 0; i < 30; i += 1) {
  await sleep(1000);
  const state = await evaluate(`({
    tool: document.querySelectorAll('.tool-card').length,
    artifact: document.querySelectorAll('.artifact-card').length,
    streaming: Boolean(document.querySelector('.cursor-blink')),
    text: (document.querySelector('.msg-assistant .md')?.innerText ?? '').slice(0, 120)
  })`);
  if (state.tool && !sawTool) {
    sawTool = true;
    console.log(`  ✔ tool card xuất hiện sau ~${i + 1}s`);
    await shot("08-chat-tool-card");
  }
  if (state.artifact && !sawArtifact) {
    sawArtifact = true;
    console.log(`  ✔ artifact card xuất hiện sau ~${i + 1}s`);
  }
  if (!state.streaming && state.artifact) break;
}

console.log("4. Kiểm tra nội dung cuối");
const final = await evaluate(`({
  toolCards: [...document.querySelectorAll('.tool-card')].map((n) => n.innerText.split('\\n')[0]).slice(0, 4),
  artifacts: [...document.querySelectorAll('.artifact-card')].map((n) => n.innerText.replace(/\\n/g, ' · ')).slice(0, 4),
  assistant: (document.querySelector('.msg-assistant .md')?.innerText ?? '').slice(0, 200),
  sidebar: [...document.querySelectorAll('.conv-title')].map((n) => n.textContent).slice(0, 3)
})`);
console.log(`  ✔ tool cards: ${(final?.toolCards ?? []).join(" | ") || "(không có)"}`);
console.log(`  ✔ artifact cards: ${(final?.artifacts ?? []).join(" | ") || "(không có)"}`);
console.log(`  ✔ trả lời: ${(final?.assistant ?? "").replace(/\n/g, " ").slice(0, 160)}`);
console.log(`  ✔ sidebar: ${(final?.sidebar ?? []).join(" | ")}`);
await shot("09-chat-done");

console.log("\nKẾT QUẢ");
console.log(problems.length ? `  ✖ ${problems.length} lỗi runtime: ${problems.slice(0, 5).join(" ¶ ")}` : "  ✔ không có exception/console error");
ws.close();
process.exit(problems.length ? 1 : 0);
