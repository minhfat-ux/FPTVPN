#!/usr/bin/env node
/**
 * Voice feature verification over CDP.
 *
 * Chrome must already run with a *fake* microphone so the permission flow and the
 * voice-mode state machine can be exercised without a real device:
 *
 *   chrome --headless=new --remote-debugging-port=9222 \
 *          --use-fake-ui-for-media-stream --use-fake-device-for-media-stream \
 *          --autoplay-policy=no-user-gesture-required --user-data-dir=...
 *
 *   node ops/ui-voice-check.mjs <magicLinkUrl> <outDir> [port]
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
const warnings = [];
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    return;
  }
  if (msg.method === "Runtime.exceptionThrown") {
    problems.push(msg.params?.exceptionDetails?.exception?.description ?? "exception");
  }
  if (msg.method === "Runtime.consoleAPICalled" && msg.params?.type === "error") {
    const text = (msg.params.args ?? []).map((a) => a.value ?? a.description ?? "").join(" ");
    if (!/401|403|404|Failed to load resource/i.test(text)) warnings.push(text.slice(0, 200));
  }
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
async function clickByText(text, selector = 'button, a, [role="button"], .tab, .chip, .nav-item') {
  const ok = await evaluate(`(() => {
    const nodes = [...document.querySelectorAll(${JSON.stringify(selector)})];
    const t = nodes.find((n) => (n.textContent || '').includes(${JSON.stringify(text)}));
    if (!t) return false;
    t.scrollIntoView({ block: 'center' });
    t.click();
    return true;
  })()`);
  if (!ok) throw new Error(`không tìm thấy "${text}"`);
  await sleep(900);
}

await send("Runtime.enable");
await send("Page.enable");
await send("Browser.grantPermissions", {
  origin: new URL(url).origin,
  permissions: ["audioCapture"],
}).catch(() => {
  /* fake-ui flag already grants it */
});

console.log("1. Mở app");
await send("Page.navigate", { url });
await waitFor("Boolean(document.querySelector('.composer textarea, .sidebar'))", 30000, "app shell");

const engine = await evaluate(`(async () => {
  const r = await fetch('/api/voice/config', { headers: { Authorization: 'Bearer ' + localStorage.getItem('flowgpt.token') } });
  if (!r.ok) return { status: r.status };
  const j = await r.json();
  return { status: 200, stt: j.config.stt.mode, tts: j.config.tts.mode, language: j.config.language };
})()`);
console.log(`2. /api/voice/config → ${JSON.stringify(engine)}`);

console.log("3. Nút micro + nút Nói chuyện trong composer");
const buttons = await evaluate(`(() => {
  const box = document.querySelector('.composer');
  if (!box) return null;
  return [...box.querySelectorAll('button')].map((b) => (b.getAttribute('aria-label') || b.title || b.textContent || '').trim()).filter(Boolean);
})()`);
console.log(`   nút trong composer: ${(buttons ?? []).join(" | ")}`);
const hasMic = (buttons ?? []).some((b) => /micro|mic|giọng nói|dictation/i.test(b));
console.log(`   ${hasMic ? "✔" : "✖"} có nút micro`);
await shot("40-composer-voice-buttons");

