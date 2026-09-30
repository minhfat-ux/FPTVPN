// gemini.google.com / claude.ai qua VPN — doc THAT bang client chiu duoc header lon (node:https + maxHeaderSize).
import https from "node:https";
import dns from "node:dns/promises";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

function request(host, path = "/") {
  return new Promise(async (resolve) => {
    const t0 = Date.now();
    let ip = null;
    try {
      ip = (await dns.resolve4(host))[0];
    } catch {}
    const req = https.request(
      {
        host,
        servername: host,
        path,
        method: "GET",
        maxHeaderSize: 1024 * 1024,
        headers: {
          "user-agent": UA,
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
          "accept-encoding": "identity",
          "upgrade-insecure-requests": "1",
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => {
          if (Buffer.concat(chunks).length < 200000) chunks.push(c);
        });
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          const headerNames = Object.keys(res.headers);
          const cookies = res.headers["set-cookie"]?.length ?? 0;
          const title = raw.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "";
          resolve({
            host,
            ip,
            status: res.statusCode,
            ms: Date.now() - t0,
            headerCount: headerNames.length,
            headerBytes: JSON.stringify(res.headers).length,
            setCookie: cookies,
            location: res.headers.location,
            title: title.trim().slice(0, 120),
            // dau hieu chan theo vung/mien
            signals: [
              /not available in your (country|region)/i.test(raw) ? "NOT_AVAILABLE_IN_COUNTRY" : null,
              /isn't currently supported in your country/i.test(raw) ? "UNSUPPORTED_COUNTRY" : null,
              /unusual traffic/i.test(raw) ? "UNUSUAL_TRAFFIC" : null,
              /sorry\/index/i.test(raw) ? "GOOGLE_SORRY_CAPTCHA" : null,
              /cf-mitigated|Just a moment|challenge-platform/i.test(raw) ? "CF_CHALLENGE" : null,
            ].filter(Boolean),
            bodyHead: raw.slice(0, 300).replace(/\s+/g, " ").trim(),
          });
        });
      },
    );
    req.setTimeout(30000, () => {
      resolve({ host, ip, error: `TIMEOUT after ${Date.now() - t0}ms` });
      req.destroy();
    });
    req.on("error", (e) => resolve({ host, ip, error: `${e.code || e.name}: ${e.message}`, ms: Date.now() - t0 }));
    req.end();
  });
}

for (const [host, path] of [
  ["gemini.google.com", "/"],
  ["claude.ai", "/"],
  ["claude.ai", "/login"],
  ["generativelanguage.googleapis.com", "/v1beta/models?key=invalid-probe-key"],
  ["aistudio.google.com", "/"],
  ["www.google.com", "/"],
  ["chatgpt.com", "/"],
]) {
  const r = await request(host, path);
  console.log(`--- ${host}${path} ---`);
  console.log(JSON.stringify(r, null, 1));
}
