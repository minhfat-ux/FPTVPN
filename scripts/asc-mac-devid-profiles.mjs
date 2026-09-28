/**
 * Tạo lại provisioning profile **Developer ID cho macOS** (profileType MAC_APP_DIRECT) bằng
 * App Store Connect API — không cần portal, không cần Xcode account.
 *
 * VÌ SAO CẦN: (1) profile tạo 20/09/2026 không cấp `packet-tunnel-provider`/bộ system-extension cần thiết;
 * (2) từ 26/09/2026 tunnel macOS là **SYSTEM EXTENSION** nên profile phải cấp
 * `packet-tunnel-provider-systemextension` (appex plugin KHÔNG dùng được giá trị này ở tầng NetworkExtension:
 * `pkd … Code=-10814`), và **app** cần thêm `com.apple.developer.system-extension.install` (capability
 * `SYSTEM_EXTENSION_INSTALL`) để được phép cài system extension — thiếu khoá này macOS trả
 * `missingEntitlement` khi kích hoạt.
 *
 * Usage:
 *   ASC_KEY_ID=… ASC_ISSUER_ID=… ASC_KEY_PATH=… \
 *     node scripts/asc-mac-devid-profiles.mjs <thư-mục-ra> [tên-app] [tên-appex]
 * Mặc định thư mục ra: ~/.vpnflow-macrelease/profiles
 * Mã thoát: 0 = cả 2 profile đủ quyền · 1 = thiếu quyền (ĐỪNG ký/phát)
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const OUT = process.argv[2] || `${process.env.HOME}/.vpnflow-macrelease/profiles`;
const NAME_APP = process.argv[3] || "VPNFlow macOS DeveloperID";
const NAME_EXT = process.argv[4] || "VPNFlow macOS Tunnel DeveloperID";

const KEY_ID = process.env.ASC_KEY_ID || "8GW3662G64";
const ISSUER = process.env.ASC_ISSUER_ID || "7a64d085-c03d-4b10-9b96-ff8e00c42e79";
const KEY_PATH = process.env.ASC_KEY_PATH || `${process.env.HOME}/.appstoreconnect/private_keys/AuthKey_${KEY_ID}.p8`;

const b64url = (b) => Buffer.from(b).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
function makeToken() {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "ES256", kid: KEY_ID, typ: "JWT" }));
  const body = b64url(JSON.stringify({ iss: ISSUER, iat: now, exp: now + 900, aud: "appstoreconnect-v1" }));
  const input = `${head}.${body}`;
  const key = crypto.createPrivateKey(fs.readFileSync(KEY_PATH));
  const sig = crypto.sign("sha256", Buffer.from(input), { key, dsaEncoding: "ieee-p1363" });
  return `${input}.${b64url(sig)}`;
}
const TOKEN = makeToken();

async function asc(method, apiPath, body = null) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${apiPath}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${apiPath} → HTTP ${res.status} ${JSON.stringify(json?.errors?.[0] ?? json)}`);
  return json;
}

const allBundleIds = async () => (await asc("GET", "/v1/bundleIds?limit=200")).data;
const bundleId = async (identifier) => {
  const hit = (await allBundleIds()).find((b) => b.attributes.identifier === identifier);
  if (!hit) throw new Error(`không thấy App ID ${identifier} trên tài khoản`);
  return hit;
};
const capabilities = async (id) =>
  (await asc("GET", `/v1/bundleIds/${id}/bundleIdCapabilities`)).data.map((c) => c.attributes.capabilityType);

/** Bật capability nếu chưa có (API đặt được SYSTEM_EXTENSION_INSTALL / NETWORK_EXTENSIONS). */
async function ensureCapability(id, type) {
  const have = await capabilities(id);
  if (have.includes(type)) {
    console.log(`    ${type}: đã bật`);
    return;
  }
  await asc("POST", "/v1/bundleIdCapabilities", {
    data: { type: "bundleIdCapabilities", attributes: { capabilityType: type }, relationships: { bundleId: { data: { type: "bundleIds", id } } } },
  });
  console.log(`    ${type}: ĐÃ BẬT`);
}

const certs = (await asc("GET", "/v1/certificates?filter[certificateType]=DEVELOPER_ID_APPLICATION&limit=50"))
  .data.map((c) => ({ id: c.id, name: c.attributes?.displayName || c.id }));
