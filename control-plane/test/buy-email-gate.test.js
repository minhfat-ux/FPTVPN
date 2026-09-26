import test from "node:test";
import assert from "node:assert/strict";
import { buyPageHTML, downloadsSectionHTML, detectBuyPlatform } from "../src/payments.js";

// Chủ dự án chốt 26/09/2026: trang /buy phải BẮT BUỘC nhập email trước rồi mới hiện bản
// tải theo thiết bị. Xem docs/handoff/HANDOFF_BUY_EMAIL_GATE_2026-09-26.md.
const BASE = "https://meetflowai.site";
const LINKS = {
  ios: `${BASE}/v1/downloads/ios`,
  android: `${BASE}/v1/downloads/android`,
  androidLegacy: `${BASE}/v1/downloads/android-legacy`,
  windows: `${BASE}/dl/VPNFlow-Setup-latest.exe`,
};
const DL_RE = /downloads\/ios|downloads\/mac|VPNFlow-Setup/g;

test("detectBuyPlatform: nhận diện đúng iOS / macOS / Android / Windows, UA lạ = unknown", () => {
  assert.equal(detectBuyPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"), "ios");
  assert.equal(detectBuyPlatform("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)"), "ios");
  assert.equal(detectBuyPlatform("Mozilla/5.0 (Linux; Android 14; Pixel 8)"), "android");
  assert.equal(detectBuyPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"), "macos");
  assert.equal(detectBuyPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)"), "windows");
  assert.equal(detectBuyPlatform("curl/8.0.1"), "unknown");
  assert.equal(detectBuyPlatform(""), "unknown");
});

test("trang /buy CHƯA có email: KHÔNG được chứa link tải nào", () => {
  const html = buyPageHTML({ baseUrl: BASE, lang: "vi", product: "vpn", links: LINKS, methods: ["bankqr"], emailVerified: false });
  assert.equal((html.match(DL_RE) || []).length, 0, "trang chưa có email vẫn lộ link tải");
  assert.ok(!html.includes('<div class="dl-section">'), "không được render khối tải");
  assert.ok(html.includes('id="leadGate"'), "phải có bước nhập email");
  assert.ok(html.includes('id="leadEmail"'), "thiếu ô email của bước 1");
  assert.ok(html.includes('id="buyForm" style="display:none"'), "form thanh toán phải ẩn tới khi có email");
});

test("trang /buy mặc định (emailVerified=true): giữ nguyên khối tải cho caller cũ", () => {
  const html = buyPageHTML({ baseUrl: BASE, lang: "vi", product: "vpn", links: LINKS, methods: ["bankqr"] });
  assert.ok(html.includes('<div class="dl-section">'), "khối tải phải còn cho caller không gate");
  assert.ok(html.includes(`href="${LINKS.ios}"`), "link iOS phải còn");
});

test("khối tải theo thiết bị: iOS chỉ hiện bản iOS, các nền tảng khác bị ẩn", () => {
  const ios = downloadsSectionHTML({ baseUrl: BASE, lang: "vi", product: "vpn", links: LINKS, platform: "ios" });
  assert.ok(ios.includes(`href="${LINKS.ios}"`), "thiếu nút iOS");
  // Nút Windows bị ẩn bằng class .plat-hidden, không phải xoá khỏi DOM (để nút "chọn nền tảng khác" mở lại).
  assert.match(ios, /href="[^"]*VPNFlow-Setup-latest\.exe"[^>]*class="plat-hidden"/, "nút Windows chưa bị ẩn");
  assert.ok(ios.includes("dlOtherBtn"), "thiếu nút chọn nền tảng khác");
});

test("khối tải theo thiết bị: không nhận ra thiết bị thì hiện đủ danh sách", () => {
  const all = downloadsSectionHTML({ baseUrl: BASE, lang: "vi", product: "vpn", links: LINKS, platform: "unknown" });
  assert.ok(!all.includes("plat-hidden"), "unknown không được ẩn nền tảng nào");
  assert.ok(all.includes(`href="${LINKS.ios}"`) && all.includes(`href="${LINKS.android}"`), "phải đủ nút");
});

test("bước email có đủ chữ ở cả 5 ngôn ngữ (không rơi vào undefined)", () => {
  for (const lang of ["en", "vi", "zh", "ja", "ko"]) {
    const html = buyPageHTML({ baseUrl: BASE, lang, product: "vpn", links: LINKS, methods: ["bankqr"], emailVerified: false });
    assert.ok(html.includes('id="leadBtn"'), `${lang}: thiếu nút Tiếp tục`);
    assert.ok(!/undefined/.test(html.slice(html.indexOf('id="leadGate"'), html.indexOf('id="leadGate"') + 900)), `${lang}: có khoá i18n bị undefined`);
  }
});

// Lỗi thật 26/09/2026 (Mac verify fail bus-435): regex nằm trong template literal của
// buyPageHTML nên escape bị nuốt khi render => HTML phát ra có "[^s@]" và CHẶN NHẦM mọi
// email hợp lệ chứa chữ "s" (user@example.com, test@gmail.com...). Test này chạy thật
// biểu thức lấy từ chính HTML đang phát, không chỉ so khớp chuỗi.
test("regex email phía client phải còn escape sau khi render (chống tái phát bus-435)", () => {
  const html = buyPageHTML({ baseUrl: BASE, lang: "vi", product: "vpn", links: LINKS, methods: ["bankqr"], emailVerified: false });
  assert.ok(!html.includes("[^s@]"), "regex bị mất backslash: '[^s@]' xuất hiện trong HTML đang phát");
  const idx = html.indexOf(".test(email)");
  assert.ok(idx > 0, "không tìm thấy chỗ kiểm email phía client");
  const lit = html.slice(html.lastIndexOf("if (!", idx) + 5, idx).trim();
  assert.ok(lit.startsWith("/") && lit.endsWith("/"), "regex email không hợp lệ trong HTML: " + lit);
  const re = new RegExp(lit.slice(1, -1));
  assert.equal(re.test("user@example.com"), true, "email hợp lệ có chữ s bị chặn nhầm");
  assert.equal(re.test("test@gmail.com"), true, "email hợp lệ bị chặn nhầm");
  assert.equal(re.test("john@sub.domain.co"), true, "email nhiều dấu chấm bị chặn nhầm");
  assert.equal(re.test("khong-phai-email"), false, "email sai định dạng phải bị chặn");
  assert.equal(re.test("a b@example.com"), false, "email có khoảng trắng phải bị chặn");
});
