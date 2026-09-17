import crypto from "node:crypto";
import { config } from "./config.js";

// ---------------------------------------------------------------- passwords

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

/** scrypt$N$r$p$saltB64$hashB64 — self-describing so parameters can change later. */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, SCRYPT.keylen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    maxmem: 256 * 1024 * 1024,
  });
  return [
    "scrypt",
    SCRYPT.N,
    SCRYPT.r,
    SCRYPT.p,
    salt.toString("base64"),
    hash.toString("base64"),
  ].join("$");
}

export function verifyPassword(password, stored) {
  try {
    const [scheme, N, r, p, saltB64, hashB64] = String(stored ?? "").split("$");
    if (scheme !== "scrypt") return false;
    const salt = Buffer.from(saltB64, "base64");
    const expected = Buffer.from(hashB64, "base64");
    const actual = crypto.scryptSync(String(password), salt, expected.length, {
      N: Number(N),
      r: Number(r),
      p: Number(p),
      maxmem: 256 * 1024 * 1024,
    });
    return crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------- JWT

function b64url(input) {
  return Buffer.from(input).toString("base64url");
}

function sign(data) {
  return crypto.createHmac("sha256", `jwt:${config.secret}`).update(data).digest("base64url");
}

export function signToken(payload, { ttlSec = 60 * 60 * 24 * 30 } = {}) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const body = b64url(JSON.stringify({ ...payload, iat: now, exp: now + ttlSec }));
  const data = `${header}.${body}`;
  return `${data}.${sign(data)}`;
}

export function verifyToken(token) {
  const parts = String(token ?? "").split(".");
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts;
  const expected = sign(`${header}.${body}`);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload.exp || payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// ------------------------------------------------- secret storage (AES-GCM)

/**
 * Khoá AES = scrypt(secret, SALT). Vì **salt nằm trong code**, đổi tên thương hiệu
 * trong salt là đổi luôn khoá dẫn xuất — mọi credential đã lưu (API key của nhà cung
 * cấp AI, Resend, SePay, MCP) sẽ không giải mã được nữa dù biến môi trường `*_SECRET`
 * không hề đổi, và `decryptSecret()` trả `null` im lặng.
 *
 * Đó đúng là sự cố 2026-09-18 khi đổi tên sang fBuddy. Nên: **GHI bằng salt mới, ĐỌC
 * được cả salt cũ**. Muốn bỏ hẳn đường cũ thì phải chạy `ops/reencrypt-secrets.mjs`
 * để mã hoá lại toàn bộ dữ liệu trước, đừng xoá `LEGACY_SALTS` trước khi làm việc đó.
 */
const SECRET_SALT = "fbuddy-secret-v1";

/** Salt thời còn tên cũ — chỉ dùng để ĐỌC dữ liệu đã mã hoá. */
const LEGACY_SALTS = ["flowgpt-secret-v1"];

/**
 * Cache khoá đã dẫn xuất. `scrypt` khá đắt mà mỗi lần đọc cài đặt lại giải mã vài
 * secret (Resend/SePay…) — không cache thì mỗi lần đọc phải chạy lại scrypt nhiều lần.
 * Khoá chỉ nằm trong RAM, không ghi ra đâu.
 */
const keyCache = new Map();

function deriveKey(secret, salt) {
  const cacheKey = `${salt}\u0000${secret}`;
  let key = keyCache.get(cacheKey);
  if (!key) {
    key = crypto.scryptSync(secret, salt, 32, { N: 16384, r: 8, p: 1 });
    keyCache.set(cacheKey, key);
  }
  return key;
}

/** Khoá dùng để GHI secret mới. */
function secretKey() {
  return deriveKey(config.secret, SECRET_SALT);
}

/**
 * Các khoá dùng để ĐỌC, theo thứ tự thử: khoá hiện tại trước, rồi salt cũ với secret
 * hiện tại, rồi salt cũ với secret CŨ (khi lần đổi tên trước đó cũng sinh secret mới —
 * đặt secret cũ vào `FBUDDY_LEGACY_SECRET` hoặc để biến `FLOWGPT_SECRET` còn trong env).
 */
function readKeys() {
  const legacySecret = process.env.FBUDDY_LEGACY_SECRET || process.env.FLOWGPT_SECRET || null;
  const keys = [secretKey()];
  for (const salt of LEGACY_SALTS) {
    keys.push(deriveKey(config.secret, salt));
    if (legacySecret && legacySecret.length >= 16 && legacySecret !== config.secret) {
      keys.push(deriveKey(legacySecret, salt));
    }
  }
  return keys;
}

export function encryptSecret(plain) {
  if (plain === null || plain === undefined || plain === "") return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", secretKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${enc.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}`;
}

/**
 * Giải mã, trả kèm thông tin đã dùng khoá nào — `legacy: true` nghĩa là blob còn
 * thuộc khoá cũ và nên được mã hoá lại (`ops/reencrypt-secrets.mjs`).
 */
export function decryptSecretInfo(blob) {
  if (!blob) return { plain: null, legacy: false };
  const [version, ivB64, dataB64, tagB64] = String(blob).split(".");
  if (version !== "v1") return { plain: null, legacy: false };
  const keys = readKeys();
  for (let index = 0; index < keys.length; index += 1) {
    try {
      const decipher = crypto.createDecipheriv("aes-256-gcm", keys[index], Buffer.from(ivB64, "base64url"));
      decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
      const plain = Buffer.concat([
        decipher.update(Buffer.from(dataB64, "base64url")),
        decipher.final(),
      ]).toString("utf8");
      return { plain, legacy: index > 0 };
    } catch {
      // Sai khoá ⇒ GCM ném lỗi xác thực; thử khoá kế tiếp.
    }
  }
  return { plain: null, legacy: false };
}

export function decryptSecret(blob) {
  return decryptSecretInfo(blob).plain;
}

/** `AIzaSyD…4f2` — enough for an admin to recognise a key, useless to an attacker. */
export function maskSecret(plain, { head = 6, tail = 3 } = {}) {
  const s = String(plain ?? "");
  if (!s) return null;
  if (s.length <= head + tail) return "•".repeat(s.length);
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}
