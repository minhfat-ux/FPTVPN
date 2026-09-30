// Ket luan: Claude/Gemini nhin thay IP nao? (T-20260930-02)
import https from "node:https";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

function get(host, path) {
  return new Promise((resolve) => {
    const req = https.request(
      { host, path, method: "GET", maxHeaderSize: 1024 * 1024, headers: { "user-agent": UA, accept: "*/*", "accept-encoding": "identity" } },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve({ host, path, status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
      },
    );
    req.setTimeout(25000, () => { resolve({ host, path, error: "TIMEOUT" }); req.destroy(); });
    req.on("error", (e) => resolve({ host, path, error: e.code || e.message }));
    req.end();
  });
}

// Cloudflare dung cho ca claude.ai va chatgpt.com -> loc = quoc gia ma Anthropic/OpenAI NHIN THAY
for (const [host, path, label] of [
  ["claude.ai", "/cdn-cgi/trace", "claude.ai (Cloudflare) — quoc gia Anthropic thay"],
  ["chatgpt.com", "/cdn-cgi/trace", "chatgpt.com (Cloudflare) — doi chung"],
  ["meetflowai.site", "/cdn-cgi/trace", "meetflowai.site (Cloudflare) — doi chung"],
]) {
  const r = await get(host, path);
  console.log(`--- ${label} [${host}${path}] ---`);
  if (r.error) console.log(`  LOI: ${r.error}`);
  else {
    const keep = r.body.split("\n").filter((l) => /^(ip|loc|colo|warp|gateway|http|tls)=/.test(l));
    console.log(`  status=${r.status}`);
    for (const l of keep) console.log(`  ${l.trim()}`);
  }
}

// Google tra ve ngon ngu nao cho gemini (lang="vi" = phuc vu thi truong VN)
const g = await get("gemini.google.com", "/");
console.log("--- gemini.google.com/ ---");
console.log(`  status=${g.status} lang=${g.body?.match(/<html[^>]*lang="([^"]+)"/)?.[1] ?? "?"}`);
console.log(`  dau hieu chan vung: ${/not available in your|isn't currently supported/i.test(g.body || "") ? "CO" : "khong"}`);
