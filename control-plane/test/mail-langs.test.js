import test from "node:test";
import assert from "node:assert/strict";
import {
  pickMailLang,
  renderInvoiceEmail,
  renderOtpEmail,
  renderPaymentAlert,
  renderRenewalEmail,
  renderVerifyEmail,
} from "../src/mailer.js";
import { planNameFor } from "../src/payments.js";

/**
 * Chốt lại việc "email 3 ngôn ngữ" bằng test, vì đã từng lọt thật:
 *  - hoá đơn dùng nhãn gói tiếng Anh cho cả khách Việt/Trung (`PLANS[id].label`);
 *  - bảng chữ tiếng Trung bị định nghĩa lặp 10 dòng (dead code) trong `mailer.js`.
 * Test này bắt mọi lần lọt tiếng Việt sang bản en/zh về sau.
 */

const SITE = "https://meetflowai.site";
const ACTIVATED = "2026-09-13T00:00:00.000Z";
const EXPIRES = "2026-10-13T00:00:00.000Z";

const BUILDERS = {
  otp: (lang) => renderOtpEmail({ code: "135790", lang }),
  verify: (lang) => renderVerifyEmail({ lang, to: "a@b.com", link: `${SITE}/v1/ai/verify-email/confirm?token=T`, reminders: 1 }),
  "invoice-vpn": (lang) => renderInvoiceEmail({
    lang, product: "vpn", brand: "VPNFlow Premium", to: "a@b.com", orderCode: "VF-1",
    planLabel: planNameFor(pickMailLang(lang), "vpn", "monthly"), amount: 200000, days: 30,
    activatedAt: ACTIVATED, expiresAt: EXPIRES,
    appUrl: `${SITE}/open`, guideUrl: `${SITE}/guide`,
  }),
  "invoice-ai": (lang) => renderInvoiceEmail({
    lang, product: "ai", brand: "MeetFlow AI Pro", to: "a@b.com", orderCode: "MF-1",
    planLabel: planNameFor(pickMailLang(lang), "ai", "pass30"), amount: 150000, days: 30,
    activatedAt: ACTIVATED, expiresAt: EXPIRES,
    guideUrl: `${SITE}/ai/guide`, oneTime: true,
  }),
  renewal: (lang) => renderRenewalEmail({
    lang, to: "a@b.com", daysLeft: 3, expiresAt: EXPIRES,
    buyUrl: `${SITE}/buy?renew=1&email=a%40b.com&plan=monthly`,
  }),
};

/** Ký tự chỉ có trong tiếng Việt — không xuất hiện trong tiếng Anh/Trung. */
const VI_DIACRITICS = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i;

/** Từ tiếng Việt chắc chắn không được có trong bản en/zh (kể cả không dấu). */
const VI_WORDS = ["Xin chào", "Cảm ơn", "Trân trọng", "Đội ngũ", "Gói", "đơn", "hết hạn", "tài khoản"];

/** "200.000 đ" là đơn vị tiền tệ (giữ nguyên mọi ngôn ngữ) — bỏ ra trước khi soi. */
function stripMoney(text) {
  return text.replace(/\d[\d.,\s]*đ/gi, " ");
}

function subjectAndBody(message) {
  return { subject: message.subject, body: message.html };
}

test("email bản en/zh KHÔNG lọt chữ tiếng Việt", () => {
  for (const [name, build] of Object.entries(BUILDERS)) {
    for (const lang of ["en", "zh"]) {
      const { subject, body } = subjectAndBody(build(lang));
      const text = stripMoney(`${subject}\n${body}`);
      const hit = text.match(VI_DIACRITICS);
      assert.equal(hit, null, `${name}/${lang} lọt ký tự tiếng Việt: "${hit?.[0]}"`);
      for (const word of VI_WORDS) {
        assert.ok(!text.includes(word), `${name}/${lang} lọt chữ tiếng Việt "${word}"`);
      }
      assert.ok(!subject.includes("Gói"), `${name}/${lang} tiêu đề còn "Gói"`);
    }
  }
});

test("tiêu đề đúng ngôn ngữ: en không có chữ Hán, zh phải có chữ Hán", () => {
  for (const [name, build] of Object.entries(BUILDERS)) {
    const en = build("en").subject;
    const zh = build("zh").subject;
    assert.ok(!/\p{Script=Han}/u.test(en), `${name}/en có chữ Hán: ${en}`);
    assert.ok(/\p{Script=Han}/u.test(zh), `${name}/zh không có chữ Hán: ${zh}`);
    // tiếng Việt vẫn là tiếng Việt
    const vi = build("vi").subject;
    assert.ok(VI_DIACRITICS.test(vi) || vi.includes("đ"), `${name}/vi không giống tiếng Việt: ${vi}`);
  }
});

test("3 ngôn ngữ cho ra 3 tiêu đề KHÁC nhau (không dùng chung một bản)", () => {
  for (const [name, build] of Object.entries(BUILDERS)) {
    const subjects = ["vi", "en", "zh"].map((lang) => build(lang).subject);
    assert.equal(new Set(subjects).size, 3, `${name} có tiêu đề trùng nhau: ${JSON.stringify(subjects)}`);
  }
});

test("hoá đơn đã bản địa hoá tên gói trong CẢ 3 ngôn ngữ", () => {
  const expected = { vi: "Hàng tháng", en: "Monthly", zh: "月度" };
  for (const [lang, label] of Object.entries(expected)) {
    const { body } = subjectAndBody(BUILDERS["invoice-vpn"](lang));
    assert.ok(body.includes(label), `hoá đơn ${lang} không có tên gói "${label}"`);
  }
});

test("email báo đơn cho chủ shop là tiếng Việt CÓ CHỦ Ý (người nhận là chủ shop)", () => {
  const alert = renderPaymentAlert({
    orderCode: "VF-1", buyerEmail: "a@b.com", plan: "1 tháng", amount: 200000,
    confirmUrl: "https://api.meetflowai.site/v1/admin/payments/confirm?code=X", method: "bank",
  });
  assert.ok(alert.subject.includes("Đơn mới"), alert.subject);
  assert.ok(alert.html.includes("Xin chào"), "email báo đơn phải là tiếng Việt");
});

test("khách Nhật/Hàn (app có ja/ko, email chưa dịch) nhận bản TIẾNG ANH, không phải tiếng Việt", () => {
  for (const [name, build] of Object.entries(BUILDERS)) {
    const en = build("en");
    for (const lang of ["ja", "ko", "fr", ""]) {
      const other = build(lang);
      assert.equal(other.subject, en.subject, `${name}/${lang} không rơi về tiêu đề tiếng Anh`);
      assert.equal(other.html, en.html, `${name}/${lang} không rơi về nội dung tiếng Anh`);
    }
  }
});

test("nhãn gói trong email phải theo NGÔN NGỮ EMAIL, không theo ngôn ngữ app", () => {
  // Khách Nhật: app ja nhưng email là tiếng Anh ⇒ nhãn gói cũng phải tiếng Anh,
  // không được để "月額" lạc trong thư tiếng Anh (production gọi planNameFor(pickMailLang(lang), …)).
  assert.equal(planNameFor(pickMailLang("ja"), "vpn", "monthly"), "Monthly");
  assert.equal(planNameFor(pickMailLang("ko"), "vpn", "monthly"), "Monthly");
  assert.equal(planNameFor(pickMailLang("zh"), "vpn", "monthly"), "月度");
  assert.equal(planNameFor(pickMailLang("vi"), "vpn", "monthly"), "Hàng tháng");
});
