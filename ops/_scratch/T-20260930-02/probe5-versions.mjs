// Ban phat hanh that + trang buy (node fetch — .NET/schannel trong harness nay hong, khong dung duoc).
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

async function get(url, opts = {}) {
  try {
    const r = await fetch(url, {
      headers: { "user-agent": UA, accept: "*/*", ...(opts.headers || {}) },
      redirect: "follow",
      signal: AbortSignal.timeout(25000),
    });
    return { url, status: r.status, type: r.headers.get("content-type"), body: (await r.text()).slice(0, 400) };
  } catch (e) {
    return { url, error: `${e.cause?.code || e.name}: ${e.message}` };
  }
}

for (const pl of ["windows", "android", "ios", "macos"]) {
  const r = await get(`https://api.meetflowai.site/v1/app-version?platform=${pl}`);
  console.log(`app-version ${pl}: ${JSON.stringify(r)}`);
}
console.log("");
for (const u of ["https://meetflowai.site/dl/", "https://meetflowai.site/buy", "https://meetflowai.site/"]) {
  const r = await get(u);
  console.log(`--- ${u} -> ${r.status ?? r.error} (${r.type ?? ""})`);
  if (r.body) console.log(`    ${r.body.replace(/\s+/g, " ").slice(0, 220)}`);
}
