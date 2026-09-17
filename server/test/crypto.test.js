import "./helpers.js";
import test from "node:test";
import assert from "node:assert/strict";

const { hashPassword, verifyPassword, signToken, verifyToken, encryptSecret, decryptSecret, maskSecret } =
  await import("../src/crypto.js");

test("password hashing round-trips and rejects wrong passwords", () => {
  const stored = hashPassword("matkhau12345");
  assert.match(stored, /^scrypt\$\d+\$\d+\$\d+\$/);
  assert.equal(verifyPassword("matkhau12345", stored), true);
  assert.equal(verifyPassword("matkhau12346", stored), false);
  assert.equal(verifyPassword("", stored), false);
  assert.equal(verifyPassword("matkhau12345", "garbage"), false);
});

test("the same password hashes differently every time (unique salt)", () => {
  assert.notEqual(hashPassword("abcdefgh"), hashPassword("abcdefgh"));
});

test("tokens verify, expire and reject tampering", () => {
  const token = signToken({ sub: "u_1", role: "admin" }, { ttlSec: 60 });
  const payload = verifyToken(token);
  assert.equal(payload.sub, "u_1");
  assert.equal(payload.role, "admin");

  const expired = signToken({ sub: "u_1" }, { ttlSec: -10 });
  assert.equal(verifyToken(expired), null);

  const [header, body] = token.split(".");
  assert.equal(verifyToken(`${header}.${body}.deadbeef`), null);
  assert.equal(verifyToken("not-a-token"), null);
});

test("secrets are encrypted with AES-GCM and decrypt back", () => {
  const blob = encryptSecret("AIzaSy-super-secret-key");
  assert.ok(blob.startsWith("v1."));
  assert.ok(!blob.includes("super-secret"));
  assert.equal(decryptSecret(blob), "AIzaSy-super-secret-key");
  assert.equal(decryptSecret(null), null);
  assert.equal(decryptSecret("v1.bad.bad.bad"), null);
});

test("maskSecret never reveals the middle of a key", () => {
  const masked = maskSecret("AIzaSyABCDEFGHIJKLMNOP");
  assert.equal(masked, "AIzaSy…NOP");
  assert.equal(maskSecret(""), null);
  assert.equal(maskSecret("short"), "•••••");
});
