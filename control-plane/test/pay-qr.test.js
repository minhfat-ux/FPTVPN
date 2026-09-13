import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveQrFile, qrAmountsFor } from "../src/payments.js";

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
