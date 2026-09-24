#!/usr/bin/env node
// Đọc trạng thái một phiên nộp build (buildUploads) + stateDetail lỗi của Apple.
//   node ops/_scratch/asc-upload-state.mjs <buildUploadId>
import fs from "node:fs";
import crypto from "node:crypto";

const APP_ID = process.env.ASC_APP_ID ?? "6804150049";
const CRED = process.env.ASC_CRED ?? "/root/flowvpn-cp/data/apple-asc.json";
const API = "https://api.appstoreconnect.apple.com";
const id = process.argv[2];
if (!id) { console.error("usage: asc-upload-state.mjs <buildUploadId>"); process.exit(2); }

const d = JSON.parse(fs.readFileSync(CRED, "utf8"));
const b64 = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const head = b64({ alg: "ES256", kid: d.keyId, typ: "JWT" });
const body = b64({ iss: d.issuerId, iat: now, exp: now + 900, aud: "appstoreconnect-v1" });
const sig = crypto.sign("sha256", Buffer.from(`${head}.${body}`), { key: d.privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url");
const jwt = `${head}.${body}.${sig}`;

async function api(path) {
  const r = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${jwt}` } });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text };
}

const up = await api(`/v1/buildUploads/${id}`);
console.log(`[buildUpload ${id}] HTTP ${up.status}`);
console.log(JSON.stringify(up.json?.data?.attributes ?? up.text.slice(0, 600), null, 2));
console.log("relationships:", JSON.stringify(up.json?.data?.relationships ?? null));

const files = await api(`/v1/buildUploads/${id}/buildUploadFiles`);
console.log(`\n[buildUploadFiles] HTTP ${files.status}`);
for (const f of files.json?.data ?? []) {
  console.log(JSON.stringify({ id: f.id, ...f.attributes }, null, 2));
}

const all = await api(`/v1/apps/${APP_ID}/buildUploads?limit=10`);
console.log(`\n[app buildUploads] HTTP ${all.status}`);
for (const u of all.json?.data ?? []) {
  const a = u.attributes ?? {};
  console.log(`  ${u.id} state=${a.state} v=${a.cfBundleShortVersionString} b=${a.cfBundleVersion} created=${a.createdDate} detail=${JSON.stringify(a.stateDetail ?? null)}`);
}

const builds = await api(`/v1/builds?filter[app]=${APP_ID}&limit=5&sort=-uploadedDate`);
console.log(`\n[builds] HTTP ${builds.status}`);
for (const b of builds.json?.data ?? []) console.log(`  build ${b.attributes.version} state=${b.attributes.processingState} uploaded=${b.attributes.uploadedDate}`);
