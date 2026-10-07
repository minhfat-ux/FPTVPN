// Rà version Android phát cho TV/box vs latest code (T-20261007-01, bus #829).
// Chạy: node ops/_scratch/tvbox-version-probe.mjs
const UA = { "user-agent": "FlowTechProbe/1.0" };

async function probe(url, opts = {}) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(45000), ...opts });
    const text = opts.method === "HEAD" ? "" : await res.text();
    return { url, status: res.status, ms: Date.now() - t0, len: res.headers.get("content-length"), type: res.headers.get("content-type"), last: res.headers.get("last-modified"), etag: res.headers.get("etag"), text };
  } catch (e) {
    return { url, error: `${e.name}: ${e.message}${e.cause ? " / " + (e.cause.code || e.cause.message) : ""}`, ms: Date.now() - t0 };
  }
}

const endpoints = [
  "https://api.meetflowai.site/v1/ai/app-version",
  "https://api.meetflowai.site/v1/ai/downloads/android",
  "https://t1.meetflowai.site/v1/downloads/android",
  "https://t1.meetflowai.site/v1/downloads/android-legacy",
  "https://t1.meetflowai.site/v1/ai/downloads/android",
  "https://api.meetflowai.site/v1/ai/app-version?platform=android",
];

console.log("========== ENDPOINT VERSION ==========");
for (const url of endpoints) {
  const r = await probe(url);
  console.log(`\n--- ${url}\n  ${r.error ? "LOI " + r.error : `status=${r.status} ${r.ms}ms len=${r.len} type=${r.type}`}`);
  if (r.text) console.log("  body: " + r.text.replace(/\s+/g, " ").slice(0, 1200));
}

console.log("\n========== TRANG WEB: chip tai ==========");
for (const page of ["https://meetflowai.site/", "https://meetflowai.site/buy", "https://meetflowai.site/ai/buy"]) {
  const r = await probe(page);
  if (r.error) { console.log(`LOI ${r.error} ${page}`); continue; }
  const hrefs = [...new Set([...r.text.matchAll(/href="([^"]+)"/g)].map((m) => m[1]))].filter((h) => /dl\/|\/downloads\/|\.apk|\.exe|install\//i.test(h));
  console.log(`\n--- ${page} status=${r.status} len=${r.text.length}`);
  for (const h of hrefs) console.log(`    ${h}`);
  const tv = /Android TV/i.test(r.text);
  console.log(`    (co chu 'Android TV': ${tv})`);
}

console.log("\n========== HEAD cac file phat cho TV/box ==========");
const files = [
  "https://meetflowai.site/dl/VPNFlow-tv-latest.apk",
  "https://t1.meetflowai.site/dl/VPNFlow-tv-latest.apk",
  "https://meetflowai.site/dl/tv/FPTPlay-TV-7.34.13-ottbox.xapk",
  "https://meetflowai.site/dl/tv/FPTPlay-TV-7.34.13-universal.apk",
];
for (const url of files) {
  const r = await probe(url, { method: "HEAD" });
  console.log(`${r.error ? "LOI " + r.error : `status=${r.status} len=${r.len} type=${r.type} last=${r.last}`}\n     ${url}`);
}
