import crypto from "node:crypto";
import { count, getById, insert, one, update, all, remove } from "./db.js";
import { hashPassword, verifyPassword, signToken, verifyToken } from "./crypto.js";
import { config } from "./config.js";
import { grantSignupCredits } from "./credits.js";
import { sendLoginCode, loginLink, mailerStatus, sendVerificationCode, verifyLink } from "./mailer.js";
import {
  SESSION_TTL_SEC,
  createSession,
  isSessionActive,
  revokeAllSessions,
  touchSession,
} from "./sessions.js";
import { badRequest, forbidden, unauthorized, RateLimiter, nowIso, ApiError } from "./util.js";

export const authLimiter = new RateLimiter({ limit: 20, windowMs: 60 * 1000 });

export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name ?? null,
    role: row.role,
    isAdmin: row.role === "admin",
    /** Ngôn ngữ người dùng chọn (vi/en/zh) — dùng cho cả giao diện lẫn chỉ dẫn kỹ năng. */
    locale: row.locale ?? null,
    /** Đã xác thực email chưa (tài khoản cũ được grandfather = true). */
    emailVerified: Number(row.email_verified ?? 0) === 1,
    emailVerifiedAt: row.email_verified_at ?? null,
    createdAt: row.created_at,
  };
}

export function countUsers() {
  return count("users");
}

export function findUserByEmail(email) {
  return one("users", "email = ?", [normalizeEmail(email)]);
}

function normalizeEmail(email) {
  return String(email ?? "").trim().toLowerCase();
}

export function validatePassword(password) {
  const value = String(password ?? "");
  if (value.length < 8) throw badRequest("Mật khẩu cần tối thiểu 8 ký tự");
  if (value.length > 200) throw badRequest("Mật khẩu quá dài");
  return value;
}

export function validateEmail(email) {
  const value = normalizeEmail(email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) throw badRequest("Email không hợp lệ");
  return value;
}

/** The very first account becomes the admin — there is no bootstrap CLI. */
/**
 * Tạo tài khoản. `emailVerifiedAt` mặc định = BÂY GIỜ vì đây là primitive nội bộ (seed, test,
 * tạo hộ): gọi tới đây nghĩa là phía gọi đã chấp nhận tài khoản này. Hai con đường dành cho
 * KHÁCH (đăng ký công khai, admin tạo hộ khách) truyền `emailVerifiedAt: null` để buộc xác thực.
 */
export function createUser({ email, password, name = null, role = null, emailVerifiedAt = nowIso() }) {
  const normalized = validateEmail(email);
  const secret = validatePassword(password);
  if (findUserByEmail(normalized)) throw badRequest("Email này đã được đăng ký");
  const isFirst = countUsers() === 0;
  const row = insert("users", {
    email: normalized,
    name: name ? String(name).slice(0, 120) : null,
    password_hash: hashPassword(secret),
    role: role ?? (isFirst ? "admin" : "user"),
    email_verified: emailVerifiedAt ? 1 : 0,
    email_verified_at: emailVerifiedAt ?? null,
  });
  // Optional welcome credit (app_settings.signupCredits, 0 by default).
  grantSignupCredits(row.id);
  return row;
}

/** Tài khoản đã xác thực email chưa? Tài khoản có trước tính năng này được grandfather = rồi. */
export function isEmailVerified(row) {
  return Number(row?.email_verified ?? 0) === 1;
}

/**
 * Chính sách "bắt buộc xác thực email" do tầng route gắn vào (auth.js cố ý KHÔNG import
 * settings.js để tránh vòng import). Mặc định BẬT — nếu ai đó quên gắn thì nghiêng về phía an toàn.
 */
let emailVerificationPolicy = () => true;
export function setEmailVerificationPolicy(fn) {
  if (typeof fn === "function") emailVerificationPolicy = fn;
}
export function emailVerificationRequired() {
  try {
    return emailVerificationPolicy() !== false;
  } catch {
    return true;
  }
}

/** Đánh dấu tài khoản đã xác thực email (idempotent, giữ mốc thời gian đầu tiên). */
export function markEmailVerified(userId, at = nowIso()) {
  const row = getById("users", userId);
  if (!row) return null;
  if (isEmailVerified(row)) return row;
  return update("users", userId, { email_verified: 1, email_verified_at: row.email_verified_at ?? at });
}

export function authenticate({ email, password }) {
  const row = findUserByEmail(email);
  if (!row || !verifyPassword(password, row.password_hash)) {
    throw unauthorized("Email hoặc mật khẩu không đúng");
  }
  return row;
}

