import crypto from "node:crypto";
import fs from "node:fs";

const PRODUCT = "882A8127-3E6C-484C-8E10-028A22CEF81A";
const d = JSON.parse(fs.readFileSync("/root/flowvpn-cp/data/apple-asc.json", "utf8"));
const b64 = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const head = b64({ alg: "ES256", kid: d.keyId, typ: "JWT" });
const body = b64({ iss: d.issuerId, iat: now, exp: now + 900, aud: "appstoreconnect-v1" });
const sig = crypto.sign("sha256", Buffer.from(`${head}.${body}`), { key: d.privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url");
const jwt = `${head}.${body}.${sig}`;

async function api(path) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, { headers: { Authorization: `Bearer ${jwt}` } });
  const text = await res.text();
  let json = {};
  try { json = JSON.parse(text); } catch { /* rong */ }
  return { status: res.status, json, text };
}

const paths = [
  `/v1/ciProducts/${PRODUCT}/workflows`,
  `/v1/ciProducts/${PRODUCT}/buildRuns?limit=5`,
  `/v1/ciProducts/${PRODUCT}/primaryRepositories`,
  `/v1/ciProducts/${PRODUCT}/additionalRepositories`,
];
for (const p of paths) {
  const r = await api(p);
  console.log("=".repeat(60));
  console.log(p, "->", r.status);
  const data = r.json?.data;
  if (Array.isArray(data)) {
    for (const it of data) {
      console.log(" ", it.type, it.id, JSON.stringify(it.attributes ?? {}).slice(0, 400));
    }
    if (!data.length) console.log("  (rong)", r.text.slice(0, 200));
  } else {
    console.log(" ", r.text.slice(0, 600));
  }
}