console.log("4. Mở chế độ Nói chuyện");
let opened = false;
try {
  await clickByText("Nói chuyện", 'button, [role="button"]');
  opened = await waitFor("Boolean(document.querySelector('.voice-mode, [class*=voice]'))", 8000, "voice overlay");
} catch (err) {
  warnings.push(`không mở được chế độ nói chuyện: ${err.message}`);
}
if (opened) {
  await sleep(3000);
  const state = await evaluate(`(() => {
    const root = document.querySelector('.voice-mode') ?? document.body;
    return {
      label: root.querySelector('[class*=voice-state], .voice-state')?.textContent?.trim() ?? null,
      engine: root.querySelector('[class*=voice-engine], .voice-engine')?.textContent?.trim()?.slice(0, 160) ?? null,
      interim: root.querySelector('[class*=voice-interim], .voice-interim')?.textContent?.trim() ?? null,
      error: root.querySelector('[class*=error], .error-text')?.textContent?.trim() ?? null,
      orb: Boolean(root.querySelector('[class*=voice-orb], .voice-orb')),
      text: root.innerText?.replace(/\\n+/g, ' · ').slice(0, 220) ?? null
    };
  })()`);
  console.log(`   ${state?.orb ? "✔" : "⚠"} orb: ${state?.orb}`);
  console.log(`   trạng thái: ${state?.label ?? "(không có nhãn)"}`);
  console.log(`   engine    : ${state?.engine ?? "(không có)"}`);
  console.log(`   lỗi hiển thị: ${state?.error ?? "(không có)"}`);
  console.log(`   nội dung  : ${state?.text ?? ""}`);
  await shot("41-voice-mode");
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await sleep(800);
  const closed = await evaluate("!document.querySelector('.voice-mode')");
  console.log(`   ${closed ? "✔" : "⚠"} Escape đóng overlay: ${closed}`);
}

console.log("5. Cài đặt → Giọng nói");
const isAdmin = await evaluate("Boolean([...document.querySelectorAll('.nav-item')].find((n) => /Cài đặt/.test(n.textContent)))");
if (!isAdmin) {
  console.log("   ⚠ tài khoản này không phải admin — bỏ qua tab Giọng nói (chạy lại bằng link admin để kiểm tra)");
  warnings.push("không kiểm tra được tab Giọng nói: tài khoản không phải admin");
} else {
  await clickByText("Cài đặt");
  await waitFor("Boolean(document.querySelector('.tabs'))", 15000, "settings tabs");
  const tabs = await evaluate("[...document.querySelectorAll('.tab')].map((t) => t.textContent.trim())");
  console.log(`   tab: ${tabs.join(" | ")}`);
  if (tabs.some((t) => /giọng nói/i.test(t))) {
    await clickByText("Giọng nói", ".tab");
    await sleep(700);
    const voiceTab = await evaluate(`(() => {
      const page = document.querySelector('.page-inner');
      return {
        text: page?.innerText?.replace(/\\n+/g, ' · ').slice(0, 420) ?? "",
        radios: [...document.querySelectorAll('.page-inner input[type=radio]')].length,
        sliders: [...document.querySelectorAll('.page-inner input[type=range]')].length,
        switches: [...document.querySelectorAll('.page-inner input[type=checkbox]')].length,
        selects: [...document.querySelectorAll('.page-inner select')].length,
        freeCard: /miễn phí/i.test(page?.innerText ?? "")
      };
    })()`);
    console.log(`   ✔ tab Giọng nói: radio=${voiceTab.radios} slider=${voiceTab.sliders} switch=${voiceTab.switches} select=${voiceTab.selects}`);
    console.log(`   ${voiceTab.freeCard ? "✔" : "⚠"} có nhắc phương án miễn phí (trình duyệt)`);
    console.log(`   nội dung: ${voiceTab.text.slice(0, 300)}`);
    await shot("42-settings-voice");
    if (!voiceTab.radios) problems.push("tab Giọng nói thiếu lựa chọn trình duyệt/nhà cung cấp");
  } else {
    console.log("   ✖ chưa có tab Giọng nói");
    problems.push("thiếu tab Giọng nói trong Cài đặt");
  }
}

console.log("\nKẾT QUẢ");
console.log(problems.length ? `  ✖ ${problems.length} vấn đề: ${problems.slice(0, 4).join(" | ")}` : "  ✔ không có exception / thiếu thành phần");
if (warnings.length) console.log(`  ⚠ ${warnings.length} cảnh báo: ${warnings.slice(0, 4).join(" | ")}`);
ws.close();
process.exit(problems.length ? 1 : 0);
