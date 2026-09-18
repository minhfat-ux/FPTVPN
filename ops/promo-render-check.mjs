/**
 * Kiểm chứng popup quảng cáo THẬT SỰ render đúng thứ tiếng.
 *
 * `ops/promo-i18n-check.mjs` chỉ canh bảng chuỗi; script này chạy nguyên `promo.js`
 * trong một DOM giả rồi đọc chữ đã render, nên bắt được cả lỗi ở `pickLanguage()`,
 * ở `t()`, và ở các chỗ còn hardcode.
 *
 * Kịch bản (mỗi kịch bản chỉ rõ cả múi giờ để không phụ thuộc múi giờ của máy chạy test):
 *   1. vi-VN + Asia/Ho_Chi_Minh + UA Windows → tiếng Việt, nút chính "Tải cho Windows"
 *   2. en-US + America/New_York              → tiếng Anh
 *   3. zh-CN + Asia/Shanghai                 → tiếng Trung
 *   4. fr-FR + Europe/Paris                  → mặc định tiếng Anh (không khớp)
 *   5. en-US + Asia/Ho_Chi_Minh              → đoán ra tiếng Việt (khách Việt để en-US)
 *   6. en-US + Asia/Shanghai                 → đoán ra tiếng Trung
 *   7. vi-VN + America/New_York              → vẫn tiếng Việt (ngôn ngữ được tôn trọng)
 *   8. zh-CN + Europe/Paris                  → vẫn tiếng Trung
 *
 * Chạy: node ops/promo-render-check.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TARGET = path.resolve(HERE, "..", "web", "public", "promo.js");
const source = fs.readFileSync(TARGET, "utf8");

const WINDOWS_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const MAC_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

const failures = [];
function check(ok, label, detail = "") {
  console.log(`${ok ? "OK  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(label);
}

function createNode(tag) {
  const node = {
    tagName: tag,
    children: [],
    attributes: {},
    style: { removeProperty() {} },
    className: "",
    textContent: "",
    parentNode: null,
    type: "",
    href: "",
    src: "",
    alt: "",
    id: "",
    loading: "",
    decoding: "",
    appendChild(child) {
      child.parentNode = node;
      node.children.push(child);
      return child;
    },
    removeChild(child) {
      node.children = node.children.filter((entry) => entry !== child);
      child.parentNode = null;
      return child;
    },
    setAttribute(name, value) {
      node.attributes[name] = String(value);
    },
    addEventListener() {},
    removeEventListener() {},
    focus() {},
  };
  return node;
}

function collectText(node, out) {
  if (typeof node.textContent === "string" && node.textContent) out.push(node.textContent);
  if (node.attributes && node.attributes["aria-label"]) out.push(node.attributes["aria-label"]);
  for (const child of node.children ?? []) collectText(child, out);
  return out;
}

const RealDateTimeFormat = Intl.DateTimeFormat;

/** Chạy popup thật với ngôn ngữ/UA/múi giờ cho trước, trả về toàn bộ chữ đã render. */
async function render({ languages, userAgent = MAC_UA, timeZone = null }) {
  const body = createNode("body");
  const store = new Map();

  Object.defineProperty(globalThis, "navigator", {
    value: { userAgent, language: languages[0], languages },
    configurable: true,
    writable: true,
  });
  globalThis.window = globalThis;
  globalThis.document = {
    readyState: "complete",
    body,
    activeElement: null,
    createElement: (tag) => createNode(tag),
    createElementNS: (_ns, tag) => createNode(tag),
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
  };
  globalThis.fetch = () =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ promo: { reminderMinutes: 5, creditSnoozeMinutes: 1440 } }),
    });

  if (timeZone) {
    Intl.DateTimeFormat = function (...args) {
      const instance = new RealDateTimeFormat(...args);
      return { resolvedOptions: () => Object.assign({}, instance.resolvedOptions(), { timeZone }) };
    };
  }

  try {
    vm.runInThisContext(source, { filename: "promo.js" });
  } finally {
    Intl.DateTimeFormat = RealDateTimeFormat;
  }

  // DELAY_MS trong promo.js là 1400ms.
  await new Promise((resolve) => setTimeout(resolve, 1700));
  const texts = collectText(body, []);
  delete globalThis.document;
  delete globalThis.localStorage;
  delete globalThis.fetch;
  return texts;
}

const has = (texts, needle) => texts.some((text) => text.includes(needle));

const vi = await render({ languages: ["vi-VN", "vi"], userAgent: WINDOWS_UA, timeZone: "Asia/Ho_Chi_Minh" });
check(has(vi, "Cài app dùng ngay trên mọi thiết bị"), "vi-VN ⇒ tiêu đề tiếng Việt");
check(has(vi, "Để sau") && has(vi, "Không hiện lại nữa"), "vi-VN ⇒ nút phụ tiếng Việt");
check(has(vi, "· bản cho máy bạn"), "vi-VN ⇒ nhãn 'bản cho máy bạn'");
check(has(vi, "Tải cho Windows"), "vi-VN + UA Windows ⇒ nút chính 'Tải cho Windows'");
check(has(vi, "Đóng quảng cáo"), "vi-VN ⇒ aria-label nút đóng");

const en = await render({ languages: ["en-US", "en"], timeZone: "America/New_York" });
check(has(en, "Install our apps on any device"), "en-US ⇒ tiêu đề tiếng Anh");
check(has(en, "Later") && has(en, "Don't show again"), "en-US ⇒ nút phụ tiếng Anh");
check(has(en, "Close this ad"), "en-US ⇒ aria-label nút đóng");
check(!has(en, "Để sau") && !has(en, "Cài app"), "en-US ⇒ không còn chữ tiếng Việt");

const zh = await render({ languages: ["zh-CN", "zh"], timeZone: "Asia/Shanghai" });
check(has(zh, "在任何设备上安装我们的应用"), "zh-CN ⇒ tiêu đề tiếng Trung");
check(has(zh, "稍后") && has(zh, "不再显示"), "zh-CN ⇒ nút phụ tiếng Trung");
check(has(zh, "关闭广告"), "zh-CN ⇒ aria-label nút đóng");

const fr = await render({ languages: ["fr-FR", "fr"], timeZone: "Europe/Paris" });
check(has(fr, "Install our apps on any device"), "fr-FR ⇒ mặc định là tiếng Anh");

const viByZone = await render({ languages: ["en-US", "en"], timeZone: "Asia/Ho_Chi_Minh" });
check(has(viByZone, "Cài app dùng ngay trên mọi thiết bị"), "en-US + Asia/Ho_Chi_Minh ⇒ đoán ra tiếng Việt");

const zhByZone = await render({ languages: ["en-US", "en"], timeZone: "Asia/Shanghai" });
check(has(zhByZone, "在任何设备上安装我们的应用"), "en-US + Asia/Shanghai ⇒ đoán ra tiếng Trung");

const viOutside = await render({ languages: ["vi-VN", "vi"], timeZone: "America/New_York" });
check(has(viOutside, "Cài app dùng ngay trên mọi thiết bị"), "vi-VN + America/New_York ⇒ vẫn tiếng Việt");

const zhOutside = await render({ languages: ["zh-CN", "zh"], timeZone: "Europe/Paris" });
check(has(zhOutside, "在任何设备上安装我们的应用"), "zh-CN + Europe/Paris ⇒ vẫn tiếng Trung");

console.log("");
if (failures.length) {
  console.log(`RENDER FAIL (${failures.length}): ${failures.join("; ")}`);
  process.exit(1);
}
console.log("RENDER OK — 8 kịch bản ngôn ngữ/vùng đều đúng.");
