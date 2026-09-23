// Do do on dinh duong toi may chu dang nhap: nhieu luot, dem loi.
// Dung: node ops/_scratch/stability-login-hosts.mjs [so-luot]
const N = Number(process.argv[2] || 20);
const targets = [
  "https://api.meetflowai.site/v1/health",
  "https://t1.meetflowai.site/v1/health",
  "http://127.0.0.1:7778/v1/health", // chi co y nghia khi chay TREN node-2
];

for (const url of targets) {
  let ok = 0;
  const errors = [];
  const times = [];
  for (let i = 0; i < N; i += 1) {
    const s = Date.now();
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
      const t = await r.text();
      if (r.status === 200 && t.includes("ok")) {
        ok += 1;
        times.push(Date.now() - s);
      } else {
        errors.push(`HTTP ${r.status}`);
      }
    } catch (e) {
      errors.push(`${e.name}: ${e.cause?.message ?? e.message}`);
    }
    await new Promise((s2) => setTimeout(s2, 400));
  }
  times.sort((a, b) => a - b);
  console.log(`\n${url}`);
  console.log(`  OK ${ok}/${N} (${((ok / N) * 100).toFixed(0)}%)  min=${times[0] ?? "-"}ms  p50=${times[Math.floor(times.length / 2)] ?? "-"}ms  max=${times[times.length - 1] ?? "-"}ms`);
  if (errors.length) {
    const counts = {};
    for (const e of errors) counts[e] = (counts[e] ?? 0) + 1;
    for (const [e, c] of Object.entries(counts)) console.log(`  LOI x${c}: ${e}`);
  }
}
