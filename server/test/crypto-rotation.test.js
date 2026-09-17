/**
 * Xoay khoá mã hoá secret — canh đúng sự cố 2026-09-18.
 *
 * Khoá AES = `scrypt(secret, SALT)` và SALT nằm trong code, nên lần đổi tên
 * `flowgpt-secret-v1` → `fbuddy-secret-v1` đã làm mọi API key đã lưu không giải mã
 * được nữa, dù biến môi trường `*_SECRET` không đổi. Test này khoá hành vi đúng:
 * **ghi bằng salt mới, đọc được cả salt cũ**, và không nhận nhầm khoá lạ.
 *
 * Khoá phải đặt TRƯỚC khi import `config.js`/`crypto.js` vì config đọc env lúc import.
 */
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

const CURRENT_SECRET = "secret-hien-tai-0123456789-abcdef";
const OLD_SECRET = "secret-thoi-flowgpt-9876543210-zyxw";
const CURRENT_SALT = "fbuddy-secret-v1";
/** Fixture: salt của bản TRƯỚC khi đổi tên — dữ liệu production đang mã hoá bằng khoá này. */
const LEGACY_SALT = "flowgpt-secret-v1";

process.env.NODE_ENV = "test";
process.env.FBUDDY_SECRET = CURRENT_SECRET;
delete process.env.FBUDDY_LEGACY_SECRET;
delete process.env.FLOWGPT_SECRET;

const { encryptSecret, decryptSecret, decryptSecretInfo } = await import("../src/crypto.js");

/** Dựng lại đúng cách bản cũ ghi dữ liệu (salt cũ + AES-256-GCM). */
function legacyBlob(plain, { secret = CURRENT_SECRET, salt = LEGACY_SALT } = {}) {
  const key = crypto.scryptSync(secret, salt, 32, { N: 16384, r: 8, p: 1 });
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${enc.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}`;
}

test("dữ liệu mã hoá bằng SALT CŨ vẫn đọc được (cùng secret)", () => {
  const blob = legacyBlob("glm-api-key-that-was-working");
  assert.equal(
    decryptSecret(blob),
    "glm-api-key-that-was-working",
    "đổi tên thương hiệu không được làm chết API key đã lưu",
  );
  const info = decryptSecretInfo(blob);
  assert.equal(info.legacy, true, "phải báo đây là blob khoá cũ để còn mã hoá lại");
});

test("secret mới được GHI bằng salt mới, không phải salt cũ", () => {
  const blob = encryptSecret("key-moi-dan-vao");
  assert.equal(decryptSecret(blob), "key-moi-dan-vao");
  assert.equal(decryptSecretInfo(blob).legacy, false, "bản ghi mới không được coi là khoá cũ");

  // Giải mã thẳng bằng khoá dẫn xuất từ salt mới ⇒ chứng minh đúng salt đang dùng để ghi.
  const currentKey = crypto.scryptSync(CURRENT_SECRET, CURRENT_SALT, 32, { N: 16384, r: 8, p: 1 });
  const [version, ivB64, dataB64, tagB64] = blob.split(".");
  assert.equal(version, "v1");
  const decipher = crypto.createDecipheriv("aes-256-gcm", currentKey, Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  assert.equal(
    Buffer.concat([decipher.update(Buffer.from(dataB64, "base64url")), decipher.final()]).toString("utf8"),
    "key-moi-dan-vao",
  );
});

test("salt cũ + SECRET CŨ vẫn đọc được khi khai báo FBUDDY_LEGACY_SECRET", () => {
  const blob = legacyBlob("key-cua-thoi-truoc", { secret: OLD_SECRET });
  assert.equal(decryptSecret(blob), null, "chưa khai báo secret cũ thì không thể đoán ra");

  process.env.FBUDDY_LEGACY_SECRET = OLD_SECRET;
  try {
    assert.equal(decryptSecret(blob), "key-cua-thoi-truoc");
    assert.equal(decryptSecretInfo(blob).legacy, true);
  } finally {
    delete process.env.FBUDDY_LEGACY_SECRET;
  }
});

test("biến FLOWGPT_SECRET còn sót trong env cũng đủ để đọc dữ liệu cũ", () => {
  const blob = legacyBlob("key-cua-thoi-truoc", { secret: OLD_SECRET });
  process.env.FLOWGPT_SECRET = OLD_SECRET;
  try {
    assert.equal(decryptSecret(blob), "key-cua-thoi-truoc");
  } finally {
    delete process.env.FLOWGPT_SECRET;
  }
});

test("khoá lạ hoặc blob hỏng trả null chứ không ném lỗi", () => {
  assert.equal(decryptSecret(null), null);
  assert.equal(decryptSecret(""), null);
  assert.equal(decryptSecret("khong-phai-blob"), null);
  assert.equal(decryptSecret("v1.aaa.bbb.ccc"), null);
  // Secret hoàn toàn khác + salt cũ ⇒ không được nhận nhầm.
  assert.equal(decryptSecret(legacyBlob("cua-nguoi-khac", { secret: "secret-khac-han-0987654321" })), null);
  assert.equal(encryptSecret(""), null);
});
