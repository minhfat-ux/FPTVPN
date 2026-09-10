import nodemailer from "nodemailer";

/**
 * Transactional email — localized in Vietnamese, English and Chinese.
 *
 * The customer's language is taken from, in order:
 *   1. an explicit `lang` (the buy page knows the language the customer used,
 *      the apps send their UI language with the OTP request),
 *   2. the language remembered for that email address,
 *   3. Vietnamese (the primary market).
 *
 * Owner alerts (payment confirmations) stay Vietnamese — they go to the shop
 * owner, not the customer.
 */

const DEFAULT_FROM_EMAIL = "FlowVPN <no-reply@meetflowai.site>";
const SUPPORT_EMAIL = "support@meetflowai.site";

export const MAIL_LANGS = ["vi", "en", "zh"];

/** Normalizes a requested language; unknown values fall back to Vietnamese. */
export function pickMailLang(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw.startsWith("zh")) return "zh";
  return MAIL_LANGS.includes(raw) ? raw : "vi";
}

const T = {
  vi: {
    greeting: "Xin chào,",
    otpSubject: "Mã đăng nhập VPNFlow",
    otpIntro: "Mã đăng nhập VPNFlow của bạn là:",
    otpNote: "Mã có hiệu lực 10 phút. Nếu bạn không yêu cầu mã này, hãy bỏ qua email.",
    signature: "Trân trọng,<br/>Đội ngũ VPNFlow",
    invoiceSubject: (p) => `${p} — Xác nhận thanh toán`,
    invoiceIntro: (p) => `Cảm ơn bạn đã mua <b>${p}</b>. Thanh toán của bạn đã được xác nhận thành công.`,
    orderCode: "Mã đơn", plan: "Gói", period: "Thời hạn", amount: "Số tiền",
    activated: "Kích hoạt", expires: "Hết hạn",
    days: (d) => `${d} ngày`,
    forever: "Không giới hạn",
    oneTimePeriod: "Mua một lần (không tự động gia hạn)",
    activatedFor: (to) => `Đã kích hoạt cho tài khoản <b>${to}</b>.`,
    howToVpn: "Cách kích hoạt trong app:",
    howToStepsVpn: (to) => [
      "Tải app (iOS: App Store · Android: file APK trên trang mua).",
      `Mở app và đăng nhập bằng đúng email <b>${to}</b> — mã OTP sẽ gửi vào email này.`,
      "Premium tự kích hoạt, không cần làm gì thêm.",
    ],
    howToAi: "Cách kích hoạt trong app (Android):",
    howToStepsAi: (to) => [
      "Tải app: iOS trên App Store · Android tải file APK trên trang mua.",
      "Mở app → màn hình nâng cấp → mục <b>“Đã mua trên web?”</b>.",
      `Nhập đúng email <b>${to}</b> → bấm <b>“Kích hoạt Pro”</b>.`,
    ],
    guideLink: "Xem hướng dẫn chi tiết →",
    openApp: "🚀 Mở ứng dụng",
    renewSubject: "Gói của bạn sắp hết hạn",
    renewIntro: (d) => `Gói <b>Premium</b> của bạn sẽ hết hạn sau <b>${d} ngày</b>.`,
    renewBody: "Gia hạn ngay để không bị gián đoạn kết nối.",
    renewCta: "🔄 Gia hạn ngay",
    renewalFor: (to) => `Tài khoản: <b>${to}</b>`,
    expiresAt: (when) => `Hết hạn: ${when}`,
    support: "Cần hỗ trợ? Liên hệ",
  },
  en: {
    greeting: "Hello,",
    otpSubject: "Your VPNFlow login code",
    otpIntro: "Your VPNFlow login code is:",
    otpNote: "This code expires in 10 minutes. If you did not request it, please ignore this email.",
    signature: "Best regards,<br/>The VPNFlow Team",
    invoiceSubject: (p) => `${p} — payment confirmation`,
    invoiceIntro: (p) => `Thank you for buying <b>${p}</b>. Your payment has been confirmed.`,
    orderCode: "Order code", plan: "Plan", period: "Period", amount: "Amount",
    activated: "Activated", expires: "Expires",
    days: (d) => `${d} days`,
    forever: "Unlimited",
    oneTimePeriod: "One-time purchase (no auto-renewal)",
    activatedFor: (to) => `Activated for the account <b>${to}</b>.`,
    howToVpn: "How to activate in the app:",
    howToStepsVpn: (to) => [
      "Install the app (iOS: App Store · Android: the APK on the buy page).",
      `Open the app and sign in with the same email <b>${to}</b> — the OTP goes to this address.`,
      "Premium switches on by itself — nothing else to do.",
    ],
    howToAi: "How to activate in the app (Android):",
    howToStepsAi: (to) => [
      "Install the app: iOS from the App Store · Android from the APK on the buy page.",
      "Open the app → upgrade screen → <b>“Bought on the web?”</b>.",
      `Enter the same email <b>${to}</b> → tap <b>“Activate Pro”</b>.`,
    ],
    guideLink: "Open the step-by-step guide →",
    openApp: "🚀 Open the app",
    renewSubject: "Your plan is about to expire",
    renewIntro: (d) => `Your <b>Premium</b> plan expires in <b>${d} days</b>.`,
    renewBody: "Renew now so your connection is not interrupted.",
    renewCta: "🔄 Renew now",
    renewalFor: (to) => `Account: <b>${to}</b>`,
    expiresAt: (when) => `Expires: ${when}`,
    support: "Need help? Contact",
  },
  zh: {
    greeting: "您好，",
    otpSubject: "您的 VPNFlow 登录验证码",
    otpIntro: "您的 VPNFlow 登录验证码是：",
    otpNote: "验证码 10 分钟内有效。如果并非您本人操作，请忽略此邮件。",
    signature: "此致，<br/>VPNFlow 团队",
    invoiceSubject: (p) => `${p} — 付款确认`,
    invoiceIntro: (p) => `感谢您购买 <b>${p}</b>。您的付款已确认成功。`,
    orderCode: "订单号", plan: "套餐", period: "有效期", amount: "金额",
    activated: "激活时间", expires: "到期时间",
    days: (d) => `${d} 天`,
    forever: "无限期",
    oneTimePeriod: "一次性购买（不会自动续费）",
    activatedFor: (to) => `已为账户 <b>${to}</b> 激活。`,
    howToVpn: "在应用中激活的方法：",
    howToStepsVpn: (to) => [
      "安装应用（iOS：App Store · Android：购买页的 APK 文件）。",
      `打开应用并使用同一邮箱 <b>${to}</b> 登录 — 验证码会发送到该邮箱。`,
      "Premium 会自动激活，无需其他操作。",
    ],
    howToAi: "在应用中激活的方法（Android）：",
    howToStepsAi: (to) => [
      "安装应用：iOS 从 App Store · Android 从购买页下载 APK。",
      "打开应用 → 升级页面 → <b>“已在网页购买？”</b>。",
      `输入同一邮箱 <b>${to}</b> → 点击 <b>“激活 Pro”</b>。`,
    ],
    guideLink: "查看分步指南 →",
    openApp: "🚀 打开应用",
    renewSubject: "您的套餐即将到期",
    renewIntro: (d) => `您的 <b>Premium</b> 套餐将在 <b>${d} 天</b>后到期。`,
    renewBody: "立即续费，避免连接中断。",
    renewCta: "🔄 立即续费",
    renewalFor: (to) => `账户：<b>${to}</b>`,
    expiresAt: (when) => `到期时间：${when}`,
    support: "需要帮助？请联系",
  },
};

