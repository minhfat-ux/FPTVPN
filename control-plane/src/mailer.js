import nodemailer from "nodemailer";

const DEFAULT_FROM_EMAIL = "FlowVPN <no-reply@meetflowai.site>";
const SUBJECT = "Your FlowVPN login code";
const EXPIRES_NOTE = "It expires in 10 minutes. If you did not request this, ignore this email.";

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
          html: `<p>Your FlowVPN login code is <strong>${code}</strong>.</p>\n<p>${EXPIRES_NOTE}</p>`,
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

// Never log the code or the email body that contains it.
function redactError(err) {
  return { name: err?.name ?? "Error", message: err?.message ?? "unknown error" };
}
