import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const OTP_TTL_MS = 10 * 60 * 1000;
const ENROLLMENT_TTL_MS = 10 * 60 * 1000;
const RESEND_RATE_MAX = 3;
const RESEND_RATE_WINDOW_MS = 15 * 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;
const LEGACY_JOIN_TTL_MS = 30 * 60 * 1000;

export class AuthStore {
  constructor(filePath) {
    this.filePath = filePath;
  }

  async startEmailLogin(email) {
    const normalized = normalizeEmail(email);
    if (!normalized) throw badRequest("email is required");

    const data = await this._load();
    const now = Date.now();
    const windowStart = now - RESEND_RATE_WINDOW_MS;
    data.emailLoginRequests = data.emailLoginRequests.filter(
      (entry) => Date.parse(entry.createdAt) > windowStart
    );
    const recentCount = data.emailLoginRequests.filter((entry) => entry.email === normalized).length;
    if (recentCount >= RESEND_RATE_MAX) {
      throw tooManyRequests("Too many login code requests; try again later");
    }
    data.emailLoginRequests.push({ email: normalized, createdAt: new Date(now).toISOString() });

    const code = `${crypto.randomInt(0, 1000000)}`.padStart(6, "0");
    data.emailOtps = data.emailOtps.filter((otp) => otp.email !== normalized);
    data.emailOtps.push({
      email: normalized,
      codeHash: hashToken(code),
      expiresAt: new Date(now + OTP_TTL_MS).toISOString(),
      createdAt: new Date(now).toISOString(),
      failedAttempts: 0,
    });
    await this._save(data);
    return { email: normalized, code };
  }

  async verifyEmailLogin(email, code) {
    const normalized = normalizeEmail(email);
    if (!normalized || !code) throw badRequest("email and code are required");

    const data = await this._load();
    const otp = data.emailOtps.find((entry) => entry.email === normalized);
    if (!otp) throw unauthorized("Invalid or expired login code");
    if (isExpired(otp.expiresAt) || otp.codeHash !== hashToken(String(code))) {
      otp.failedAttempts = (otp.failedAttempts ?? 0) + 1;
      if (otp.failedAttempts >= MAX_VERIFY_ATTEMPTS) {
        data.emailOtps = data.emailOtps.filter((entry) => entry !== otp);
      }
      await this._save(data);
      throw unauthorized("Invalid or expired login code");
    }

    data.emailOtps = data.emailOtps.filter((entry) => entry !== otp);
    const user = findOrCreateUser(data, { email: normalized });
    const session = createSession(data, user.id);
    await this._save(data);
    return sessionPayload(session, user);
  }

  async createAppleSession({ appleUserId, email }) {
    if (!appleUserId) throw badRequest("apple_user_id is required");
    const data = await this._load();
    const user = findOrCreateUser(data, {
      appleUserId,
      email: normalizeEmail(email),
    });
    const session = createSession(data, user.id);
    await this._save(data);
    return sessionPayload(session, user);
  }

  async findSession(token) {
    if (!token) return null;
    const data = await this._load();
    const session = data.sessions.find((entry) => entry.tokenHash === hashToken(token));
    if (!session || isExpired(session.expiresAt)) return null;
    const user = data.users.find((entry) => entry.id === session.userId);
    if (!user || user.revokedAt) return null;
    return { session, user, subscription: activeSubscriptionFor(data, user.id) };
  }

  async createEnrollmentToken(userId) {
    const data = await this._load();
    const user = data.users.find((entry) => entry.id === userId);
    if (!user || user.revokedAt) throw unauthorized("User session is no longer active");
    if (!activeSubscriptionFor(data, userId)) throw forbidden("Active subscription required");

    const token = `PVPN-ENROLL-${crypto.randomUUID()}`;
    const enrollment = {
      tokenHash: hashToken(token),
      userId,
      expiresAt: new Date(Date.now() + ENROLLMENT_TTL_MS).toISOString(),
      consumedAt: null,
      createdAt: new Date().toISOString(),
    };
    data.enrollmentTokens.push(enrollment);
    await this._save(data);
    return token;
  }

