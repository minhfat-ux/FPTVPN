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

const DEFAULT_FROM_EMAIL = "VPNFlow <no-reply@meetflowai.site>";
const AI_FROM_EMAIL = "MeetFlow AI <no-reply@meetflowai.site>";
const REPLY_TO = "support@meetflowai.site";
const SUPPORT_EMAIL = "support@meetflowai.site";

export const MAIL_LANGS = ["vi", "en", "zh"];

/** Normalizes a requested language; unknown values fall back to Vietnamese. */
export function pickMailLang(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw.startsWith("zh")) return "zh";
  // Emails exist in vi/en/zh only; anything else (ja, ko, unknown) gets English
  // so non-Vietnamese customers never receive a Vietnamese receipt.
  return MAIL_LANGS.includes(raw) ? raw : "en";
}

const T = {
  vi: {
    greeting: "Xin chào,",
    otpSubject: "Mã đăng nhập VPNFlow",
    otpIntro: "Mã đăng nhập VPNFlow của bạn là:",
    otpNote: "Mã có hiệu lực 10 phút. Nếu bạn không yêu cầu mã này, hãy bỏ qua email.",
    signature: "Trân trọng,<br/>Đội ngũ VPNFlow",
    verifySubject: "Xác thực email của bạn — MeetFlow AI",
    verifyIntro: "Bạn đã tạo tài khoản MeetFlow AI bằng email này nhưng <b>chưa xác thực</b>. Chỉ cần bấm nút bên dưới để hoàn tất.",
    verifyCta: "✅ Xác thực email",
    verifyWhy: "Vì sao cần xác thực?",
    verifyWhyBody: "Để bảo vệ tài khoản của bạn: khi quên mật khẩu, bạn cần email này để lấy lại. Tài khoản chưa xác thực cũng có thể bị khoá khi phát hiện dấu hiệu bất thường.",
    verifyFor: (to) => `Xác thực cho tài khoản <b>${to}</b>.`,
    verifyLinkNote: "Nút trên có hiệu lực 30 ngày. Nếu link không bấm được, copy địa chỉ dưới vào trình duyệt:",
    verifyIgnore: "Nếu bạn không tạo tài khoản này, hãy bỏ qua email — chúng tôi sẽ không gửi thêm.",
    verifyDone: "Đã xác thực rồi? Bạn có thể bỏ qua email này.",
    verifyTrouble: "Cần hỗ trợ? Trả lời email này hoặc viết tới",
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
    renewBody: "Bấm nút bên dưới để gia hạn — email và gói của bạn đã được điền sẵn, chỉ cần chọn cách thanh toán rồi quét QR chuyển tiền là xong.",
    renewCta: "🔄 Gia hạn ngay",
    renewalFor: (to) => `Tài khoản: <b>${to}</b>`,
    expiresAt: (when) => `Hết hạn: ${when}`,
    support: "Cần hỗ trợ? Liên hệ",
    renewHint: "Link mở sẵn trang thanh toán của bạn.",
  },
  en: {
    greeting: "Hello,",
    otpSubject: "Your VPNFlow login code",
    otpIntro: "Your VPNFlow login code is:",
    otpNote: "This code expires in 10 minutes. If you did not request it, please ignore this email.",
    signature: "Best regards,<br/>The VPNFlow Team",
    verifySubject: "Verify your email — MeetFlow AI",
    verifyIntro: "You signed up for MeetFlow AI with this address but it is <b>not verified yet</b>. One tap on the button below finishes it.",
    verifyCta: "✅ Verify my email",
    verifyWhy: "Why verify?",
    verifyWhyBody: "It protects your account: if you ever forget your password, this address is how you get back in. Unverified accounts can also be locked when we detect unusual activity.",
    verifyFor: (to) => `Verifying <b>${to}</b>.`,
    verifyLinkNote: "This button works for 30 days. If it does not open, paste this address into your browser:",
    verifyIgnore: "If you did not create this account, ignore this email — we will not send more.",
    verifyDone: "Already verified? You can ignore this email.",
    verifyTrouble: "Need help? Reply to this email or write to",
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
    renewBody: "Tap the button below to renew — your email and plan are already filled in, so you only pick a payment method and scan the QR.",
    renewCta: "🔄 Renew now",
    renewalFor: (to) => `Account: <b>${to}</b>`,
    expiresAt: (when) => `Expires: ${when}`,
    support: "Need help? Contact",
    renewHint: "The link opens your pre-filled checkout page.",
  },
  zh: {
    greeting: "您好，",
    otpSubject: "您的 VPNFlow 登录验证码",
    otpIntro: "您的 VPNFlow 登录验证码是：",
    otpNote: "验证码 10 分钟内有效。如果并非您本人操作，请忽略此邮件。",
    signature: "此致，<br/>VPNFlow 团队",
    verifySubject: "验证您的邮箱 — MeetFlow AI",
    verifyIntro: "您使用此邮箱注册了 MeetFlow AI，但<b>尚未验证</b>。点击下面的按钮即可完成。",
    verifyCta: "✅ 验证邮箱",
    verifyWhy: "为什么要验证？",
    verifyWhyBody: "为了保护您的账号：忘记密码时，需要通过此邮箱找回。当系统发现异常活动时，未验证的账号也可能被锁定。",
    verifyFor: (to) => `正在验证账号 <b>${to}</b>。`,
    verifyLinkNote: "按钮 30 天内有效。如果无法点击，请将下面的地址复制到浏览器：",
    verifyIgnore: "如果这不是您创建的账号，请忽略此邮件——我们不会再发送。",
    verifyDone: "已验证过？可以忽略此邮件。",
    verifyTrouble: "需要帮助？回复此邮件或联系",
    verifySubject: "验证您的邮箱 — MeetFlow AI",
    verifyIntro: "您使用此邮箱注册了 MeetFlow AI，但<b>尚未验证</b>。点击下面的按钮即可完成。",
    verifyCta: "✅ 验证邮箱",
    verifyWhy: "为什么要验证？",
    verifyWhyBody: "为了保护您的账号：忘记密码时，需要通过此邮箱找回。当系统发现异常活动时，未验证的账号也可能被锁定。",
    verifyFor: (to) => `正在验证账号 <b>${to}</b>。`,
    verifyLinkNote: "按钮 30 天内有效。如果无法点击，请将下面的地址复制到浏览器：",
    verifyIgnore: "如果这不是您创建的账号，请忽略此邮件——我们不会再发送。",
    verifyDone: "已验证过？可以忽略此邮件。",
    verifyTrouble: "需要帮助？回复此邮件或联系",
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
    renewBody: "点击下方按钮续费 — 您的邮箱和套餐已自动填好，只需选择支付方式并扫码付款即可。",
    renewCta: "🔄 立即续费",
    renewalFor: (to) => `账户：<b>${to}</b>`,
    expiresAt: (when) => `到期时间：${when}`,
    support: "需要帮助？请联系",
    renewHint: "该链接会打开已填好信息的支付页面。",
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

/** Crude HTML → text so every message ships a text/plain alternative. */
function htmlToText(html) {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<li>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
<p style="color:#666;font-size:12px">${t.renewHint}</p>
${buyUrl ? `<p><a href="${buyUrl}" style="display:inline-block;background:#33c773;color:#06160d;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold">${t.renewCta}</a></p>
<p style="color:#666;font-size:12px;word-break:break-all">${buyUrl}</p>` : ""}
<p style="color:#999;font-size:12px">${t.support} <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></p>
<p>${t.signature}</p>`),
  };
}

/** Builds the "please verify your email address" reminder. */
export function renderVerifyEmail({ lang = "en", to, link, reminders = 1 }) {
  const t = text(lang);
  const gentle = reminders > 1;
  return {
    subject: t.verifySubject,
    html: shell(`<p>${t.greeting}</p>
<p>${t.verifyIntro}</p>
<p>${t.verifyFor(to)}</p>
<p><a href="${link}" style="display:inline-block;background:#33c773;color:#06160d;padding:13px 24px;border-radius:8px;text-decoration:none;font-weight:bold">${t.verifyCta}</a></p>
<div style="background:#f4f8ff;border:1px solid #d8e4f5;border-radius:10px;padding:14px;margin:16px 0">
  <p style="margin:0 0 8px"><b>${t.verifyWhy}</b></p>
  <p style="margin:0;color:#333">${t.verifyWhyBody}</p>
</div>
<p style="color:#666;font-size:12px">${t.verifyLinkNote}</p>
<p style="color:#666;font-size:12px;word-break:break-all">${link}</p>
<p style="color:#666;font-size:12px">${gentle ? t.verifyIgnore : t.verifyDone}</p>
<p style="color:#999;font-size:12px">${t.verifyTrouble} <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></p>
<p>${t.signature}</p>`),
  };
}

/** Builds the owner's "new order needs confirmation" alert (always Vietnamese). */
export function renderPaymentAlert({ orderCode, buyerEmail, plan, amount, confirmUrl, product = "VPNFlow Premium", cny = null }) {
  const amt = Number(amount || 0).toLocaleString("vi-VN");
  // WeChat/Alipay customers type the CNY amount by hand, so the owner must know
  // which ¥ figure to look for in the payment app.
  const cnyRow = cny?.amount
    ? `<tr><td style="padding:4px 12px 4px 0;color:#666">Quy đổi CNY</td><td style="font-weight:bold">¥${cny.amount} <span style="color:#666;font-weight:normal">(1 CNY ≈ ${Number(cny.rate || 0).toLocaleString("vi-VN")} đ)</span></td></tr>`
    : "";
  return {
    subject: `Đơn thanh toán mới (${product}) — #${orderCode}`,
    html: shell(`<p>Xin chào,</p>
<p>Có đơn thanh toán mới cần xác nhận:</p>
<table style="border-collapse:collapse">
  <tr><td style="padding:4px 12px 4px 0;color:#666">Mã đơn</td><td style="font-weight:bold">#${orderCode}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#666">Email khách</td><td style="font-weight:bold">${buyerEmail}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#666">Gói</td><td style="font-weight:bold">${plan}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#666">Số tiền</td><td style="font-weight:bold">${amt} đ</td></tr>
  ${cnyRow}
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

async function deliver({ to, message, logTag, logContext, from }) {
  if (!(process.env.NODE_ENV === "production" && smtpConfigured())) {
    console.log(`[${logTag}] (dev, no SMTP)`, logContext);
    return { sent: false };
  }
  try {
    const info = await transport().sendMail({
      from: from ?? process.env.FROM_EMAIL ?? DEFAULT_FROM_EMAIL,
      replyTo: REPLY_TO,
      to,
      subject: message.subject,
      html: message.html,
      text: htmlToText(message.html),
    });
    console.log(`[${logTag}] sent to ${to} accepted=${JSON.stringify(info.accepted)} id=${info.messageId}`);
    return { sent: true, accepted: info.accepted, messageId: info.messageId };
  } catch (err) {
    console.error(`${logTag} failed to ${to}:`, redactError(err), err?.response ?? "");
    return { sent: false, error: err?.message ?? "send failed" };
  }
}

// Sends the OTP login code (tests can inject a fake transporter).
export function createSendOtpEmail({ transporter } = {}) {
  return async function sendOtpEmail({ email, code, lang }) {
    const message = renderOtpEmail({ code, lang });
    if (process.env.NODE_ENV === "production" && smtpConfigured()) {
      try {
        const info = await (transporter ?? transport()).sendMail({
          from: process.env.FROM_EMAIL ?? DEFAULT_FROM_EMAIL,
          replyTo: REPLY_TO,
          to: email,
          subject: message.subject,
          html: message.html,
          text: htmlToText(message.html),
        });
        console.log(`[otp] sent to ${email} accepted=${JSON.stringify(info.accepted)} id=${info.messageId}`);
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
    from: AI_FROM_EMAIL,
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

/**
 * Sends the email-verification reminder from the MeetFlow AI brand address.
 * Delivery failure is reported, never thrown: a reminder must not break the
 * caller (the scheduled job or an admin click).
 */
export async function sendVerifyEmail({ to, lang = "en", link, reminders = 1 }) {
  const message = renderVerifyEmail({ lang, to, link, reminders });
  const result = await deliver({
    to,
    message,
    logTag: "verify-email",
    logContext: { to, reminders, linkPrefix: String(link).slice(0, 60) },
    from: AI_FROM_EMAIL,
  });
  return result;
}