function text(lang) {
  return T[pickMailLang(lang)];
}

/** Locale-aware date/time for the invoice body. */
function fmtDate(iso, lang) {
  if (!iso) return null;
  const locale = pickMailLang(lang) === "zh" ? "zh-CN" : pickMailLang(lang) === "en" ? "en-US" : "vi-VN";
  try {
    return new Date(iso).toLocaleString(locale);
  } catch {
    return new Date(iso).toISOString();
  }
}

function money(amount, lang) {
  const n = Number(amount || 0);
  const locale = pickMailLang(lang) === "zh" ? "zh-CN" : pickMailLang(lang) === "en" ? "en-US" : "vi-VN";
  try {
    return `${n.toLocaleString(locale)} đ`;
  } catch {
    return `${n} đ`;
  }
}

function shell(body) {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;line-height:1.6;color:#222">${body}</div>`;
}

function stepsHtml(title, steps, guideUrl, guideLabel) {
  return `
<div style="background:#f4f8ff;border:1px solid #d8e4f5;border-radius:10px;padding:14px;margin:16px 0">
  <p style="margin:0 0 8px"><b>${title}</b></p>
  <ol style="margin:0;padding-left:20px;color:#333">${steps.map((s) => `<li>${s}</li>`).join("")}</ol>
  ${guideUrl ? `<p style="margin:10px 0 0"><a href="${guideUrl}" style="color:#1c70f2">${guideLabel}</a></p>` : ""}
</div>`;
}

