// Đo kênh phát VPNFlow Android (phone/legacy/TV) + endpoint version — T-20261007-01.
const UA = { "user-agent": "FlowTechProbe/1.0" };

async function get(url, opts = {}) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(120000), ...opts });
    const ct = res.headers.get("content-type") ?? "";
    let body = "";
    if (!opts.method) {
      if (/json|text/i.test(ct)) body = (await res.text()).slice(0, 800);
      else body = `(binary ${res.headers.get("content-length")}B)`;
    }
    return `status=${res.status} ${Date.now() - t0}ms len=${res.headers.get("content-length")} type=${ct} last=${res.headers.get("last-modified")} etag=${res.headers.get("etag")} ${body ? "\n      " + body.replace(/\s+/g, " ") : ""}`;
  } catch (e) {
    return `LOI ${Date.now() - t0}ms ${e.name}: ${e.message}${e.cause ? " / " + (e.cause.code || e.cause.message) : ""}`;
  }
}

const targets = [
  ["app-version vpn android", "https://api.meetflowai.site/v1/app-version?platform=android", {}],
  ["app-version vpn all", "https://api.meetflowai.site/v1/app-version", {}],
  ["HEAD vpn modern (api)", "https://api.meetflowai.site/v1/downloads/android", { method: "HEAD" }],
  ["HEAD vpn legacy (api)", "https://api.meetflowai.site/v1/downloads/android-legacy", { method: "HEAD" }],
  ["HEAD vpn modern (t1)", "https://t1.meetflowai.site/v1/downloads/android", { method: "HEAD" }],
  ["HEAD vpn legacy (t1)", "https://t1.meetflowai.site/v1/downloads/android-legacy", { method: "HEAD" }],
  ["HEAD vpn modern (site)", "https://meetflowai.site/v1/downloads/android", { method: "HEAD" }],
  ["HEAD vpn legacy (site)", "https://meetflowai.site/v1/downloads/android-legacy", { method: "HEAD" }],
  ["HEAD tv apk", "https://meetflowai.site/dl/VPNFlow-tv-latest.apk", { method: "HEAD" }],
  ["HEAD tv test v36", "https://meetflowai.site/dl/test/VPNFlow-tv-v36.apk", { method: "HEAD" }],
];

for (const [label, url, opts] of targets) {
  console.log(`\n--- ${label}\n    ${url}\n    ${await get(url, opts)}`);
}
