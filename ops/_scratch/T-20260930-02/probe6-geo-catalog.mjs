// Geo 2 node + catalog model cua app (neu doc duoc cong khai).
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

async function get(url, opts = {}) {
  try {
    const r = await fetch(url, {
      headers: { "user-agent": UA, accept: "application/json,*/*", ...(opts.headers || {}) },
      redirect: "follow",
      signal: AbortSignal.timeout(25000),
    });
    return { status: r.status, body: (await r.text()).slice(0, 900).replace(/\s+/g, " ") };
  } catch (e) {
    return { error: `${e.cause?.code || e.name}: ${e.message}` };
  }
}

for (const ip of ["165.101.114.162", "103.173.155.50"]) {
  const r = await get(`http://ip-api.com/json/${ip}?fields=query,country,countryCode,city,isp,org,as,proxy,hosting`);
  console.log(`${ip}: ${JSON.stringify(r)}`);
}

console.log("\n--- catalog model cua app ---");
for (const u of [
  "https://api.meetflowai.site/v1/models",
  "https://fbuddy.meetflowai.site/api/models",
  "https://fbuddy.meetflowai.site/api/settings",
  "https://console.meetflowai.site/api/models",
]) {
  const r = await get(u);
  console.log(`${u}\n   -> ${JSON.stringify(r)}`);
}
