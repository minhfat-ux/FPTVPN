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
export async function sendPaymentAlert({ to, orderCode, buyerEmail, plan, amount, confirmUrl }) {
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
      subject: `${PAYMENT_SUBJECT} — #${orderCode}`,
      html: `<p>${GREETING}</p>
<p>Có đơn thanh toán mới cần xác nhận:</p>
<table style="border-collapse:collapse">
  <tr><td style="padding:4px 12px 4px 0;color:#666">Mã đơn</td><td style="font-weight:bold">#${orderCode}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#666">Email khách</td><td style="font-weight:bold">${buyerEmail}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#666">Gói</td><td style="font-weight:bold">${plan}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#666">Số tiền</td><td style="font-weight:bold">${amt} đ</td></tr>
</table>
<p>Vui lòng kiểm tra app ngân hàng đã nhận tiền, rồi bấm nút bên dưới để kích hoạt Premium cho khách:</p>
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
