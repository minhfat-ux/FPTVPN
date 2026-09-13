import test from "node:test";
import assert from "node:assert/strict";
import { planNameFor } from "../src/payments.js";
import { renderInvoiceEmail } from "../src/mailer.js";

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
