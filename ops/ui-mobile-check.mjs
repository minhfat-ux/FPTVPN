#!/usr/bin/env node
/**
 * Mobile (iPhone-shaped) check for the things that broke on Safari:
 *   - the skill dropdown in the composer must be fully inside the visible
 *     viewport and tappable (it used to be clipped by `.app { overflow:hidden }`
 *     and pushed off-screen by the keyboard),
 *   - the skill picker modal's buttons must stay reachable,
 *   - the "Thiết bị đang đăng nhập" list renders in the profile modal.
 *
 *   node ops/ui-mobile-check.mjs [url] [outDir] [port]
 *
 * Uses Chrome's device emulation (390×844, touch) over CDP. iOS Safari itself
 * cannot be scripted from here, but every geometry assertion below is exactly the
 * failure mode reported on the iPhone.
 */

import fs from "node:fs";
import path from "node:path";

const [url = "https://flowgpt.meetflowai.site", outDir = "ops/ui-out-mobile", portArg] = process.argv.slice(2);
const PORT = Number(portArg ?? 9224);
const API = `${url.replace(/\/+$/, "")}/api`;
const EMAIL = `mobile-check+${Date.now()}@flowgpt.local`;
const PASSWORD = "matkhau12345";
const UA_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
fs.mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
const ok = (message) => console.log(`  \u001b[32m✔\u001b[0m ${message}`);
const bad = (message) => {
  failures += 1;
  console.log(`  \u001b[31m✖\u001b[0m ${message}`);
};
const info = (message) => console.log(`    ${message}`);

const registered = await fetch(`${API}/auth/register`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "User-Agent": UA_IPHONE },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
if (!registered.ok) {
  console.error(`✖ không tạo được tài khoản test: ${registered.status} ${await registered.text()}`);
  process.exit(1);
}
const token = (await registered.json()).token;
console.log(`Tài khoản test (iPhone UA): ${EMAIL}`);

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
async function waitFor(expression, timeout = 25000, label = expression) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return true;
    await sleep(300);
  }
  throw new Error(`hết thời gian chờ: ${label}`);
}

/**
 * Hit-test an element at its centre. This is the part that actually broke on the
 * iPhone: something else (the promo overlay, a clipped container) was on top, so
 * the tap never reached the control. Chrome's synthesized tap gesture does not
 * produce clicks in this headless build, so a real `click()` follows the check.
 */
async function hitTest(selector, { index = 0 } = {}) {
  return evaluate(`(() => {
    const el = [...document.querySelectorAll(${JSON.stringify(selector)})][${index}];
    if (!el) return null;
    el.scrollIntoView({ block: "center" });
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const hit = document.elementFromPoint(x, y);
    return {
      x, y,
      inViewport: r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight + 1 && r.right <= window.innerWidth + 1,
      reachable: Boolean(hit) && (hit === el || el.contains(hit) || hit.contains(el)),
      hitTag: hit ? hit.tagName + "." + String(hit.className || "").slice(0, 40) : null,
    };
  })()`);
}

/** Clicks through CDP mouse events (same code path as a real click). */
async function click(selector, { index = 0 } = {}) {
  const point = await hitTest(selector, { index });
  if (!point) return null;
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 });
  await sleep(450);
  return point;
}

await send("Runtime.enable");
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 844,
  deviceScaleFactor: 3,
  mobile: true,
});
await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
await send("Emulation.setUserAgentOverride", { userAgent: UA_IPHONE, platform: "iPhone" });
await send("Page.navigate", { url });
await sleep(4000);
// Forget any promo snooze so the popup is always part of this check.
await evaluate(`localStorage.setItem("flowgpt.token", ${JSON.stringify(token)}); localStorage.removeItem("flowgpt:promo:apps:v1");`);
await send("Page.navigate", { url });
await waitFor("Boolean(document.querySelector('.chat-shell, .composer'))", 30000, "khung chat");
await sleep(2500);
ok("đăng nhập và render ở khổ iPhone 390×844 (touch)");

