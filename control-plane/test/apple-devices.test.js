import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  AppleCredentialStore,
  derToJose,
  listAppleDevices,
  registerDeviceWithApple,
  signAscToken,
} from "../src/apple-devices.js";

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "asc-")), "apple-asc.json");
const keyPair = () => crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });

test("JWT App Store Connect: ES256 hợp lệ, verify được bằng public key", () => {
  const { privateKey, publicKey } = keyPair();
  const pem = privateKey.export({ type: "pkcs8", format: "pem" });
  const token = signAscToken({ keyId: "ABC123", issuerId: "issuer-1", privateKey: pem, now: 1_700_000_000_000 });

  const [h, p, sig] = token.split(".");
  assert.equal(token.split(".").length, 3, "JWT phải có 3 phần");
  const header = JSON.parse(Buffer.from(h, "base64url").toString());
  assert.equal(header.alg, "ES256");
  assert.equal(header.kid, "ABC123");
  const payload = JSON.parse(Buffer.from(p, "base64url").toString());
  assert.equal(payload.iss, "issuer-1");
  assert.equal(payload.aud, "appstoreconnect-v1");
  assert.equal(payload.exp - payload.iat, 900, "hạn token 15 phút");
  // chữ ký phải là raw r||s 64 byte và verify được (nếu còn DER thì Apple trả 401)
  assert.equal(Buffer.from(sig, "base64url").length, 64, "JWS ES256 phải là 64 byte");
  const ok = crypto.verify(
    "SHA256",
    Buffer.from(`${h}.${p}`),
    { key: publicKey, dsaEncoding: "ieee-p1363" },
    Buffer.from(sig, "base64url"),
  );
  assert.equal(ok, true, "chữ ký phải verify được với dsaEncoding ieee-p1363");
});

test("derToJose: chuyển DER của Node sang raw r||s (đủ 64 byte, kể cả số nhỏ)", () => {
  const { privateKey } = keyPair();
  for (let i = 0; i < 5; i += 1) {
    const signer = crypto.createSign("SHA256");
    signer.update(`payload-${i}`);
    const jose = derToJose(signer.sign(privateKey));
    assert.equal(jose.length, 64);
  }
  assert.throws(() => derToJose(Buffer.from([0x31, 0x02])), /SEQUENCE/);
});

test("registerDeviceWithApple: gửi đúng request Apple; 409 coi như đã đăng ký", async () => {
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 201, json: async () => ({ data: { id: "DEV-1" } }) };
  };
  const ok = await registerDeviceWithApple({
    token: "jwt",
    udid: "00008120-0008299A26D80032",
    name: "khach A",
    fetchImpl: fakeFetch,
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.deviceId, "DEV-1");
  assert.equal(calls[0].url, "https://api.appstoreconnect.apple.com/v1/devices");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.Authorization, "Bearer jwt");
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.data.type, "devices");
  assert.equal(body.data.attributes.platform, "IOS");
  assert.equal(body.data.attributes.udid, "00008120-0008299A26D80032");

  const dup = await registerDeviceWithApple({
    token: "jwt",
    udid: "X",
    fetchImpl: async () => ({ ok: false, status: 409, json: async () => ({ errors: [{ title: "Conflict", detail: "already exists" }] }) }),
  });
  assert.equal(dup.ok, false);
  assert.equal(dup.alreadyRegistered, true, "409 = UDID đã có trên Apple, không phải lỗi chặn khách");
});

test("listAppleDevices: đọc danh sách + trả lỗi rõ ràng khi API từ chối", async () => {
  const fakeFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ data: [{ id: "D1", attributes: { udid: "U1", name: "n", status: "ENABLED", addedDate: "2026-09-15" } }] }),
  });
  const list = await listAppleDevices({ token: "jwt", fetchImpl: fakeFetch });
  assert.equal(list.ok, true);
  assert.deepEqual(list.devices[0], { id: "D1", udid: "U1", name: "n", status: "ENABLED", addedDate: "2026-09-15" });

  const denied = await listAppleDevices({
    token: "bad",
    fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ errors: [{ detail: "Authentication credentials are missing or invalid." }] }) }),
  });
  assert.equal(denied.ok, false);
  assert.match(denied.error, /credentials/i);
  assert.deepEqual(denied.devices, []);
});

test("credential store: lưu .p8 với quyền 0600, status KHÔNG lộ khoá", async () => {
  const file = tmpFile();
  const store = new AppleCredentialStore(file);
  assert.equal((await store.status()).configured, false);

  const { privateKey } = keyPair();
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  await store.save({ keyId: "K1", issuerId: "12345678-abcd", privateKey: pem });

  const status = await store.status();
  assert.equal(status.configured, true);
  assert.equal(status.keyId, "K1");
  assert.ok(!JSON.stringify(status).includes("BEGIN PRIVATE KEY"), "status không được chứa khoá");
  assert.equal(fs.statSync(file).mode & 0o777, 0o600, "file khoá phải 0600");
  assert.ok((await store.token())?.split(".").length === 3, "phải ký được token từ khoá đã lưu");

  await assert.rejects(() => store.save({ keyId: "K", issuerId: "I", privateKey: "không phải p8" }), /PKCS#8/);
  await store.clear();
  assert.equal((await store.status()).configured, false);
});