if (!certs.length) throw new Error("tài khoản không có chứng chỉ DEVELOPER_ID_APPLICATION");
console.log(`  chứng chỉ Developer ID Application: ${certs.map((c) => c.name).join(", ")}`);

const existing = async (name) => {
  const r = await asc("GET", `/v1/profiles?filter[name]=${encodeURIComponent(name)}&limit=1`);
  return r.data.length ? r.data[0].id : null;
};

function readEntitlements(buf, label) {
  const prof = path.join(OUT, `.p-${label}.mobileprovision`);
  const plist = path.join(OUT, `.p-${label}.plist`);
  fs.writeFileSync(prof, buf, { mode: 0o600 });
  fs.writeFileSync(plist, execFileSync("security", ["cms", "-D", "-i", prof]).toString());
  const json = (key) => {
    try {
      return JSON.parse(execFileSync("plutil", ["-extract", key, "json", "-o", "-", plist]).toString());
    } catch {
      return null;
    }
  };
  const out = {
    name: (() => { try { return execFileSync("plutil", ["-extract", "Name", "raw", "-o", "-", plist]).toString().trim(); } catch { return ""; } })(),
    expiry: (() => { try { return execFileSync("plutil", ["-extract", "ExpirationDate", "raw", "-o", "-", plist]).toString().trim(); } catch { return ""; } })(),
    ent: json("Entitlements") || {},
  };
  fs.rmSync(prof, { force: true });
  fs.rmSync(plist, { force: true });
  return out;
}

async function makeProfile(name, bid) {
  const old = await existing(name);
  if (old) {
    await asc("DELETE", `/v1/profiles/${old}`);
    console.log(`  ↻ xoá profile cũ "${name}" (${old})`);
  }
  return asc("POST", "/v1/profiles", {
    data: {
      type: "profiles",
      attributes: { name, profileType: "MAC_APP_DIRECT" },
      relationships: {
        bundleId: { data: { type: "bundleIds", id: bid } },
        certificates: { data: certs.map((c) => ({ type: "certificates", id: c.id })) },
      },
    },
  });
}

fs.mkdirSync(OUT, { recursive: true });
const appBid = (await bundleId("com.privatevpn.mac")).id;
const extBid = (await bundleId("com.privatevpn.mac.packet-tunnel")).id;

console.log("  capability:");
await ensureCapability(appBid, "SYSTEM_EXTENSION_INSTALL");
await ensureCapability(appBid, "NETWORK_EXTENSIONS");
await ensureCapability(extBid, "NETWORK_EXTENSIONS");

const NE_SYSEXT = "packet-tunnel-provider-systemextension";
const NE_PLUGIN = "packet-tunnel-provider";
let bad = 0;

for (const [name, bid, file, needsInstall] of [
  [NAME_APP, appBid, "app.provisionprofile", true],
  [NAME_EXT, extBid, "appex.provisionprofile", false],
]) {
  const res = await makeProfile(name, bid);
  const content = Buffer.from(res.data.attributes.profileContent, "base64");
  const out = path.join(OUT, file);
  fs.writeFileSync(out, content, { mode: 0o600 });
  const info = readEntitlements(content, file);
  const ne = info.ent["com.apple.developer.networking.networkextension"] || [];
  const install = info.ent["com.apple.developer.system-extension.install"];
  console.log(`  ✔ ${name} → ${out} (${content.length} bytes, hết hạn ${info.expiry})`);
  console.log(`      networkextension = [${ne.join(", ")}]`);
  console.log(`      system-extension.install = ${install === undefined ? "KHÔNG CÓ" : JSON.stringify(install)}`);
  if (!ne.includes(NE_SYSEXT) && !ne.includes(NE_PLUGIN)) {
    console.error(`      LỖI: thiếu cả '${NE_SYSEXT}' lẫn '${NE_PLUGIN}'`);
    bad++;
  } else {
    console.log(`      giá trị dùng để ký: ${ne.includes(NE_SYSEXT) ? NE_SYSEXT : NE_PLUGIN}`);
  }
  if (needsInstall && install !== true) {
    console.error("      LỖI: app thiếu 'com.apple.developer.system-extension.install' ⇒ macOS trả missingEntitlement khi cài system extension");
    bad++;
  }
}

if (bad) {
  console.error(`\nLỖI: ${bad} vấn đề về quyền — ĐỪNG ký/phát hành.`);
  process.exit(1);
}
console.log(`\nOK: 2 profile Developer ID đủ quyền (networkextension '${NE_SYSEXT}' + system-extension.install cho app).`);
