import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

/**
 * Store (Google Play / App Store) purchase reports from the apps.
 *
 * The apps buy through the platform, so the purchase lives with Google/Apple
 * and never reaches us — a Play subscriber was invisible in the admin
 * dashboard. The app now reports the purchase token, and this store keeps one
 * row per token:
 *
 *   - `verified: true`  → Google/Apple confirmed it; the row can grant Pro.
 *   - `verified: false` → reported by a client, waiting for credentials or a
 *     failed check. Shown in the dashboard, never grants Pro.
 *
 * The raw purchase token is kept (verification needs it) in a file written with
 * mode 0600; `tokenId` is a short hash used in URLs and logs so the token itself
 * never ends up in a log line.
 */

const MAX_ROWS = 5000;

function normalizeEmail(email) {
  return String(email ?? "").trim().toLowerCase();
}

export class AiStorePurchaseStore {
  constructor(filePath) {
    this.filePath = filePath;
    this._queue = Promise.resolve();
  }

  _serialize(fn) {
    const run = this._queue.then(fn, fn);
    this._queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async _load() {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const data = JSON.parse(raw);
      return { purchases: Array.isArray(data.purchases) ? data.purchases : [] };
    } catch (err) {
      if (err.code === "ENOENT") return { purchases: [] };
      throw err;
    }
  }

  async _save(data) {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
    await fs.rename(tmp, this.filePath);
    await fs.chmod(this.filePath, 0o600).catch(() => {});
  }

  /** Stable public id for a purchase token (no token material in URLs/logs). */
  static tokenId(purchaseToken) {
    return crypto.createHash("sha256").update(String(purchaseToken)).digest("hex").slice(0, 16);
  }

  /**
   * Records or updates a reported purchase.
   * Returns the stored row (with `tokenId`, `firstReportedAt`, `reportCount`).
   */
  async record(report) {
    return this._serialize(() => this._recordNow(report));
  }

  async _recordNow(report) {
    const tokenId = AiStorePurchaseStore.tokenId(report.purchaseToken);
    const data = await this._load();
    const now = new Date().toISOString();
    let row = data.purchases.find((p) => p.tokenId === tokenId);
    if (!row) {
      row = {
        tokenId,
        firstReportedAt: now,
        reportCount: 0,
        verified: false,
        verifiedAt: null,
        verifyError: null,
      };
      data.purchases.push(row);
      if (data.purchases.length > MAX_ROWS) {
        data.purchases = data.purchases.slice(-MAX_ROWS);
      }
    }
    row.reportCount = Number(row.reportCount ?? 0) + 1;
    row.lastReportedAt = now;
    row.platform = report.platform ?? row.platform ?? "android";
    row.packageName = report.packageName ?? row.packageName ?? null;
    row.productId = report.productId ?? row.productId ?? null;
    row.kind = report.kind ?? row.kind ?? "subs";
    row.uid = report.uid ?? row.uid ?? null;
    // An email may only become known later (the app reports uid first).
    const email = normalizeEmail(report.email);
    if (email) row.email = email;
    row.orderId = report.orderId ?? row.orderId ?? null;
    row.autoRenewing = report.autoRenewing ?? row.autoRenewing ?? null;
    row.state = report.state ?? row.state ?? null;
    row.obfuscatedAccountId = report.obfuscatedAccountId ?? row.obfuscatedAccountId ?? null;
    row.expiresAt = report.expiresAt ?? row.expiresAt ?? null;
    row.active = report.active ?? row.active ?? null;
    row.plan = report.plan ?? row.plan ?? null;
    row.priceMicros = report.priceMicros ?? row.priceMicros ?? null;
    row.currency = report.currency ?? row.currency ?? null;
    row.countryCode = report.countryCode ?? row.countryCode ?? null;
    row.appVersion = report.appVersion ?? row.appVersion ?? null;
    // Never persist an unverified client claim of "active": only verification
    // (or an expiry that is still in the future for a verified row) counts.
    row.purchaseToken = report.purchaseToken;
    await this._save(data);
    return row;
  }

  /** Applies a verification result to a stored row. */
  async markVerified(tokenId, result, error = null) {
    return this._serialize(async () => {
      const data = await this._load();
      const row = data.purchases.find((p) => p.tokenId === tokenId);
      if (!row) return null;
      row.verifiedAt = new Date().toISOString();
      if (error) {
        row.verified = false;
        row.verifyError = String(error).slice(0, 300);
      } else {
        row.verified = true;
        row.verifyError = null;
        row.productId = result.productId ?? row.productId;
        row.orderId = result.orderId ?? row.orderId;
        row.expiresAt = result.expiresAt ?? row.expiresAt;
        row.active = Boolean(result.active);
        row.autoRenewing = result.autoRenewing ?? row.autoRenewing;
        row.state = result.state ?? row.state;
        row.kind = result.kind ?? row.kind;
        row.obfuscatedAccountId = result.obfuscatedAccountId ?? row.obfuscatedAccountId;
        row.verifiedRaw = result.raw ?? null;
      }
      await this._save(data);
      return row;
    });
  }

  async list() {
    const data = await this._load();
    return [...data.purchases].sort((a, b) => String(b.lastReportedAt ?? "").localeCompare(String(a.lastReportedAt ?? "")));
  }

  async get(tokenId) {
    const data = await this._load();
    return data.purchases.find((p) => p.tokenId === tokenId) ?? null;
  }

  async forget(tokenId) {
    return this._serialize(async () => {
      const data = await this._load();
      const before = data.purchases.length;
      data.purchases = data.purchases.filter((p) => p.tokenId !== tokenId);
      if (data.purchases.length !== before) await this._save(data);
      return before - data.purchases.length;
    });
  }

  /** Totals for the dashboard: verified/active per plan plus currency totals. */
  static summarize(purchases, now = Date.now()) {
    const out = {
      total: purchases.length,
      verified: 0,
      unverified: 0,
      active: 0,
      autoRenewing: 0,
      expired: 0,
      byPlan: {},
      byPlatform: {},
      revenue: {},
      lastReportAt: null,
    };
    for (const p of purchases) {
      if (p.verified) out.verified += 1;
      else out.unverified += 1;
      const plan = p.plan ?? p.productId ?? "unknown";
      out.byPlan[plan] = (out.byPlan[plan] ?? 0) + 1;
      const platform = p.platform ?? "android";
      out.byPlatform[platform] = (out.byPlatform[platform] ?? 0) + 1;
      if (p.verified && p.expiresAt && Date.parse(p.expiresAt) > now) {
        out.active += 1;
        if (p.autoRenewing) out.autoRenewing += 1;
      } else if (p.verified && p.expiresAt && Date.parse(p.expiresAt) <= now) {
        out.expired += 1;
      }
      if (p.priceMicros) {
        const currency = p.currency ?? "VND";
        out.revenue[currency] = (out.revenue[currency] ?? 0) + Number(p.priceMicros) / 1_000_000;
      }
      if (!out.lastReportAt || String(p.lastReportedAt) > String(out.lastReportAt)) out.lastReportAt = p.lastReportedAt;
    }
    return out;
  }
}