/**
 * Signs a JWT. Passing `sessionId` ties the token to one device, so several
 * devices can be signed in at once (see `sessions.js`).
 */
export function issueToken(row, { sessionId = null } = {}) {
  return signToken(
    { sub: row.id, email: row.email, role: row.role, tv: row.token_version ?? 1, ...(sessionId ? { sid: sessionId } : {}) },
    { ttlSec: SESSION_TTL_SEC },
  );
}

/** Opens a session for this device and returns both the row and its token. */
export function startSession({ user, ip = null, userAgent = null }) {
  const session = createSession({ userId: user.id, ip, userAgent });
  return { session, token: issueToken(user, { sessionId: session.id }) };
}

export function changePassword(userId, { currentPassword, newPassword }) {
  const row = getById("users", userId);
  if (!row) throw unauthorized();
  if (!verifyPassword(currentPassword, row.password_hash)) {
    throw badRequest("Mật khẩu hiện tại không đúng");
  }
  const secret = validatePassword(newPassword);
  // Bumping `token_version` kills every token; revoking the sessions as well
  // keeps the device list honest instead of showing rows that can no longer work.
  revokeAllSessions(userId, "password_changed");
  return update("users", userId, {
    password_hash: hashPassword(secret),
    token_version: (row.token_version ?? 1) + 1,
  });
}

export function updateProfile(userId, patch) {
  const changes = {};
  if (patch.name !== undefined) changes.name = patch.name ? String(patch.name).slice(0, 120) : null;
  // Ngôn ngữ giao diện; chỉ nhận 3 mã đang hỗ trợ, giá trị lạ bị bỏ qua (không ghi rác).
  if (patch.locale !== undefined) {
    const locale = String(patch.locale ?? "").trim().toLowerCase();
    if (["vi", "en", "zh"].includes(locale)) changes.locale = locale;
  }
  return update("users", userId, changes);
}

function tokenFromRequest(req) {
  const header = req.headers.authorization ?? "";
  if (header.toLowerCase().startsWith("bearer ")) return header.slice(7).trim();
  const cookie = req.headers.cookie ?? "";
  const match = cookie.match(/(?:^|;\s*)fbuddy_token=([^;]+)/);
  if (match) return decodeURIComponent(match[1]);
  return null;
}

export function currentUser(req) {
  const token = tokenFromRequest(req);
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload?.sub) return null;
  const row = getById("users", payload.sub);
  if (!row) return null;
  // Password changes bump token_version, invalidating older tokens.
  if (payload.tv !== undefined && Number(payload.tv) !== Number(row.token_version ?? 1)) return null;
  if (payload.sid) {
    // Per-device session: revoking one device cannot touch the others.
    if (!isSessionActive(payload.sid, row.id)) return null;
    touchSession(payload.sid);
    req.sessionId = payload.sid;
  }
  // No `sid` = a token minted before sessions existed; accepted until it expires.
  return row;
}

export function requireAuth(req, _res, next) {
  const row = currentUser(req);
  if (!row) return next(unauthorized());
  // Chưa xác thực email = tài khoản CHƯA active: chỉ mở được các route /auth (xác thực, gửi lại mã).
  if (!isEmailVerified(row) && emailVerificationRequired()) {
    return next(
      new ApiError(403, "email_not_verified", "Tài khoản chưa xác thực email. Mở hộp thư để lấy mã xác thực.", {
        email: row.email,
      }),
    );
  }
  req.user = row;
  return next();
}

export function requireAdmin(req, _res, next) {
  const row = currentUser(req);
  if (!row) return next(unauthorized());
  if (row.role !== "admin") return next(forbidden("Chỉ quản trị viên"));
  req.user = row;
  return next();
}

// ------------------------------------------------- login by emailed token

/** At most 3 codes per email per 15 minutes, and 10 attempts per email per 10 min. */
export const tokenRequestLimiter = new RateLimiter({ limit: 3, windowMs: 15 * 60 * 1000 });
export const tokenVerifyLimiter = new RateLimiter({ limit: 10, windowMs: 10 * 60 * 1000 });

const MAX_ATTEMPTS = 5;

/** Peppered with the server secret so a leaked row cannot be brute-forced offline. */
function hashToken(value, email, purpose = "login") {
  return crypto
    .createHmac("sha256", `${purpose}:${config.secret}`)
    .update(`${normalizeEmail(email)}:${String(value)}`)
    .digest("hex");
}

function randomCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function purgeOldTokens(email) {
  const rows = all("email_tokens", "email = ?", [normalizeEmail(email)]);
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const row of rows) {
    const expired = Date.parse(row.expires_at) < Date.now();
    const old = Date.parse(row.created_at) < cutoff;
    if (row.consumed_at || expired || old) remove("email_tokens", row.id);
  }
}

