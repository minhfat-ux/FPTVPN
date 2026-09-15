/**
 * Cập nhật profile Ad Hoc cho ĐỦ UDID — chạy TRÊN SERVER (node-2), không cần máy Mac.
 * Dùng chính khoá App Store Connect mà control plane đã lưu (data/apple-asc.json).
 * Apple KHÔNG cho PATCH profile ⇒ xoá rồi tạo lại cùng tên (giữ tên để manifest/ExportOptions cũ vẫn đúng).
 */
import fs from "node:fs";
import path from "node:path";
import { AppleCredentialStore, signAscToken } from "/root/flowvpn-cp/src/apple-devices.js";

const OUT_DIR = process.argv[2] || "/root/flowvpn-sign";
const store = new AppleCredentialStore("/root/flowvpn-cp/data/apple-asc.json");
const creds = await store.load();
if (!creds.keyId || !creds.issuerId || !creds.privateKey) {
  console.error("  LỖI: chưa có khoá App Store Connect trong control plane");
  process.exit(2);
}
const token = signAscToken({ keyId: creds.keyId, issuerId: creds.issuerId, privateKey: creds.privateKey });

async function asc(method, apiPath, body = null) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${apiPath}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${apiPath} → HTTP ${res.status} ${JSON.stringify(json?.errors?.[0] ?? "")}`);
  return json;
}

const bundleId = async (identifier) =>
  (await asc("GET", `/v1/bundleIds?filter[identifier]=${identifier}`)).data[0].id;
const appBid = await bundleId("com.privatevpn.app");
const extBid = await bundleId("com.privatevpn.app.packet-tunnel");
const certId = (await asc("GET", "/v1/certificates?filter[certificateType]=DISTRIBUTION&limit=1")).data[0].id;
const devices = (await asc("GET", "/v1/devices?filter[platform]=IOS&limit=200")).data.map((d) => ({
  type: "devices",
  id: d.id,
}));

const existingId = async (name) => {
  const found = (await asc("GET", `/v1/profiles?filter[name]=${encodeURIComponent(name)}&limit=1`)).data;
  return found.length ? found[0].id : null;
};

async function makeProfile(name, bid) {
  const old = await existingId(name);
  if (old) await asc("DELETE", `/v1/profiles/${old}`);
  return asc("POST", "/v1/profiles", {
    data: {
      type: "profiles",
      attributes: { name, profileType: "IOS_APP_ADHOC" },
      relationships: {
        bundleId: { data: { type: "bundleIds", id: bid } },
        certificates: { data: [{ type: "certificates", id: certId }] },
        devices: { data: devices },
      },
    },
  });
}

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const [name, bid, file] of [
  ["VPNFlow AdHoc App", appBid, "app.mobileprovision"],
  ["VPNFlow AdHoc Tunnel", extBid, "ext.mobileprovision"],
]) {
  const res = await makeProfile(name, bid);
  const content = Buffer.from(res.data.attributes.profileContent, "base64");
  fs.writeFileSync(path.join(OUT_DIR, file), content, { mode: 0o600 });
  console.log(`  ✔ ${name} (${content.length} bytes) → ${file}`);
}
console.log(`  thiết bị trong profile: ${devices.length}`);
