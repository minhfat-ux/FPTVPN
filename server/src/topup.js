import crypto from "node:crypto";
import { all, getAppSettings, getById, insert, update } from "./db.js";
import { config } from "./config.js";
import { badRequest, notFound, nowIso } from "./util.js";
import { getBalance, grantCredits } from "./credits.js";

/**
 * fBuddy top-up page: token packages paid by bank transfer.
 *
 * The flow is deliberately self-contained (no dependency on the VPNFlow control
 * plane): the user picks a package, gets a VietQR code with a unique transfer
 * note, taps "Tôi đã chuyển khoản", the owner gets a Telegram message with a
 * one-tap confirmation link, and the tokens are granted when it is confirmed.
 * Every step is idempotent, so double taps and re-opened links are harmless.
 */

const LINK_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * The packages shown on the top-up page.
 *
 * `vndPerCredit` is the single price knob the owner edits in the admin panel:
 * a package without its own `priceVnd` is priced `credits × vndPerCredit`, so
 * changing that one number re-prices the whole shop. `priceVnd` on a package is
 * an override (e.g. a promo tier).
 */
export function topupPackages() {
  const settings = getAppSettings();
  const perCredit = Math.max(0, Number(settings.vndPerCredit) || 0);
  const packages = Array.isArray(settings.topupPackages) ? settings.topupPackages : [];
  return packages.map((entry) => {
    const tokens = Math.max(0, Math.trunc(Number(entry.tokens) || 0));
    const bonusTokens = Math.max(0, Math.trunc(Number(entry.bonusTokens) || 0));
    const explicit = Number(entry.priceVnd) > 0 ? Math.trunc(Number(entry.priceVnd)) : null;
    const grant = tokens + bonusTokens;
    return {
      id: String(entry.id),
      name: String(entry.name ?? "Gói token"),
      tokens,
      bonusTokens,
      // Derived when the package has no price of its own.
      priceVnd: explicit ?? Math.round(grant * perCredit),
      priceSource: explicit ? "package" : "vndPerCredit",
      vndPerCredit: perCredit,
      note: entry.note ? String(entry.note) : null,
      totalTokens: grant,
    };
  });
}

/** Price of a credit amount at the current rate (used by the admin preview). */
export function priceForCredits(credits) {
  const settings = getAppSettings();
  const perCredit = Math.max(0, Number(settings.vndPerCredit) || 0);
  return Math.round(Math.max(0, Math.trunc(Number(credits) || 0)) * perCredit);
}

export function bankInfo() {
  const settings = getAppSettings();
  return {
    bankId: String(settings.bankId ?? "970436"),
    account: String(settings.bankAccount ?? ""),
    accountName: String(settings.bankAccountName ?? ""),
    notePrefix: String(settings.bankNotePrefix ?? "FBUDDY"),
  };
}

/** VietQR image URL — public service, no key, same one the buy pages use. */
export function vietQrUrl({ amountVnd, note, bank = bankInfo() }) {
  if (!bank.account) return null;
  const params = new URLSearchParams({ amount: String(Math.max(0, Math.trunc(amountVnd))), addInfo: note });
  if (bank.accountName) params.set("accountName", bank.accountName);
  return `https://img.vietqr.io/image/${encodeURIComponent(bank.bankId)}-${encodeURIComponent(bank.account)}-compact2.png?${params.toString()}`;
}

export function publicTopupOrder(row) {
  if (!row) return null;
  const bank = bankInfo();
  return {
    id: row.id,
    userId: row.user_id,
    email: row.email ?? null,
    packageId: row.package_id ?? null,
    packageName: row.package_name,
    tokens: Number(row.tokens ?? 0),
    amountVnd: Number(row.amount_vnd ?? 0),
    transferNote: row.transfer_note,
    status: row.status,
    paidAt: row.paid_at ?? null,
    confirmedBy: row.confirmed_by ?? null,
    createdAt: row.created_at,
    qrUrl: row.status === "paid" ? null : vietQrUrl({ amountVnd: Number(row.amount_vnd ?? 0), note: row.transfer_note, bank }),
    bank,
  };
}

export function listTopupOrders({ userId = null, status = null, limit = 50 } = {}) {
  const clauses = [];
  const params = [];
  if (userId) {
    clauses.push("user_id = ?");
    params.push(userId);
  }
  if (status) {
    clauses.push("status = ?");
    params.push(status);
  }
  return all("topup_orders", clauses.join(" AND "), params, {
    order: "created_at DESC, rowid DESC",
    limit,
  }).map(publicTopupOrder);
}

export function createTopupOrder({ user, packageId }) {
  const pkg = topupPackages().find((entry) => entry.id === String(packageId));
  if (!pkg) throw badRequest("Gói token không tồn tại");

  // Reuse an unpaid order for the same package instead of piling up duplicates.
  const existing = all(
    "topup_orders",
    "user_id = ? AND package_id = ? AND status IN ('pending','awaiting_confirmation')",
    [user.id, pkg.id],
    { limit: 1 },
  )[0];
  if (existing) return { order: publicTopupOrder(existing), reused: true };

  const row = insert("topup_orders", {
    user_id: user.id,
    email: user.email,
    package_id: pkg.id,
    package_name: pkg.name,
    tokens: pkg.totalTokens,
    amount_vnd: pkg.priceVnd,
    transfer_note: `${bankInfo().notePrefix}${String(Date.now()).slice(-6)}`,
    status: "pending",
  });
  return { order: publicTopupOrder(row), reused: false };
}