/**
 * Issues a one-time login code (and a magic link with the same lifetime) for an
 * email address. Creates the account on first use unless the admin turned
 * auto-creation off — in that case the response is still generic, so the
 * endpoint cannot be used to enumerate accounts.
 */
export async function requestLoginToken({ email, ip = null, userAgent = null, settings }) {
  const normalized = validateEmail(email);
  const gate = tokenRequestLimiter.check(normalized);
  if (!gate.ok) {
    throw new ApiError(
      429,
      "rate_limited",
      "Đã gửi quá nhiều mã cho email này. Vui lòng chờ vài phút rồi thử lại.",
    );
  }

  let user = findUserByEmail(normalized);
  const firstUser = countUsers() === 0;
  if (!user) {
    if (!settings.autoCreateUserOnLogin && !firstUser) {
      // Same shape as success on purpose — no account enumeration.
      return { ok: true, delivered: false, created: false, expiresInMin: settings.loginTokenTtlMin };
    }
    user = createUser({
      email: normalized,
      password: crypto.randomBytes(24).toString("base64url"),
      name: null,
      // Chỉ active sau khi nhập đúng mã trong email (verifyLoginToken đánh dấu đã xác thực).
      emailVerifiedAt: null,
    });
  }

  purgeOldTokens(normalized);

  // A new code supersedes any still-pending one, so an old email cannot be used.
  for (const pending of all("email_tokens", "email = ? AND consumed_at IS NULL", [normalized])) {
    update("email_tokens", pending.id, { consumed_at: nowIso() });
  }

  const code = randomCode();
  const linkToken = crypto.randomBytes(24).toString("base64url");
  const ttlMin = Math.min(Math.max(Number(settings.loginTokenTtlMin) || 15, 5), 60);
  const expiresAt = new Date(Date.now() + ttlMin * 60 * 1000).toISOString();

  insert("email_tokens", {
    email: normalized,
    token_hash: hashToken(code, normalized),
    link_hash: hashToken(linkToken, normalized),
    purpose: "login",
    expires_at: expiresAt,
    ip,
    user_agent: userAgent ? String(userAgent).slice(0, 200) : null,
  });

  const link = loginLink({ publicUrl: config.publicUrl, email: normalized, token: linkToken });
  const delivery = await sendLoginCode({ settings, to: normalized, code, link, ttlMin });
  const status = mailerStatus(settings);

  const payload = {
    ok: true,
    delivered: Boolean(delivery.sent),
    created: false,
    expiresInMin: ttlMin,
    mailerConfigured: status.configured,
  };
  if (!delivery.sent) {
    payload.message = status.configured
      ? `Không gửi được email: ${delivery.detail ?? delivery.reason}`
      : "Chưa cấu hình email (Resend) — mã hiển thị ngay trên màn hình để anh đăng nhập.";
    // Escape hatch so a fresh install is usable before a mailer exists.
    if (settings.showLoginCodeWhenNoMailer) {
      payload.devCode = code;
      payload.devLink = link;
    }
  }
  return payload;
}

/**
 * Redeems a one-time code (or magic-link token) của một `purpose`; dùng một lần, sai 5 lần là khoá.
 * Dùng chung cho đăng nhập bằng email và xác thực email để hai luồng không lệch luật nhau.
 */