  async consumeEnrollmentToken(token, userId) {
    const data = await this._load();
    const enrollment = data.enrollmentTokens.find((entry) => entry.tokenHash === hashToken(token));
    if (!enrollment || enrollment.consumedAt || isExpired(enrollment.expiresAt)) {
      throw unauthorized("Enrollment token is invalid or expired");
    }
    if (enrollment.userId !== userId) {
      throw forbidden("Enrollment token does not belong to this user");
    }
    const user = data.users.find((entry) => entry.id === userId);
    if (!user || user.revokedAt) throw unauthorized("User session is no longer active");
    if (!activeSubscriptionFor(data, userId)) throw forbidden("Active subscription required");

    enrollment.consumedAt = new Date().toISOString();
    await this._save(data);
    return { userId };
  }

  /// Legacy one-time join token (App Store review compat window, LEGACY_MODE=1).
  /// Mirrors the pre-auth coordinator: PVPN-JOIN-* token, 30-min expiry, single-use.
  async createJoinToken() {
    const data = await this._load();
    const token = `PVPN-JOIN-${crypto.randomBytes(24).toString("base64url")}`;
    const now = new Date();
    data.joinTokens.push({
      tokenHash: hashToken(token),
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + LEGACY_JOIN_TTL_MS).toISOString(),
      consumed: false,
    });
    await this._save(data);
    return { token, expiresAt: new Date(now.getTime() + LEGACY_JOIN_TTL_MS).toISOString() };
  }

  async consumeJoinToken(token) {
    const data = await this._load();
    const row = data.joinTokens.find((entry) => entry.tokenHash === hashToken(token));
    if (!row) throw unauthorized("Invalid or expired join token");
    if (row.consumed) throw unauthorized("Join token has already been consumed");
    if (isExpired(row.expiresAt)) throw unauthorized("Join token has expired");
    row.consumed = true;
    await this._save(data);
    return { ok: true };
  }

  async listUsers() {
    const data = await this._load();
    return data.users.map((user) => publicUser(user, activeSubscriptionFor(data, user.id)));
  }

  /**
   * Users with per-user subscription expiry analytics: days left and an
   * expiry status bucket for the admin dashboard.
   *   status: none | active | expiring_soon (<=7d) | expired
   */
  async listUsersWithExpiry() {
    const data = await this._load();
    const now = Date.now();
    return data.users.map((user) => {
      const sub = activeSubscriptionFor(data, user.id);
      const base = publicUser(user, sub);
      let daysLeft = null;
      let expiryStatus = "none";
      if (user.revokedAt) {
        expiryStatus = "revoked";
      } else if (sub) {
        if (!sub.expiresAt) {
          expiryStatus = "lifetime";
          daysLeft = null;
        } else {
          const ms = Date.parse(sub.expiresAt) - now;
          daysLeft = Math.ceil(ms / (24 * 60 * 60 * 1000));
          expiryStatus = ms <= 0 ? "expired" : ms <= 7 * 24 * 60 * 60 * 1000 ? "expiring_soon" : "active";
        }
      }
      return {
        ...base,
        id: user.id,
        email: user.email ?? null,
        created_at: user.createdAt ?? null,
        revoked_at: user.revokedAt ?? null,
        days_left: daysLeft,
        expiry_status: expiryStatus,
        expires_at: sub?.expiresAt ?? null,
      };
    });
  }

  async grantSubscription(userId, { productId = "test.premium", days = 30 } = {}) {
    const data = await this._load();
    const user = data.users.find((entry) => entry.id === userId);
    if (!user) throw badRequest("User not found");
    // days == null (or 0) means LIFETIME: no expiry.
    const lifetime = days == null || Number(days) <= 0;
    const expiresAt = lifetime
      ? null
      : new Date(Date.now() + Number(days) * 24 * 60 * 60 * 1000).toISOString();
    data.subscriptions = data.subscriptions.filter((entry) => entry.userId !== userId);
    data.subscriptions.push({
      id: crypto.randomUUID(),
      userId,
      productId,
      expiresAt,
      revokedAt: null,
      createdAt: new Date().toISOString(),
    });
    await this._save(data);
    return publicUser(user, activeSubscriptionFor(data, userId));
  }

  async deleteUser(userId) {
    const data = await this._load();
    data.users = data.users.filter((entry) => entry.id !== userId);
    data.sessions = data.sessions.filter((entry) => entry.userId !== userId);
    data.subscriptions = data.subscriptions.filter((entry) => entry.userId !== userId);
    data.enrollmentTokens = data.enrollmentTokens.filter((entry) => entry.userId !== userId);
    await this._save(data);
    return { ok: true };
  }

  async revokeUser(userId) {
    const data = await this._load();
    const user = data.users.find((entry) => entry.id === userId);
    if (!user) throw badRequest("User not found");
    user.revokedAt = new Date().toISOString();
    await this._save(data);
    return publicUser(user, activeSubscriptionFor(data, userId));
  }

  async grantSubscriptionForTest(userId, productId = "test.premium") {
    const data = await this._load();
    data.subscriptions = data.subscriptions.filter((entry) => entry.userId !== userId);
    data.subscriptions.push({
      id: crypto.randomUUID(),
      userId,
      productId,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      revokedAt: null,
      createdAt: new Date().toISOString(),
    });
    await this._save(data);
  }

  /**
   * Ensures a user exists for the given email (creates if missing). Used by
   * the payment webhook to grant premium to the buyer's account.
   */
  /**
   * Returns the active subscription (with expiresAt) for the user owning the
   * given email, or null. Used by the admin payments view to show activation
   * and expiry times after a payment was confirmed.
   */
  async subscriptionForUserEmail(email) {
    const normalized = normalizeEmail(email);
    if (!normalized) return null;
    const data = await this._load();
    const user = data.users.find((entry) => entry.email === normalized);
    if (!user) return null;
    const sub = activeSubscriptionFor(data, user.id);
    return sub ? { productId: sub.productId, expiresAt: sub.expiresAt, createdAt: sub.createdAt } : null;
  }

  async ensureUserByEmail(email) {
    const normalized = normalizeEmail(email);
    if (!normalized) throw badRequest("email is required");
    const data = await this._load();
    const user = findOrCreateUser(data, { email: normalized });
    await this._save(data);
    return user;
  }

  /**
   * Records a pending payment order (orderCode -> {email, plan}) so the
   * webhook can activate the right user/plan when the payment completes.
   */
  async recordPendingPayment(orderCode, { email, plan, method }) {
    const data = await this._load();
    data.pendingPayments = data.pendingPayments.filter((entry) => entry.orderCode !== orderCode);
    data.pendingPayments.push({
      orderCode: Number(orderCode),
      email: normalizeEmail(email),
      plan,
      method: method ?? "payos",
      paidAt: null,
      createdAt: new Date().toISOString(),
    });
    await this._save(data);
  }

  /** Retrieves (and consumes) a pending payment for a given orderCode. */
  async takePendingPayment(orderCode) {
    const data = await this._load();
    const entry = data.pendingPayments.find((e) => e.orderCode === Number(orderCode));
    if (!entry) return null;
    data.pendingPayments = data.pendingPayments.filter((e) => e.orderCode !== Number(orderCode));
    await this._save(data);
    return entry;
  }

  /** Marks a pending payment as paid (keeps it for status polling). */
  async markPendingPaymentPaid(orderCode) {
    const data = await this._load();
    const entry = data.pendingPayments.find((e) => e.orderCode === Number(orderCode));
    if (!entry || entry.paidAt) return null;
    entry.paidAt = new Date().toISOString();
    await this._save(data);
    return entry;
  }

  /** Looks up a pending payment without consuming it (status polling). */
  async pendingPaymentByCode(orderCode) {
    const data = await this._load();
    return data.pendingPayments.find((e) => e.orderCode === Number(orderCode)) ?? null;
  }

  /** Lists recent pending payments (admin manual-confirm queue). */
  async listPendingPayments() {
    const data = await this._load();
    return data.pendingPayments.slice(-50).reverse();
  }

  /**
   * Users with an active (non-lifetime) subscription expiring within `maxDays`
   * that have NOT yet been reminded for the coarser reminder window they fall
   * into. Reminder windows: [7, 3, 1]. A user due in 9 days => none yet
   * (only reminded when <=7). Due in 5 days but already reminded at window 7
   * => skipped. Returns records to email.
   */
  async listUsersDueForRenewalReminder() {
    const data = await this._load();
    const now = Date.now();
    const windows = [7, 3, 1];
    const out = [];
    for (const user of data.users) {
      if (user.revokedAt) continue;
      const sub = activeSubscriptionFor(data, user.id);
      if (!sub || !sub.expiresAt) continue; // none or lifetime
      const msLeft = Date.parse(sub.expiresAt) - now;
      if (msLeft <= 0) continue; // already expired -> handled elsewhere
      const daysLeft = Math.ceil(msLeft / (24 * 60 * 60 * 1000));
      // choose the coarsest window that still applies (7 > 3 > 1)
      const win = windows.find((w) => daysLeft <= w);
      if (win == null) continue; // >7 days, no reminder yet
      const reminded = (data.renewalReminders ?? []).some(
        (r) => r.userId === user.id && r.windowDays === win
      );
      if (reminded) continue;
      out.push({ user, sub, daysLeft, windowDays: win });
    }
    return out;
  }

  /** Records that a renewal reminder was sent for a user at a given window. */
  async markRenewalReminded(userId, windowDays) {
    const data = await this._load();
    data.renewalReminders = (data.renewalReminders ?? []).filter(
      (r) => !(r.userId === userId && r.windowDays === windowDays)
    );
    data.renewalReminders.push({ userId, windowDays, sentAt: new Date().toISOString() });
    await this._save(data);
  }

  async _load() {
    if (!existsSync(this.filePath)) return emptyData();
    try {
      return normalizeData(JSON.parse(await fs.readFile(this.filePath, "utf8")));
    } catch {
      return emptyData();
    }
  }

  async _save(data) {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(normalizeData(data), null, 2), "utf8");
  }
}