const viewport = await evaluate(`({ w: window.innerWidth, h: window.innerHeight, dpr: devicePixelRatio })`);
info(`viewport: ${viewport.w}×${viewport.h} @${viewport.dpr}x`);

// 1. Skill dropdown: tap the trigger, then measure the menu.
const triggerCount = await evaluate(`document.querySelectorAll('.skill-trigger').length`);
info(`ô chọn kỹ năng trong DOM: ${triggerCount}`);

// 0. The promo popup must be dismissible on a phone: a full-screen overlay whose
//    close button sits off-screen blocks the whole app (that is what was reported).
const promo = await evaluate(`(() => {
  const card = document.querySelector('.fg-promo');
  const close = document.querySelector('.fg-promo__close');
  if (!card) return null;
  const box = card.getBoundingClientRect();
  const c = close ? close.getBoundingClientRect() : null;
  return {
    cardTop: Math.round(box.top),
    cardBottom: Math.round(box.bottom),
    closeVisible: c ? c.top >= 0 && c.bottom <= window.innerHeight + 1 : false,
    text: card.innerText.replace(/\\s+/g, " ").slice(0, 220),
    fontFamily: getComputedStyle(card).fontFamily,
  };
})()`);
if (promo) {
  info(`popup quảng cáo: ${promo.cardTop}→${promo.cardBottom} (màn hình ${viewport.h})`);
  info(`chữ trong popup: ${promo.text}`);
  // The popup was double-encoded ("Há»‡ sinh thÃ¡i") — garbled on every browser.
  if (/hệ sinh thái/i.test(promo.text) && !/(Ã|Â|á»|áº|â€)/.test(promo.text)) {
    ok("chữ trong popup là tiếng Việt đúng (không còn lỗi font/mojibake)");
  } else {
    bad(`chữ trong popup bị lỗi mã hoá: ${promo.text.slice(0, 80)}`);
  }
  if (promo.fontFamily) info(`font: ${promo.fontFamily}`);
  if (promo.closeVisible) ok("nút đóng popup nằm trong màn hình (bấm được trên điện thoại)");
  else bad("nút đóng popup bị đẩy ra ngoài màn hình — popup chặn cả app");
  await shot("79-mobile-promo");
  await evaluate(`document.querySelector('.fg-promo__close')?.click()`);
  await sleep(700);
  if (await evaluate(`!document.querySelector('.fg-promo-backdrop')`)) ok("đóng được popup quảng cáo");
  else bad("không đóng được popup quảng cáo");
} else {
  info("không có popup quảng cáo (đã snooze hoặc không tải)");
}

const triggerBox = await click(".skill-trigger");
await sleep(500);
if (triggerBox?.reachable) ok("ô chọn kỹ năng không bị lớp nào che (hit-test trúng phần tử)");
else if (triggerBox) bad(`ô chọn kỹ năng bị che bởi ${triggerBox.hitTag}`);
else bad("không tìm thấy ô chọn kỹ năng");

// The composer bar must not overlap its own controls (iPhone: the model <select>
// used to sit on top of the skill chip).
const layout = await evaluate(`(() => {
  const bar = document.querySelector('.composer-bar');
  const skill = document.querySelector('.skill-menu');
  const model = document.querySelector('.composer-model');
  if (!bar || !skill) return null;
  const box = (el) => (el ? el.getBoundingClientRect() : null);
  const s = box(skill);
  const m = box(model);
  const overlaps = (a, b) =>
    a && b ? !(a.right <= b.left + 0.5 || b.right <= a.left + 0.5 || a.bottom <= b.top + 0.5 || b.bottom <= a.top + 0.5) : false;
  const controls = [...bar.querySelectorAll('.skill-menu, .composer-model, .btn')].map((el) => box(el));
  let collisions = 0;
  for (let i = 0; i < controls.length; i += 1) {
    for (let j = i + 1; j < controls.length; j += 1) if (overlaps(controls[i], controls[j])) collisions += 1;
  }
  return {
    collisions,
    barOverflow: bar.scrollWidth - bar.clientWidth,
    skillWidth: Math.round(s.width),
    modelWidth: m ? Math.round(m.width) : 0,
    skillRow: s ? Math.round(s.top) : 0,
    modelRow: m ? Math.round(m.top) : 0,
    barHeight: Math.round(bar.getBoundingClientRect().height),
  };
})()`);
if (!layout) bad("không đọc được layout thanh soạn thảo");
else {
  info(
    `thanh soạn thảo: skill ${layout.skillWidth}px (y=${layout.skillRow}), model ${layout.modelWidth}px (y=${layout.modelRow}), cao ${layout.barHeight}px, tràn ${layout.barOverflow}px`,
  );
  if (layout.collisions === 0) ok("không có control nào chồng lên nhau trong thanh soạn thảo");
  else bad(`${layout.collisions} cặp control chồng nhau (skill/model/…)`);
  if (layout.barOverflow <= 1) ok("thanh soạn thảo không tràn ngang");
  else bad(`thanh soạn thảo tràn ${layout.barOverflow}px`);
  await shot("78-mobile-composer");
}

