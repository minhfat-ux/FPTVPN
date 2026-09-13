import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderPaidAlert, renderUnmatchedTransferAlert, renderPaymentAlert } from "../src/mailer.js";

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
  assert.ok(indexSrc.includes("async function createPendingOrder("), "phải có bộ cấp mã đơn duy nhất");
  assert.ok(/function withOrderCodeLock\(fn\)/.test(indexSrc),
    "cấp mã + ghi đơn phải nằm trong hàng đợi chung (file JSON đọc-sửa-ghi, không tự bảo vệ)");
  assert.ok(/while \(orderCode < 9_999_999_999\)[\s\S]{0,300}?orderCode \+= 1/.test(indexSrc),
    "phải nhích mã khi mã đã bị dùng (giữ 10 chữ số cho normalizeOrderCode)");
  const used = [...indexSrc.matchAll(/await createPendingOrder\(\{/g)].length;
  assert.equal(used, 2, "cả luồng VPN và MeetFlow AI đều phải dùng createPendingOrder()");
  assert.equal((indexSrc.match(/Math\.floor\(Date\.now\(\) \/ 1000\)/g) ?? []).length, 1,
    "chỉ createPendingOrder() được sinh mã đơn từ epoch giây");
  const allocator = indexSrc.slice(
    indexSrc.indexOf("async function createPendingOrder("),
    indexSrc.indexOf("app.post(\"/v1/payments/create\""),
  );
  const writes = (indexSrc.match(/(?:authStore|aiStore)\.recordPendingPayment\(/g) ?? []).length;
  const writesInAllocator = (allocator.match(/(?:authStore|aiStore)\.recordPendingPayment\(/g) ?? []).length;
  assert.equal(writes, 2, "chỉ createPendingOrder() được ghi đơn mới");
  assert.equal(writesInAllocator, writes, "mọi lệnh ghi đơn mới phải nằm trong createPendingOrder()");
});

test("guard: request có chữ ký thì không được hạ cấp sang API Key/token URL", () => {
  const block = indexSrc.slice(indexSrc.indexOf("sepay-webhook"), indexSrc.indexOf("app.get(\"/v1/payments/status"));
  assert.ok(/const signedRequest = Boolean\(signatureHeader \?\? timestampHeader\)/.test(block),
    "phải nhận diện request có chữ ký");
  const apiKeyLine = block.match(/const apiKeyOk = [^;]+;/)?.[0] ?? "";
  const urlTokenLine = block.match(/const urlTokenOk = [^;]+;/)?.[0] ?? "";
  assert.ok(apiKeyLine.includes("!signedRequest"), "API Key chỉ dùng khi request KHÔNG có chữ ký");
  assert.ok(urlTokenLine.includes("!signedRequest"), "token URL chỉ dùng khi request KHÔNG có chữ ký");
  assert.ok(block.includes("verifySepaySignature({"), "HMAC-SHA256 phải được kiểm trên raw body");
  assert.ok(block.includes("req.rawBody"), "chữ ký phải tính trên raw body (không phải body đã parse)");
});

test("guard: webhook kiểm tài khoản nhận, whitelist IP và ghi nhật ký đối soát", () => {
  const block = indexSrc.slice(indexSrc.indexOf("sepay-webhook"), indexSrc.indexOf("app.get(\"/v1/payments/status"));
  assert.ok(block.includes("accountMatches({"), "phải kiểm tiền vào đúng tài khoản nhận");
  assert.ok(block.includes("SEPAY_IP_ALLOWLIST") && block.includes("clientIpAllowed({"),
    "phải hỗ trợ whitelist IP của SePay");
  assert.ok(block.includes("logSepayWebhook("), "phải ghi payload gốc để đối soát");
  for (const decision of ["activated", "duplicate", "underpaid", "no-order-code", "wrong-account", "rejected-ip"]) {
    assert.ok(block.includes(`"${decision}"`), `nhật ký phải phân biệt quyết định "${decision}"`);
  }
  assert.ok(indexSrc.includes("sepay-webhooks.log"), "đường dẫn nhật ký phải rõ ràng");
});

test("email đã-thanh-toán sau khi XÁC NHẬN TAY không được nói 'SePay xác nhận'", () => {
  const manual = renderPaidAlert({ ...base, confirmedBy: "manual" });
  assert.ok(/Anh đã xác nhận thanh toán/.test(manual.html), "phải nói rõ là chủ shop xác nhận tay");
  assert.ok(!/SePay xác nhận/.test(manual.html), "không được gán cho SePay khi kênh không có webhook");
  const auto = renderPaidAlert({ ...base, confirmedBy: "sepay" });
  assert.ok(/SePay xác nhận tiền về/.test(auto.html), "đơn tự xác nhận vẫn nói SePay");
});

test("email xác nhận tay cho WeChat/Alipay: có nút xác nhận, số ¥ cần khớp và nơi kiểm tra", () => {
  const confirmUrl = "https://api.meetflowai.site/v1/payments/confirm/1789000001?t=abc123";
  const methodInfo = {
    short: "WeChat Pay",
    label: "\ud83d\udcac WeChat Pay (\u5fae\u4fe1\u652f\u4ed8)",
    where: "M\u1edf WeChat \u2192 \u6211 \u2192 \u670d\u52a1 \u2192 \u94b1\u5305 \u2192 \u8d26\u5355",
    account: "V\u00ed WeChat nh\u1eadn ti\u1ec1n (m\u00e3 QR c\u00e1 nh\u00e2n)",
    expected: "\u00a558 (\u2248 200.000 \u0111)",
  };
  const wechat = renderPaymentAlert({
    orderCode: 1789000001, buyerEmail: "a@b.com", plan: "monthly", amount: 200000,
    confirmUrl, method: "wechat", methodInfo, cny: { amount: 58, rate: 3450 },
    product: "VPNFlow Premium",
  });
  assert.ok(wechat.subject.includes("WeChat Pay"), "tiêu đề phải ghi rõ kênh WeChat");
  assert.ok(wechat.html.includes("Xác nhận đã nhận tiền"), "phải còn nút xác nhận cho kênh thủ công");
  assert.ok(wechat.html.includes(confirmUrl), "nút phải trỏ đúng link xác nhận");
  assert.ok(wechat.html.includes("¥58"), "phải ghi số ¥ chủ shop cần khớp");
  assert.ok(/Kiểm tra ở/.test(wechat.html), "phải nói mở app nào để kiểm tra");

  const alipay = renderPaymentAlert({
    orderCode: 1789000002, buyerEmail: "a@b.com", plan: "monthly", amount: 200000,
    confirmUrl, method: "alipay",
    methodInfo: { ...methodInfo, short: "Alipay", label: "Alipay (\u652f\u4ed8\u5b9d)" },
    cny: { amount: 58, rate: 3450 },
  });
  assert.ok(alipay.subject.includes("Alipay") && alipay.html.includes("Xác nhận đã nhận tiền"));
});

test("guard: WeChat/Alipay luôn gửi email xác nhận tay, và xác nhận tay ghi đúng kênh", () => {
  assert.ok(/MANUAL_CHANNELS = new Set\(\["wechat", "alipay"\]\)/.test(indexSrc));
  assert.ok(/function shouldAlertOnCreate\(method\) \{[^}]*OWNER_ALERT_ON_CREATE[^}]*MANUAL_CHANNELS\.has\(method\)/.test(indexSrc));
  assert.ok(/cnyAmountForMethod/.test(indexSrc) && /m !== "wechat" && m !== "alipay"/.test(indexSrc.replace(/\\/g, "")),
    "email cho WeChat/Alipay phải kèm số ¥ cần khớp");
  // Mọi đường xác nhận TAY (link trong email + API admin, VPN + AI) đều phải giữ đúng kênh
  // khách đã dùng và được đánh dấu confirmedBy="manual" để email không gán nhầm cho SePay.
  const manualBlocks = [
    ['link xác nhận VPN', indexSrc.indexOf('app.get("/v1/payments/confirm/:orderCode"'), indexSrc.indexOf('app.get("/v1/payments/confirm/:orderCode"') + 1200],
    ['API admin VPN', indexSrc.indexOf('app.post("/v1/admin/payments/:orderCode/confirm"'), indexSrc.indexOf('app.post("/v1/admin/payments/:orderCode/confirm"') + 900],
    ['link xác nhận AI', indexSrc.indexOf('app.get("/v1/ai/payments/confirm/:orderCode"'), indexSrc.indexOf('app.get("/v1/ai/payments/confirm/:orderCode"') + 1200],
    ['API admin AI', indexSrc.indexOf('app.post("/v1/admin/ai/payments/:orderCode/confirm"'), indexSrc.indexOf('app.post("/v1/admin/ai/payments/:orderCode/confirm"') + 900],
  ];
  for (const [name, from, to] of manualBlocks) {
    assert.ok(from > -1 && to > from, `không tìm thấy khối ${name}`);
    const block = indexSrc.slice(from, to);
    assert.ok(block.includes('confirmedBy: "manual"'), `${name} phải đánh dấu xác nhận tay`);
  }
  assert.ok(indexSrc.slice(indexSrc.indexOf('app.get("/v1/payments/confirm/:orderCode"'), indexSrc.indexOf('app.get("/v1/payments/confirm/:orderCode"') + 1200).includes('prefix: order.method || "bankqr"'),
    "link xác nhận VPN phải giữ đúng kênh khách dùng");
});
