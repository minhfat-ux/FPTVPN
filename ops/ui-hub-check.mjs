#!/usr/bin/env node
/**
 * Kiểm tra chợ kỹ năng trong trình duyệt thật — cả phía admin lẫn phía người dùng.
 *
 *   node ops/ui-hub-check.mjs <url> <outDir> [port] [adminToken]
 *
 * Khẳng định:
 *   · tab Chợ kỹ năng (Cài đặt → Chợ kỹ năng) liệt kê đủ kỹ năng, có giá VND quy đổi
 *   · mở form "Sửa" thì ô chỉ dẫn + công cụ được NẠP SẴN từ server (lỗi cũ: trống)
 *   · giá token trong form khớp API và quy đổi VND đúng theo vndPerCredit
 *   · trang chợ phía người dùng hiện đúng giá mới
 */

import fs from "node:fs";
import path from "node:path";

const [url = "https://fbuddy.meetflowai.site", outDir = "ops/ui-out-hub", portArg, tokenArg] =
  process.argv.slice(2);
const PORT = Number(portArg ?? 9224);
const API = `${url.replace(/\/+$/, "")}/api`;
const token = tokenArg ?? process.env.FBUDDY_ADMIN_TOKEN ?? "";
fs.mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
const ok = (m) => console.log(`  \u001b[32m✔\u001b[0m ${m}`);
const bad = (m) => {
  failures += 1;
  console.log(`  \u001b[31m✖\u001b[0m ${m}`);
};
const info = (m) => console.log(`    ${m}`);

const auth = { Authorization: `Bearer ${token}` };
const settings = await fetch(`${API}/settings/app`, { headers: auth }).then((r) => r.json());
const perCredit = Number(settings.settings?.vndPerCredit ?? 0);
info(`API: vndPerCredit = ${perCredit}đ`);
if (perCredit > 0) ok(`giá 1 credit = ${perCredit}đ`);
else bad("API không trả vndPerCredit");

const adminHub = await fetch(`${API}/admin/hub`, { headers: auth }).then((r) => r.json());
const apiItems = adminHub.items ?? [];
const priced = apiItems.filter((s) => s.priceVnd > 0);
info(`API: ${apiItems.length} kỹ năng, ${priced.length} kỹ năng tính tiền`);
if (priced.length >= 6) ok(`${priced.length} kỹ năng đang bán`);
else bad(`chỉ có ${priced.length} kỹ năng tính tiền`);
const withPrompt = apiItems.filter((s) => (s.instructions ?? "").length > 0);
if (withPrompt.length === apiItems.filter((s) => s.state === "published").length) {
  ok(`API trả prompt pack cho mọi kỹ năng đang bán (${withPrompt.length} kỹ năng)`);
} else {
  bad(`chỉ ${withPrompt.length} kỹ năng có instructions — form Sửa sẽ trống`);
}
// Giá là VND; credit chỉ là bản quy đổi.
for (const skill of priced) {
  if (skill.priceVnd !== 50000) bad(`${skill.slug} bán ${skill.priceVnd}đ, không phải 50.000đ`);
}
ok(`mọi kỹ năng đang bán đều 50.000đ`);

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
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? "eval failed");
  return r.result?.value;
};
async function shot(name) {
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(data, "base64"));
  console.log(`  📸 ${name}.png`);
}
async function waitFor(expr, timeout = 25000, label = expr) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluate(expr)) return true;
    await sleep(300);
  }
  throw new Error(`hết thời gian chờ: ${label}`);
}

// ---------------------------------------------------------------- admin side
await send("Runtime.enable");
await send("Page.enable");
await send("Page.navigate", { url });
await sleep(3500);
await evaluate(
  `localStorage.setItem("fbuddy.token", ${JSON.stringify(token)}); localStorage.setItem("fbuddy.locale", "vi");`,
);
await send("Page.navigate", { url });
await waitFor("Boolean(document.querySelector('.sidebar'))", 25000, "app shell");
await sleep(1200);
await evaluate(
  `[...document.querySelectorAll('.nav-item')].find((n) => /Cài đặt|Settings|设置/.test(n.innerText))?.click()`,
);
await sleep(1500);
await evaluate(
  `[...document.querySelectorAll('.tabs button')].find((b) => /Chợ kỹ năng|Skill market|技能市场/.test(b.innerText))?.click()`,
);
await sleep(1800);
await waitFor("document.querySelectorAll('.table tbody tr').length > 0", 20000, "bảng chợ kỹ năng");

const table = await evaluate(`(() => {
  return [...document.querySelectorAll('.table tbody tr')].map((row) => {
    const cells = [...row.querySelectorAll('td')].map((c) => c.innerText.replace(/\\s+/g, ' ').trim());
    return { name: cells[0], slug: cells[1], price: cells[3], state: cells[4], installs: cells[5] };
  });
})()`);
info(`bảng admin: ${table.length} dòng`);
for (const row of table) info(`  ${row.slug} · ${row.price} · ${row.state} · ${row.installs} lượt`);
if (table.length === apiItems.length) ok(`bảng hiện đủ ${table.length} kỹ năng như API`);
else bad(`bảng có ${table.length} dòng, API có ${apiItems.length}`);