const menu = await evaluate(`(() => {
  const el = document.querySelector('.skill-dropdown-portal') ?? document.querySelector('.skill-dropdown');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return {
    top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height,
    scrollHeight: el.scrollHeight, clientHeight: el.clientHeight,
    items: el.querySelectorAll('.skill-dropdown-item').length,
    position: getComputedStyle(el).position,
    inViewport: r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight + 1 && r.right <= window.innerWidth + 1,
  };
})()`);

if (!menu) bad("bấm vào ô chọn kỹ năng nhưng menu không mở");
else {
  info(`menu: ${Math.round(menu.height)}px cao, ${menu.items} mục, position=${menu.position}, đáy=${Math.round(menu.bottom)} / màn hình ${viewport.h}`);
  if (menu.inViewport) ok("menu kỹ năng nằm TRỌN trong màn hình (không bị cắt)");
  else bad(`menu tràn khỏi màn hình: top=${Math.round(menu.top)}, bottom=${Math.round(menu.bottom)}, left=${Math.round(menu.left)}, right=${Math.round(menu.right)}`);
  if (menu.position === "fixed") ok("menu dùng position: fixed (không bị .app overflow cắt)");
  else bad(`menu vẫn là position: ${menu.position}`);
  await shot("80-mobile-skill-menu");

  // 2. Tapping a row must actually select the skill.
  const before = await evaluate(`document.querySelector('.skill-trigger-label')?.textContent ?? ""`);
  const tapped = await click(".skill-dropdown-portal .skill-dropdown-item", { index: 2 });
  const after = await evaluate(`document.querySelector('.skill-trigger-label')?.textContent ?? ""`);
  if (tapped && after && after !== before) ok(`chọn được kỹ năng bằng cảm ứng: "${before}" → "${after}"`);
  else bad(`không chọn được kỹ năng (trước="${before}", sau="${after}")`);
  const closed = await evaluate(`Boolean(document.querySelector('.skill-dropdown-portal'))`);
  if (!closed) ok("menu tự đóng sau khi chọn");
  else bad("menu không đóng sau khi chọn");
}

// 3. Picker modal: open it and check the footer buttons are reachable.
await click(".skill-trigger");
await sleep(400);
await click(".skill-dropdown-portal .skill-dropdown-more");
await sleep(900);
const modal = await evaluate(`(() => {
  const back = document.querySelector('.modal-backdrop');
  const foot = document.querySelector('.modal-foot');
  if (!back) return null;
  const backRect = back.getBoundingClientRect();
  const footRect = foot ? foot.getBoundingClientRect() : null;
  const scrollable = back.scrollHeight > back.clientHeight;
  return {
    backdropScrollable: scrollable,
    backdropOverflow: getComputedStyle(back).overflowY,
    footVisible: footRect ? footRect.top >= 0 && footRect.bottom <= window.innerHeight + 1 : false,
    footTop: footRect ? Math.round(footRect.top) : null,
    footBottom: footRect ? Math.round(footRect.bottom) : null,
    cards: document.querySelectorAll('.skill-card').length,
  };
})()`);
if (!modal) bad("không mở được ngăn kéo chọn kỹ năng");
else {
  info(`modal: ${modal.cards} thẻ kỹ năng, backdrop overflow=${modal.backdropOverflow}, nút cuối ở ${modal.footTop}–${modal.footBottom}`);
  if (modal.footVisible) ok("nút Lưu/Huỷ của ngăn kéo nằm trong màn hình (bấm được)");
  else bad("nút cuối của ngăn kéo bị đẩy ra ngoài màn hình");
  await shot("81-mobile-skill-picker");
  // Tap a skill card, then the footer action.
  await click(".skill-card");
  await sleep(300);
  const picked = await evaluate(`document.querySelectorAll('.chip.active').length`);
  if (picked > 0) ok("chạm được vào thẻ kỹ năng trong ngăn kéo");
  else bad("chạm thẻ kỹ năng không có tác dụng");
  await shot("82-mobile-picker-picked");
  const saved = await click(".modal-foot .btn-primary, .modal-foot .btn:last-child");
  await sleep(700);
  if (saved) ok("bấm được nút lưu trong ngăn kéo");
  else bad("không bấm được nút lưu");
}

