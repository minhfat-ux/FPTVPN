#!/usr/bin/env node
/**
 * Gửi thử TẤT CẢ email hệ thống bằng mọi ngôn ngữ, tới một hộp thư mình đọc được.
 *
 * Dùng để tự kiểm tra sau mỗi lần sửa template/transport (không cần tạo đơn thật):
 *
 *   cd control-plane && NODE_ENV=production node ../scripts/check-mail-langs.mjs no-reply@meetflowai.site
 *   # chỉ định ngôn ngữ / loại:
 *   ... check-mail-langs.mjs hộp@thư vi,zh --only otp,invoice-vpn
 *
 * Trên VPS, chạy bằng ĐÚNG env của service (để dùng transport đang bật):
 *   python3 /tmp/run-with-env.py /root/flowvpn-cp/scripts/check-mail-langs.mjs
 *
 * Lưu ý: OTP chỉ thực sự gửi khi `NODE_ENV=production`; ngoài production hàm trả `devCode`
 * và KHÔNG gửi gì (đúng như thiết kế trong mailer.js).
 */
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Script sống ở <repo>/scripts/ (nguồn ở <repo>/control-plane/src) nhưng trên VPS lại nằm
// cạnh src/ (/root/flowvpn-cp/scripts + /root/flowvpn-cp/src) — tự tìm cho đúng cả hai nơi.
const here = dirname(fileURLToPath(import.meta.url));
const srcDir = [
  resolve(here, "../control-plane/src"), // trong repo
  resolve(here, "../src"),               // trên VPS
].find((dir) => existsSync(resolve(dir, "mailer.js")));
if (!srcDir) {
  console.error("Không tìm thấy control-plane/src/mailer.js — chạy script từ repo hoặc từ /root/flowvpn-cp.");
  process.exit(2);
}

const {
  MAIL_LANGS,
  mailTransportName,
  sendAiInvoiceEmail,
  sendInvoiceEmail,
  sendOtpEmail,
  sendPaymentAlert,
  sendRenewalReminder,
  sendVerifyEmail,
} = await import(`${new URL(`file://${srcDir}/mailer.js`).href}`);
const { planNameFor } = await import(`${new URL(`file://${srcDir}/payments.js`).href}`);

const args = process.argv.slice(2);
const to = args.find((a) => !a.startsWith("--")) || "no-reply@meetflowai.site";
const onlyArg = (() => {
  const withEq = args.find((a) => a.startsWith("--only="));
  if (withEq) return withEq.slice("--only=".length);
  const flag = args.indexOf("--only");
  return flag >= 0 ? args[flag + 1] ?? "" : "";
})();
const only = onlyArg ? String(onlyArg).split(",").map((s) => s.trim()).filter(Boolean) : null;
const wantLangs = args.filter((a) => MAIL_LANGS.includes(a));
const langs = wantLangs.length ? wantLangs : MAIL_LANGS;

const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString();
const activatedAt = new Date().toISOString();

const BUILDERS = {
  otp: (lang) => () => sendOtpEmail({ email: to, code: "135790", lang }),
  verify: (lang) => () => sendVerifyEmail({
    to, lang, link: "https://meetflowai.site/v1/ai/verify-email/confirm?token=CHECKSCRIPT", reminders: 1,
  }),
  "invoice-vpn": (lang) => () => sendInvoiceEmail({
    to, lang, orderCode: `CHECK-VPN-${lang.toUpperCase()}`,
    planLabel: planNameFor(lang, "vpn", "monthly"), amount: 200000, days: 30, activatedAt, expiresAt,
    appUrl: "https://meetflowai.site", guideUrl: "https://meetflowai.site/guide",
  }),
  "invoice-ai": (lang) => () => sendAiInvoiceEmail({
    to, lang, orderCode: `CHECK-AI-${lang.toUpperCase()}`,
    planLabel: planNameFor(lang, "ai", "pass30"), amount: 150000, days: 30, activatedAt, expiresAt,
    guideUrl: "https://meetflowai.site/ai/guide", oneTime: true,
  }),
  renewal: (lang) => () => sendRenewalReminder({
    to, lang, daysLeft: 3, expiresAt, buyUrl: "https://meetflowai.site/buy?renew=1",
  }),
  "owner-alert": (lang) => () => sendPaymentAlert({
    to, orderCode: `CHECK-${lang.toUpperCase()}`, buyerEmail: "buyer@example.com", plan: "1 tháng",
    amount: 200000, confirmUrl: "https://api.meetflowai.site/v1/admin/payments/confirm?code=CHECK",
    method: "bank",
    methodInfo: {
      label: "Chuyển khoản ngân hàng (VietQR)", short: "VietQR",
      where: "App ngân hàng", expected: "200.000 đ", account: "57222538888",
    },
  }),
};

const kinds = (only ?? Object.keys(BUILDERS)).filter((k) => BUILDERS[k]);
if (!kinds.length) {
  console.error(`Không có loại email hợp lệ. Chọn trong: ${Object.keys(BUILDERS).join(", ")}`);
  process.exit(2);
}

console.log(`transport=${mailTransportName()} to=${to} langs=${langs.join(",")} kinds=${kinds.join(",")}`);
let ok = 0;
let total = 0;
for (const lang of langs) {
  for (const kind of kinds) {
    total += 1;
    let result;
    try {
      result = await BUILDERS[kind](lang)();
    } catch (err) {
      result = { sent: false, error: err?.message ?? String(err) };
    }
    const sent = result?.sent === true;
    if (sent) ok += 1;
    console.log(`  ${sent ? "OK  " : "FAIL"} ${kind.padEnd(12)} ${lang.padEnd(3)} ${JSON.stringify(result)}`);
  }
}
console.log(`\nTỔNG: ${ok}/${total} gửi thành công`);
process.exit(ok === total ? 0 : 1);
