// Bắt tay WireGuard (Noise IKpsk2) bằng Node thuần — dùng để ĐO THẬT đường tới một node VPN
// từ chính máy khách, không cần `wg`/wireguard-go và không cần quyền admin.
//
// Vì sao cần: app Windows nhúng wireguard-go, không có công cụ dòng lệnh nào phát được một
// handshake initiation để kiểm tra "node X có sống không". Gói ở đây dựng đúng theo
// wireguard-go `device/noise-protocol.go` + `device/cookie.go`:
//   • HASH/KDF = BLAKE2s-256 và HMAC-BLAKE2s (HKDF)
//   • MAC1     = BLAKE2s **CÓ KHOÁ** 128-bit với khoá HASH("mac1----" || static_public của responder)
//                (KHÔNG phải HMAC — sai chỗ này thì responder im lặng, không log gì)
//   • AEAD     = ChaCha20-Poly1305, nonce 12 byte = 4 byte 0 || counter 8 byte LE
//
// Đã đối chiếu hai chiều (xem docs/evidence/T-20260930-03/README.md):
//   1. byte-for-byte với bản tham chiếu Python dùng thư viện `cryptography`;
//   2. kernel WireGuard thật (interface tạm trên node-2) TRẢ LỜI message type 2 đúng sender_index.

import crypto from "node:crypto";
import dgram from "node:dgram";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CONSTRUCTION = "Noise_IKpsk2_25519_ChaChaPoly_BLAKE2s";
const IDENTIFIER = "WireGuard v1 zx2c4 Jason@zx2c4.com";
const LABEL_MAC1 = "mac1----";

export const hash = (data) => crypto.createHash("blake2s256").update(data).digest();
export const hmac = (key, data) => crypto.createHmac("blake2s256", key).update(data).digest();
const concat = (...parts) => Buffer.concat(parts);

// ---------------------------------------------------------------- BLAKE2s (có khoá)
const B2S_IV = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
const B2S_SIGMA = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  [14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3],
  [11, 8, 12, 0, 5, 2, 15, 13, 10, 14, 3, 6, 7, 1, 9, 4],
  [7, 9, 3, 1, 13, 12, 11, 14, 2, 6, 5, 10, 4, 0, 15, 8],
  [9, 0, 5, 7, 2, 4, 10, 15, 14, 1, 11, 12, 6, 8, 3, 13],
  [2, 12, 6, 10, 0, 11, 8, 3, 4, 13, 7, 5, 15, 14, 1, 9],
  [12, 5, 1, 15, 14, 13, 4, 10, 0, 7, 6, 3, 9, 2, 8, 11],
  [13, 11, 7, 14, 12, 1, 3, 9, 5, 0, 15, 4, 8, 6, 2, 10],
  [6, 15, 14, 9, 11, 3, 0, 8, 12, 2, 13, 7, 1, 4, 10, 5],
  [10, 2, 8, 4, 7, 6, 1, 5, 15, 11, 9, 14, 3, 12, 13, 0],
];

function b2sG(v, a, b, c, d, x, y) {
  const rot = (w, n) => ((w >>> n) | (w << (32 - n))) >>> 0;
  v[a] = (v[a] + v[b] + x) >>> 0;
  v[d] = rot(v[d] ^ v[a], 16);
  v[c] = (v[c] + v[d]) >>> 0;
  v[b] = rot(v[b] ^ v[c], 12);
  v[a] = (v[a] + v[b] + y) >>> 0;
  v[d] = rot(v[d] ^ v[a], 8);
  v[c] = (v[c] + v[d]) >>> 0;
  v[b] = rot(v[b] ^ v[c], 7);
}

