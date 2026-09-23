// Kiem tra DOC LAP duong build iOS KHONG can may Mac (Xcode Cloud) bang API App Store Connect.
// Chay TREN node-2: node /tmp/asc-ci-verify.mjs
import crypto from "node:crypto";
import fs from "node:fs";

const APP_ID = process.env.ASC_APP_ID ?? "6804150049";
const CRED = process.env.ASC_CRED ?? "/root/flowvpn-cp/data/apple-asc.json";
const d = JSON.parse(fs.readFileSync(CRED, "utf8"));

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

const prod = await api(`/v1/ciProducts?filter[app]=${APP_ID}`);
console.log(`[ciProducts] HTTP ${prod.status}`);
for (const p of prod.json?.data ?? []) {
  console.log(`  ${p.id}  name=${p.attributes?.name}  type=${p.attributes?.productType}  created=${p.attributes?.createdDate}`);
}
const productId = prod.json?.data?.[0]?.id;
if (!productId) {
  console.log("KHONG co ciProduct => Xcode Cloud chua duoc cau hinh cho app nay.");
  process.exit(0);
}

const wf = await api(`/v1/ciProducts/${productId}/workflows`);
console.log(`[workflows] HTTP ${wf.status}`);
for (const w of wf.json?.data ?? []) {
  const a = w.attributes ?? {};
  console.log(`  ${w.id} name=${a.name} enabled=${a.isEnabled} container=${a.containerFilePath}`);
  const sc = a.branchStartCondition ?? a.startConditions?.branchStartCondition;
  if (sc) console.log(`     branchStartCondition pattern=${JSON.stringify(sc.pattern)} autoCancel=${sc.autoCancel}`);
  else console.log(`     startConditions=${JSON.stringify(a.startConditions ?? null)}`);
  const actions = (a.actions ?? []).map((x) => `${x.name}[${x.actionType}/${x.platform ?? "-"}] scheme=${x.scheme} required=${x.isRequiredToPass}`);
  console.log(`     actions: ${actions.join(" | ") || "(khong doc duoc trong list)"}`);
}

const runs = await api(`/v1/ciProducts/${productId}/buildRuns?limit=5`);
console.log(`[buildRuns] HTTP ${runs.status}  count=${runs.json?.data?.length ?? 0}`);
for (const r of runs.json?.data ?? []) {
  const a = r.attributes ?? {};
  console.log(`  ${r.id} number=${a.number} progress=${a.executionProgress} completion=${a.completionStatus} started=${a.startedDate ?? a.createdDate}`);
}

const repos = await api(`/v1/ciProducts/${productId}/primaryRepositories`);
console.log(`[primaryRepositories] HTTP ${repos.status}`);
for (const r of repos.json?.data ?? []) {
  console.log(`  ${r.id} ${r.attributes?.httpCloneUrl} lastAccessed=${r.attributes?.lastAccessedDate}`);
}

const certs = await api(`/v1/certificates?limit=50`);
console.log(`[certificates] HTTP ${certs.status}`);
for (const c of certs.json?.data ?? []) {
  const a = c.attributes ?? {};
  console.log(`  ${a.certificateType}  ${a.displayName}  expires=${a.expirationDate}`);
}

const devs = await api(`/v1/devices?limit=50`);
console.log(`[devices] HTTP ${devs.status} count=${devs.json?.data?.length ?? 0}`);
for (const v of devs.json?.data ?? []) {
  console.log(`  ${v.attributes?.udid}  ${v.attributes?.name}  ${v.attributes?.platform}  ${v.attributes?.status}`);
}

const groups = await api(`/v1/betaGroups?limit=30`);
console.log(`[betaGroups] HTTP ${groups.status}`);
for (const g of groups.json?.data ?? []) {
  console.log(`  ${g.attributes?.name}  publicLink=${g.attributes?.publicLinkEnabled ? g.attributes?.publicLink : "-"}`);
}
