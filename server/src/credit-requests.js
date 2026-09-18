import crypto from "node:crypto";
import { all, db, getById, insert, update } from "./db.js";
import { config } from "./config.js";
import { badRequest, nowIso, notFound } from "./util.js";
import { creditSettings, getBalance, grantCredits } from "./credits.js";

/**
 * "Xin thêm token": a user who runs out asks the owner for credits. The request
 * is written to the DB, pushed to Telegram with one-tap approve/reject links, and
 * can also be decided inside fBuddy (Settings → Người dùng).
 *
 * The Telegram buttons are plain URLs signed with the server secret, so the
 * approval works without a webhook — the existing polling bot keeps running
 * untouched (two pollers on one bot token would fight over getUpdates).
 */

const DEFAULT_AMOUNT = 10000;
const MAX_AMOUNT = 5_000_000;
const LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function signDecision({ requestId, action, expiresAt }) {
  const data = `${requestId}:${action}:${expiresAt}`;
  const signature = crypto.createHmac("sha256", `credit-request:${config.secret}`).update(data).digest("base64url");
  return `${expiresAt}.${signature}`;
}

/** Verifies a signed approve/reject token from a Telegram button. */
export function verifyDecisionToken(requestId, action, token) {
  const [expiresAtRaw, signature] = String(token ?? "").split(".");
  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || !signature) return { ok: false, reason: "invalid" };
  if (Date.now() > expiresAt) return { ok: false, reason: "expired" };
  const expected = signDecision({ requestId, action, expiresAt });
  const a = Buffer.from(signature);
  const b = Buffer.from(expected.split(".")[1]);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, reason: "invalid" };
  return { ok: true };
}

export function decisionLinks(requestId) {
  const expiresAt = Date.now() + LINK_TTL_MS;
  const base = String(config.publicUrl ?? "").replace(/\/+$/, "");
  const make = (action) =>
    `${base}/api/credits/requests/${requestId}/decide?action=${action}&t=${encodeURIComponent(
      signDecision({ requestId, action, expiresAt }),
    )}`;
  return { approve: make("approve"), reject: make("reject"), expiresAt };
}

export function publicCreditRequest(row) {
  if (!row) return null;
  const user = getById("users", row.user_id);
  return {
    id: row.id,
    userId: row.user_id,
    email: user?.email ?? row.email ?? null,
    name: user?.name ?? null,
    amount: Number(row.amount ?? 0),
    note: row.note ?? null,
    status: row.status,
    createdAt: row.created_at,
    decidedAt: row.decided_at ?? null,
    decidedBy: row.decided_by ?? null,
    grantedAmount: row.granted_amount == null ? null : Number(row.granted_amount),
  };
}

export function listCreditRequests({ status = null, userId = null, limit = 50 } = {}) {
  const clauses = [];
  const params = [];
  if (status) {
    clauses.push("status = ?");
    params.push(status);
  }
  if (userId) {
    clauses.push("user_id = ?");
    params.push(userId);
  }
  return all("credit_requests", clauses.join(" AND "), params, {
    order: "created_at DESC, rowid DESC",
    limit,
  }).map(publicCreditRequest);
}

export function pendingRequestFor(userId) {
  const row = all("credit_requests", "user_id = ? AND status = 'pending'", [userId], { limit: 1 })[0];
  return publicCreditRequest(row);
}

/** Creates (or returns the existing) pending request for a user. */
export function createCreditRequest({ user, amount = DEFAULT_AMOUNT, note = null }) {
  const existing = all("credit_requests", "user_id = ? AND status = 'pending'", [user.id], { limit: 1 })[0];
  if (existing) {
    const error = badRequest("Bạn đã có một yêu cầu đang chờ duyệt.");
    error.status = 409;
    error.code = "request_pending";
    error.details = { request: publicCreditRequest(existing) };
    throw error;
  }

  // Only an omitted amount falls back to the default; an explicit 0/negative is a mistake.
  const raw = amount === undefined || amount === null || amount === "" ? DEFAULT_AMOUNT : Number(amount);
  const value = Math.trunc(raw);
  if (!Number.isFinite(value) || value <= 0) throw badRequest("Số token xin thêm phải lớn hơn 0");
  if (value > MAX_AMOUNT) throw badRequest(`Mỗi yêu cầu tối đa ${MAX_AMOUNT.toLocaleString("vi-VN")} token`);

  const row = insert("credit_requests", {
    user_id: user.id,
    email: user.email,
    amount: value,
    note: note ? String(note).slice(0, 300) : null,
    status: "pending",
    balance_at_request: getBalance(user.id),
  });
  return publicCreditRequest(row);
}

