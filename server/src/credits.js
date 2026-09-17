import { all, db, getAppSettings, insert } from "./db.js";
import { badRequest, nowIso } from "./util.js";

/**
 * Credit metering.
 *
 * 1 credit = 1 token, counting **input + output** exactly like ChatGPT's usage
 * (prompt + completion). `app_settings.creditsPerToken` scales it if the owner
 * ever wants a different rate. Balances come from an append-only ledger so every
 * movement is explainable.
 */

export function creditSettings() {
  const settings = getAppSettings();
  return {
    enabled: Boolean(settings.creditsEnabled),
    signupCredits: Math.max(0, Number(settings.signupCredits) || 0),
    /** Credits charged per token (1 = one credit per token). */
    perToken: Math.max(0, Number(settings.creditsPerToken) || 0),
    buyUrl: settings.creditBuyUrl ?? "",
    promoReminderMinutes: Math.max(1, Number(settings.promoReminderMinutes) || 5),
    promoCreditSnoozeMinutes: Math.max(1, Number(settings.promoCreditSnoozeMinutes) || 1440),
  };
}

export function getBalance(userId) {
  if (!userId) return 0;
  const row = db.prepare("SELECT COALESCE(SUM(delta), 0) AS balance FROM credit_ledger WHERE user_id = ?").get(userId);
  return Number(row?.balance ?? 0);
}

export function getTotals(userId) {
  const row = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN delta > 0 THEN delta ELSE 0 END), 0) AS granted,
         COALESCE(SUM(CASE WHEN delta < 0 THEN -delta ELSE 0 END), 0) AS spent,
         COUNT(*) AS entries
       FROM credit_ledger WHERE user_id = ?`,
    )
    .get(userId);
  return {
    granted: Number(row?.granted ?? 0),
    spent: Number(row?.spent ?? 0),
    entries: Number(row?.entries ?? 0),
  };
}

export function listLedger(userId, { limit = 20 } = {}) {
  // rowid breaks ties: two entries can share the same millisecond timestamp.
  return all("credit_ledger", "user_id = ?", [userId], { order: "created_at DESC, rowid DESC", limit }).map((row) => ({
    id: row.id,
    delta: Number(row.delta),
    reason: row.reason,
    ref: row.ref ?? null,
    balanceAfter: Number(row.balance_after),
    note: row.note ?? null,
    createdAt: row.created_at,
  }));
}

/**
 * Cost of one turn: input tokens + output tokens (ChatGPT-style usage), scaled by
 * `perToken`. Never below 1 when metering is on, so a turn always costs something.
 */
export function costForUsage(usage, perToken = creditSettings().perToken) {
  const tokens = Number(usage?.in ?? 0) + Number(usage?.out ?? 0);
  if (!perToken) return 0;
  if (!tokens) return 1;
  return Math.max(1, Math.ceil(tokens * perToken));
}

/** Average cost of the last turns, so the UI can say "≈ N lượt còn lại". */
export function averageCostPerTurn(userId, { sample = 20 } = {}) {
  const rows = all(
    "credit_ledger",
    "user_id = ? AND reason = 'chat_usage'",
    [userId],
    { order: "created_at DESC, rowid DESC", limit: sample },
  );
  if (!rows.length) return 1;
  const total = rows.reduce((sum, row) => sum + Math.abs(Number(row.delta)), 0);
  return Math.max(1, Math.round(total / rows.length));
}

function writeEntry({ userId, delta, reason, ref = null, note = null, actorId = null }) {
  const balanceAfter = getBalance(userId) + Number(delta);
  return insert("credit_ledger", {
    user_id: userId,
    delta: Number(delta),
    reason,
    ref,
    balance_after: balanceAfter,
    note,
    actor_id: actorId,
  });
}

export function grantCredits({ userId, amount, reason = "admin_grant", note = null, actorId = null }) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value === 0) throw badRequest("Số credit phải là số khác 0");
  if (Math.abs(value) > 100_000_000) throw badRequest("Số credit quá lớn");
  writeEntry({ userId, delta: Math.trunc(value), reason, note, actorId });
  return getBalance(userId);
}

export function spendCredits({ userId, amount, ref = null, note = null, reason = "chat_usage" }) {
  const value = Math.max(0, Math.trunc(Number(amount) || 0));
  if (!value) return getBalance(userId);
  writeEntry({ userId, delta: -value, reason, ref, note });
  return getBalance(userId);
}

/** Called on signup when `signupCredits` is configured. */
export function grantSignupCredits(userId) {
  const { signupCredits } = creditSettings();
  if (signupCredits > 0) {
    writeEntry({ userId, delta: signupCredits, reason: "signup", note: "credit khởi tạo" });
  }
  return getBalance(userId);
}

/**
 * Gate for a chat turn. Admins always get through (the balance may go negative
 * on their own instance); everyone else needs at least one credit.
 */
export function assertCanChat(user) {
  const settings = creditSettings();
  if (!settings.enabled) return { allowed: true, balance: getBalance(user.id) };
  const balance = getBalance(user.id);
  if (user.role === "admin") return { allowed: true, balance };
  if (balance <= 0) {
    return {
      allowed: false,
      balance,
      message:
        `Tài khoản đã hết credit (số dư: ${balance}). ` +
        `Nạp thêm tại ${settings.buyUrl} để tiếp tục dùng FlowGpt.`,
    };
  }
  return { allowed: true, balance };
}

/** Public payload for the UI (balance, spend history, pricing). */
export function creditSummary(userId) {
  const settings = creditSettings();
  const totals = getTotals(userId);
  const balance = getBalance(userId);
  const average = averageCostPerTurn(userId);
  return {
    enabled: settings.enabled,
    balance,
    granted: totals.granted,
    spent: totals.spent,
    entries: totals.entries,
    perToken: settings.perToken,
    averageCostPerTurn: average,
    estimatedTurnsLeft: settings.enabled ? Math.max(0, Math.floor(balance / average)) : null,
    buyUrl: settings.buyUrl,
    recent: listLedger(userId, { limit: 12 }),
    updatedAt: nowIso(),
  };
}
