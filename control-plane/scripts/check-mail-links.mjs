#!/usr/bin/env node
/**
 * Kiểm tra MỌI link nằm trong email hệ thống có sống không (chống link chết trong hoá đơn).
 *
 *   node scripts/check-mail-links.mjs            # in link + HTTP code
 *
 * Vì sao cần: edge Caddy của meetflowai.site chỉ proxy những đường dẫn có `handle` riêng,
 * nên một route mới ở control-plane có thể 200 khi gọi thẳng cổng 7778 nhưng **404 ở ngoài**.
 * Ca thật 13/09/2026: `/guide` (link trong mọi hoá đơn VPNFlow) trả 404 ở edge.
 *
 * Link "cần token" (xác thực email, xác nhận đơn của chủ shop) được coi là ĐẠT khi trả về lỗi
 * có kiểm soát (4xx) chứ không phải 404/5xx.
 */
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = [
  resolve(here, "../control-plane/src"), // trong repo
  resolve(here, "../src"),               // trên VPS
].find((dir) => existsSync(resolve(dir, "mailer.js")));
if (!srcDir) {
  console.error("Không tìm thấy control-plane/src/mailer.js — chạy từ repo hoặc /root/flowvpn-cp.");
  process.exit(2);
}
const mailer = await import(`file://${srcDir}/mailer.js`);
const { planNameFor } = await import(`file://${srcDir}/payments.js`);

const SITE = process.env.PUBLIC_SITE_URL || "https://meetflowai.site";
const expiresAt = "2026-10-13T00:00:00.000Z";
const activatedAt = "2026-09-13T00:00:00.000Z";

const messages = {
  otp: mailer.renderOtpEmail({ code: "135790", lang: "vi" }),
  verify: mailer.renderVerifyEmail({
    lang: "vi", to: "check@example.com", reminders: 1,
    link: `${SITE}/v1/ai/verify-email/confirm?token=CHECK`,
  }),
  "invoice-vpn": mailer.renderInvoiceEmail({
    lang: "vi", product: "vpn", brand: "VPNFlow Premium", to: "check@example.com",
    orderCode: "CHECK-VPN", planLabel: planNameFor("vi", "vpn", "monthly"),
    amount: 200000, days: 30, activatedAt, expiresAt,
    appUrl: `${SITE}/open`, guideUrl: `${SITE}/guide`,
  }),
  "invoice-ai": mailer.renderInvoiceEmail({
    lang: "vi", product: "ai", brand: "MeetFlow AI Pro", to: "check@example.com",
    orderCode: "CHECK-AI", planLabel: planNameFor("vi", "ai", "pass30"),
    amount: 150000, days: 30, activatedAt, expiresAt,
    guideUrl: `${SITE}/ai/guide`, oneTime: true,
  }),
  renewal: mailer.renderRenewalEmail({
    lang: "vi", to: "check@example.com", daysLeft: 3, expiresAt,
    buyUrl: `${SITE}/buy?renew=1&email=check%40example.com&plan=monthly`,
  }),
  "owner-alert": mailer.renderPaymentAlert({
    orderCode: "CHECK", buyerEmail: "check@example.com", plan: "1 tháng", amount: 200000,
    confirmUrl: `${SITE.replace("https://", "https://api.")}/v1/admin/payments/confirm?code=CHECK`,
    method: "bank",
    methodInfo: { label: "VietQR", short: "VietQR", where: "app", expected: "200.000 đ" },
  }),
};

/** Link cần token thì lỗi 4xx (trừ 404) là bình thường; 404/5xx là hỏng. */
const TOKEN_LINKS = /verify-email\/confirm|payments\/confirm/;

const seen = new Map();
for (const [name, message] of Object.entries(messages)) {
  const urls = [...new Set(message.html.match(/https?:\/\/[^"'\s<>]+/g) ?? [])]
    .map((u) => u.replace(/&amp;/g, "&"));
  for (const url of urls) {
    if (!seen.has(url)) seen.set(url, []);
    seen.get(url).push(name);
  }
}

let bad = 0;
for (const [url, from] of seen) {
  let status = 0;
  try {
    const res = await fetch(url, { method: "GET", redirect: "manual" });
    status = res.status;
  } catch (err) {
    console.log(`  LỖI   ${url}  (${err?.message ?? err})  ← ${from.join(", ")}`);
    bad += 1;
    continue;
  }
  const tokenLink = TOKEN_LINKS.test(url);
  const ok = status >= 200 && status < 400 || (tokenLink && status >= 400 && status < 500 && status !== 404);
  if (!ok) bad += 1;
  console.log(`  ${ok ? "OK  " : "HỎNG"}  ${String(status).padEnd(4)} ${url}  ← ${from.join(", ")}`);
}
console.log(`\n${seen.size} link — ${bad ? `${bad} link hỏng` : "tất cả sống"}`);
process.exit(bad ? 1 : 0);
