import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderPaidAlert, renderUnmatchedTransferAlert } from "../src/mailer.js";

const indexSrc = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");

const base = {
  orderCode: 1789321749,
  buyerEmail: "khach@gmail.com",
  plan: "Hàng tháng",
  amount: 200000,
  product: "VPNFlow Premium",
  statusUrl: "https://meetflowai.site/buy/status/1789321749",
};

test("email đã thanh toán: chỉ thông báo, KHÔNG có nút xác nhận", () => {
  const { subject, html } = renderPaidAlert(base);
  assert.ok(subject.includes("Đã thanh toán") && subject.includes("#1789321749"));
  assert.ok(subject.includes("200.000 đ") && subject.includes("khach@gmail.com"));
  assert.ok(!/confirm=/.test(html), "không được còn link xác nhận thanh toán");
  assert.ok(!/>\s*(Xác nhận|Xác nhận thanh toán)\s*</i.test(html), "không được còn nút xác nhận");
  assert.ok(html.includes(base.statusUrl), "phải kèm link tình trạng đơn");
  assert.ok(html.includes("Hàng tháng") && html.includes("200.000 đ") && html.includes("VPNFlow Premium"));
});

test("email đã thanh toán: nêu rõ đã kích hoạt tự động, không cần làm gì", () => {
  const { html } = renderPaidAlert(base);
  assert.ok(/kích hoạt/i.test(html), "phải nói gói đã được kích hoạt");
  assert.ok(/không cần|Không cần/.test(html), "phải nói chủ shop không cần làm gì");
});

test("email đã thanh toán: dùng được cho MeetFlow AI Pro và có phương thức thanh toán", () => {
  const { subject, html } = renderPaidAlert({
    ...base,
    product: "MeetFlow AI Pro",
    methodInfo: { label: "TPBank QR", account: "57222538888" },
  });
  assert.ok(subject.includes("MeetFlow AI Pro"));
  assert.ok(html.includes("TPBank QR"), "phải hiện kênh thanh toán khi có");
});

test("email cảnh báo tiền vào không khớp đơn: nêu số tiền + lý do + link dashboard", () => {
  const { subject, html } = renderUnmatchedTransferAlert({
    amount: 150000,
    content: "chuyen tien thang",
    txId: "TX123",
    reason: "không có mã đơn trong nội dung chuyển khoản",
    dashboardUrl: "https://meetflowai.site/admin",
  });
  assert.ok(subject.includes("150.000 đ") && /chưa khớp đơn/.test(subject));
  assert.ok(html.includes("chuyen tien thang") && html.includes("TX123"));
  assert.ok(html.includes("không có mã đơn trong nội dung chuyển khoản"));
  assert.ok(html.includes("https://meetflowai.site/admin"));
  assert.ok(!/confirm=/i.test(html), "không có nút xác nhận cho giao dịch không rõ đơn");
});

test("guard: webhook SePay đã kích hoạt thì gửi email đã-thanh-toán, không gửi email xác nhận", () => {
  const sepayBlock = indexSrc.slice(indexSrc.indexOf("sepay-webhook"));
  assert.ok(sepayBlock.includes("confirmPendingOrder("), "phải tự kích hoạt khi khớp đơn");
  assert.ok(!/firePaymentAlert\(\s*ref\.orderCode/.test(sepayBlock), "không gửi email xác nhận cho đơn đã khớp");
});

test("guard: email báo đơn mới chỉ gửi khi shouldAlertOnCreate(method) cho phép", () => {
  assert.ok(indexSrc.includes('process.env.OWNER_ALERT_ON_CREATE === "1"'));
  assert.ok(/MANUAL_CHANNELS = new Set\(\["wechat", "alipay"\]\)/.test(indexSrc),
    "WeChat/Alipay là QR cá nhân không có webhook → vẫn phải báo đơn mới");
  assert.ok(/function shouldAlertOnCreate\(method\) \{[^}]*OWNER_ALERT_ON_CREATE[^}]*MANUAL_CHANNELS\.has\(method\)/.test(indexSrc),
    "shouldAlertOnCreate phải = cờ ENV hoặc kênh thủ công");
  const calls = [...indexSrc.matchAll(/(?<!function )(?:await )?fire(?:Ai)?PaymentAlert\(/g)];
  const gated = calls.filter((m) =>
    /if \(shouldAlertOnCreate\(method\)\) \{\s*(\/\/[^\n]*\n\s*)?fire(?:Ai)?PaymentAlert\(/.test(
      indexSrc.slice(m.index - 160, m.index + m[0].length),
    ),
  ).length;
  assert.ok(calls.length > 0 && gated === calls.length, `mọi lời gọi firePaymentAlert phải nằm sau shouldAlertOnCreate() (${gated}/${calls.length})`);
});

test("guard: kích hoạt xong (VPN + AI) đều bắn email đã-thanh-toán", () => {
  const vpn = indexSrc.indexOf("async function activatePaymentAndInvoice");
  const vpnEnd = indexSrc.indexOf("\nasync function ", vpn + 10);
  assert.ok(indexSrc.slice(vpn, vpnEnd).includes("firePaidAlert("), "activatePaymentAndInvoice phải bắn paid-alert");
  const ai = indexSrc.indexOf("async function activateAiProAndInvoice");
  const aiEnd = indexSrc.indexOf("\nasync function ", ai + 10);
  assert.ok(indexSrc.slice(ai, aiEnd).includes("firePaidAlert("), "activateAiProAndInvoice phải bắn paid-alert");
});

test("guard: tiền vào không khớp đơn thì có cảnh báo chủ shop", () => {
  assert.ok(indexSrc.includes("fireUnmatchedAlert("), "phải có cảnh báo khi không khớp đơn");
  const block = indexSrc.slice(indexSrc.indexOf("sepay-webhook"));
  assert.ok(block.includes("fireUnmatchedAlert("), "nhánh webhook phải gọi cảnh báo");
  assert.ok(block.includes("chuyển thiếu"), "chuyển thiếu tiền cũng phải cảnh báo");
});

test("guard: mã đơn phải là duy nhất (không trùng khi 2 khách mua trong cùng giây)", () => {
  assert.ok(indexSrc.includes("async function freshOrderCode()"), "phải có bộ sinh mã đơn duy nhất");
  assert.ok(/while \(code < 9_999_999_999\)[\s\S]{0,200}?code \+= 1/.test(indexSrc),
    "phải nhích mã khi mã đã bị dùng (giữ 10 chữ số cho normalizeOrderCode)");
  const used = [...indexSrc.matchAll(/orderCode = await freshOrderCode\(\)/g)].length;
  assert.equal(used, 2, "cả luồng VPN và MeetFlow AI đều phải dùng freshOrderCode()");
  assert.ok(!/orderCode = Math\.floor\(Date\.now\(\) \/ 1000\)/.test(indexSrc),
    "không còn chỗ nào tự sinh mã đơn từ epoch giây");
});