/** The user says they transferred → notify the owner for confirmation. */
export async function markTopupAsTransferred({ user, orderId, bankTxnRef = null }) {
  const row = getById("topup_orders", orderId);
  if (!row || row.user_id !== user.id) throw notFound("Không tìm thấy đơn nạp token");
  if (row.status === "paid") return { order: publicTopupOrder(row), telegram: { sent: false, message: "Đơn đã được xác nhận trước đó" } };

  const updated = update("topup_orders", row.id, {
    status: "awaiting_confirmation",
    bank_txn_ref: bankTxnRef ? String(bankTxnRef).slice(0, 80) : row.bank_txn_ref,
  });
  const order = publicTopupOrder(updated);
  const telegram = await notifyTopupTelegram(order);
  return { order, telegram };
}

function signConfirm({ orderId, expiresAt }) {
  const data = `${orderId}:confirm:${expiresAt}`;
  const signature = crypto.createHmac("sha256", `topup:${config.secret}`).update(data).digest("base64url");
  return `${expiresAt}.${signature}`;
}

export function verifyConfirmToken(orderId, token) {
  const [expiresAtRaw, signature] = String(token ?? "").split(".");
  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || !signature) return { ok: false, reason: "invalid" };
  if (Date.now() > expiresAt) return { ok: false, reason: "expired" };
  const expected = signConfirm({ orderId, expiresAt }).split(".")[1];
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, reason: "invalid" };
  return { ok: true };
}

export function topupConfirmLink(orderId) {
  const expiresAt = Date.now() + LINK_TTL_MS;
  const base = String(config.publicUrl ?? "").replace(/\/+$/, "");
  const token = encodeURIComponent(signConfirm({ orderId, expiresAt }));
  return `${base}/api/topup/orders/${orderId}/confirm?t=${token}`;
}

/**
 * Confirms a payment (owner taps the Telegram link or an admin presses the button)
 * and grants the tokens exactly once.
 */
export function confirmTopupOrder({ orderId, confirmedBy = "telegram", tokens = null }) {
  const row = getById("topup_orders", orderId);
  if (!row) throw notFound("Không tìm thấy đơn nạp token");
  if (row.status === "paid") return { order: publicTopupOrder(row), alreadyPaid: true, balance: getBalance(row.user_id) };

  const granted = Math.trunc(Number(tokens ?? row.tokens) || row.tokens);
  const balance = grantCredits({
    userId: row.user_id,
    amount: granted,
    reason: "topup",
    note: `Nạp token: ${row.package_name} (${row.transfer_note})`,
    actorId: null,
  });
  const updated = update("topup_orders", row.id, {
    status: "paid",
    tokens: granted,
    paid_at: nowIso(),
    confirmed_by: confirmedBy,
  });
  return { order: publicTopupOrder(updated), alreadyPaid: false, balance };
}

export function cancelTopupOrder({ orderId, userId = null }) {
  const row = getById("topup_orders", orderId);
  if (!row) throw notFound("Không tìm thấy đơn nạp token");
  if (userId && row.user_id !== userId) throw notFound("Không tìm thấy đơn nạp token");
  if (row.status === "paid") throw badRequest("Đơn đã thanh toán, không thể huỷ");
  return publicTopupOrder(update("topup_orders", row.id, { status: "cancelled" }));
}

export function buildTopupTelegram(order) {
  const amount = Number(order.amountVnd).toLocaleString("vi-VN");
  const tokens = Number(order.tokens).toLocaleString("vi-VN");
  const text = [
    "💰 *fBuddy — khách báo đã chuyển khoản*",
    "",
    `👤 ${order.email ?? "(không rõ)"}`,
    `📦 ${order.packageName} — ${tokens} token`,
    `💵 ${amount} đ`,
    `🔖 Nội dung CK: *${order.transferNote}*`,
    order.bankTxnRef ? `🏦 Mã giao dịch khách nhập: ${order.bankTxnRef}` : "",
    "",
    "Kiểm tra sao kê rồi bấm nút dưới để cộng token (hiệu lực 30 ngày):",
  ]
    .filter(Boolean)
    .join("\n");
  return {
    text,
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [[{ text: `✅ Đã nhận ${amount} đ — cộng ${tokens} token`, url: topupConfirmLink(order.id) }]],
    },
  };
}

export async function notifyTopupTelegram(order) {
  const token = process.env.FBUDDY_TELEGRAM_BOT_TOKEN ?? "";
  const chatId = process.env.FBUDDY_TELEGRAM_CHAT_ID ?? "";
  if (!token || !chatId) {
    return { sent: false, message: "Chưa cấu hình FBUDDY_TELEGRAM_BOT_TOKEN / FBUDDY_TELEGRAM_CHAT_ID" };
  }
  const payload = buildTopupTelegram(order);
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

/** Small page shown after the owner taps the confirmation link. */
export function topupPageHtml({ ok, title, detail }) {
  const colour = ok ? "#33C773" : "#f25a5a";
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0A1F3B;color:#fff;font-family:Segoe UI,Roboto,Arial,sans-serif">
  <div style="max-width:460px;padding:32px 28px;text-align:center">
    <img src="/brand-mark.png" alt="FlowTech" width="48" height="48" style="display:block;margin:0 auto 16px">
    <div style="font-size:22px;font-weight:700;color:${colour};margin-bottom:10px">${title}</div>
    <div style="font-size:15px;line-height:1.6;color:rgba(255,255,255,.75)">${detail}</div>
    <a href="https://fbuddy.meetflowai.site/?view=topup" style="display:inline-block;margin-top:22px;background:${colour};color:#0A1F3B;font-weight:700;text-decoration:none;padding:11px 20px;border-radius:10px">Mở fBuddy</a>
  </div>
</body></html>`;
}
