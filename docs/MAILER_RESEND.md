# Mailer Solution — Resend (OTP email for email login)

- **Status:** DECIDED (owner, 2026-08-23) — use **Resend** for transactional OTP emails
- **Purpose:** deliver the 6-digit OTP code from `/v1/auth/email/start` (email-code login,
  part of BUG-20260823-001 Option F account model)
- **Related:** `.privatevpn/memory/DECISIONS.md`, `CURRENT_WORK.md` (BUG-20260823-001 gap b),
  `control-plane/src/auth-store.js`, `control-plane/src/index.js`
- **Owner decision:** Resend free tier (3,000 emails/month, 100 emails/day, never expires).
  Backup if more volume later: Brevo (300/day) or Resend Pro ($20/mo, 50k/mo).
  Do NOT use Gmail SMTP for production.

## 1. Why Resend

- Free 3,000 emails/month + 100/day, permanent (unlike Mailgun 3-month trial).
- Simple Node SDK (`resend` npm package), one API call to send.
- Good deliverability, webhooks, dashboard; domain verification via DNS (SPF/DKIM).
- References: <https://www.resend.com/docs/knowledge-base/account-quotas-and-limits>,
  <https://www.resend.com/docs/introduction>

## 2. Integration plan (for the coding agent)

### 2.1 Dependency

- Add `resend` to `control-plane/package.json` dependencies (Node >= 18).

### 2.2 New file `control-plane/src/mailer.js`

- Export `sendOtpEmail({ email, code })`:
  - If `NODE_ENV === "production"` and `RESEND_API_KEY` is set: send via Resend:
    ```js
    import { Resend } from "resend";
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: process.env.FROM_EMAIL ?? "FlowVPN <no-reply@meetflowai.site>",
      to: email,
      subject: "Your FlowVPN login code",
      html: `<p>Your FlowVPN login code is <strong>${code}</strong>.</p>
             <p>It expires in 10 minutes. If you did not request this, ignore this email.</p>`,
    });
    ```
  - Otherwise (dev): return the code to the caller (existing `debug_code` behavior) —
    keep the current `!IS_PRODUCTION` debug_code response in `index.js`.
  - Errors: log redacted (never log the code); do not fail the request with the raw
    mailer error — map to a safe message.

### 2.3 Wire into `control-plane/src/index.js`

- `POST /v1/auth/email/start`: after `authStore.startEmailLogin(email)` returns `{ code }`,
  call `sendOtpEmail(...)`. Keep returning `debug_code` ONLY when `!IS_PRODUCTION`.
- `POST /v1/auth/email/verify`: unchanged (auth-store verifies hash + TTL).

### 2.4 Env vars (documented in `control-plane/README.md` + `.env.example` if present)

| Var | Required | Notes |
|---|---|---|
| `RESEND_API_KEY` | production | Resend API key (never commit) |
| `FROM_EMAIL` | optional | default `FlowVPN <no-reply@meetflowai.site>` |
| `NODE_ENV` | production | gates debug_code + real send |

### 2.5 Domain verification (one-time, owner/resend dashboard)

- Add DNS records for `meetflowai.site` (or a dedicated subdomain like `mail.meetflowai.site`):
  SPF + DKIM per Resend dashboard instructions (~5 min). Without this, OTP emails go to spam.

## 3. OTP security requirements (keep / enforce)

- Code is stored hashed (SHA-256) in `auth-store.js`, TTL 10 minutes, single-use (already implemented).
- **Add rate limits (missing):**
  - Resend: max 3 `startEmailLogin` calls per 15 min per email address.
  - Verify: max 5 attempts per email per code; lock/invalidate after that.
- Never log the OTP code or the email body containing it (RULE-SEC-002 style).
- Production must NOT return `debug_code` in the response (already gated by `IS_PRODUCTION`).

## 4. Verification checklist (after implementation)

1. Dev: `POST /v1/auth/email/start` returns `debug_code` (no real email needed).
2. Production (with `RESEND_API_KEY`): email is delivered with the 6-digit code; response has no `debug_code`.
3. Wrong/expired code → 401 "Invalid or expired login code".
4. Rate limit: >3 resends per 15 min per email → 429.
5. `npm test --prefix control-plane` passes (add a mailer test with injected mock).
