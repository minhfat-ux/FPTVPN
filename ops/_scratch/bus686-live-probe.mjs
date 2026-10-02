// Evidence cho bus-686: xac nhan backend that (api.meetflowai.site/meetflow) van
// chay du client khong con key provider. In ra KHONG kem gia tri key.
const base = "https://api.meetflowai.site/meetflow";

async function call(method, path, body) {
  const r = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const text = await r.text();
  return { status: r.status, text };
}

const health = await call("GET", "/health");
console.log(`GET  /health  -> ${health.status} ${health.text.slice(0, 60)}`);

const tmp = await call("POST", "/tmp-key", { clientReferenceId: "fchina-translator-win" });
let tmpDesc = tmp.text.slice(0, 40);
try {
  const j = JSON.parse(tmp.text);
  tmpDesc = `api_key=<${String(j.api_key || "").length} chars, prefix ${String(j.api_key || "").slice(0, 4)}...>, expires_at=${j.expires_at}`;
} catch {}
console.log(`POST /tmp-key -> ${tmp.status} ${tmpDesc}`);

const summary = await call("POST", "/summary", {
  format: "meeting_minutes",
  targetLanguage: "vi",
  segments: [
    { speaker: "Speaker 1", language: "en", originalText: "We agreed to move provider keys to the backend.", translatedText: "Chung ta dong y chuyen key nha cung cap ve backend." },
  ],
});
let summaryDesc = summary.text.slice(0, 100);
try {
  const j = JSON.parse(summary.text);
  summaryDesc = `provider=${j.provider} model=${j.model} summary=<${String(j.summary || "").length} chars>`;
} catch {}
console.log(`POST /summary -> ${summary.status} ${summaryDesc}`);

const chat = await call("POST", "/chat", { question: "What did we agree?", context: "[Speaker 1] (en) We agreed to move provider keys to the backend." });
let chatDesc = chat.text.slice(0, 100);
try {
  const j = JSON.parse(chat.text);
  chatDesc = `provider=${j.provider} answer=<${String(j.answer || "").length} chars>`;
} catch {}
console.log(`POST /chat    -> ${chat.status} ${chatDesc}`);