/**
 * Applies a decision. Idempotent: a request that was already decided returns its
 * stored outcome instead of granting twice (a Telegram link can be opened twice).
 */
export function decideCreditRequest({ requestId, approve, amount = null, decidedBy = "telegram", note = null }) {
  const row = getById("credit_requests", requestId);
  if (!row) throw notFound("Không tìm thấy yêu cầu");
  if (row.status !== "pending") return { request: publicCreditRequest(row), alreadyDecided: true };

  const granted = approve ? Math.trunc(Number(amount ?? row.amount) || row.amount) : 0;
  if (approve && granted <= 0) throw badRequest("Số token duyệt phải lớn hơn 0");

  const updated = update("credit_requests", row.id, {
    status: approve ? "approved" : "rejected",
    decided_at: nowIso(),
    decided_by: decidedBy,
    granted_amount: granted,
    note: note ? String(note).slice(0, 300) : row.note,
  });

  let balance = getBalance(row.user_id);
  if (approve) {
    balance = grantCredits({
      userId: row.user_id,
      amount: granted,
      reason: "request_approved",
      note: `Duyệt yêu cầu ${row.id}`,
      actorId: null,
    });
  }
  return { request: publicCreditRequest(updated), balance, alreadyDecided: false };
}

/** Telegram message text + inline buttons for the owner. */
export function buildTelegramPayload(request) {
  const links = decisionLinks(request.id);
  const balance = getBalance(request.userId);
  const amount = Number(request.amount).toLocaleString("vi-VN");
  const text = [
    "🔔 *fBuddy — xin thêm token*",
    "",
    `👤 ${request.email}${request.name ? ` (${request.name})` : ""}`,
    `💰 Số dư hiện tại: *${balance.toLocaleString("vi-VN")}* token`,
    `🙋 Xin thêm: *${amount}* token`,
    request.note ? `📝 Lý do: ${request.note}` : "",
    "",
    "Bấm nút bên dưới để duyệt (hiệu lực 7 ngày):",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    text,
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [
          { text: `✅ Duyệt ${amount}`, url: links.approve },
          { text: "❌ Từ chối", url: links.reject },
        ],
      ],
    },
  };
}

/** Sends the notification through the Telegram bot configured for fBuddy. */
export async function notifyTelegram(request) {
  const token = process.env.FBUDDY_TELEGRAM_BOT_TOKEN ?? "";
  const chatId = process.env.FBUDDY_TELEGRAM_CHAT_ID ?? "";
  if (!token || !chatId) {
    return { sent: false, message: "Chưa cấu hình FBUDDY_TELEGRAM_BOT_TOKEN / FBUDDY_TELEGRAM_CHAT_ID" };
  }
  const payload = buildTelegramPayload(request);
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: payload.text,
        parse_mode: payload.parse_mode,
        reply_markup: payload.reply_markup,
        disable_web_page_preview: true,
      }),
    });
    const json = await response.json().catch(() => null);
    if (!response.ok || !json?.ok) {
      return { sent: false, message: json?.description ?? `Telegram trả ${response.status}` };
    }
    return { sent: true, messageId: json.result?.message_id ?? null };
  } catch (err) {
    return { sent: false, message: String(err?.message ?? err) };
  }
}

/** Small standalone page shown after tapping a Telegram button. */
export function decisionPageHtml({ ok, title, detail }) {
  const colour = ok ? "#33C773" : "#f25a5a";
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0A1F3B;color:#fff;font-family:Segoe UI,Roboto,Arial,sans-serif">
  <div style="max-width:460px;padding:32px 28px;text-align:center">
    <img src="/brand-mark.png?v=culi2" alt="FlowTech" width="48" height="48" style="display:block;margin:0 auto 16px">
    <div style="font-size:22px;font-weight:700;color:${colour};margin-bottom:10px">${title}</div>
    <div style="font-size:15px;line-height:1.6;color:rgba(255,255,255,.75)">${detail}</div>
    <a href="https://fbuddy.meetflowai.site" style="display:inline-block;margin-top:22px;background:${colour};color:#0A1F3B;font-weight:700;text-decoration:none;padding:11px 20px;border-radius:10px">Mở fBuddy</a>
  </div>
</body></html>`;
}
