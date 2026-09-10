import fs from "node:fs/promises";
import path from "node:path";

/**
 * MeetFlow AI entitlement store (web purchases).
 *
 * The MeetFlow AI apps identify users by email (Firebase account). A web
 * purchase activated here grants "Pro" for that email until `expiresAt`,
 * which the apps read via GET /v1/ai/entitlement?email=…
 *
 * Kept separate from the VPNFlow auth store: different product, different
 * account system (Firebase vs coordinator email OTP).
 */
const DAY_MS = 24 * 60 * 60 * 1000;

function normalizeEmail(email) {
  return String(email ?? "").trim().toLowerCase();
}

export class AiAccessStore {
  constructor(filePath) {
    this.filePath = filePath;
  }

  async _load() {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const data = JSON.parse(raw);
      return {
        pendingPayments: Array.isArray(data.pendingPayments) ? data.pendingPayments : [],
        entitlements: Array.isArray(data.entitlements) ? data.entitlements : [],
      };
    } catch (err) {
      if (err.code === "ENOENT") return { pendingPayments: [], entitlements: [] };
      throw err;
    }
  }

  async _save(data) {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2));
    await fs.rename(tmp, this.filePath);
  }

  // ---------------------------------------------------------------- orders

  async recordPendingPayment(orderCode, { email, plan, method, lang }) {
    const data = await this._load();
    data.pendingPayments = data.pendingPayments.filter((e) => e.orderCode !== Number(orderCode));
    data.pendingPayments.push({
      orderCode: Number(orderCode),
      email: normalizeEmail(email),
      plan,
      method: method ?? "bankqr",
      lang: lang ?? null,
      paidAt: null,
      createdAt: new Date().toISOString(),
    });
    await this._save(data);
  }

  async pendingPayment(orderCode) {
    const data = await this._load();
    return data.pendingPayments.find((e) => e.orderCode === Number(orderCode)) ?? null;
  }

  /** Marks an order paid; returns the order (or null when missing/already paid). */
  async markPendingPaymentPaid(orderCode) {
    const data = await this._load();
    const entry = data.pendingPayments.find((e) => e.orderCode === Number(orderCode));
    if (!entry || entry.paidAt) return null;
    entry.paidAt = new Date().toISOString();
    await this._save(data);
    return entry;
  }

  async listPendingPayments() {
    const data = await this._load();
    return data.pendingPayments.filter((e) => !e.paidAt).slice(-50).reverse();
  }

  // ----------------------------------------------------------- entitlements

  /** Grants (or extends) Pro for an email. days === null -> lifetime. */
  async grantPro(email, { plan, days, orderCode = null, productId = null, lang = null } = {}) {
    const data = await this._load();
    const key = normalizeEmail(email);
    const now = Date.now();
    const existing = data.entitlements.find((e) => e.email === key && e.product === "meetflow-pro");
    const base = existing && existing.expiresAt && Date.parse(existing.expiresAt) > now
      ? Date.parse(existing.expiresAt)
      : now;
    const expiresAt = days == null ? null : new Date(base + days * DAY_MS).toISOString();

    if (existing) {
      existing.plan = plan;
      existing.lang = lang ?? existing.lang ?? null;
      existing.productId = productId ?? existing.productId ?? null;
      existing.expiresAt = expiresAt;
      existing.grantedAt = new Date(now).toISOString();
      existing.orderCode = orderCode ?? existing.orderCode ?? null;
      existing.history = [
        ...(Array.isArray(existing.history) ? existing.history : []),
        { plan, days: days ?? null, orderCode, at: new Date(now).toISOString() },
      ];
    } else {
      data.entitlements.push({
        email: key,
        product: "meetflow-pro",
        plan,
        lang: lang ?? null,
        productId: productId ?? null,
        expiresAt,
        grantedAt: new Date(now).toISOString(),
        orderCode: orderCode ?? null,
        history: [{ plan, days: days ?? null, orderCode, at: new Date(now).toISOString() }],
      });
    }
    await this._save(data);
    return this.entitlementForEmail(key);
  }

  /** Public entitlement payload for the apps (never exposes other users). */
  async entitlementForEmail(email) {
    const data = await this._load();
    const key = normalizeEmail(email);
    const entry = data.entitlements.find((e) => e.email === key && e.product === "meetflow-pro");
    if (!entry) return { email: key, active: false, plan: null, expires_at: null, lifetime: false };
    const active = entry.expiresAt == null || Date.parse(entry.expiresAt) > Date.now();
    return {
      email: key,
      active,
      plan: active ? entry.plan ?? null : null,
      expires_at: active ? entry.expiresAt ?? null : null,
      lifetime: active && entry.expiresAt == null,
    };
  }

  /** Reminder window (7/3/1 days before expiry) for a given time left. */
  static renewalWindow(daysLeft) {
    if (daysLeft <= 1) return 1;
    if (daysLeft <= 3) return 3;
    if (daysLeft <= 7) return 7;
    return null;
  }

  /** Active Pro subscriptions expiring soon that were not reminded yet. */
  async listDueForRenewalReminder(now = Date.now()) {
    const data = await this._load();
    const due = [];
    for (const entry of data.entitlements) {
      if (!entry.expiresAt) continue; // lifetime — never expires
      const msLeft = Date.parse(entry.expiresAt) - now;
      if (!Number.isFinite(msLeft) || msLeft <= 0) continue;
      const daysLeft = Math.ceil(msLeft / DAY_MS);
      const windowDays = AiAccessStore.renewalWindow(daysLeft);
      if (!windowDays) continue;
      const reminded = Array.isArray(entry.renewalReminded) ? entry.renewalReminded : [];
      if (reminded.includes(windowDays)) continue;
      due.push({
        email: entry.email,
        plan: entry.plan ?? null,
        expiresAt: entry.expiresAt,
        daysLeft,
        windowDays,
        lang: entry.lang ?? null,
        oneTime: true,
      });
    }
    return due;
  }

  /** Marks a reminder window as sent so it is not repeated. */
  async markRenewalReminded(email, windowDays) {
    const data = await this._load();
    const entry = data.entitlements.find(
      (e) => e.email === normalizeEmail(email) && e.product === "meetflow-pro",
    );
    if (!entry) return;
    entry.renewalReminded = Array.from(
      new Set([...(Array.isArray(entry.renewalReminded) ? entry.renewalReminded : []), Number(windowDays)]),
    );
    await this._save(data);
  }

  async listEntitlements() {
    const data = await this._load();
    return data.entitlements;
  }
}
