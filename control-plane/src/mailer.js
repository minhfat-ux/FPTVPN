import nodemailer from "nodemailer";

const DEFAULT_FROM_EMAIL = "FlowVPN <no-reply@meetflowai.site>";
const SUBJECT = "Your FlowVPN Login Code";
const SUPPORT_EMAIL = "support@meetflowai.site";
const GREETING = "Dear valued customer,";
const EXPIRES_NOTE = "This code expires in 10 minutes. If you did not request this, please ignore this email.";
const SIGNATURE = `Best regards,<br/>FlowVPN Team<br/><a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>`;

// Sends the OTP login code via the owner's SMTP mail server
// (mail92231.maychuemail.com:465 SSL / 587 STARTTLS). createSendOtpEmail lets
// tests inject a fake transporter; production uses nodemailer via SMTP_HOST /
// SMTP_PORT / SMTP_USER / SMTP_PASS / FROM_EMAIL env vars.
export function createSendOtpEmail({ transporter } = {}) {
  return async function sendOtpEmail({ email, code }) {
    const configured =
      process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS;
    if (process.env.NODE_ENV === "production" && configured) {
      try {
        const port = Number(process.env.SMTP_PORT || 465);
        const tr =
          transporter ??
          nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port,
            secure: port === 465,
            auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
          });
        await tr.sendMail({
          from: process.env.FROM_EMAIL ?? DEFAULT_FROM_EMAIL,
          to: email,
          subject: SUBJECT,
          html: `<p>${GREETING}</p>
<p>Your FlowVPN login code is:</p>
<p style="font-size:24px;font-weight:bold;letter-spacing:4px">${code}</p>
<p>${EXPIRES_NOTE}</p>
<p>${SIGNATURE}</p>`,
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

// ---------- Invoice email (customer, after successful payment) ----------
const INVOICE_SUBJECT = "VPNFlow — Xác nhận thanh toán";

// Sends a payment confirmation/invoice to the customer after their order is
// confirmed/activated. Reuses the configured SMTP transporter.
export async function sendInvoiceEmail({ to, orderCode, planLabel, amount, days, activatedAt, expiresAt, appUrl, guideUrl }) {
  const configured = process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS;
  if (!(process.env.NODE_ENV === "production" && configured)) {
    console.log("[invoice] (dev, no SMTP) to", to, "order", orderCode);
    return { sent: false };
  }
  try {
    const port = Number(process.env.SMTP_PORT || 465);
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    const amt = Number(amount || 0).toLocaleString("vi-VN");
    const fmt = (iso) => (iso ? new Date(iso).toLocaleString("vi-VN") : "Vĩnh viễn");
    const period = days == null ? "Vĩnh viễn (một lần)" : `${days} ngày`;
    const expires = expiresAt ? fmt(expiresAt) : "Không giới hạn";
    await transporter.sendMail({
      from: process.env.FROM_EMAIL ?? DEFAULT_FROM_EMAIL,
      to,
      subject: `${INVOICE_SUBJECT} — #${orderCode}`,
      html: `<p>Xin chào,</p>
<p>Cảm ơn bạn đã mua <b>VPNFlow Premium</b>. Thanh toán của bạn đã được xác nhận thành công.</p>
<table style="border-collapse:collapse;width:100%;max-width:460px">
  <tr style="background:rgba(0,0,0,.05)"><th style="text-align:left;padding:8px">Mã đơn</th><td style="padding:8px">#${orderCode}</td></tr>
  <tr><th style="text-align:left;padding:8px">Gói</th><td style="padding:8px">${planLabel}</td></tr>
  <tr style="background:rgba(0,0,0,.05)"><th style="text-align:left;padding:8px">Thời hạn</th><td style="padding:8px">${period}</td></tr>
  <tr><th style="text-align:left;padding:8px">Số tiền</th><td style="padding:8px"><b>${amt} đ</b></td></tr>
  <tr style="background:rgba(0,0,0,.05)"><th style="text-align:left;padding:8px">Kích hoạt</th><td style="padding:8px">${fmt(activatedAt)}</td></tr>
  <tr><th style="text-align:left;padding:8px">Hết hạn</th><td style="padding:8px">${expires}</td></tr>
</table>
<p>Premium đã được kích hoạt cho tài khoản <b>${to}</b> — bạn có thể dùng trên mọi thiết bị khi đăng nhập cùng email này.</p>
<div style="background:#f4f8ff;border:1px solid #d8e4f5;border-radius:10px;padding:14px;margin:16px 0">
  <p style="margin:0 0 8px"><b>Cách kích hoạt trong app:</b></p>
  <ol style="margin:0;padding-left:20px;color:#333;font-size:14px;line-height:1.7">
    <li>Tải app (iOS: App Store · Android: file APK trên trang mua).</li>
    <li>Mở app và đăng nhập bằng đúng email <b>${to}</b> — mã OTP sẽ gửi vào email này.</li>
    <li>Premium tự kích hoạt, không cần làm gì thêm.</li>
  </ol>
  ${guideUrl ? `<p style="margin:10px 0 0"><a href="${guideUrl}" style="color:#1c70f2">Xem hướng dẫn chi tiết có hình →</a></p>` : ""}
</div>
<p><a href="${appUrl || "https://meetflowai.site"}" style="display:inline-block;background:#33c773;color:#06160d;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold">🚀 Mở VPNFlow</a></p>
<p style="color:#999;font-size:12px">Cần hỗ trợ? Liên hệ <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></p>
${SIGNATURE}`,
    });
    return { sent: true };
  } catch (err) {
    console.error("sendInvoiceEmail failed:", redactError(err));
    return { sent: false };
  }
}

// ---------- Renewal reminder email (customer) ----------
const RENEW_SUBJECT = "VPNFlow — Gói của bạn sắp hết hạn";

// Reminds a customer that their premium is about to expire and links them to
// the buy page so they can renew. SMTP is reused from the env config.
export async function sendRenewalReminder({ to, daysLeft, expiresAt, buyUrl }) {
  const configured = process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS;
  if (!(process.env.NODE_ENV === "production" && configured)) {
    console.log("[renewal-reminder] (dev, no SMTP) to", to, "daysLeft", daysLeft);
    return { sent: false };
  }
  try {
    const port = Number(process.env.SMTP_PORT || 465);
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    const expDate = expiresAt ? new Date(expiresAt).toLocaleDateString("vi-VN") : "";
    const when = daysLeft === 1 ? "HÔM NAY" : `còn ${daysLeft} ngày`;
    await transporter.sendMail({
      from: process.env.FROM_EMAIL ?? DEFAULT_FROM_EMAIL,
      to,
      subject: `${RENEW_SUBJECT} — ${when}`,
      html: `<p>${GREETING}</p>
<p>Gói <b>VPNFlow Premium</b> của bạn sẽ hết hạn vào <b>${expDate}</b> (${when}).</p>
<p>Để tiếp tục sử dụng VPN không bị gián đoạn, hãy gia hạn trước khi gói kết thúc:</p>
<p><a href="${buyUrl}" style="display:inline-block;background:#33c773;color:#06160d;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold">🔄 Gia hạn Premium</a></p>
<p style="color:#999;font-size:12px">Sau khi thanh toán, Premium được kích hoạt tự động cho tài khoản của bạn.</p>
${SIGNATURE}`,
    });
    return { sent: true };
  } catch (err) {
    console.error("sendRenewalReminder failed:", redactError(err));
    return { sent: false };
  }
}

// ---------- Payment alert email (owner) ----------
const PAYMENT_SUBJECT = "VPNFlow — Đơn thanh toán mới cần xác nhận";

// Sends the owner an email when a new payment order arrives, with a signed
// link to confirm (grant premium) after verifying the transfer in the bank app.
export async function sendPaymentAlert({ to, orderCode, buyerEmail, plan, amount, confirmUrl, product = "VPNFlow Premium" }) {
  const configured = process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS;
  if (!(process.env.NODE_ENV === "production" && configured)) {
    console.log("[payment-alert] (dev, no SMTP) order", orderCode, "buyer", buyerEmail, "plan", plan);
    return { sent: false };
  }
  try {
    const port = Number(process.env.SMTP_PORT || 465);
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    const amt = Number(amount || 0).toLocaleString("vi-VN");
    await transporter.sendMail({
      from: process.env.FROM_EMAIL ?? DEFAULT_FROM_EMAIL,
      to,
      subject: `${PAYMENT_SUBJECT} (${product}) — #${orderCode}`,
      html: `<p>${GREETING}</p>
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
<p style="color:#999;font-size:12px">Link chỉ có hiệu lực 1 lần. Nếu bạn không tạo đơn này, hãy bỏ qua email.</p>
${SIGNATURE}`,
    });
    return { sent: true };
  } catch (err) {
    console.error("sendPaymentAlert failed:", redactError(err));
    return { sent: false };
  }
}

// Never log the code or the email body that contains it.
function redactError(err) {
  return { name: err?.name ?? "Error", message: err?.message ?? "unknown error" };
}

/** Invoice for a MeetFlow AI Pro web purchase (separate branding). */
export async function sendAiInvoiceEmail({ to, orderCode, planLabel, amount, days, activatedAt, expiresAt, guideUrl }) {
  const configured = process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS;
  if (!(process.env.NODE_ENV === "production" && configured)) {
    console.log("[ai-invoice] (dev, no SMTP) to", to, "order", orderCode);
    return { sent: false };
  }
  try {
    const port = Number(process.env.SMTP_PORT || 465);
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    const amt = Number(amount || 0).toLocaleString("vi-VN");
    const fmt = (iso) => (iso ? new Date(iso).toLocaleString("vi-VN") : "Không giới hạn");
    const period = days == null ? "Vĩnh viễn (một lần)" : `${days} ngày`;
    await transporter.sendMail({
      from: process.env.FROM_EMAIL ?? DEFAULT_FROM_EMAIL,
      to,
      subject: `MeetFlow AI — Xác nhận thanh toán gói Pro #${orderCode}`,
      html: `<p>Xin chào,</p>
<p>Cảm ơn bạn đã mua <b>MeetFlow AI Pro</b>. Thanh toán của bạn đã được xác nhận thành công.</p>
<table style="border-collapse:collapse;width:100%;max-width:460px">
  <tr style="background:rgba(0,0,0,.05)"><th style="text-align:left;padding:8px">Mã đơn</th><td style="padding:8px">#${orderCode}</td></tr>
  <tr><th style="text-align:left;padding:8px">Gói</th><td style="padding:8px">${planLabel}</td></tr>
  <tr style="background:rgba(0,0,0,.05)"><th style="text-align:left;padding:8px">Thời hạn</th><td style="padding:8px">${period}</td></tr>
  <tr><th style="text-align:left;padding:8px">Số tiền</th><td style="padding:8px"><b>${amt} đ</b></td></tr>
  <tr style="background:rgba(0,0,0,.05)"><th style="text-align:left;padding:8px">Kích hoạt</th><td style="padding:8px">${fmt(activatedAt)}</td></tr>
  <tr><th style="text-align:left;padding:8px">Hết hạn</th><td style="padding:8px">${fmt(expiresAt)}</td></tr>
</table>
<p>Pro đã được kích hoạt cho tài khoản <b>${to}</b>.</p>
<div style="background:#f4f8ff;border:1px solid #d8e4f5;border-radius:10px;padding:14px;margin:16px 0">
  <p style="margin:0 0 8px"><b>Cách kích hoạt trong app (Android):</b></p>
  <ol style="margin:0;padding-left:20px;color:#333;font-size:14px;line-height:1.7">
    <li>Tải app: iOS trên App Store · Android tải file APK trên trang mua.</li>
    <li>Mở app → màn hình nâng cấp → mục <b>“Đã mua trên web?”</b>.</li>
    <li>Nhập đúng email <b>${to}</b> → bấm <b>“Kích hoạt Pro”</b>.</li>
  </ol>
  ${guideUrl ? `<p style="margin:10px 0 0"><a href="${guideUrl}" style="color:#1c70f2">Xem hướng dẫn chi tiết →</a></p>` : ""}
</div>
<p style="color:#999;font-size:12px">Cần hỗ trợ? Liên hệ <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></p>
<p>Best regards,<br/>MeetFlow AI Team<br/><a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></p>`,
    });
    return { sent: true };
  } catch (err) {
    console.error("sendAiInvoiceEmail failed:", redactError(err));
    return { sent: false };
  }
}
