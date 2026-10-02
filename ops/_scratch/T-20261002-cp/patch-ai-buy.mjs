// Patch control-plane cho 2 việc owner giao qua bus (Telegram /vibecode):
//   #652 — trang /ai/buy: nhãn ô email đang là "Your VPNFlow account email" ⇒ sửa thành "Email".
//   #653 — trang /ai/buy: bổ sung link tải bản Windows (MeetFlowAI Overlay) cho MeetFlow AI.
//
// Chạy TRÊN node-2: node /tmp/patch-ai-buy.mjs
// Nguyên tắc: mỗi phép thay phải khớp ĐÚNG số lần mong đợi, sai thì DỪNG và KHÔNG ghi file nào.
import fs from "node:fs";

const SRC = "/root/flowvpn-agent/control-plane/src";
const files = {
  payments: `${SRC}/payments.js`,
  index: `${SRC}/index.js`,
};

const edits = [
  // ---------- #652: nhãn email đúng thương hiệu MeetFlow AI (không phải VPNFlow) ----------
  {
    file: "payments",
    what: "AI_TEXTS.en.emailLabel",
    count: 1,
    old: '    dlTitle: "Get the MeetFlow AI app",',
    new: '    emailLabel: "Email",\n    windowsLine: "Windows: download the overlay above, unzip it, run MeetFlowAI.Win.exe, then sign in with the SAME email.",\n    dlTitle: "Get the MeetFlow AI app",',
  },
  {
    file: "payments",
    what: "AI_TEXTS.vi.emailLabel",
    count: 1,
    old: '    dlTitle: "Tải app MeetFlow AI",',
    new: '    emailLabel: "Email",\n    windowsLine: "Windows: tải bản overlay ở trên, giải nén, chạy MeetFlowAI.Win.exe, rồi đăng nhập bằng ĐÚNG email này.",\n    dlTitle: "Tải app MeetFlow AI",',
  },
  {
    file: "payments",
    what: "AI_TEXTS.zh.emailLabel",
    count: 1,
    old: '    dlTitle: "获取 MeetFlow AI 应用",',
    new: '    emailLabel: "邮箱",\n    windowsLine: "Windows：下载上方的悬浮窗版，解压后运行 MeetFlowAI.Win.exe，然后用同一个邮箱登录。",\n    dlTitle: "获取 MeetFlow AI 应用",',
  },
  {
    file: "payments",
    what: "AI_TEXTS.ja.emailLabel",
    count: 1,
    old: '    dlTitle: "MeetFlow AI アプリを入手",',
    new: '    emailLabel: "メールアドレス",\n    windowsLine: "Windows：上のオーバーレイ版をダウンロードして解凍し、MeetFlowAI.Win.exe を実行して、同じメールでサインインしてください。",\n    dlTitle: "MeetFlow AI アプリを入手",',
  },
  {
    file: "payments",
    what: "AI_TEXTS.ko.emailLabel",
    count: 1,
    old: '    dlTitle: "MeetFlow AI 앱 받기",',
    new: '    emailLabel: "이메일",\n    windowsLine: "Windows: 위 오버레이 버전을 내려받아 압축을 풀고 MeetFlowAI.Win.exe를 실행한 뒤 같은 이메일로 로그인하세요.",\n    dlTitle: "MeetFlow AI 앱 받기",',
  },

  // ---------- #653: nút tải Windows cho MeetFlow AI (trước đây chỉ có khi product = vpn) ----------
  {
    file: "payments",
    what: "windowsUrl (downloadsSectionHTML + buyPageHTML)",
    count: 2,
    old: '  const windowsUrl = product === "vpn" ? (links.windows || `${baseUrl}/dl/VPNFlow-Setup-latest.exe`) : null;',
    new: '  const windowsUrl = product === "vpn"\n    ? (links.windows || `${baseUrl}/dl/VPNFlow-Setup-latest.exe`)\n    : (links.windows || null);',
  },
  {
    file: "index",
    what: "storeLinks('ai').windows",
    count: 1,
    old: '        android: appConfig.get("ai_android_apk_url") || `${base}/v1/ai/downloads/android`,\n      }',
    new:
      '        android: appConfig.get("ai_android_apk_url") || `${base}/v1/ai/downloads/android`,\n' +
      '        // Windows: bản overlay desktop (.zip tự chứa, chạy MeetFlowAI.Win.exe) — phát tĩnh\n' +
      '        // từ /dl/ của domain chính giống bộ cài VPNFlow. Đổi link bằng appConfig, không cần restart.\n' +
      '        windows: appConfig.get("ai_windows_url") || process.env.AI_WINDOWS_URL || `${siteBaseUrl()}/dl/MeetFlowAI-Overlay-latest-win-x64.zip`,\n' +
      '      }',
  },
];

// Nạp nội dung (payments.js đang ở CRLF ⇒ chuẩn hoá LF cho khớp anchor; ghi lại bằng LF).
const originals = {};
for (const [key, p] of Object.entries(files)) {
  originals[key] = fs.readFileSync(p, "utf8");
  if (originals[key].includes("\r\n")) {
    console.log(`chuan hoa CRLF -> LF: ${p}`);
    originals[key] = originals[key].replace(/\r\n/g, "\n");
  }
}

const next = { ...originals };
const fails = [];
for (const e of edits) {
  const src = next[e.file];
  const hits = src.split(e.old).length - 1;
  if (hits !== e.count) {
    fails.push(`${e.file}: ${e.what} — khop ${hits} lan, mong doi ${e.count}`);
    continue;
  }
  next[e.file] = src.split(e.old).join(e.new);
  console.log(`OK  ${e.file}: ${e.what} (${hits})`);
}
if (fails.length) {
  console.error("\nDUNG: khong ghi file nao. Cac phep thay bi lech:");
  for (const f of fails) console.error("  - " + f);
  process.exit(1);
}

const dryRun = process.argv.includes("--dry-run");
for (const [key, p] of Object.entries(files)) {
  if (dryRun) {
    console.log(`[dry-run] se ghi ${p}: ${next[key] !== originals[key] ? "CO thay doi" : "khong doi"}`);
  } else if (next[key] !== originals[key]) {
    fs.writeFileSync(p, next[key], "utf8");
    console.log(`da ghi ${p} (${next[key].length} ky tu)`);
  } else {
    console.log(`khong doi ${p}`);
  }
}
console.log("\nXONG. Kiem tiep: node --check tung file.");
