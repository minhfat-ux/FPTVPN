import crypto from "node:crypto";
import fs from "node:fs";

const APP_ID = "6804150049";
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

for (const p of [
  `/v1/ciProducts?filter[app]=${APP_ID}`,
  `/v1/certificates?limit=20`,
  `/v1/devices?limit=200`,
  `/v1/bundleIds?filter[identifier]=com.privatevpn.app`,
]) {
  const r = await api(p);
  console.log("=".repeat(60));
  console.log(p, "->", r.status);
  const data = r.json?.data;
  if (Array.isArray(data)) {
    for (const it of data) {
      const a = it.attributes ?? {};
      const brief = { ...a };
      if (brief.certificateContent) brief.certificateContent = `<${brief.certificateContent.length} chars>`;
      if (brief.csrContent) brief.csrContent = `<${brief.csrContent.length} chars>`;
      console.log(" ", it.type, it.id, JSON.stringify(brief).slice(0, 300));
    }
  } else {
    console.log(" ", r.text.slice(0, 400));
  }
}
