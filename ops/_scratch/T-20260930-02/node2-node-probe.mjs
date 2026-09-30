// Chay TREN node-2: cung phep do nhu tu may Windows (node:https, UA Chrome) — de tach
// "IP bi chan" khoi "fingerprint cua curl bi chan".
import https from "node:https";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

function get(host, path, opts = {}) {
  return new Promise((resolve) => {
    const req = https.request(
      {
        host,
        path,
        method: opts.method || "GET",
        maxHeaderSize: 1024 * 1024,
        headers: {
          "user-agent": UA,
          accept: opts.accept || "*/*",
          "accept-language": "vi-VN,vi;q=0.9,en;q=0.8",
          "accept-encoding": "identity",
          ...(opts.headers || {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          resolve({
            status: res.statusCode,
            location: res.headers.location,
            server: res.headers.server,
            title: body.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim().slice(0, 60),
            head: body.slice(0, 120).replace(/\s+/g, " "),
          });
        });
      },
    );
    req.setTimeout(25000, () => { resolve({ error: "TIMEOUT" }); req.destroy(); });
    req.on("error", (e) => resolve({ error: e.code || e.message }));
    req.end(opts.body);
  });
}

const cases = [
  ["claude.ai/login", "claude.ai", "/login", { accept: "text/html,application/xhtml+xml" }],
  ["claude.ai/", "claude.ai", "/", { accept: "text/html,application/xhtml+xml" }],
  ["gemini.google.com/", "gemini.google.com", "/", { accept: "text/html,application/xhtml+xml" }],
  [
    "api.anthropic.com (key sai)",
    "api.anthropic.com",
    "/v1/messages",
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": "sk-ant-invalid-probe", "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 1, messages: [{ role: "user", content: "hi" }] }),
    },
  ],
  ["generativelanguage (key sai)", "generativelanguage.googleapis.com", "/v1beta/models?key=invalid-probe", {}],
];

for (const [label, host, path, opts] of cases) {
  const r = await get(host, path, opts);
  console.log(`${label.padEnd(30)} ${JSON.stringify(r)}`);
}
