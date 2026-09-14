/**
 * Đăng ký UDID lên Apple Developer qua **App Store Connect API** (thay thao tác tay).
 *
 * Vì sao cần: bản iOS phát Ad Hoc chỉ cài được khi UDID của khách nằm trong tài khoản Apple
 * và provisioning profile đã được tạo lại. Trước đây chủ shop phải copy UDID dán vào trang
 * Apple; module này để server tự gọi API (khi đã cấu hình khoá .p8).
 *
 * Cần 3 thứ từ App Store Connect → Users and Access → Integrations → App Store Connect API:
 *   • Issuer ID  • Key ID  • file khoá riêng .p8 (chỉ tải được MỘT lần)
 * Token API là JWT ES256 ký bằng khoá đó (hạn tối đa 20 phút) — xem signAscToken().
 *
 * Module chỉ chứa hàm thuần + store JSON nhỏ (không tự I/O mạng khi test: `fetchImpl` bơm vào).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ASC_BASE = "https://api.appstoreconnect.apple.com";
/** Apple cho hạn token tối đa 20 phút; để 15 phút cho an toàn. */
const TOKEN_TTL_SEC = 900;

function b64url(input) {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Chữ ký ECDSA của Node là DER; JWS cần dạng "raw" r||s (P-256 = 32+32 byte).
 * Không convert thì Apple trả 401 vì chữ ký sai định dạng.
 */
export function derToJose(der, size = 32) {
  const buf = Buffer.from(der);
  let i = 0;
  if (buf[i++] !== 0x30) throw new Error("chữ ký DER không hợp lệ: thiếu SEQUENCE");
  const seqLen = buf[i++];
  if (seqLen & 0x80) i += seqLen & 0x7f; // độ dài dài (hiếm với P-256) — bỏ qua byte độ dài
  const readInt = () => {
    if (buf[i++] !== 0x02) throw new Error("chữ ký DER không hợp lệ: thiếu INTEGER");
    let len = buf[i++];
    if (len & 0x80) {
      const n = len & 0x7f;
      len = 0;
      for (let k = 0; k < n; k += 1) len = (len << 8) | buf[i++];
    }
    let val = buf.subarray(i, i + len);
    i += len;
    while (val.length > size && val[0] === 0) val = val.subarray(1);
    if (val.length > size) throw new Error("chữ ký DER không hợp lệ: số quá lớn");
    const out = Buffer.alloc(size);
    val.copy(out, size - val.length);
    return out;
  };
  const r = readInt();
  const s = readInt();
  return Buffer.concat([r, s]);
}

/** JWT ES256 để gọi App Store Connect API. */
export function signAscToken({ keyId, issuerId, privateKey, now = Date.now(), ttlSec = TOKEN_TTL_SEC }) {
  if (!keyId || !issuerId || !privateKey) throw new Error("thiếu keyId/issuerId/privateKey");
  const iat = Math.floor(now / 1000);
  const header = { alg: "ES256", kid: keyId, typ: "JWT" };
  const payload = { iss: issuerId, iat, exp: iat + ttlSec, aud: "appstoreconnect-v1" };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signer = crypto.createSign("SHA256");
  signer.update(signingInput);
  const signature = derToJose(signer.sign(privateKey));
  return `${signingInput}.${b64url(signature)}`;
}

/** Gọi App Store Connect; trả { ok, status, data } và không throw theo HTTP status. */
async function ascRequest({ token, method = "GET", path: apiPath, body = null, fetchImpl = fetch }) {
  const res = await fetchImpl(`${ASC_BASE}${apiPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data };
}

/** Đăng ký 1 UDID vào tài khoản Apple. Apple trả 409 nếu UDID đã có (coi như thành công). */
export async function registerDeviceWithApple({ token, udid, name = "VPNFlow customer", fetchImpl = fetch }) {
  const result = await ascRequest({
    token,
    method: "POST",
    path: "/v1/devices",
    body: { data: { type: "devices", attributes: { name: String(name).slice(0, 50), platform: "IOS", udid } } },
    fetchImpl,
  });
  if (result.ok) {
    return { ok: true, deviceId: result.data?.data?.id ?? null, alreadyRegistered: false };
  }
  const detail = result.data?.errors?.[0];
  const already = result.status === 409 || /already|duplicate|exists/i.test(String(detail?.detail ?? ""));
  return {
    ok: false,
    alreadyRegistered: already,
    status: result.status,
    error: detail ? `${detail.title ?? "Apple error"}: ${detail.detail ?? ""}`.trim() : `HTTP ${result.status}`,
  };
}

/** Danh sách thiết bị đã có trên Apple (để đối chiếu với danh sách trong hệ thống). */
export async function listAppleDevices({ token, fetchImpl = fetch, limit = 200 }) {
  const result = await ascRequest({ token, path: `/v1/devices?limit=${Math.min(Number(limit) || 200, 200)}`, fetchImpl });
  if (!result.ok) {
    return { ok: false, status: result.status, error: result.data?.errors?.[0]?.detail ?? `HTTP ${result.status}`, devices: [] };
  }
  const devices = (result.data?.data ?? []).map((d) => ({
    id: d.id,
    udid: d.attributes?.udid ?? null,
    name: d.attributes?.name ?? null,
    status: d.attributes?.status ?? null,
    addedDate: d.attributes?.addedDate ?? null,
  }));
  return { ok: true, devices };
}

/** Lưu khoá App Store Connect (file quyền 0600, không bao giờ trả khoá ra ngoài). */
export class AppleCredentialStore {
  constructor(filePath) {
    this.filePath = filePath;
  }

  async load() {
    try {
      const parsed = JSON.parse(await fs.promises.readFile(this.filePath, "utf8"));
      return {
        keyId: parsed?.keyId ?? null,
        issuerId: parsed?.issuerId ?? null,
        teamId: parsed?.teamId ?? null,
        privateKey: parsed?.privateKey ?? null,
        savedAt: parsed?.savedAt ?? null,
      };
    } catch {
      return { keyId: null, issuerId: null, teamId: null, privateKey: null, savedAt: null };
    }
  }

  async save({ keyId, issuerId, teamId = null, privateKey }) {
    if (!keyId || !issuerId || !privateKey) throw new Error("thiếu keyId/issuerId/privateKey");
    if (!/BEGIN PRIVATE KEY/.test(privateKey)) throw new Error("privateKey phải là nội dung file .p8 (PKCS#8)");
    await fs.promises.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.promises.writeFile(
      this.filePath,
      JSON.stringify({ keyId, issuerId, teamId, privateKey, savedAt: new Date().toISOString() }, null, 2),
      { mode: 0o600 },
    );
    return true;
  }

  async clear() {
    await fs.promises.rm(this.filePath, { force: true });
    return true;
  }

  /** Trạng thái cho dashboard — KHÔNG trả privateKey. */
  async status() {
    const data = await this.load();
    return {
      configured: Boolean(data.keyId && data.issuerId && data.privateKey),
      keyId: data.keyId,
      issuerId: data.issuerId ? `${data.issuerId.slice(0, 8)}…` : null,
      teamId: data.teamId,
      savedAt: data.savedAt,
    };
  }

  /** Token dùng ngay để gọi API (null nếu chưa cấu hình). */
  async token(now = Date.now()) {
    const data = await this.load();
    if (!data.keyId || !data.issuerId || !data.privateKey) return null;
    return signAscToken({ keyId: data.keyId, issuerId: data.issuerId, privateKey: data.privateKey, now });
  }
}
