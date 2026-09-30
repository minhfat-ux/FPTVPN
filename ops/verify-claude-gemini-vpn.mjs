// Nghiệm thu T-20260930-02 (chủ dự án, bus #604):
//   "kiểm tra: khách complain không dùng được claude và gemini khi vpn"
//
// Chạy TRÊN MÁY ĐANG BẬT VPNFlow:   node ops/verify-claude-gemini-vpn.mjs
// (chạy được cả trên VPS node-2 để đối chứng: cùng IP ra Internet, khác đường đi)
//
// CÂU HỎI PHẢI TRẢ LỜI: đường hầm VPN có chặn Claude/Gemini không?
//
// Kết luận máy đọc:
//   PASS  endpoint trả lời được  => VPN KHÔNG chặn
//   FAIL  không kết nối / 403     => có chặn thật, phải điều tra tiếp
//
// LƯU Ý KỸ THUẬT (đã trả giá, đừng "sửa" lại):
//   - KHÔNG dùng `fetch`/undici để đo: gemini.google.com trả ~28 KB header > mức 16 KB mặc định
//     của undici ⇒ `UND_ERR_HEADERS_OVERFLOW` và bị báo oan là "fetch failed". Dùng `node:https`
//     với `maxHeaderSize` lớn.
//   - KHÔNG dùng `curl`/`Invoke-WebRequest` để kết luận: TLS fingerprint của curl bị Cloudflare
//     bot-management trả 403 trên claude.ai DÙ IP sạch (đo được: cùng IP, curl=403, node=200).
//   - Không dùng mã HTTP của API để đo vùng: 401 (Anthropic) / 400 (Google) nghĩa là
//     "tới được API, chỉ sai khoá" ⇒ đạt. 403 mới là chặn.

import https from "node:https";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

const results = [];
const ok = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

function httpsGet(host, path, options = {}) {
  return new Promise((resolve) => {
    const started = Date.now();
    const req = https.request(
      {
        host,
        path,
        method: options.method ?? "GET",
        maxHeaderSize: 1024 * 1024,
        headers: {
          "user-agent": UA,
          accept: options.accept ?? "*/*",
          "accept-language": "vi-VN,vi;q=0.9,en;q=0.8",
          "accept-encoding": "identity",
          ...(options.headers ?? {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => {
          if (Buffer.concat(chunks).length < 65536) chunks.push(chunk);
        });
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          resolve({
            status: res.statusCode,
            location: res.headers.location,
            title: body.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim().slice(0, 60) ?? "",
            ms: Date.now() - started,
            body,
          });
        });
      },
    );
    req.setTimeout(30000, () => {
      resolve({ error: `TIMEOUT sau ${Date.now() - started} ms` });
      req.destroy();
    });
    req.on("error", (error) => resolve({ error: `${error.code || error.name}: ${error.message}` }));
    req.end(options.body);
  });
}

// ------------------------------------------------------------------ 1. IP ra Internet
let egress = null;
try {
  const response = await fetch("https://api.ipify.org?format=json", { signal: AbortSignal.timeout(20000) });
  egress = (await response.json())?.ip ?? null;
} catch (error) {
  egress = `lỗi: ${error.message}`;
}
console.log(`INFO  IP ra Internet = ${egress}`);
console.log(`INFO  (máy Windows bật VPN thì IP này phải là IP VPS; trên VPS thì là chính nó)`);

// ------------------------------------------------------------------ 2. Claude
const claudeLogin = await httpsGet("claude.ai", "/login", { accept: "text/html,application/xhtml+xml" });
ok(
  "claude.ai/login trả lời được",
  typeof claudeLogin.status === "number" && claudeLogin.status < 400,
  claudeLogin.error ?? `status=${claudeLogin.status} title="${claudeLogin.title}" ${claudeLogin.ms}ms`,
);

const anthropicApi = await httpsGet("api.anthropic.com", "/v1/messages", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-api-key": "sk-ant-invalid-probe",
    "anthropic-version": "2023-06-01",
  },
  body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 1, messages: [{ role: "user", content: "hi" }] }),
});
// 401 = tới được Anthropic (chỉ sai khoá). 403 = bị chặn theo vùng/IP.
ok(
  "api.anthropic.com tới được (401 = sai khoá, không phải chặn)",
  anthropicApi.status === 401,
  anthropicApi.error ?? `status=${anthropicApi.status} body=${String(anthropicApi.body ?? "").slice(0, 90)}`,
);

// ------------------------------------------------------------------ 3. Gemini
const gemini = await httpsGet("gemini.google.com", "/", { accept: "text/html,application/xhtml+xml" });
ok(
  "gemini.google.com trả lời được",
  typeof gemini.status === "number" && gemini.status < 400,
  gemini.error ?? `status=${gemini.status} title="${gemini.title}" ${gemini.ms}ms`,
);

const genLangApi = await httpsGet("generativelanguage.googleapis.com", "/v1beta/models?key=invalid-probe");
// 400 = tới được Google API (chỉ sai khoá). 403 = bị chặn.
ok(
  "generativelanguage.googleapis.com tới được (400 = sai khoá, không phải chặn)",
  genLangApi.status === 400,
  genLangApi.error ?? `status=${genLangApi.status}`,
);

// ------------------------------------------------------------------ 4. Danh tiếng IP + quốc gia (thông tin, không chặn cứng)
if (egress && /^[\d.]+$/.test(String(egress))) {
  try {
    const response = await fetch(
      `http://ip-api.com/json/${egress}?fields=country,countryCode,city,isp,proxy,hosting`,
      { signal: AbortSignal.timeout(20000) },
    );
    const geo = await response.json();
    console.log(
      `INFO  IP ${egress}: ${geo.countryCode} ${geo.city} · ${geo.isp} · proxy=${geo.proxy} hosting=${geo.hosting}`,
    );
    ok("IP ra Internet KHÔNG bị gắn cờ proxy/hosting", geo.proxy === false && geo.hosting === false, JSON.stringify(geo));
  } catch (error) {
    console.log(`INFO  không tra được danh tiếng IP: ${error.message}`);
  }
}

try {
  const trace = await httpsGet("claude.ai", "/cdn-cgi/trace");
  const loc = String(trace.body ?? "").match(/^loc=(\S+)/m)?.[1];
  console.log(`INFO  Cloudflare (thứ Anthropic nhìn thấy) báo quốc gia: loc=${loc ?? "?"}`);
} catch (error) {
  console.log(`INFO  không đọc được cdn-cgi/trace: ${error.message}`);
}

// ------------------------------------------------------------------ kết luận
const passed = results.filter((item) => item.pass).length;
console.log("");
console.log(
  `KẾT LUẬN: đường hầm VPN ${passed === results.length ? "KHÔNG chặn" : "CÓ dấu hiệu chặn"} Claude/Gemini ` +
    `(${passed}/${results.length} mục PASS).`,
);
console.log(
  "Nếu tất cả PASS mà khách vẫn không dùng được: nguyên nhân nằm ở phía khách " +
    "(bản app cũ / tài khoản bị chặn / trình duyệt), không phải ở đường hầm.",
);

process.exit(passed === results.length ? 0 : 1);
