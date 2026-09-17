#!/usr/bin/env node
/**
 * Headless UI verification over the Chrome DevTools Protocol.
 *
 * Chrome must already be running with --remote-debugging-port=<port>.
 * The script logs in through a magic link, walks the main views, clicks the
 * Studio / Settings tabs, screenshots each one and reports any console error or
 * uncaught exception. This is what catches runtime mistakes that type-checking
 * cannot (bad hooks, undefined access, broken imports).
 *
 *   node ops/ui-check.mjs <url> <outDir> [port]
 */

import fs from "node:fs";
import path from "node:path";

const [url, outDir, portArg] = process.argv.slice(2);
if (!url || !outDir) {
  console.error("usage: node ops/ui-check.mjs <url> <outDir> [port]");
  process.exit(2);
}
const PORT = Number(portArg ?? 9222);
fs.mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = targets.find((t) => t.type === "page");
if (!page) {
  console.error("Không tìm thấy tab nào trong Chrome");
  process.exit(1);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = (event) => reject(new Error(`WS error: ${event?.message ?? "unknown"}`));
});

let nextId = 0;
const pending = new Map();
const problems = [];
const consoleErrors = [];

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(`${msg.error.message} (${JSON.stringify(msg.error.data ?? "")})`));
    else resolve(msg.result);
    return;
  }
  if (msg.method === "Runtime.exceptionThrown") {
    const details = msg.params?.exceptionDetails;
    problems.push(`Uncaught: ${details?.exception?.description ?? details?.text ?? "unknown"}`);
  }
  if (msg.method === "Runtime.consoleAPICalled" && msg.params?.type === "error") {
    const text = (msg.params.args ?? []).map((a) => a.value ?? a.description ?? "").join(" ");
    consoleErrors.push(text.slice(0, 300));
  }
  if (msg.method === "Log.entryAdded" && msg.params?.entry?.level === "error") {
    const entry = msg.params.entry;
    if (!/cloudflareinsights|beacon\.min\.js/.test(entry.url ?? "")) {
      consoleErrors.push(`${entry.text} ${entry.url ?? ""}`.slice(0, 300));
    }
  }
};

function send(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`${method} quá thời gian chờ`));
      }
    }, 30000);
  });
}

async function evaluate(expression) {
  const result = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? "evaluate failed");
  }
  return result.result?.value;
}

async function shot(name) {
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  const file = path.join(outDir, `${name}.png`);
  fs.writeFileSync(file, Buffer.from(data, "base64"));
  console.log(`  📸 ${name}.png`);
  return file;
}

/** Clicks the first button/link whose visible text contains `text`. */
async function clickByText(text) {
  const clicked = await evaluate(`(() => {
    const nodes = [...document.querySelectorAll('button, a, [role="button"], .tab, .chip, .nav-item')];
    const target = nodes.find((n) => (n.textContent || '').includes(${JSON.stringify(text)}));
    if (!target) return false;
    target.scrollIntoView({ block: 'center' });
    target.click();
    return true;
  })()`);
  if (!clicked) throw new Error(`Không tìm thấy phần tử chứa "${text}"`);
  await sleep(1200);
}

async function waitFor(expression, { timeoutMs = 20000, label = expression } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (await evaluate(expression)) return true;
    } catch {
      /* page mid-navigation */
    }
    await sleep(400);
  }
  throw new Error(`Hết thời gian chờ: ${label}`);
}

function report(title) {
  console.log(`\n${title}`);
}

// --------------------------------------------------------------------- run
await send("Runtime.enable");
await send("Log.enable");
await send("Page.enable");

report("1. Mở magic link và đăng nhập");
await send("Page.navigate", { url });
await waitFor("Boolean(document.querySelector('.sidebar, .chat-shell'))", {
  timeoutMs: 30000,
  label: "app shell sau khi đăng nhập",
});
const who = await evaluate("document.querySelector('.sidebar-foot .small')?.textContent ?? null");
console.log(`  ✔ đã vào app (tài khoản: ${who})`);

