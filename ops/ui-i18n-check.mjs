#!/usr/bin/env node
/**
 * Checks the three locales in a real browser: logs in as a throwaway account,
 * switches VI → EN → ZH, and verifies the shell copy actually changes while the
 * console stays clean.
 *
 *   node ops/ui-i18n-check.mjs <url> <outDir> [port]
 *
 * Needs Chrome/Edge already running with --remote-debugging-port (default 9224)
 * and the app reachable at <url>. The throwaway account is deleted separately:
 *   ssh root@165.101.114.162 "…DELETE FROM users WHERE email LIKE 'i18n-ui+%'"
 */

import fs from "node:fs";
import path from "node:path";

const [url = "https://flowgpt.meetflowai.site", outDir = "ops/ui-out-i18n", portArg] = process.argv.slice(2);
const PORT = Number(portArg ?? 9224);
const API = `${url.replace(/\/+$/, "")}/api`;
const EMAIL = `i18n-ui+${Date.now()}@flowgpt.local`;
const PASSWORD = "matkhau12345";
fs.mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- test account
const registered = await fetch(`${API}/auth/register`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
if (!registered.ok) {
  console.error(`✖ không tạo được tài khoản test: ${registered.status} ${await registered.text()}`);
  process.exit(1);
}
const token = (await registered.json()).token;
console.log(`Tài khoản test: ${EMAIL}`);

// ------------------------------------------------------------------- CDP glue
const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = targets.find((t) => t.type === "page");
if (!page) {
  console.error(`✖ không thấy tab nào trên cổng ${PORT}`);
  process.exit(1);
}
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
const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? "evaluate failed");
  return r.result?.value;
};
async function shot(name) {
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(data, "base64"));
  console.log(`  📸 ${name}.png`);
}
async function waitFor(expression, timeout = 20000, label = expression) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return true;
    await sleep(300);
  }
  throw new Error(`hết thời gian chờ: ${label}`);
}

await send("Runtime.enable");
await send("Page.enable");
await send("Page.navigate", { url });
await sleep(4000);
await evaluate(`localStorage.setItem("flowgpt.token", ${JSON.stringify(token)})`);
await send("Page.navigate", { url });
await waitFor("Boolean(document.querySelector('.sidebar'))", 25000, "app shell hiện ra");
await sleep(1500);
console.log("✔ đăng nhập được, app shell đã render");

// Visible copy of the shell = topbar + sidebar, which every locale must translate.
const READ = `(() => {
  const topbar = document.querySelector('.topbar, header');
  const sidebar = document.querySelector('.sidebar');
  return {
    lang: document.documentElement.lang,
    locale: localStorage.getItem("flowgpt.locale"),
    topbar: topbar ? topbar.innerText.replace(/\\s+/g, " ").trim().slice(0, 160) : null,
    nav: sidebar ? [...sidebar.querySelectorAll('button, a')].map((n) => n.innerText.replace(/\\s+/g, " ").trim()).filter(Boolean).slice(0, 8) : [],
    chips: [...document.querySelectorAll('.locale-switcher button')].map((b) => b.textContent.trim()),
  };
})()`;

const results = {};
for (const locale of ["vi", "en", "zh"]) {
  await evaluate(`localStorage.setItem("flowgpt.locale", ${JSON.stringify(locale)})`);
  await send("Page.navigate", { url });
  await waitFor("Boolean(document.querySelector('.sidebar'))", 25000, `app shell (${locale})`);
  await sleep(1200);
  results[locale] = await evaluate(READ);
  console.log(
    `\n[${locale}] html lang=${results[locale].lang} | nav: ${results[locale].nav.join(" · ") || "(trống)"}`,
  );
  console.log(`      topbar: ${results[locale].topbar}`);
  await shot(`70-i18n-${locale}`);
}

// The switcher must be visible on the main screen (topbar), not only in a menu.
await evaluate(`localStorage.setItem("flowgpt.locale", "vi")`);
await send("Page.navigate", { url });
await waitFor("Boolean(document.querySelector('.topbar-locale .locale-chip'))", 20000, "locale chips trong topbar");
await sleep(600);
const topbarChips = await evaluate(`(() => {
  const box = document.querySelector('.topbar-locale');
  const chips = [...box.querySelectorAll('.locale-chip')].map((b) => b.textContent.trim());
  const rect = box.getBoundingClientRect();
  const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
  return { chips, visible: rect.width > 0 && rect.height > 0, reachable: Boolean(hit) && box.contains(hit) };
})()`);
console.log(`\nTopbar locale: ${topbarChips.chips.join("/")} | hiện: ${topbarChips.visible} | bấm được: ${topbarChips.reachable}`);
await shot("72-i18n-topbar");