function b2sCompress(h, block, counter, last) {
  const v = new Uint32Array(16);
  v.set(h);
  v.set(B2S_IV, 8);
  v[12] = (v[12] ^ (counter & 0xffffffff)) >>> 0;
  v[13] = (v[13] ^ Math.floor(counter / 4294967296)) >>> 0;
  if (last) v[14] = ~v[14] >>> 0;
  const m = new Uint32Array(16);
  for (let i = 0; i < 16; i += 1) m[i] = block.readUInt32LE(i * 4);
  for (let r = 0; r < 10; r += 1) {
    const s = B2S_SIGMA[r];
    b2sG(v, 0, 4, 8, 12, m[s[0]], m[s[1]]);
    b2sG(v, 1, 5, 9, 13, m[s[2]], m[s[3]]);
    b2sG(v, 2, 6, 10, 14, m[s[4]], m[s[5]]);
    b2sG(v, 3, 7, 11, 15, m[s[6]], m[s[7]]);
    b2sG(v, 0, 5, 10, 15, m[s[8]], m[s[9]]);
    b2sG(v, 1, 6, 11, 12, m[s[10]], m[s[11]]);
    b2sG(v, 2, 7, 8, 13, m[s[12]], m[s[13]]);
    b2sG(v, 3, 4, 9, 14, m[s[14]], m[s[15]]);
  }
  for (let i = 0; i < 8; i += 1) h[i] = (h[i] ^ v[i] ^ v[i + 8]) >>> 0;
}

export function blake2s(data, { key = null, outlen = 32 } = {}) {
  const h = new Uint32Array(B2S_IV);
  h[0] = (h[0] ^ 0x01010000 ^ ((key ? key.length : 0) << 8) ^ outlen) >>> 0;
  const input = key ? concat(Buffer.concat([key, Buffer.alloc(64 - key.length)]), data) : data;
  let counter = 0;
  let offset = 0;
  while (input.length - offset > 64) {
    counter += 64;
    b2sCompress(h, input.subarray(offset, offset + 64), counter, false);
    offset += 64;
  }
  const last = Buffer.alloc(64);
  input.subarray(offset).copy(last);
  counter += input.length - offset;
  b2sCompress(h, last, counter, true);
  const out = Buffer.alloc(32);
  for (let i = 0; i < 8; i += 1) out.writeUInt32LE(h[i], i * 4);
  return out.subarray(0, outlen);
}

const PKCS8_X25519 = Buffer.from("302e020100300506032b656e04220420", "hex");
const SPKI_X25519 = Buffer.from("302a300506032b656e032100", "hex");
const privKeyObject = (raw) => crypto.createPrivateKey({ key: concat(PKCS8_X25519, raw), format: "der", type: "pkcs8" });
const pubKeyObject = (raw) => crypto.createPublicKey({ key: concat(SPKI_X25519, raw), format: "der", type: "spki" });
const dh = (privRaw, pubRaw) => crypto.diffieHellman({ privateKey: privKeyObject(privRaw), publicKey: pubKeyObject(pubRaw) });
const pubOf = (privRaw) => crypto.createPublicKey(privKeyObject(privRaw)).export({ type: "spki", format: "der" }).subarray(-32);

function kdf2(key, input) {
  const temp = hmac(key, input);
  const out1 = hmac(temp, Buffer.from([0x01]));
  const out2 = hmac(temp, concat(out1, Buffer.from([0x02])));
  return [out1, out2];
}

function aeadEncrypt(key, counter, plaintext, aad) {
  const nonce = Buffer.alloc(12);
  nonce.writeBigUInt64LE(BigInt(counter), 4);
  const cipher = crypto.createCipheriv("chacha20-poly1305", key, nonce, { authTagLength: 16 });
  cipher.setAAD(aad);
  return concat(cipher.update(plaintext), cipher.final(), cipher.getAuthTag());
}

function tai64n(now = Date.now()) {
  const out = Buffer.alloc(12);
  out.writeBigUInt64BE(BigInt(Math.floor(now / 1000)) + 0x400000000000000an, 0);
  out.writeUInt32BE((now % 1000) * 1_000_000, 8);
  return out;
}

