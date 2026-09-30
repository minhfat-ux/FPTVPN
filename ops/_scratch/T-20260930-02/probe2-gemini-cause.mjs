// Dao sau: vi sao gemini.google.com that bai qua VPN (T-20260930-02).
import tls from "node:tls";
import dns from "node:dns/promises";

function chain(e) {
  const out = [];
  let cur = e;
  let depth = 0;
  while (cur && depth < 6) {
    out.push(`${cur.name || "Error"}: ${cur.message}${cur.code ? ` [${cur.code}]` : ""}${cur.errno ? ` errno=${cur.errno}` : ""}`);
    cur = cur.cause;
    depth += 1;
  }
  return out;
}

async function attempt(host, url) {
  try {
    const r = await fetch(url, {
      redirect: "manual",
      headers: { "user-agent": "curl/8.5.0", accept: "*/*" },
      signal: AbortSignal.timeout(20000),
    });
    return `OK status=${r.status}`;
  } catch (e) {
    return chain(e).join("  <-  ");
  }
}

console.log("=== fetch lai nhieu lan ===");
for (const host of ["gemini.google.com", "www.google.com", "claude.ai"]) {
  for (let i = 1; i <= 3; i += 1) {
    console.log(`${host} lan ${i}: ${await attempt(host, `https://${host}/`)}`);
  }
}

console.log("\n=== TLS handshake tay (node:tls) ===");
async function tlsProbe(host) {
  const addrs = await dns.resolve4(host).catch(() => []);
  const ip = addrs[0];
  return await new Promise((resolve) => {
    const t0 = Date.now();
    const socket = tls.connect(
      { host: ip, servername: host, port: 443, timeout: 20000, rejectUnauthorized: false },
      () => {
        const cert = socket.getPeerCertificate();
        resolve(
          `OK ip=${ip} proto=${socket.getProtocol()} cipher=${socket.getCipher()?.name} subject=${cert.subject?.CN} issuer=${cert.issuer?.O} ms=${Date.now() - t0}`,
        );
        socket.destroy();
      },
    );
    socket.on("error", (e) => resolve(`FAIL ip=${ip} ${e.code || e.name}: ${e.message} ms=${Date.now() - t0}`));
    socket.on("timeout", () => {
      resolve(`TIMEOUT ip=${ip} ms=${Date.now() - t0}`);
      socket.destroy();
    });
  });
}
for (const host of ["gemini.google.com", "www.google.com", "claude.ai", "chatgpt.com"]) {
  console.log(`${host}: ${await tlsProbe(host)}`);
}

console.log("\n=== Cac dich vu thay IP nay o dau ===");
for (const [label, url] of [
  ["cloudflare-trace", "https://www.cloudflare.com/cdn-cgi/trace"],
  ["ipinfo.io", "https://ipinfo.io/json"],
  ["ipapi.co", "https://ipapi.co/json/"],
]) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { "user-agent": "curl/8.5.0" } });
    const t = await r.text();
    console.log(`--- ${label} (${r.status}) ---`);
    console.log(t.slice(0, 700).replace(/\n{2,}/g, "\n"));
  } catch (e) {
    console.log(`--- ${label}: ${chain(e).join(" <- ")}`);
  }
}