// System language: a French browser must land on English, not Vietnamese.
await send("Emulation.setLocaleOverride", { locale: "fr-FR" });
await send("Emulation.setUserAgentOverride", { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15", acceptLanguage: "fr-FR,fr;q=0.9,en;q=0.8" });
await evaluate(`localStorage.removeItem("flowgpt.locale")`);
await send("Page.navigate", { url });
await waitFor("Boolean(document.querySelector('.sidebar'))", 25000, "app shell (system locale)");
await sleep(1200);
const systemLocale = await evaluate(`({ lang: document.documentElement.lang, stored: localStorage.getItem("flowgpt.locale"), nav: [...document.querySelectorAll('.sidebar button, .sidebar a')].map((n) => n.innerText.trim()).filter(Boolean).slice(0, 3) })`);
console.log(`\nHệ thống = fr-FR → app chọn: ${systemLocale.lang} (nav: ${systemLocale.nav.join(" · ")})`);

// The language switcher should be reachable from the profile menu.
await evaluate(`localStorage.setItem("flowgpt.locale", "vi")`);
await send("Page.navigate", { url });
await waitFor("Boolean(document.querySelector('.sidebar'))", 25000, "app shell (switcher)");
await sleep(1200);
const opened = await evaluate(`(() => {
  const trigger = document.querySelector('.profile-trigger, .profile-button, [aria-label*="ài khoản"], .topbar button:last-of-type');
  if (trigger) trigger.click();
  return Boolean(trigger);
})()`);
await sleep(900);
const switcher = await evaluate(`(() => {
  const box = document.querySelector('.locale-switcher');
  if (!box) return null;
  const chip = [...box.querySelectorAll('button')].find((b) => b.textContent.trim() === 'EN');
  const before = document.querySelector('.sidebar')?.innerText ?? '';
  chip?.click();
  return { chips: [...box.querySelectorAll('button')].map((b) => b.textContent.trim()), clicked: Boolean(chip), before };
})()`);
await sleep(1200);
const afterClick = await evaluate(`(() => ({
  lang: document.documentElement.lang,
  locale: localStorage.getItem("flowgpt.locale"),
  nav: [...document.querySelectorAll('.sidebar button, .sidebar a')].map((n) => n.innerText.replace(/\\s+/g, " ").trim()).filter(Boolean).slice(0, 8),
}))()`);
if (switcher) await shot("71-i18n-switcher-en");

// ------------------------------------------------------------------- verdict
let failures = 0;
const ok = (m) => console.log(`  ✔ ${m}`);
const bad = (m) => {
  failures += 1;
  console.log(`  ✖ ${m}`);
};

console.log("\nKiểm tra:");
if (results.vi.lang === "vi" && results.en.lang === "en" && results.zh.lang === "zh") ok("html lang đổi theo locale");
else bad(`html lang sai: vi=${results.vi.lang} en=${results.en.lang} zh=${results.zh.lang}`);

for (const [locale, data] of Object.entries(results)) {
  // Untranslated keys would show up as dotted identifiers ("shell.sidebar.settings").
  const looksUntranslated = data.nav.length < 3 || data.nav.every((item) => /^[a-z][\w]*(\.[\w]+)+$/i.test(item));
  if (!looksUntranslated) ok(`menu ${locale} có nhãn thật`);
  else bad(`menu ${locale} trông như chưa dịch: ${data.nav.join(" | ")}`);
}

const viText = `${results.vi.topbar} ${results.vi.nav.join(" ")}`;
const enText = `${results.en.topbar} ${results.en.nav.join(" ")}`;
const zhText = `${results.zh.topbar} ${results.zh.nav.join(" ")}`;
if (viText !== enText && enText !== zhText && viText !== zhText) ok("copy khác nhau giữa 3 ngôn ngữ");
else bad("copy giống nhau giữa các ngôn ngữ — có thể chưa nối i18n");

if (/[\u4e00-\u9fff]/.test(zhText)) ok("tiếng Trung có chữ Hán");
else bad("locale zh không có chữ Hán");

if (!opened) bad("không mở được menu tài khoản");
else if (switcher?.chips?.length === 3) ok(`LocaleSwitcher có 3 lựa chọn: ${switcher.chips.join("/")}`);
else bad("không thấy LocaleSwitcher trong menu tài khoản");

if (topbarChips?.visible && topbarChips.reachable && topbarChips.chips.length === 3) {
  ok(`đổi ngôn ngữ ngay trên màn hình chính (topbar): ${topbarChips.chips.join("/")}`);
} else {
  bad(`topbar không có bộ chọn ngôn ngữ dùng được: ${JSON.stringify(topbarChips)}`);
}

if (systemLocale.lang === "en") ok("trình duyệt tiếng Pháp → mặc định là English (không rơi về tiếng Việt)");
else bad(`hệ thống fr-FR nhưng app chọn ${systemLocale.lang}`);

if (switcher?.clicked) {
  if (afterClick.locale === "en" && afterClick.lang === "en") ok("bấm EN trong menu đổi ngôn ngữ ngay");
  else bad(`bấm EN nhưng locale=${afterClick.locale}, lang=${afterClick.lang}`);
}

console.log(errors.length ? `  ✖ ${errors.length} lỗi console: ${errors.slice(0, 4).join(" | ")}` : "  ✔ không có lỗi console");
failures += errors.length;
console.log(`\n${failures ? `\u001b[31m${failures} mục chưa đạt\u001b[0m` : "\u001b[32mĐẠT HẾT\u001b[0m"}`);
ws.close();
process.exit(failures ? 1 : 0);