// 4. Device list in the profile modal.
// On a phone the sidebar is off-canvas, so open it from the topbar first.
await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await sleep(600);
await evaluate(`document.querySelector('.modal-head .btn-ghost')?.click()`);
await sleep(500);
const openedSidebar = await click(".topbar .btn-icon");
await sleep(900);
// Toasts must not sit on top of the sidebar footer.
await waitFor("document.querySelectorAll('.toast').length === 0", 12000, "toast tự tắt").catch(() => {});
const sidebarState = await evaluate(`({
  open: Boolean(document.querySelector('.sidebar.open')),
  profile: (() => {
    const el = document.querySelector('.profile-open');
    if (!el) return null;
    el.scrollIntoView({ block: "center" });
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, hit: hit ? hit.className : null };
  })(),
})`);
info(`ngăn kéo điều hướng: open=${sidebarState.open}, nút tài khoản: ${JSON.stringify(sidebarState.profile)}`);
if (openedSidebar && sidebarState.open) ok("mở được ngăn kéo điều hướng trên điện thoại");
else bad("không mở được ngăn kéo điều hướng");
await click(".profile-open");
await sleep(1400);
const sessionDiag = await evaluate(`({
  modals: document.querySelectorAll('.modal-backdrop').length,
  title: document.querySelector('.modal-title')?.textContent ?? null,
  block: Boolean(document.querySelector('.session-block')),
})`);
info(`modal tài khoản: ${JSON.stringify(sessionDiag)}`);
const sessions = await evaluate(`(() => {
  const block = document.querySelector('.session-block');
  if (!block) return null;
  const rect = block.getBoundingClientRect();
  return {
    rows: block.querySelectorAll('.session-item').length,
    current: [...block.querySelectorAll('.badge')].map((b) => b.textContent.trim()),
    visible: rect.height > 0,
    text: block.innerText.replace(/\\s+/g, " ").slice(0, 220),
  };
})()`);
if (!sessions) bad("không thấy khối 'Thiết bị đang đăng nhập' trong menu tài khoản");
else {
  info(`thiết bị: ${sessions.rows} dòng · ${sessions.text}`);
  if (sessions.rows >= 1) ok("liệt kê được thiết bị đang đăng nhập");
  else bad("danh sách thiết bị rỗng");
  if (sessions.current.length) ok(`có nhãn thiết bị hiện tại: ${sessions.current.join(", ")}`);
  else bad("không đánh dấu thiết bị hiện tại");
  await shot("83-mobile-devices");
}

console.log(errors.length ? `  ✖ ${errors.length} lỗi console: ${errors.slice(0, 4).join(" | ")}` : "  ✔ không có lỗi console");
failures += errors.length;
console.log(
  `\n${failures ? `\u001b[31m${failures} mục chưa đạt\u001b[0m` : "\u001b[32mĐẠT HẾT\u001b[0m"}` +
    `\nDọn tài khoản test: node ops/prune-test-users.mjs --apply`,
);
ws.close();
process.exit(failures ? 1 : 0);
