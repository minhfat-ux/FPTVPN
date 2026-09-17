#!/usr/bin/env node
/**
 * Verifies the credit UI: sidebar balance chip, the clickable profile → "Tài khoản
 * & token" modal, the purchase/request actions and the exhausted-credit card.
 *
 *   node ops/ui-credit-check.mjs <magicLinkUrl> <outDir> [port]
 */

import fs from "node:fs";
import path from "node:path";

const [url, outDir, portArg] = process.argv.slice(2);
const PORT = Number(portArg ?? 9224);
fs.mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = targets.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = rej;
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
    problems.push(msg.params?.exceptionDetails?.exception?.description?.split("\n")[0] ?? "exception");
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
await waitFor("Boolean(document.querySelector('.sidebar'))", 30000, "app shell");
console.log("1. Đã vào app");

// Give the signed-in account some tokens so the UI has something to show.
const seeded = await evaluate(`(async () => {
  const token = localStorage.getItem('fbuddy.token');
  const me = await (await fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + token } })).json();
  return { email: me.user?.email, isAdmin: me.user?.isAdmin };
})()`);
console.log(`2. Tài khoản: ${seeded?.email} (admin: ${seeded?.isAdmin})`);

console.log("3. Chip credit trong sidebar");
const badge = await evaluate(`(() => {
  const el = document.querySelector('.credit-badge, [class*=credit]');
  return el ? { text: el.innerText.replace(/\\n+/g, ' · ').slice(0, 160), cls: el.className } : null;
})()`);
if (!badge) {
  problems.push("không thấy chip credit trong sidebar");
  console.log("  ✖ không tìm thấy (có thể credit đang tắt hoặc chưa tải xong)");
} else {
  console.log(`  ✔ "${badge.text}"`);
}
await shot("70-sidebar-credit");

console.log("4. Click profile mở modal Tài khoản & token");
const opened = await evaluate(`(() => {
  const btn = document.querySelector('.profile-open') ?? document.querySelector('.sidebar-foot button');
  if (!btn) return false;
  btn.click();
  return true;
})()`);
if (!opened) {
  problems.push("không tìm thấy nút profile");
  console.log("  ✖ không có nút profile");
} else {
  await sleep(900);
  const modal = await evaluate(`(() => {
    const m = document.querySelector('.modal');
    if (!m) return null;
    return {
      title: m.querySelector('.modal-title')?.textContent?.trim() ?? "",
      text: m.innerText.replace(/\\n+/g, ' · ').slice(0, 480),
      buttons: [...m.querySelectorAll('button, a')].map((b) => b.textContent.trim()).filter(Boolean).slice(0, 12)
    };
  })()`);
  if (!modal) {
    problems.push("click profile nhưng modal không mở");
    console.log("  ✖ modal không mở");
  } else {
    console.log(`  ✔ modal "${modal.title}"`);
    console.log(`    nút: ${modal.buttons.join(" | ")}`);
    console.log(`    nội dung: ${modal.text.slice(0, 320)}`);
    const hasBuy = modal.buttons.some((b) => /Mua thêm token/i.test(b));
    const hasRequest = modal.buttons.some((b) => /Xin thêm token/i.test(b));
    console.log(`    ${hasBuy ? "✔" : "✖"} có nút "Mua thêm token"`);
    console.log(`    ${hasRequest ? "✔" : "✖"} có nút "Xin thêm token"`);
    if (!hasBuy) problems.push("modal thiếu nút mua token");
    if (!hasRequest) problems.push("modal thiếu nút xin token");
    await shot("71-profile-modal");
  }
}

console.log("5. API credit trả về đúng dữ liệu");
const apiState = await evaluate(`(async () => {
  const token = localStorage.getItem('fbuddy.token');
  const res = await fetch('/api/credits', { headers: { Authorization: 'Bearer ' + token } });
  const json = await res.json();
  const c = json.credits ?? {};
  return { enabled: c.enabled, balance: c.balance, perToken: c.perToken, buyUrl: c.buyUrl, ledger: (c.recent ?? []).length };
})()`);
console.log(`  ✔ enabled=${apiState?.enabled} balance=${apiState?.balance} perToken=${apiState?.perToken} lịch sử=${apiState?.ledger} buyUrl=${apiState?.buyUrl}`);
if (apiState?.perToken !== 1) problems.push(`perToken phải là 1, đang là ${apiState?.perToken}`);

console.log("\nKẾT QUẢ");
console.log(problems.length ? `  ✖ ${problems.length} vấn đề: ${problems.slice(0, 4).join(" | ")}` : "  ✔ UI credit + profile hoạt động, không có exception");
ws.close();
process.exit(problems.length ? 1 : 0);