/** Builds the login-code email (subject + html) for a language. */
export function renderOtpEmail({ code, lang = "vi" }) {
  const t = text(lang);
  return {
    subject: t.otpSubject,
    html: shell(`<p>${t.greeting}</p>
<p>${t.otpIntro}</p>
<p style="font-size:24px;font-weight:bold;letter-spacing:4px">${code}</p>
<p>${t.otpNote}</p>
<p>${t.signature}<br/><a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></p>`),
  };
}

/** Builds the invoice email for a confirmed purchase. */
export function renderInvoiceEmail({
  lang = "vi",
  product = "vpn",
  brand = "VPNFlow Premium",
  to,
  orderCode,
  planLabel,
  amount,
  days,
  activatedAt,
  expiresAt,
  appUrl,
  guideUrl,
  oneTime = false,
}) {
  const t = text(lang);
  const isAi = product === "ai";
  const period = oneTime ? t.oneTimePeriod : days == null ? t.forever : t.days(days);
  const expires = expiresAt ? fmtDate(expiresAt, lang) : t.forever;
  const rows = [
    [t.orderCode, `#${orderCode}`],
    [t.plan, planLabel],
    [t.period, period],
    [t.amount, `<b>${money(amount, lang)}</b>`],
    [t.activated, fmtDate(activatedAt, lang) ?? "-"],
    [t.expires, expires],
  ]
    .map(
      ([k, v], i) =>
        `<tr style="background:${i % 2 ? "rgba(0,0,0,.04)" : "transparent"}"><th style="text-align:left;padding:8px;white-space:nowrap">${k}</th><td style="padding:8px">${v}</td></tr>`,
    )
    .join("");
  const steps = isAi ? t.howToStepsAi(to) : t.howToStepsVpn(to);
  return {
    subject: t.invoiceSubject(brand),
    html: shell(`<p>${t.greeting}</p>
<p>${t.invoiceIntro(brand)}</p>
<table style="border-collapse:collapse;width:100%;max-width:460px">${rows}</table>
<p>${t.activatedFor(to)}</p>
${stepsHtml(isAi ? t.howToAi : t.howToVpn, steps, guideUrl, t.guideLink)}
${appUrl ? `<p><a href="${appUrl}" style="display:inline-block;background:#33c773;color:#06160d;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold">${t.openApp}</a></p>` : ""}
<p style="color:#999;font-size:12px">${t.support} <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></p>
<p>${t.signature}</p>`),
  };
}

/** Builds the "your plan expires soon" reminder. */
export function renderRenewalEmail({ lang = "vi", to, daysLeft, expiresAt, buyUrl, brand = "VPNFlow Premium" }) {
  const t = text(lang);
  return {
    subject: `${brand} — ${t.renewSubject}`,
    html: shell(`<p>${t.greeting}</p>
<p>${t.renewIntro(daysLeft)}</p>
<p>${t.renewalFor(to)}<br/>${t.expiresAt(fmtDate(expiresAt, lang))}</p>
<p>${t.renewBody}</p>
${buyUrl ? `<p><a href="${buyUrl}" style="display:inline-block;background:#33c773;color:#06160d;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold">${t.renewCta}</a></p>` : ""}
<p style="color:#999;font-size:12px">${t.support} <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></p>
<p>${t.signature}</p>`),
  };
}

/** Builds the owner's "new order needs confirmation" alert (always Vietnamese). */
export function renderPaymentAlert({ orderCode, buyerEmail, plan, amount, confirmUrl, product = "VPNFlow Premium" }) {
  const amt = Number(amount || 0).toLocaleString("vi-VN");
  return {
    subject: `Đơn thanh toán mới (${product}) — #${orderCode}`,
    html: shell(`<p>Xin chào,</p>
<p>Có đơn thanh toán mới cần xác nhận:</p>
<table style="border-collapse:collapse">
  <tr><td style="padding:4px 12px 4px 0;color:#666">Mã đơn</td><td style="font-weight:bold">#${orderCode}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#666">Email khách</td><td style="font-weight:bold">${buyerEmail}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#666">Gói</td><td style="font-weight:bold">${plan}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#666">Số tiền</td><td style="font-weight:bold">${amt} đ</td></tr>
</table>
<p>Sản phẩm: <b>${product}</b></p>
<p>Vui lòng kiểm tra app ngân hàng đã nhận tiền, rồi bấm nút bên dưới để kích hoạt cho khách:</p>
<p><a href="${confirmUrl}" style="display:inline-block;background:#33c773;color:#06160d;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold">✅ Xác nhận đã nhận tiền</a></p>
<p style="color:#999;font-size:12px">Link chỉ có hiệu lực 1 lần. Nếu bạn không tạo đơn này, hãy bỏ qua email.</p>`),
  };
}

