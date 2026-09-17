import crypto from "node:crypto";
import { decryptSecret } from "./crypto.js";

/**
 * Transactional email for login codes. Uses Resend's HTTP API (the same provider
 * the rest of the MeetFlow stack sends with) — no SMTP dependency, so the VPS
 * needs nothing installed. The key can come from Settings (encrypted) or from
 * the environment, and the app still works without any mailer by showing the
 * code on screen (see `showLoginCodeWhenNoMailer`).
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";
export const BRAND_NAVY = "#0A1F3B";
export const BRAND_GREEN = "#33C773";

function resolveApiKey(settings) {
  const fromSettings = settings?.resendApiKeyEnc ? decryptSecret(settings.resendApiKeyEnc) : null;
  return (
    fromSettings ||
    process.env.FBUDDY_RESEND_API_KEY ||
    process.env.RESEND_API_KEY ||
    null
  );
}

export function mailerStatus(settings) {
  const apiKey = resolveApiKey(settings);
  return {
    configured: Boolean(apiKey),
    provider: apiKey ? "resend" : null,
    from: settings?.mailerFrom ?? null,
    fromName: settings?.mailerFromName ?? null,
  };
}

function sender(settings) {
  const email = String(settings?.mailerFrom ?? "no-reply@meetflowai.site").trim();
  const name = String(settings?.mailerFromName ?? "fBuddy").trim();
  return name ? `${name} <${email}>` : email;
}

async function sendViaResend({ settings, to, subject, html, text }) {
  const apiKey = resolveApiKey(settings);
  if (!apiKey) return { sent: false, reason: "mailer_not_configured" };
  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: sender(settings), to: [to], subject, html, text }),
  });
  const body = await response.text();
  if (!response.ok) {
    let detail = body.slice(0, 300);
    try {
      detail = JSON.parse(body)?.message ?? detail;
    } catch {
      /* keep the raw body */
    }
    return { sent: false, reason: "resend_error", detail };
  }
  let id = null;
  try {
    id = JSON.parse(body)?.id ?? null;
  } catch {
    /* ignore */
  }
  return { sent: true, id };
}

/** Minimal, dark-branded transactional layout (inline CSS for email clients). */
function layout({ title, intro, codeBlock, linkBlock, footer }) {
  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title></head>
<body style="margin:0;background:#f2f5f9;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0A1F3B">
  <div style="max-width:560px;margin:0 auto;padding:28px 18px">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px">
      <img src="https://fbuddy.meetflowai.site/brand-mark.png" alt="FlowTech" width="34" height="34" style="display:block">
      <div style="font-size:18px;font-weight:700">fBuddy</div>
    </div>
    <div style="background:#0A1F3B;border-radius:16px;padding:28px 24px;color:#ffffff">
      <div style="font-size:20px;font-weight:700;letter-spacing:-.02em;margin-bottom:10px">${title}</div>
      <div style="font-size:14.5px;line-height:1.65;color:rgba(255,255,255,.72)">${intro}</div>
      ${codeBlock ?? ""}
      ${linkBlock ?? ""}
    </div>
    <div style="font-size:12px;line-height:1.7;color:#7183a0;margin-top:16px">${footer}</div>
  </div>
</body></html>`;
}

export async function sendLoginCode({ settings, to, code, link, ttlMin }) {
  const subject = `${code} là mã đăng nhập fBuddy của bạn`;
  const codeBlock = `
    <div style="margin:22px 0 8px;padding:16px;border-radius:12px;background:#123052;text-align:center">
      <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.45);margin-bottom:6px">Mã đăng nhập</div>
      <div style="font-family:Consolas,Menlo,monospace;font-size:34px;font-weight:700;letter-spacing:.28em;color:${BRAND_GREEN}">${code}</div>
    </div>
    <div style="font-size:13px;color:rgba(255,255,255,.6)">Mã có hiệu lực trong ${ttlMin} phút và chỉ dùng được một lần.</div>`;
  const linkBlock = link
    ? `<div style="margin-top:20px">
         <a href="${link}" style="display:inline-block;background:${BRAND_GREEN};color:${BRAND_NAVY};font-weight:700;text-decoration:none;padding:12px 20px;border-radius:10px">Đăng nhập ngay</a>
         <div style="font-size:12px;color:rgba(255,255,255,.45);margin-top:10px;word-break:break-all">Hoặc mở liên kết: ${link}</div>
       </div>`
    : "";
  const html = layout({
    title: "Đăng nhập fBuddy",
    intro: "Dùng mã dưới đây để đăng nhập. Nếu không phải bạn yêu cầu, hãy bỏ qua email này — không ai đăng nhập được nếu không có mã.",
    codeBlock,
    linkBlock,
    footer: `Email gửi tự động từ fBuddy (FlowTech · MeetFlow AI). Không trả lời email này.`,
  });
  const text = `Mã đăng nhập fBuddy: ${code}\nHiệu lực ${ttlMin} phút.${link ? `\nHoặc mở: ${link}` : ""}`;

  const result = await sendViaResend({ settings, to, subject, html, text }).catch((err) => ({
    sent: false,
    reason: "network_error",
    detail: err?.message ?? String(err),
  }));
  return result;
}

export async function sendTestEmail({ settings, to }) {
  const code = String(crypto.randomInt(100000, 1000000));
  const html = layout({
    title: "Kiểm tra cấu hình email",
    intro: "Nếu anh nhận được email này, fBuddy đã gửi được mail — mã đăng nhập sẽ tới hộp thư như thế này.",
    codeBlock: `<div style="margin:20px 0 4px;padding:14px;border-radius:12px;background:#123052;text-align:center;font-family:Consolas,Menlo,monospace;font-size:26px;letter-spacing:.24em;color:${BRAND_GREEN}">${code}</div>`,
    footer: "Đây là email kiểm tra, không dùng để đăng nhập.",
  });
  return sendViaResend({
    settings,
    to,
    subject: "fBuddy — email kiểm tra cấu hình",
    html,
    text: `fBuddy gửi được email. Mã kiểm tra: ${code}`,
  }).catch((err) => ({ sent: false, reason: "network_error", detail: err?.message ?? String(err) }));
}

export function loginLink({ publicUrl, email, token }) {
  const base = String(publicUrl ?? "").replace(/\/+$/, "");
  const query = new URLSearchParams({ email, token });
  return `${base}/?${query.toString()}`;
}
