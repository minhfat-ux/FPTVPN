#!/usr/bin/env node
/**
 * Production page check: does the app still render, and what does the
 * (externally added) promo popup do? Reports console errors and screenshots.
 *
 *   node ops/ui-prod-check.mjs <url> <outDir> [port]
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
  return r.result?.value;
};
async function shot(name) {
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(data, "base64"));
  console.log(`  📸 ${name}.png`);
}

await send("Runtime.enable");
await send("Page.enable");
await send("Page.navigate", { url });
await sleep(6000);

const state = await evaluate(`(() => {
  const popup = document.querySelector('.promo-overlay, [class*=promo]');
  const style = popup ? getComputedStyle(popup) : null;
  return {
    url: location.href,
    loginCard: Boolean(document.querySelector('.auth-card')),
    appShell: Boolean(document.querySelector('.sidebar, .chat-shell')),
    rootChildren: document.getElementById('root')?.childElementCount ?? 0,
    promoInDom: Boolean(popup),
    promoVisible: style ? style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0 : false,
    promoText: popup?.innerText?.replace(/\\n+/g, ' · ').slice(0, 220) ?? null,
    promoButtons: popup ? [...popup.querySelectorAll('button, a')].map((b) => b.textContent.trim()).slice(0, 6) : [],
    externalLinks: [...document.querySelectorAll('a[href^="http"]')].map((a) => a.href).slice(0, 6),
    title: document.title
  };
})()`);

console.log(`URL           : ${state.url}`);
console.log(`title         : ${state.title}`);
console.log(`#root children: ${state.rootChildren}  | login: ${state.loginCard} | app shell: ${state.appShell}`);
console.log(`promo trong DOM: ${state.promoInDom} | đang hiện: ${state.promoVisible}`);
if (state.promoText) console.log(`promo         : ${state.promoText}`);
if (state.promoButtons?.length) console.log(`nút promo     : ${state.promoButtons.join(" | ")}`);
if (state.externalLinks?.length) console.log(`link ngoài    : ${state.externalLinks.join(" | ")}`);
await shot("60-production-page");

const healthy = state.rootChildren > 0 && (state.loginCard || state.appShell);
console.log(`\n${healthy ? "✔" : "✖"} app render ${healthy ? "bình thường" : "CÓ VẤN ĐỀ"}`);
console.log(errors.length ? `✖ ${errors.length} lỗi console: ${errors.slice(0, 5).join(" | ")}` : "✔ không có lỗi console");
ws.close();
process.exit(healthy && !errors.length ? 0 : 1);
