const base = "https://api.meetflowai.site/meetflow";

async function probe(method, path, body, headers = {}) {
  const url = base + path;
  try {
    const r = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", ...headers },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
    const text = await r.text();
    console.log(`=== ${method} ${path} -> ${r.status}`);
    console.log(text.slice(0, 500));
  } catch (e) {
    console.log(`=== ${method} ${path} -> ERR ${e.message}`);
  }
}

await probe("GET", "/health");
await probe("POST", "/tmp-key", { clientReferenceId: "fchina-translator-win" });
await probe("POST", "/summary", { format: "meeting_minutes", targetLanguage: "vi", segments: [{ speaker: "Speaker 1", language: "en", originalText: "hello", translatedText: "xin chao" }] });
await probe("POST", "/chat", { question: "q", context: "c" });
