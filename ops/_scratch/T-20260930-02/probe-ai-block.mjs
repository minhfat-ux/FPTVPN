// Do that: khach complain khong dung duoc Claude/Gemini khi bat VPN (bus #604 / T-20260930-02).
// Chay TREN MAY WINDOWS dang bat VPNFlow. In du lieu tho de ket luan, khong phan doan.
//
// Cach doc ket qua:
//   api.anthropic.com  401 = toi duoc Anthropic, chi sai key  => KHONG bi chan
//   api.anthropic.com  403 = bi chan theo vung/IP ("Request not allowed") => BI CHAN
//   generativelanguage.googleapis.com 400 "API key not valid" => KHONG bi chan
//   generativelanguage.googleapis.com 400 "User location is not supported" => BI CHAN
//   claude.ai / gemini.google.com: 403 + cf-mitigated: challenge = Cloudflare chan IP

import dns from "node:dns/promises";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

async function probe(label, url, opts = {}) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, {
      method: opts.method || "GET",
      redirect: "manual",
      headers: {
        "user-agent": opts.browser ? UA : "curl/8.5.0",
        accept: opts.accept || "*/*",
        ...(opts.headers || {}),
      },
      body: opts.body,
      signal: AbortSignal.timeout(opts.timeout ?? 25000),
    });
    let body = "";
    try {
      body = (await r.text()).slice(0, 600).replace(/\s+/g, " ").trim();
    } catch {}
    return {
      label,
      url,
      status: r.status,
      location: r.headers.get("location") || undefined,
      server: r.headers.get("server") || undefined,
      "cf-mitigated": r.headers.get("cf-mitigated") || undefined,
      "cf-ray": r.headers.get("cf-ray") || undefined,
      ms: Date.now() - t0,
      body,
    };
  } catch (e) {
    return { label, url, error: `${e.name}: ${e.message}`, ms: Date.now() - t0 };
  }
}

const HOSTS = [
  "claude.ai",
  "api.anthropic.com",
  "gemini.google.com",
  "generativelanguage.googleapis.com",
  "aistudio.google.com",
  "chatgpt.com",
  "www.google.com",
  "meetflowai.site",
];

console.log("=== 1. DNS ===");
for (const host of HOSTS) {
  try {
    const v4 = await dns.resolve4(host);
    console.log(`OK    ${host} -> ${v4.join(", ")}`);
  } catch (e) {
    console.log(`FAIL  ${host} -> ${e.code || e.message}`);
  }
}

console.log("\n=== 2. Egress + danh tieng IP ra Internet ===");
const egress = await probe("egress", "https://api.ipify.org?format=json");
console.log(JSON.stringify(egress));
let ip = null;
try {
  ip = JSON.parse(egress.body).ip;
} catch {}

if (ip && /^[\d.]+$/.test(ip)) {
  const geo = await probe(
    "geo",
    `http://ip-api.com/json/${ip}?fields=status,country,countryCode,regionName,city,isp,org,as,asname,proxy,hosting,mobile`,
  );
  console.log(JSON.stringify(geo));
}

console.log("\n=== 3. Claude ===");
console.log(
  JSON.stringify(
    await probe("claude.ai", "https://claude.ai/", { browser: true, accept: "text/html,application/xhtml+xml" }),
  ),
);
console.log(
  JSON.stringify(
    await probe("api.anthropic.com (key sai)", "https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "sk-ant-invalid-probe-key",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 1, messages: [{ role: "user", content: "hi" }] }),
    }),
  ),
);

console.log("\n=== 4. Gemini ===");
console.log(
  JSON.stringify(
    await probe("gemini.google.com", "https://gemini.google.com/", {
      browser: true,
      accept: "text/html,application/xhtml+xml",
    }),
  ),
);
console.log(
  JSON.stringify(
    await probe("generativelanguage.googleapis.com (key sai)", "https://generativelanguage.googleapis.com/v1beta/models?key=invalid-probe-key"),
  ),
);
console.log(
  JSON.stringify(
    await probe("aistudio.google.com", "https://aistudio.google.com/", {
      browser: true,
      accept: "text/html,application/xhtml+xml",
    }),
  ),
);

console.log("\n=== 5. Doi chung (khong phai Claude/Gemini) ===");
console.log(JSON.stringify(await probe("chatgpt.com", "https://chatgpt.com/", { browser: true })));
console.log(JSON.stringify(await probe("www.google.com", "https://www.google.com/", { browser: true })));
console.log(JSON.stringify(await probe("api.openai.com/v1/models", "https://api.openai.com/v1/models")));
