#!/usr/bin/env node
/**
 * Verifies the skill dropdown (top 10) and the "Thêm kỹ năng" picker / skill
 * marketplace seed, over CDP against a logged-in instance.
 *
 *   node ops/ui-skills-check.mjs <magicLinkUrl> <outDir> [port]
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
    problems.push(msg.params?.exceptionDetails?.exception?.description ?? "exception");
  }
  if (msg.method === "Runtime.consoleAPICalled" && msg.params?.type === "error") {
    const text = (msg.params.args ?? []).map((a) => a.value ?? a.description ?? "").join(" ");
    if (!/401|403|404|Failed to load resource/i.test(text)) problems.push(text.slice(0, 200));
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
await send("Page.navigate", { url });
await waitFor("Boolean(document.querySelector('.composer textarea'))", 30000, "composer");
console.log("1. Đã vào app");

console.log("2. Dropdown kỹ năng trong composer");
const trigger = await evaluate(`(() => {
  const el = document.querySelector('.skill-trigger');
  if (!el) return null;
  return { label: el.textContent.trim(), aria: el.getAttribute('aria-label') };
})()`);
if (!trigger) {
  problems.push("không có .skill-trigger trong composer");
  console.log("  ✖ không tìm thấy dropdown");
} else {
  console.log(`  ✔ nút dropdown: "${trigger.label}" (${trigger.aria})`);
}

await evaluate("document.querySelector('.skill-trigger')?.click()");
await sleep(500);
const menu = await evaluate(`(() => {
  const dd = document.querySelector('.skill-dropdown');
  if (!dd) return null;
  return {
    items: [...dd.querySelectorAll('.skill-dropdown-item')].map((b) => b.textContent.trim().slice(0, 40)),
    more: Boolean([...dd.querySelectorAll('.skill-dropdown-more')].find((b) => /Thêm kỹ năng/.test(b.textContent)))
  };
})()`);
if (!menu) {
  problems.push("bấm dropdown nhưng menu không mở");
  console.log("  ✖ menu không mở");
} else {
  console.log(`  ✔ menu có ${menu.items.length} mục (tối đa 10): ${menu.items.slice(0, 12).join(" | ")}`);
  console.log(`  ${menu.more ? "✔" : "✖"} có mục "Thêm kỹ năng…"`);
  if (!menu.more) problems.push("thiếu mục Thêm kỹ năng trong dropdown");
  if (menu.items.length > 11) problems.push(`dropdown hiển thị ${menu.items.length} mục (>10 kỹ năng + Tự động)`);
}
await shot("50-skill-dropdown");

console.log("3. Chọn một kỹ năng khác từ dropdown");
const picked = await evaluate(`(() => {
  const dd = document.querySelector('.skill-dropdown');
  const items = [...dd.querySelectorAll('.skill-dropdown-item')];
  const target = items.find((b) => /Làm PPT|PowerPoint/.test(b.textContent));
  if (!target) return null;
  target.click();
  return true;
})()`);
await sleep(600);
const afterPick = await evaluate("document.querySelector('.skill-trigger')?.textContent?.trim() ?? null");
console.log(`  ${picked && /PPT|PowerPoint/.test(afterPick ?? "") ? "✔" : "✖"} nhãn sau khi chọn: "${afterPick}"`);
if (!picked || !/PPT|PowerPoint/.test(afterPick ?? "")) problems.push("chọn skill trong dropdown không cập nhật nhãn");

console.log("4. Mở chợ kỹ năng (Thêm kỹ năng)");
await evaluate("document.querySelector('.skill-trigger')?.click()");
await sleep(400);
await evaluate(`(() => {
  const more = [...document.querySelectorAll('.skill-dropdown-more')].find((b) => /Thêm kỹ năng/.test(b.textContent));
  more?.click();
  return Boolean(more);
})()`);
await waitFor("Boolean(document.querySelector('.modal'))", 8000, "skill picker modal");
await sleep(600);
const picker = await evaluate(`(() => {
  const modal = document.querySelector('.modal');
  return {
    title: modal.querySelector('.modal-title')?.textContent?.trim() ?? "",
    cards: modal.querySelectorAll('.skill-card').length,
    active: modal.querySelectorAll('.skill-card.active').length,
    disabled: modal.querySelectorAll('.skill-card.disabled').length,
    coming: /Chợ kỹ năng/.test(modal.innerText),
    footer: modal.querySelector('.modal-foot')?.innerText?.replace(/\\n+/g, " · ") ?? "",
    text: modal.innerText.replace(/\\n+/g, " · ").slice(0, 300)
  };
})()`);
console.log(`  ✔ modal "${picker.title}": ${picker.cards} thẻ (đang chọn ${picker.active}, sắp có ${picker.disabled})`);
console.log(`  ${picker.coming ? "✔" : "✖"} có khu "Chợ kỹ năng"`);
console.log(`  footer: ${picker.footer}`);
console.log(`  nội dung: ${picker.text.slice(0, 220)}`);
if (!picker.coming) problems.push("modal thiếu khu chợ kỹ năng");
await shot("51-skill-picker");

console.log("5. Bỏ 1 kỹ năng, lưu, rồi thêm lại");
const saved = await evaluate(`(async () => {
  const modal = document.querySelector('.modal');
  const cards = [...modal.querySelectorAll('.skill-card:not(.disabled)')];
  // With everything already installed, exercise the remove path instead.
  const active = cards.filter((c) => c.className.includes('active'));
  const unselected = cards.find((c) => !c.className.includes('active'));
  const target = unselected ?? active[active.length - 1];
  const changed = target ? target.innerText.split('\\n')[0] : null;
  const action = unselected ? 'thêm' : 'bỏ';
  target?.click();
  await new Promise((r) => setTimeout(r, 300));
  const save = [...modal.querySelectorAll('button')].find((b) => /Lưu danh sách/.test(b.textContent));
  save?.click();
  await new Promise((r) => setTimeout(r, 1500));
  const token = localStorage.getItem('flowgpt.token');
  const res = await fetch('/api/skills', { headers: { Authorization: 'Bearer ' + token } });
  const json = await res.json();
  return { action, changed, installed: json.installed, modalClosed: !document.querySelector('.modal') };
})()`);
console.log(`  ✔ ${saved.action} "${saved.changed ?? "(không có thẻ)"}" → server trả: ${saved.installed.join(", ")}`);
console.log(`  ${saved.modalClosed ? "✔" : "⚠"} modal đóng sau khi lưu: ${saved.modalClosed}`);
if (!saved.modalClosed) problems.push("modal không đóng sau khi lưu");
if (saved.action === "bỏ" && saved.installed.length !== 4) {
  problems.push(`bỏ kỹ năng nhưng server vẫn giữ ${saved.installed.length} kỹ năng`);
}
await shot("52-skill-saved");

// Put the list back to the default so the instance is left as found.
await evaluate(`(async () => {
  const token = localStorage.getItem('flowgpt.token');
  await fetch('/api/skills/installed', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ ids: ['chat', 'image', 'ppt', 'excel', 'data'] })
  });
  return true;
})()`);

console.log("\nKẾT QUẢ");
console.log(problems.length ? `  ✖ ${problems.length} vấn đề: ${problems.slice(0, 4).join(" | ")}` : "  ✔ dropdown + chợ kỹ năng hoạt động, không có exception");
ws.close();
process.exit(problems.length ? 1 : 0);