function transport(transporter) {
  if (transporter) return transporter;
  const port = Number(process.env.SMTP_PORT || 465);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

async function deliver({ to, message, logTag, logContext }) {
  if (!(process.env.NODE_ENV === "production" && smtpConfigured())) {
    console.log(`[${logTag}] (dev, no SMTP)`, logContext);
    return { sent: false };
  }
  try {
    await transport().sendMail({
      from: process.env.FROM_EMAIL ?? DEFAULT_FROM_EMAIL,
      to,
      subject: message.subject,
      html: message.html,
    });
    return { sent: true };
  } catch (err) {
    console.error(`${logTag} failed:`, redactError(err));
    return { sent: false };
  }
}

// Sends the OTP login code (tests can inject a fake transporter).
export function createSendOtpEmail({ transporter } = {}) {
  return async function sendOtpEmail({ email, code, lang }) {
    const message = renderOtpEmail({ code, lang });
    if (process.env.NODE_ENV === "production" && smtpConfigured()) {
      try {
        await (transporter ?? transport()).sendMail({
          from: process.env.FROM_EMAIL ?? DEFAULT_FROM_EMAIL,
          to: email,
          subject: message.subject,
          html: message.html,
        });
        return { sent: true };
      } catch (err) {
        console.error("sendOtpEmail failed:", redactError(err));
        const safe = new Error("Failed to send login code email");
        safe.statusCode = 500;
        throw safe;
      }
    }
    return { sent: false, devCode: code };
  };
}

export const sendOtpEmail = createSendOtpEmail();

/** Invoice for a confirmed VPNFlow purchase (localized). */
export async function sendInvoiceEmail({ to, lang, orderCode, planLabel, amount, days, activatedAt, expiresAt, appUrl, guideUrl }) {
  return deliver({
    to,
    message: renderInvoiceEmail({
      lang, product: "vpn", brand: "VPNFlow Premium",
      to, orderCode, planLabel, amount, days, activatedAt, expiresAt, appUrl, guideUrl,
    }),
    logTag: "invoice",
    logContext: { to, orderCode, lang: pickMailLang(lang) },
  });
}

/** Invoice for a confirmed MeetFlow AI Pro purchase (localized). */
export async function sendAiInvoiceEmail({ to, lang, orderCode, planLabel, amount, days, activatedAt, expiresAt, guideUrl, oneTime = false }) {
  return deliver({
    to,
    message: renderInvoiceEmail({
      lang, product: "ai", brand: "MeetFlow AI Pro",
      to, orderCode, planLabel, amount, days, activatedAt, expiresAt, guideUrl, oneTime,
    }),
    logTag: "ai-invoice",
    logContext: { to, orderCode, lang: pickMailLang(lang) },
  });
}

/** Renewal reminder (localized). */
export async function sendRenewalReminder({ to, lang, daysLeft, expiresAt, buyUrl }) {
  return deliver({
    to,
    message: renderRenewalEmail({ lang, to, daysLeft, expiresAt, buyUrl }),
    logTag: "renewal",
    logContext: { to, daysLeft, lang: pickMailLang(lang) },
  });
}

/** Owner alert for a new order (Vietnamese, includes the confirm link). */
export async function sendPaymentAlert({ to, orderCode, buyerEmail, plan, amount, confirmUrl, product = "VPNFlow Premium" }) {
  return deliver({
    to,
    message: renderPaymentAlert({ orderCode, buyerEmail, plan, amount, confirmUrl, product }),
    logTag: "payment-alert",
    logContext: { orderCode, buyerEmail },
  });
}

function redactError(err) {
  return { name: err?.name ?? "Error", message: err?.message ?? "unknown error" };
}