function findOrCreateUser(data, { email, appleUserId }) {
  let user = data.users.find((entry) =>
    (email && entry.email === email) || (appleUserId && entry.appleUserId === appleUserId)
  );
  if (user) {
    if (email && !user.email) user.email = email;
    if (appleUserId && !user.appleUserId) user.appleUserId = appleUserId;
    return user;
  }
  user = {
    id: crypto.randomUUID(),
    email: email || null,
    appleUserId: appleUserId || null,
    revokedAt: null,
    createdAt: new Date().toISOString(),
  };
  data.users.push(user);
  return user;
}

function createSession(data, userId) {
  const token = `PVPN-AUTH-${crypto.randomUUID()}`;
  const session = {
    token,
    tokenHash: hashToken(token),
    userId,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    createdAt: new Date().toISOString(),
  };
  data.sessions.push({
    tokenHash: session.tokenHash,
    userId: session.userId,
    expiresAt: session.expiresAt,
    createdAt: session.createdAt,
  });
  return session;
}

function sessionPayload(session, user) {
  return {
    access_token: session.token,
    token_type: "Bearer",
    expires_at: session.expiresAt,
    user: publicUser(user),
  };
}

function publicUser(user, subscription = null) {
  return {
    id: user.id,
    email: user.email ?? null,
    apple_user_id: user.appleUserId ?? null,
    revoked_at: user.revokedAt ?? null,
    subscription_status: {
      is_active: Boolean(subscription),
      product_id: subscription?.productId ?? null,
      expires_at: subscription?.expiresAt ?? null,
    },
  };
}

