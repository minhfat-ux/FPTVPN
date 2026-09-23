// Truy van Cloudflare Analytics cho api.meetflowai.site quanh cua so khach bao loi.
// Chay TREN node-2 (token CLOUDFLARE_API_TOKEN nam trong drop-in cua flowvpn-cp, khong in ra).
// Dung: cat file nay | ssh root@node-2 "cat > /tmp/cf-login-probe.mjs && node /tmp/cf-login-probe.mjs"
import fs from "node:fs";

const dir = "/etc/systemd/system/flowvpn-cp.service.d";
let token = "";
for (const f of fs.readdirSync(dir)) {
  const t = fs.readFileSync(`${dir}/${f}`, "utf8");
  const m = t.match(/CLOUDFLARE_API_TOKEN=(\S+)/);
  if (m) token = m[1].replace(/^"|"$/g, "").trim();
}
if (!token) {
  console.log("KHONG thay CLOUDFLARE_API_TOKEN");
  process.exit(1);
}
const H = { Authorization: `Bearer ${token}`, "content-type": "application/json" };

const zr = await fetch("https://api.cloudflare.com/client/v4/zones?per_page=50", { headers: H });
const zj = await zr.json();
if (!zj.success) {
  console.log("zones loi:", JSON.stringify(zj.errors));
  process.exit(1);
}
const zone = (zj.result || []).find((z) => z.name === "meetflowai.site");
console.log("zone:", zone?.id, zone?.name);
if (!zone) process.exit(1);

const START = process.argv[2] || "2026-09-23T13:30:00Z";
const END = process.argv[3] || "2026-09-23T15:30:00Z";
const HOST = "api.meetflowai.site";

const gql = async (label, query, variables) => {
  const r = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: H,
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  console.log(`\n== ${label} ==`);
  if (j.errors) {
    console.log("  errors:", JSON.stringify(j.errors).slice(0, 500));
    return null;
  }
  return j.data?.viewer?.zones?.[0] ?? null;
};

const base = `query($zone:String!,$start:Time!,$end:Time!,$host:String!){
  viewer { zones(filter:{zoneTag:$zone}) {`;

const byStatus = await gql(
  `httpRequestsAdaptiveGroups theo edgeResponseStatus (${START} -> ${END})`,
  base + `
    httpRequestsAdaptiveGroups(limit:50, filter:{datetime_geq:$start, datetime_leq:$end, clientRequestHTTPHost:$host}, orderBy:[count_DESC]){
      count dimensions { edgeResponseStatus originResponseStatus clientCountryName }
    } } } }`,
  { zone: zone.id, start: START, end: END, host: HOST }
);
for (const g of byStatus?.httpRequestsAdaptiveGroups ?? [])
  console.log(`  count=${String(g.count).padStart(6)} edge=${g.dimensions.edgeResponseStatus} origin=${g.dimensions.originResponseStatus} country=${g.dimensions.clientCountryName}`);

const byPath = await gql(
  `httpRequestsAdaptiveGroups theo clientRequestPath (chi /v1/auth/*)`,
  base + `
    httpRequestsAdaptiveGroups(limit:50, filter:{datetime_geq:$start, datetime_leq:$end, clientRequestHTTPHost:$host}, orderBy:[count_DESC]){
      count dimensions { clientRequestPath edgeResponseStatus clientCountryName }
    } } } }`,
  { zone: zone.id, start: START, end: END, host: HOST }
);
for (const g of byPath?.httpRequestsAdaptiveGroups ?? [])
  if (/auth|health|app-version/.test(g.dimensions.clientRequestPath))
    console.log(`  count=${String(g.count).padStart(6)} ${g.dimensions.clientRequestPath} edge=${g.dimensions.edgeResponseStatus} country=${g.dimensions.clientCountryName}`);

const fw = await gql(
  `firewallEventsAdaptiveGroups (WAF/block)`,
  base + `
    firewallEventsAdaptiveGroups(limit:50, filter:{datetime_geq:$start, datetime_leq:$end, clientRequestHTTPHost:$host}, orderBy:[count_DESC]){
      count dimensions { action source clientCountryName clientRequestPath }
    } } } }`,
  { zone: zone.id, start: START, end: END, host: HOST }
);
for (const g of fw?.firewallEventsAdaptiveGroups ?? [])
  console.log(`  count=${String(g.count).padStart(6)} action=${g.dimensions.action} source=${g.dimensions.source} country=${g.dimensions.clientCountryName} path=${g.dimensions.clientRequestPath}`);
if ((fw?.firewallEventsAdaptiveGroups ?? []).length === 0) console.log("  (khong co su kien WAF/block nao)");
