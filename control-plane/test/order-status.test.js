import test from "node:test";
import assert from "node:assert/strict";
import { orderStatusPageHTML } from "../src/payments.js";

const base = { orderCode: 1789320646, planLabel: "Hàng tháng", amount: 200000, emailMasked: "mi*****@gmail.com" };

test("trang tình trạng: đang chờ tiền thì tự cập nhật và KHÔNG hứa đã nhận", () => {
  const html = orderStatusPageHTML({ ...base, paid: false });
  assert.ok(html.includes("Chưa nhận được tiền"), "phải nói rõ là chưa nhận được tiền");
  assert.ok(html.includes('http-equiv="refresh" content="10"'), "phải tự cập nhật mỗi 10 giây");
  assert.ok(!html.includes("Đã nhận thanh toán"));
  assert.ok(html.includes("#1789320646") && html.includes("Hàng tháng") && html.includes("200.000 đ"));
});

test("trang tình trạng: đã nhận tiền thì báo đã nhận và không tự refresh nữa", () => {
  const html = orderStatusPageHTML({ ...base, paid: true });
  assert.ok(html.includes("Đã nhận thanh toán"));
  assert.ok(!html.includes('http-equiv="refresh"'), "đã thanh toán thì không cần refresh");
});

test("trang tình trạng: đơn không tồn tại thì nói không tìm thấy, không lộ dữ liệu", () => {
  const html = orderStatusPageHTML({ orderCode: 1, found: false });
  assert.ok(html.includes("Không tìm thấy đơn này"));
  assert.ok(!html.includes("<table><tr>"), "không có bảng chi tiết khi không tìm thấy");
});

test("trang tình trạng: theo ngôn ngữ khách (en/zh) và che email", () => {
  assert.ok(orderStatusPageHTML({ ...base, paid: false, lang: "en" }).includes("Payment not received yet"));
  assert.ok(orderStatusPageHTML({ ...base, paid: true, lang: "zh" }).includes("已收到付款"));
  const html = orderStatusPageHTML({ ...base, paid: false });
  assert.ok(html.includes("mi*****@gmail.com"));
  assert.ok(!html.includes("minhfat@gmail.com"), "không được hiện email đầy đủ");
  assert.ok(html.includes('name="robots" content="noindex"'), "trang riêng tư không cho Search index");
});
