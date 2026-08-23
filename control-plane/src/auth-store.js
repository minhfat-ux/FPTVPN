import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const OTP_TTL_MS = 10 * 60 * 1000;
const ENROLLMENT_TTL_MS = 10 * 60 * 1000;

export class AuthStore {
  constructor(filePath) {
    this.filePath = filePath;
  }

  async startEmailLogin(email) {
    const normalized = normalizeEmail(email);
    if (!normalized) throw badRequest("email is required");

    const data = await this._load();
    const code = `${crypto.randomInt(0, 1000000)}`.padStart(6, "0");
    data.emailOtps = data.emailOtps.filter((otp) => otp.email !== normalized);
    data.emailOtps.push({
      email: normalized,
      codeHash: hashToken(code),
      expiresAt: new Date(Date.now() + OTP_TTL_MS).toISOString(),
      createdAt: new Date().toISOString(),
    });
    await this._save(data);
    return { email: normalized, code };
  }

  async verifyEmailLogin(email, code) {
    const normalized = normalizeEmail(email);
    if (!normalized || !code) throw badRequest("email and code are required");

    const data = await this._load();
    const otp = data.emailOtps.find((entry) => entry.email === normalized);
    if (!otp || isExpired(otp.expiresAt) || otp.codeHash !== hashToken(String(code))) {
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
  return { users: [], sessions: [], emailOtps: [], subscriptions: [], enrollmentTokens: [] };
}

function normalizeData(data) {
  return {
    users: Array.isArray(data.users) ? data.users : [],
    sessions: Array.isArray(data.sessions) ? data.sessions : [],
    emailOtps: Array.isArray(data.emailOtps) ? data.emailOtps : [],
    subscriptions: Array.isArray(data.subscriptions) ? data.subscriptions : [],
    enrollmentTokens: Array.isArray(data.enrollmentTokens) ? data.enrollmentTokens : [],
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

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