report("2. Chat: màn hình trống + chip kỹ năng + composer");
await waitFor("Boolean(document.querySelector('.composer textarea'))", { label: "composer" });
const skills = await evaluate(
  "[...document.querySelectorAll('.chip-row .chip')].map((c) => c.textContent.trim())",
);
const models = await evaluate(
  "[...document.querySelectorAll('.composer select option')].map((o) => o.textContent.trim())",
);
console.log(`  ✔ chip kỹ năng: ${(skills ?? []).join(' | ') || '(không có)'}`);
console.log(`  ✔ tuỳ chọn model: ${(models ?? []).slice(0, 3).join(' | ') || '(không có)'}`);
await shot("02-chat");

report("3. Gửi một lượt chat thật (chưa cấu hình provider)");
await evaluate(`(() => {
  const ta = document.querySelector('.composer textarea');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  setter.call(ta, 'Xin chào FlowGpt');
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`);
await sleep(300);
await evaluate(`(() => {
  const form = document.querySelector('.composer');
  const btn = form.querySelector('button[type="submit"], button.btn-primary');
  btn.click();
  return true;
})()`);
await sleep(3000);
const afterSend = await evaluate(
  "document.querySelector('.msg-assistant, .status-line, .error-text, .toast')?.textContent?.slice(0,180) ?? null",
);
console.log(`  ✔ phản hồi trên UI: ${afterSend ?? '(chưa thấy)'}`);
await shot("03-chat-sent");

report("4. Studio: từng tab");
await clickByText("Studio");
await waitFor("Boolean(document.querySelector('.tabs, .studio'))", { label: "studio" });
await shot("04-studio-image");
for (const tab of ["Làm PPT", "Làm Excel", "Phân tích dữ liệu"]) {
  await clickByText(tab);
  await shot(`04-studio-${tab.replace(/\s+/g, "-").toLowerCase()}`);
}
// Exercise the Image Studio dropzone hint without a file.
await clickByText("Sửa ảnh");
const canvasInfo = await evaluate(
  "({ canvas: Boolean(document.querySelector('canvas')), dropzone: Boolean(document.querySelector('.dropzone')) })",
);
console.log(`  ✔ Image Studio: canvas=${canvasInfo?.canvas} dropzone=${canvasInfo?.dropzone}`);

report("5. Cài đặt: từng tab");
await clickByText("Cài đặt");
await waitFor("Boolean(document.querySelector('.page-inner'))", { label: "settings" });
await shot("05-settings-providers");
for (const tab of ["MCP server", "Hệ thống", "Người dùng"]) {
  await clickByText(tab);
  await shot(`05-settings-${tab.replace(/\s+/g, "-").toLowerCase()}`);
}
const settingsText = await evaluate("document.querySelector('.page-inner')?.innerText?.slice(0, 400) ?? ''");
console.log(`  ✔ nội dung tab Người dùng: ${settingsText.split("\n").slice(0, 6).join(" / ")}`);

// Mở modal thêm nhà cung cấp để chắc form render.
await clickByText("Nhà cung cấp AI");
await clickByText("Thêm nhà cung cấp");
const modal = await evaluate("Boolean(document.querySelector('.modal'))");
console.log(`  ✔ modal thêm provider: ${modal ? "render OK" : "KHÔNG mở được"}`);
await shot("06-settings-provider-modal");

report("KẾT QUẢ");
if (problems.length) {
  console.log(`  ✖ ${problems.length} lỗi runtime:`);
  for (const problem of problems.slice(0, 10)) console.log(`     - ${problem}`);
} else {
  console.log("  ✔ không có exception nào");
}
const realConsoleErrors = consoleErrors.filter(
  (text) => !/401|403|404|Failed to load resource/i.test(text),
);
if (realConsoleErrors.length) {
  console.log(`  ⚠ ${realConsoleErrors.length} console error:`);
  for (const error of realConsoleErrors.slice(0, 10)) console.log(`     - ${error}`);
} else {
  console.log("  ✔ không có console error (ngoài 4xx dự kiến)");
}

ws.close();
process.exit(problems.length ? 1 : 0);
