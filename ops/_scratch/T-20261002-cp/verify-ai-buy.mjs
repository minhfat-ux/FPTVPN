// Nghiệm thu T-20261002 (bus #652 + #653) — chạy TRÊN node-2, cwd=/root/flowvpn-cp.
//   1) trang /ai/buy đang phát: nhãn ô email KHÔNG còn "VPNFlow account" + CÓ link tải Windows
//      của MeetFlow AI (bản overlay .zip), đủ 5 ngôn ngữ;
//   2) trang /buy (VPNFlow) KHÔNG bị đổi (nhãn cũ giữ nguyên, không lẫn link overlay);
//   3) kiểm ở tầng module: nút Windows của VPNFlow vẫn còn, của MeetFlow AI chỉ hiện khi có link;
//   4) file .zip thật TẢI ĐƯỢC (HTTP 200 + đúng cỡ) và /health 200.
const BASE = process.env.BASE || "http://127.0.0.1:7778";
const fail = [];
const ok = [];
const check = (cond, label, extra = "") => {
  (cond ? ok : fail).push(`${label}${extra ? ` — ${extra}` : ""}`);
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${extra ? ` — ${extra}` : ""}`);
};
const get = async (url) => {
  const res = await fetch(url, { redirect: "follow" });
  return { status: res.status, text: await res.text() };
};
const WIN_HREF_RE = /href="(https?:\/\/[^"]+\/dl\/MeetFlowAI-Overlay-latest-win-x64\.zip)"/;

console.log("== 1) /ai/buy (5 ngôn ngữ) — nhãn email đúng + link Windows MeetFlow AI ==");
const langExpect = {
  en: ["<label>Email</label>", "run MeetFlowAI.Win.exe"],
  vi: ["<label>Email</label>", "chạy MeetFlowAI.Win.exe"],
  zh: ["<label>邮箱</label>", "MeetFlowAI.Win.exe"],
  ja: ["<label>メールアドレス</label>", "MeetFlowAI.Win.exe"],
  ko: ["<label>이메일</label>", "MeetFlowAI.Win.exe"],
};
const foundWindows = new Set();
for (const [lang, [label, winLine]] of Object.entries(langExpect)) {
  const { status, text } = await get(`${BASE}/ai/buy?lang=${lang}`);
  check(status === 200, `[${lang}] /ai/buy HTTP 200`, `status=${status}`);
  check(text.includes(label), `[${lang}] nhãn ô email = ${label}`);
  check(!/VPNFlow account email|Email tài khoản VPNFlow|VPNFlow账户邮箱|VPNFlowアカウント|VPNFlow 계정/.test(text), `[${lang}] KHÔNG còn nhãn VPNFlow`);
  const m = text.match(WIN_HREF_RE);
  check(Boolean(m), `[${lang}] có nút tải Windows (overlay MeetFlow AI)`, m ? m[1] : "khong thay href");
  if (m) foundWindows.add(m[1]);
  check(text.includes(winLine), `[${lang}] có dòng hướng dẫn Windows đúng app`, winLine.slice(0, 30));
  check(text.includes("Windows 10/11"), `[${lang}] huy hiệu Windows`);
  check(text.includes("/v1/ai/downloads/android"), `[${lang}] vẫn còn nút Android`);
  check(text.includes("apps.apple.com"), `[${lang}] vẫn còn nút iOS/macOS (App Store)`);
  check(!/MeetFlowAI-Overlay/.test(text.replace(WIN_HREF_RE, "")), `[${lang}] chỉ 1 chỗ link overlay (không lặp)`);
}
check(foundWindows.size === 1, "cả 5 ngôn ngữ dùng CÙNG một link Windows", [...foundWindows].join(", "));

console.log("== 2) /buy (VPNFlow) — KHÔNG bị đổi ==");
for (const [lang, label] of [["en", "Your VPNFlow account email"], ["vi", "Email tài khoản VPNFlow"]]) {
  const { status, text } = await get(`${BASE}/buy?lang=${lang}`);
  check(status === 200, `[${lang}] /buy HTTP 200`, `status=${status}`);
  check(text.includes(label), `[${lang}] nhãn VPNFlow giữ nguyên`, label);
  check(!text.includes("MeetFlowAI-Overlay"), `[${lang}] KHÔNG lẫn link overlay của MeetFlow AI`);
  check(text.includes('id="leadGate"'), `[${lang}] cổng bắt nhập email trước khi tải vẫn còn`);
}

console.log("== 3) tầng module payments.js (bản LIVE) ==");
const { downloadsSectionHTML, buyPageHTML } = await import("/root/flowvpn-cp/src/payments.js");
const S = "https://t1.meetflowai.site";
const vpnDl = downloadsSectionHTML({ baseUrl: S, lang: "vi", product: "vpn", links: { ios: `${S}/v1/downloads/ios`, android: `${S}/v1/downloads/android`, windows: `${S}/dl/VPNFlow-Setup-latest.exe` }, platform: "unknown" });
check(vpnDl.includes(`${S}/dl/VPNFlow-Setup-latest.exe`), "VPNFlow: nút Windows vẫn render");
const vpnFallback = downloadsSectionHTML({ baseUrl: S, lang: "vi", product: "vpn", links: {}, platform: "unknown" });
check(vpnFallback.includes(`${S}/dl/VPNFlow-Setup-latest.exe`), "VPNFlow: fallback link Windows vẫn nguyên");
const aiDl = downloadsSectionHTML({ baseUrl: S, lang: "vi", product: "ai", links: { windows: "https://meetflowai.site/dl/MeetFlowAI-Overlay-latest-win-x64.zip", android: `${S}/v1/ai/downloads/android` }, platform: "unknown" });
check(aiDl.includes("MeetFlowAI-Overlay-latest-win-x64.zip"), "MeetFlow AI: nút Windows render khi có link");
const aiNoLink = downloadsSectionHTML({ baseUrl: S, lang: "vi", product: "ai", links: { android: `${S}/v1/ai/downloads/android` }, platform: "unknown" });
check(!aiNoLink.includes("MeetFlowAI-Overlay") && !aiNoLink.includes("windows"), "MeetFlow AI: KHÔNG hiện nút Windows khi chưa cấu hình link (không có nút chết)");
const aiPage = buyPageHTML({ baseUrl: S, lang: "vi", product: "ai", links: { windows: "https://meetflowai.site/dl/MeetFlowAI-Overlay-latest-win-x64.zip", android: `${S}/v1/ai/downloads/android` }, methods: ["bankqr"] });
check(aiPage.includes("<label>Email</label>"), "buyPageHTML/ai: nhãn = Email");
check(!aiPage.includes("undefined"), "buyPageHTML/ai: không rơi khoá i18n undefined");

console.log("== 4) file .zip thật + /health ==");
for (const url of foundWindows) {
  try {
    const res = await fetch(url, { method: "HEAD" });
    const len = Number(res.headers.get("content-length") || 0);
    check(res.status === 200, `HEAD ${url}`, `status=${res.status}`);
    check(len > 60 * 1024 * 1024, "kích thước .zip hợp lý", `${len} bytes`);
  } catch (err) {
    check(false, `HEAD ${url}`, String(err?.message ?? err));
  }
}
try {
  const res = await fetch(`${BASE}/health`);
  check(res.status === 200, "/health 200", `status=${res.status}`);
} catch (err) {
  check(false, "/health", String(err?.message ?? err));
}

console.log(`\nKET QUA: ${ok.length} PASS / ${fail.length} FAIL`);
if (fail.length) {
  console.log("Cac muc FAIL:");
  for (const f of fail) console.log("  - " + f);
  process.exit(1);
}
