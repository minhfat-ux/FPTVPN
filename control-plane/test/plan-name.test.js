import test from "node:test";
import assert from "node:assert/strict";
import { bankQrImageUrl, planNameFor, transferNote } from "../src/payments.js";
import { renderInvoiceEmail } from "../src/mailer.js";
import { extractOrderRef } from "../src/sepay.js";

test("tên gói trong hoá đơn được bản địa hoá theo ngôn ngữ khách", () => {
  assert.equal(planNameFor("vi", "vpn", "monthly"), "Hàng tháng");
  assert.equal(planNameFor("en", "vpn", "monthly"), "Monthly");
  assert.equal(planNameFor("zh", "vpn", "monthly"), "月度");
  assert.equal(planNameFor("zh", "vpn", "yearly"), "年度");
  assert.equal(planNameFor("vi", "ai", "pass30"), "Gói 30 ngày");
  assert.equal(planNameFor("en", "ai", "pass30"), "30-Day Pass");
  assert.equal(planNameFor("zh", "ai", "pass30"), "30 天通行证");
});

test("KHÔNG trả nhãn tiếng Anh kèm giá của PLANS cho khách Việt/Trung", () => {
  for (const lang of ["vi", "zh"]) {
    for (const id of ["monthly", "quarterly", "semiannual", "yearly"]) {
      const name = planNameFor(lang, "vpn", id);
      assert.ok(name, `${lang}/${id} phải có tên`);
      assert.ok(!name.includes("VND"), `${lang}/${id} còn tiếng Anh: ${name}`);
      assert.ok(!/\(.*\)/.test(name), `${lang}/${id} còn phần giá: ${name}`);
    }
  }
});

test("gói không tồn tại ⇒ chuỗi rỗng, không ném lỗi", () => {
  assert.equal(planNameFor("vi", "vpn", "khong-co-goi-nay"), "");
  assert.equal(planNameFor("en", "ai", ""), "");
});

test("hoá đơn ghép đúng tên gói đã bản địa hoá", () => {
  const base = {
    lang: "zh", product: "vpn", brand: "VPNFlow Premium", to: "a@b.com",
    orderCode: "VF-9", amount: 200000, days: 30,
    activatedAt: "2026-09-13T00:00:00.000Z", expiresAt: "2026-10-13T00:00:00.000Z",
    appUrl: "https://meetflowai.site", guideUrl: "https://meetflowai.site/g",
  };
  const zh = renderInvoiceEmail({ ...base, planLabel: planNameFor("zh", "vpn", "monthly") });
  assert.ok(zh.html.includes("月度"), "hoá đơn tiếng Trung phải có tên gói tiếng Trung");
  assert.ok(!zh.html.includes("Monthly (200,000 VND"), "không được lọt nhãn tiếng Anh");

  const vi = renderInvoiceEmail({ ...base, lang: "vi", planLabel: planNameFor("vi", "vpn", "monthly") });
  assert.ok(vi.html.includes("Hàng tháng"));
});

test("nội dung chuyển khoản có kèm tên gói, mã đơn đứng TRƯỚC", () => {
  assert.equal(transferNote({ orderCode: 1789318130, plan: "monthly", product: "vpn" }), "1789318130-THANG");
  assert.equal(transferNote({ orderCode: 1789318130, plan: "quarterly", product: "vpn" }), "1789318130-3THANG");
  assert.equal(transferNote({ orderCode: 1789318130, plan: "semiannual", product: "vpn" }), "1789318130-6THANG");
  assert.equal(transferNote({ orderCode: 1789318130, plan: "yearly", product: "vpn" }), "1789318130-NAM");
  assert.equal(transferNote({ orderCode: 1789318130, plan: "pass30", product: "ai" }), "1789318130-30NG");
  // gói lạ / không rõ ⇒ chỉ có mã đơn, không có token rác
  assert.equal(transferNote({ orderCode: 1789318130, plan: "khong-co", product: "vpn" }), "1789318130");
  assert.equal(transferNote({ orderCode: 1789318130 }), "1789318130");
});

test("nội dung CK vẫn nằm trong giới hạn 25 ký tự của QR (kể cả tiền tố sản phẩm)", () => {
  const cases = [
    ["vpn", "VPNFLOW", ["monthly", "quarterly", "semiannual", "yearly"]],
    ["ai", "MEETFLOW", ["pass30", "monthly", "yearly"]],
  ];
  for (const [product, prefix, plans] of cases) {
    for (const plan of plans) {
      const total = `${prefix}-${transferNote({ orderCode: 1789318130, plan, product })}`;
      assert.ok(total.length <= 25, `${total} dài ${total.length} ký tự (>25)`);
    }
  }
});

test("nội dung CK mới vẫn đọc được mã đơn bằng bộ tách của SePay", () => {
  const memo = `VPNFLOW-${transferNote({ orderCode: 1789318130, plan: "monthly", product: "vpn" })}`;
  assert.equal(memo, "VPNFLOW-1789318130-THANG");
  assert.equal(extractOrderRef({ content: memo }).orderCode, 1789318130);
  assert.equal(extractOrderRef({ content: memo }).product, "vpn");
  // ngân hàng cắt mất phần tên gói ⇒ vẫn khớp đơn
  assert.equal(extractOrderRef({ content: "VPNFLOW-1789318130" }).orderCode, 1789318130);
});

test("URL ảnh QR SePay/vietqr.app có số tiền + nội dung CK, đúng tham số", () => {
  const url = bankQrImageUrl({
    amount: 200000,
    note: transferNote({ orderCode: 1789319664, plan: "monthly", product: "vpn" }),
    account: "57222538888",
    holder: "NGUYEN BINH MINH",
  });
  const u = new URL(url);
  assert.equal(u.origin + u.pathname, "https://vietqr.app/img");
  assert.equal(u.searchParams.get("bank"), "TPBank");
  assert.equal(u.searchParams.get("acc"), "57222538888");
  assert.equal(u.searchParams.get("amount"), "200000");
  assert.equal(u.searchParams.get("des"), "1789319664-THANG");
  assert.equal(u.searchParams.get("holder"), "NGUYEN BINH MINH");
  assert.equal(u.searchParams.get("store"), "VPNFlow Purchasing");
  assert.equal(u.searchParams.get("showinfo"), "true");
  assert.equal(u.searchParams.get("fullacc"), "true");
  // khoảng trắng phải được encode để URL còn hợp lệ
  assert.ok(!url.includes(" "), "URL còn khoảng trắng chưa encode");
});