function activeSubscriptionFor(data, userId) {
  const now = Date.now();
  return data.subscriptions.find((entry) =>
    entry.userId === userId &&
    !entry.revokedAt &&
    (!entry.expiresAt || Date.parse(entry.expiresAt) > now)
  ) ?? null;
}

function normalizeEmail(email) {
  const normalized = String(email ?? "").trim().toLowerCase();
  return normalized.includes("@") ? normalized : "";
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function isExpired(value) {
  return !value || Date.parse(value) <= Date.now();
}

function emptyData() {
  return {
    users: [],
    sessions: [],
    emailOtps: [],
    emailLoginRequests: [],
    enrollmentTokens: [],
    joinTokens: [],
    subscriptions: [],
    pendingPayments: [],
    renewalReminders: [],
  };
}

function normalizeData(data) {
  return {
    users: Array.isArray(data.users) ? data.users : [],
    sessions: Array.isArray(data.sessions) ? data.sessions : [],
    emailOtps: Array.isArray(data.emailOtps) ? data.emailOtps : [],
    emailLoginRequests: Array.isArray(data.emailLoginRequests) ? data.emailLoginRequests : [],
    joinTokens: Array.isArray(data.joinTokens) ? data.joinTokens : [],
    subscriptions: Array.isArray(data.subscriptions) ? data.subscriptions : [],
    enrollmentTokens: Array.isArray(data.enrollmentTokens) ? data.enrollmentTokens : [],
    pendingPayments: Array.isArray(data.pendingPayments) ? data.pendingPayments : [],
    renewalReminders: Array.isArray(data.renewalReminders) ? data.renewalReminders : [],
  };
}

function badRequest(message) {
  return httpError(400, message);
}

function unauthorized(message) {
  return httpError(401, message);
}

function forbidden(message) {
  return httpError(403, message);
}

function tooManyRequests(message) {
  return httpError(429, message);
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