function redeemEmailToken({ email, value, purpose }) {
  const normalized = validateEmail(email);
  const code = String(value ?? "").trim();
  if (!code) throw badRequest(purpose === "verify_email" ? "Thiếu mã xác thực email" : "Thiếu mã đăng nhập");

  const gate = tokenVerifyLimiter.check(normalized);
  if (!gate.ok) throw new ApiError(429, "rate_limited", "Thử quá nhiều lần. Vui lòng chờ rồi thử lại.");

  const rows = all("email_tokens", "email = ? AND purpose = ? AND consumed_at IS NULL", [normalized, purpose], {
    order: "created_at DESC",
    limit: 5,
  });
  if (!rows.length) {
    throw unauthorized(
      purpose === "verify_email"
        ? "Mã xác thực không đúng hoặc đã được dùng. Hãy bấm gửi lại mã."
        : "Mã không đúng hoặc đã được sử dụng. Hãy yêu cầu mã mới.",
    );
  }

  const hashed = hashToken(code, normalized, purpose);
  const row = rows.find((entry) => entry.token_hash === hashed || entry.link_hash === hashed);
  if (!row) {
    const latest = rows[0];
    update("email_tokens", latest.id, { attempts: (latest.attempts ?? 0) + 1 });
    const left = MAX_ATTEMPTS - ((latest.attempts ?? 0) + 1);
    throw unauthorized(
      left > 0
        ? `Mã không đúng. Còn ${left} lần thử.`
        : "Mã không đúng quá nhiều lần — hãy yêu cầu mã mới.",
    );
  }
  if ((row.attempts ?? 0) >= MAX_ATTEMPTS) {
    throw unauthorized("Mã này đã bị khoá do sai quá nhiều lần. Hãy yêu cầu mã mới.");
  }
  if (Date.parse(row.expires_at) < Date.now()) {
    throw unauthorized("Mã đã hết hạn. Hãy yêu cầu mã mới.");
  }

  update("email_tokens", row.id, { consumed_at: nowIso() });
  // Any other pending codes for this email are void once one is used.
  for (const other of all("email_tokens", "email = ? AND purpose = ? AND consumed_at IS NULL", [normalized, purpose])) {
    update("email_tokens", other.id, { consumed_at: nowIso() });
  }
  const user = findUserByEmail(normalized);
  if (!user) throw unauthorized("Không tìm thấy tài khoản cho email này");
  return user;
}

/**
 * Đăng nhập không mật khẩu: nhận mã (hoặc link) trong email. Nhận được mã tức là đã chứng minh
 * sở hữu hộp thư ⇒ tài khoản được coi là ĐÃ xác thực email luôn.
 */
export function verifyLoginToken({ email, token }) {
  const user = redeemEmailToken({ email, value: token, purpose: "login" });
  return markEmailVerified(user.id) ?? user;
}

/** Xác thực email: dùng mã gửi tới hộp thư sau khi đăng ký (hoặc khi đăng nhập mà chưa xác thực). */
export function verifyEmailCode({ email, code }) {
  const user = redeemEmailToken({ email, value: code, purpose: "verify_email" });
  return markEmailVerified(user.id) ?? user;
}

/**
 * Gửi (hoặc gửi lại) mã KÍCH HOẠT TÀI KHOẢN cho tài khoản chưa xác thực email.
 * Cùng hình dạng kết quả với `requestLoginToken` để giao diện dùng lại màn "kiểm tra hộp thư".
 */
export async function requestEmailVerification({ user, settings, ip = null, userAgent = null }) {
  const normalized = validateEmail(user?.email);
  const gate = tokenRequestLimiter.check(normalized);
  if (!gate.ok) {
    throw new ApiError(429, "rate_limited", "Đã gửi quá nhiều mã cho email này. Vui lòng chờ vài phút rồi thử lại.");
  }

  purgeOldTokens(normalized);
  // Mã mới thay thế mọi mã còn treo, để email cũ không dùng được nữa.
  for (const pending of all("email_tokens", "email = ? AND consumed_at IS NULL", [normalized])) {
    update("email_tokens", pending.id, { consumed_at: nowIso() });
  }

  const code = randomCode();
  const linkToken = crypto.randomBytes(24).toString("base64url");
  const ttlMin = Math.min(Math.max(Number(settings.emailVerificationTtlMin) || 30, 5), 120);
  const expiresAt = new Date(Date.now() + ttlMin * 60 * 1000).toISOString();

  insert("email_tokens", {
    email: normalized,
    token_hash: hashToken(code, normalized, "verify_email"),
    link_hash: hashToken(linkToken, normalized, "verify_email"),
    purpose: "verify_email",
    expires_at: expiresAt,
    ip,
    user_agent: userAgent ? String(userAgent).slice(0, 200) : null,
  });

  const link = verifyLink({ publicUrl: config.publicUrl, email: normalized, token: linkToken });
  const delivery = await sendVerificationCode({
    settings,
    to: normalized,
    code,
    link,
    ttlMin,
    name: user?.name ?? null,
  });
  const status = mailerStatus(settings);

  const payload = {
    ok: true,
    delivered: Boolean(delivery.sent),
    expiresInMin: ttlMin,
    mailerConfigured: status.configured,
  };
  if (!delivery.sent) {
    payload.message = status.configured
      ? `Không gửi được email: ${delivery.detail ?? delivery.reason}`
      : "Chưa cấu hình email (Resend) — mã hiển thị ngay trên màn hình để anh kích hoạt.";
    // Cùng lối thoát như đăng nhập: máy chưa có mailer thì hiện mã để còn vào được.
    if (settings.showLoginCodeWhenNoMailer) {
      payload.devCode = code;
      payload.devLink = link;
    }
  }
  return payload;
}
