import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveQrFile, qrAmountsFor, downloadQrPng, downloadQrSectionHTML } from "../src/payments.js";
import fs2 from "node:fs";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "payqr-"));
const touch = (name) => fs.writeFileSync(path.join(dir, name), "x");

test("QR theo GÓI được ưu tiên hơn ảnh chung (số tiền đã có sẵn trong ảnh)", () => {
  touch("wechat-monthly.JPG");
  touch("wechat.png");
  const r = resolveQrFile(dir, "wechat", { plan: "monthly", cny: 57, product: "vpn" });
  // macOS không phân biệt hoa/thường nên tên trả về có thể là .JPG hoặc .jpg — code thử cả hai
  // để chạy đúng trên máy chủ Linux (phân biệt hoa/thường).
  assert.equal(r.variant.toLowerCase(), "wechat-monthly.jpg", "phải chọn ảnh theo gói (kể cả đuôi .JPG)");
  assert.equal(r.prefilled, true, "ảnh theo gói là ảnh đã có sẵn số tiền");
});

test("không có ảnh theo gói thì lùi về ảnh theo số ¥, rồi ảnh chung", () => {
  const d2 = fs.mkdtempSync(path.join(os.tmpdir(), "payqr2-"));
  fs.writeFileSync(path.join(d2, "alipay-158.png"), "x");
  touch("alipay.png");
  fs.writeFileSync(path.join(d2, "alipay.png"), "x");
  assert.equal(resolveQrFile(d2, "alipay", { plan: "quarterly", cny: 158 }).variant, "alipay-158.png");
  assert.equal(resolveQrFile(d2, "alipay", { plan: "quarterly", cny: 999 }).variant, "alipay.png");
  assert.equal(resolveQrFile(d2, "alipay", { plan: "quarterly", cny: 999 }).prefilled, false);
});

test("MeetFlow AI KHÔNG được dùng ảnh giá của VPNFlow", () => {
  const d3 = fs.mkdtempSync(path.join(os.tmpdir(), "payqr3-"));
  for (const f of ["wechat-monthly.jpg", "wechat.png", "wechat-ai-yearly.jpg"]) {
    fs.writeFileSync(path.join(d3, f), "x");
  }
  // AI gói tháng: ảnh wechat-monthly.jpg là giá 200.000đ của VPN ⇒ không được lấy
  const aiMonthly = resolveQrFile(d3, "wechat", { plan: "monthly", cny: 38, product: "ai" });
  assert.notEqual(aiMonthly.variant, "wechat-monthly.jpg", "không hiển nhầm ảnh giá VPN cho AI");
  assert.equal(aiMonthly.variant, "wechat.png");
  // AI có ảnh riêng thì dùng ảnh riêng
  assert.equal(resolveQrFile(d3, "wechat", { plan: "yearly", cny: 300, product: "ai" }).variant, "wechat-ai-yearly.jpg");
  // VPN vẫn dùng ảnh theo gói của mình
  assert.equal(resolveQrFile(d3, "wechat", { plan: "monthly", cny: 58, product: "vpn" }).variant, "wechat-monthly.jpg");
});

test("chưa tải ảnh lên thì báo missing để trang buy biết đường lùi", () => {
  const d4 = fs.mkdtempSync(path.join(os.tmpdir(), "payqr4-"));
  const r = resolveQrFile(d4, "wechat", { plan: "monthly", product: "vpn" });
  assert.equal(r.missing, true);
  assert.equal(r.prefilled, false);
});

test("qr-amounts.json: đọc số ¥ thật trong ảnh và đọc lại khi file đổi", () => {
  const d5 = fs.mkdtempSync(path.join(os.tmpdir(), "payqr5-"));
  assert.deepEqual(qrAmountsFor(d5), {}, "chưa có file ⇒ rỗng, không lỗi");
  const file = path.join(d5, "qr-amounts.json");
  fs.writeFileSync(file, JSON.stringify({ "wechat-monthly.JPG": 58 }));
  assert.equal(qrAmountsFor(d5)["wechat-monthly.JPG"], 58);
  fs.writeFileSync(file, JSON.stringify({ "wechat-monthly.JPG": 59 }));
  fs.utimesSync(file, new Date(), new Date(Date.now() + 2000));
  assert.equal(qrAmountsFor(d5)["wechat-monthly.JPG"], 59, "sửa file là có hiệu lực ngay");
});

test("QR cho link tải: sinh PNG thật (magic bytes) và khác nhau theo từng link", async () => {
  const ios = await downloadQrPng("https://meetflowai.site/install/ios");
  const apk = await downloadQrPng("https://meetflowai.site/v1/downloads/android");
  assert.ok(Buffer.isBuffer(ios) && ios.length > 200, "phải trả về buffer PNG");
  assert.deepEqual([...ios.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47], "phải là PNG (magic 89 50 4E 47)");
  assert.notEqual(ios.toString("base64"), apk.toString("base64"), "QR khác link phải khác nội dung");
  await assert.rejects(() => downloadQrPng(""), /thiếu url/);
});

test("khối QR ở trang buy: có ảnh, có link bấm được và nút copy, đúng ngôn ngữ", () => {
  const vi = downloadQrSectionHTML({ lang: "vi", qrSrc: "/v1/downloads/qr?target=ios", linkUrl: "https://meetflowai.site/install/ios" });
  assert.ok(vi.includes('src="/v1/downloads/qr?target=ios"'), "phải nhúng ảnh QR");
  assert.ok(vi.includes('href="https://meetflowai.site/install/ios"'), "phải có link bấm được");
  assert.ok(vi.includes("Quét mã để cài"), "tiêu đề tiếng Việt");
  assert.ok(vi.includes("dlqr-copy"), "phải có nút copy link");
  assert.ok(downloadQrSectionHTML({ lang: "en", qrSrc: "x", linkUrl: "y" }).includes("Scan to install"));
  assert.ok(downloadQrSectionHTML({ lang: "zh", qrSrc: "x", linkUrl: "y" }).includes("扫码"));
  assert.equal(downloadQrSectionHTML({ lang: "vi", qrSrc: "", linkUrl: "y" }), "", "thiếu ảnh thì không render gì");
});

test("guard: trang buy KHÔNG còn khối QR cài app; route QR vẫn đúng link cấu hình", () => {
  const pay = fs2.readFileSync(new URL("../src/payments.js", import.meta.url), "utf8");
  const idx = fs2.readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.ok(!pay.includes("downloadQrSectionHTML({"), "chủ shop yêu cầu bỏ khối QR cài app trên trang buy");
  assert.ok(!pay.includes("class=\"dlqr\""), "không còn markup khối QR");
  assert.ok(pay.includes("export function downloadQrSectionHTML"), "hàm vẫn giữ để tái dùng (không gọi ở trang buy)");
  // route QR vẫn phục vụ: trang cài iOS dùng nó cho người xem trên máy tính
  assert.ok(idx.includes('app.get("/v1/downloads/qr"'), "phải còn route sinh ảnh QR");
  assert.ok(idx.includes("appConfig.get(\"ios_ipa_url\") || links.ios"), "QR iOS phải theo link đang cấu hình");
  assert.ok(idx.includes("downloadQrPng(url"), "route phải dùng bộ sinh QR nội bộ");
  const install = idx.slice(idx.indexOf("function iosInstallPageHTML"), idx.indexOf("function iosRegisteredHTML"));
  assert.ok(install.includes('/v1/downloads/qr?target=ios'), "trang cài iOS vẫn có QR cho người xem trên máy tính");
});
