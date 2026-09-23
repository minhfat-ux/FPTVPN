import crypto from "node:crypto";
import fs from "node:fs";

const W = "27EF970F-C793-44CA-BEE4-166E242DC7E7";
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

const w = await api(`/v1/ciWorkflows/${W}`);
console.log("workflow:", w.status, JSON.stringify(w.json?.data?.attributes ?? {}, null, 1));

const acts = await api(`/v1/ciWorkflows/${W}/actions`);
console.log("actions:", acts.status);
for (const a of acts.json?.data ?? []) {
  console.log("  ", a.type, a.id, JSON.stringify(a.attributes ?? {}).slice(0, 300));
  console.log("     rel:", JSON.stringify(a.relationships ?? {}).slice(0, 400));
}

const repo = await api(`/v1/scmRepositories/1a24ebda-db04-47e8-bf5f-e8c9a554c4d6`);
console.log("repo:", repo.status, JSON.stringify(repo.json?.data?.attributes ?? {}).slice(0, 300));

// cac nhom beta (TestFlight)
const groups = await api(`/v1/betaGroups?limit=20`);
console.log("betaGroups:", groups.status);
for (const g of groups.json?.data ?? []) console.log("  ", g.id, g.attributes?.name, "internal=", g.attributes?.isInternalGroup, "publicLink=", g.attributes?.publicLink);
