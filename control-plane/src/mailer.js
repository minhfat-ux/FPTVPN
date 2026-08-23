import { Resend } from "resend";

const DEFAULT_FROM_EMAIL = "FlowVPN <no-reply@meetflowai.site>";
const SUBJECT = "Your FlowVPN login code";
const EXPIRES_NOTE = "It expires in 10 minutes. If you did not request this, ignore this email.";

// createSendOtpEmail lets tests inject a fake Resend constructor. Production
// uses the real `resend` package via the default export `sendOtpEmail`.
export function createSendOtpEmail({ ResendCtor = Resend } = {}) {
  return async function sendOtpEmail({ email, code }) {
    if (process.env.NODE_ENV === "production" && process.env.RESEND_API_KEY) {
      try {
        const resend = new ResendCtor(process.env.RESEND_API_KEY);
        await resend.emails.send({
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