/** Dựng gói handshake initiation 148 byte. Trả về { packet, senderIndex }. */
export function buildInitiation(staticPrivRaw, staticPubRaw, responderPubRaw, options = {}) {
  const senderIndex = options.senderIndex ?? crypto.randomBytes(4).readUInt32LE(0);
  const ephPrivRaw = options.ephemeralPrivate ?? crypto.generateKeyPairSync("x25519").privateKey.export({ type: "pkcs8", format: "der" }).subarray(-32);
  const ephPubRaw = pubOf(ephPrivRaw);

  let chainingKey = hash(Buffer.from(CONSTRUCTION));
  let h = hash(concat(hash(concat(chainingKey, Buffer.from(IDENTIFIER))), responderPubRaw));

  chainingKey = kdf2(chainingKey, ephPubRaw)[0];
  h = hash(concat(h, ephPubRaw));

  let key;
  [chainingKey, key] = kdf2(chainingKey, dh(ephPrivRaw, responderPubRaw));
  const encryptedStatic = aeadEncrypt(key, 0, staticPubRaw, h);
  h = hash(concat(h, encryptedStatic));

  [chainingKey, key] = kdf2(chainingKey, dh(staticPrivRaw, responderPubRaw));
  const encryptedTimestamp = aeadEncrypt(key, 0, options.timestamp ?? tai64n(), h);
  h = hash(concat(h, encryptedTimestamp));

  const head = Buffer.alloc(8);
  head.writeUInt8(1, 0);
  head.writeUInt32LE(senderIndex, 4);
  const body = concat(head, ephPubRaw, encryptedStatic, encryptedTimestamp);
  const mac1 = blake2s(body, { key: hash(concat(Buffer.from(LABEL_MAC1), responderPubRaw)), outlen: 16 });
  return { packet: concat(body, mac1, Buffer.alloc(16)), senderIndex };
}

/** Gửi một handshake initiation và chờ message type 2. Trả về { ok, rttMs, reason }. */
export function probeHandshake({ host, port, responderPub, staticPriv, staticPub, timeoutMs = 5000, socket = null }) {
  const { packet, senderIndex } = buildInitiation(staticPriv, staticPub, responderPub);
  return new Promise((resolve) => {
    const sock = socket ?? dgram.createSocket("udp4");
    let settled = false;
    const started = process.hrtime.bigint();
    const done = (ok, reason) => {
      if (settled) return;
      settled = true;
      const rttMs = Number(process.hrtime.bigint() - started) / 1e6;
      if (!socket) {
        try { sock.close(); } catch { /* đã đóng */ }
      }
      resolve({ ok, rttMs, reason });
    };
    sock.on("message", (msg) => {
      // MessageResponse: Type u32@0, Sender u32@4, Receiver u32@8
      if (msg.length === 92 && msg.readUInt8(0) === 2 && msg.readUInt32LE(8) === senderIndex) done(true, "type=2 khớp sender_index");
      else done(false, `gói lạ: type=${msg.readUInt8(0)} len=${msg.length}`);
    });
    sock.on("error", (error) => done(false, `lỗi socket: ${error.message}`));
    sock.send(packet, port, host, (error) => {
      if (error) done(false, `gửi lỗi: ${error.message}`);
    });
    setTimeout(() => done(false, `không có phản hồi sau ${timeoutMs} ms`), timeoutMs);
  });
}

/** Khoá thiết bị VPNFlow của máy này (app lưu trong %APPDATA%\VPNFlow\device.json). */
export function loadLocalDeviceKey({ profilePath = null } = {}) {
  const candidates = profilePath
    ? [profilePath]
    : [
        path.join(os.homedir(), "AppData", "Roaming", "VPNFlow", "device.json"),
        path.join(os.homedir(), "Library", "Application Support", "VPNFlow", "device.json"),
      ];
  for (const file of candidates) {
    try {
      const device = JSON.parse(fs.readFileSync(file, "utf8"));
      const priv = Buffer.from(device.wireguard_private_key, "base64");
      const pub = Buffer.from(device.wireguard_public_key, "base64");
      if (priv.length === 32 && pub.length === 32) return { priv, pub, file };
    } catch {
      /* thử file kế tiếp */
    }
  }
  return null;
}
