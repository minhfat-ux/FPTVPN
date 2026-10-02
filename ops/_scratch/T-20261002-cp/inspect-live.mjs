// In ra các link/href liên quan trên trang /ai/buy và /buy đang phát công khai.
const urls = [
  "https://t1.meetflowai.site/ai/buy?lang=vi",
  "https://t1.meetflowai.site/ai/buy?lang=en",
  "https://t1.meetflowai.site/buy?lang=vi",
  "https://meetflowai.site/ai/buy?lang=vi",
];
for (const u of urls) {
  try {
    const res = await fetch(u, { redirect: "follow" });
    const html = await res.text();
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]).filter((h) => /dl\/|downloads|Overlay|Setup/.test(h));
    console.log(`\n=== ${u} -> ${res.status} (${html.length} bytes)`);
    for (const h of [...new Set(hrefs)]) console.log("   ", h);
    const labels = [...html.matchAll(/<label>([^<]*)<\/label>/g)].map((m) => m[1]);
    console.log("    labels:", JSON.stringify(labels));
  } catch (err) {
    console.log(`\n=== ${u} -> ERR ${err?.message ?? err}`);
  }
}
