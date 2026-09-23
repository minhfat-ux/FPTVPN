#!/usr/bin/env node
/**
 * asc-status.mjs — doc TRANG THAI THAT tren App Store Connect / TestFlight bang API (khong can Xcode, khong can Mac).
 * Chay TREN node-2 (khoa nam trong /root/flowvpn-cp/data/apple-asc.json), khong in ra private key.
 *
 *   node /tmp/asc-status.mjs
 */
import crypto from "node:crypto";
import fs from "node:fs";

const APP_ID = process.env.ASC_APP_ID ?? "6804150049";
const CRED = process.env.ASC_CRED ?? "/root/flowvpn-cp/data/apple-asc.json";
const d = JSON.parse(fs.readFileSync(CRED, "utf8"));
const KEY_ID = d.keyId;
const ISSUER = d.issuerId;

const b64 = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const head = b64({ alg: "ES256", kid: KEY_ID, typ: "JWT" });
const body = b64({ iss: ISSUER, iat: now, exp: now + 900, aud: "appstoreconnect-v1" });
const sig = crypto.sign("sha256", Buffer.from(`${head}.${body}`), { key: d.privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url");
const jwt = `${head}.${body}.${sig}`;

async function api(path) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  const text = await res.text();
  let json = {};
  try { json = JSON.parse(text); } catch { /* rong */ }
  return { status: res.status, json, text };
}

const app = await api(`/v1/apps/${APP_ID}`);
console.log(`[app] HTTP ${app.status}`, JSON.stringify(app.json?.data?.attributes ?? app.text.slice(0, 200)));

const builds = await api(`/v1/builds?filter[app]=${APP_ID}&limit=20&sort=-uploadedDate`);
console.log(`[builds] HTTP ${builds.status}`);
for (const b of builds.json?.data ?? []) {
  const a = b.attributes;
  console.log(
    `  build ${a.version} · preRelease ${b.relationships?.preReleaseVersion?.data?.id ?? "?"} · state=${a.processingState} · expired=${a.expired} · uploaded=${a.uploadedDate} · minOs=${a.minOsVersion} · icon?`,
  );
}
const pre = await api(`/v1/preReleaseVersions?filter[app]=${APP_ID}&limit=10&sort=-version`);
console.log(`[preReleaseVersions] HTTP ${pre.status}`);
for (const p of pre.json?.data ?? []) console.log(`  version ${p.attributes.version} platform=${p.attributes.platform} state=${p.attributes.appStoreState ?? "-"}`);

// Trang thai niem yet App Store (version dang cho duyet / da phat hanh)
const av = await api(`/v1/apps/${APP_ID}/appStoreVersions?limit=10`);
console.log(`[appStoreVersions] HTTP ${av.status}`);
for (const v of av.json?.data ?? []) {
  const a = v.attributes;
  console.log(`  version ${a.versionString} · state=${a.appStoreState} · platform=${a.platform} · created=${a.createdDate}`);
}