// Giá phải là VND cho người mua, kèm bản quy đổi credit cho admin.
const rowsWithVnd = table.filter((row) => /đ/.test(row.price) && /50\.000/.test(row.price));
if (rowsWithVnd.length === priced.length) ok(`${rowsWithVnd.length} dòng hiện giá VND 50.000đ`);
else bad(`chỉ ${rowsWithVnd.length}/${priced.length} dòng hiện giá VND`);
await shot("10-hub-admin-table");

// Mở form Sửa của một kỹ năng đang bán và kiểm tra prefill.
const targetSlug = priced[0].slug;
await evaluate(`(() => {
  const row = [...document.querySelectorAll('.table tbody tr')]
    .find((r) => r.querySelector('td:nth-child(2)')?.innerText.trim() === ${JSON.stringify(targetSlug)});
  [...row.querySelectorAll('button')].find((b) => /Sửa|Edit|编辑/.test(b.innerText))?.click();
})()`);
await sleep(1200);
await waitFor("Boolean(document.querySelector('.modal textarea'))", 15000, "form sửa kỹ năng");

const form = await evaluate(`(() => {
  const modal = document.querySelector('.modal');
  const areas = [...modal.querySelectorAll('textarea')].map((t) => t.value);
  const numbers = [...modal.querySelectorAll('input[type=number]')].map((i) => i.value);
  const checked = [...modal.querySelectorAll('input[type=checkbox]:checked')].map((c) => c.parentElement.innerText.trim());
  const hints = [...modal.querySelectorAll('.hint')].map((h) => h.innerText.replace(/\\s+/g, ' ').trim());
  return { areas, numbers, checked, vndHint: hints.find((h) => /≈/.test(h)) ?? null };
})()`);
const instructions = form.areas[1] ?? form.areas[0] ?? "";
info(`ô chỉ dẫn nạp được ${instructions.length} ký tự`);
info(`giá trong form: ${form.numbers[0]} · quy đổi: ${form.vndHint}`);
info(`công cụ đang chọn: ${form.checked.length ? form.checked.join(', ') : '(không chọn = tất cả)'}`);

const apiTarget = apiItems.find((s) => s.slug === targetSlug);
if (instructions.trim() === (apiTarget.instructions ?? "").trim() && instructions.length > 50) {
  ok("form Sửa nạp sẵn đúng chỉ dẫn từ server");
} else {
  bad(`ô chỉ dẫn không khớp: form ${instructions.length} ký tự, API ${(apiTarget.instructions ?? "").length}`);
}
if (String(form.numbers[0]) === String(apiTarget.priceVnd)) {
  ok(`giá trong form khớp API (${apiTarget.priceVnd.toLocaleString("vi-VN")}đ)`);
} else {
  bad(`giá form ${form.numbers[0]} khác API ${apiTarget.priceVnd}`);
}
// Ô giá nhập bằng VND; dòng gợi ý phải quy ra credit theo giá credit hiện hành.
const expectedCredits = Math.max(1, Math.ceil(apiTarget.priceVnd / perCredit)).toLocaleString("vi-VN");
if (form.vndHint && form.vndHint.includes(expectedCredits)) ok(`quy đổi đúng: ≈ ${expectedCredits} credit`);
else bad(`quy đổi sai: cần ≈ ${expectedCredits} credit, thấy "${form.vndHint}"`);
await shot("11-hub-edit-form");

await evaluate(`document.querySelector('.modal .btn')?.click()`);
await sleep(600);

// ------------------------------------------------------------- user-facing
const priceAfterEdit = await evaluate(`(() => {
  const sidebar = [...document.querySelectorAll('.nav-item')];
  const hub = sidebar.find((n) => /Chợ kỹ năng|Skill Hub|技能市场/.test(n.innerText));
  if (!hub) return null;
  hub.click();
  return true;
})()`);
if (priceAfterEdit) {
  await sleep(2500);
  await waitFor("document.querySelectorAll('.hub-card').length > 0", 20000, "thẻ kỹ năng");
  const cards = await evaluate(`[...document.querySelectorAll('.hub-card')].map((c) => c.innerText.replace(/\\s+/g, ' ').trim())`);
  info(`trang chợ: ${cards.length} thẻ`);
  const first = apiItems.find((s) => s.slug === targetSlug);
  const wanted = first.priceVnd.toLocaleString("vi-VN");
  if (cards.some((c) => c.includes(wanted))) ok(`thẻ kỹ năng hiện giá VND (${wanted}đ)`);
  else bad(`không thấy giá ${wanted}đ trên thẻ`);
  if (cards.some((c) => /token/.test(c))) bad("thẻ còn hiện giá bằng token");
  else ok("không còn thẻ nào hiện giá bằng token");
  await shot("12-hub-user-page");
} else {
  bad("không mở được trang chợ kỹ năng");
}

console.log(errors.length ? `  ✖ ${errors.length} lỗi console: ${errors.slice(0, 3).join(" | ")}` : "  ✔ không có lỗi console");
failures += errors.length;
console.log(`\n${failures ? `\u001b[31m${failures} mục chưa đạt\u001b[0m` : "\u001b[32mĐẠT HẾT\u001b[0m"}`);
ws.close();
process.exit(failures ? 1 : 0);
