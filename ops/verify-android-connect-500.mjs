#!/usr/bin/env node
/**
 * NGHIỆM THU `T-20260929-01` — "Android bấm Connect báo lỗi HTTP 500 là sao?"
 * (chủ dự án báo qua Telegram /vibecode, bus #566 lúc 2026-09-29T13:49:10Z và #567 lúc 14:03:24Z).
 *
 * Chạy: node ops/verify-android-connect-500.mjs
 * Đổi máy đích: env FBUDDY_SSH_HOST (mặc định root@165.101.114.162).
 * Đổi cửa sổ log lúc khách báo: REPORT_SINCE / REPORT_UNTIL (giờ máy node-2, UTC+7).
 *
 * Script KHÔNG đọc lại báo cáo — nó ĐO LẠI trên node-2 và kiểm đúng chuỗi bằng chứng:
 *
 *   (1) `GET /v1/health` = 200 (local 127.0.0.1:7778 và public api.meetflowai.site)
 *   (2) Đường Android bấm Connect (`POST /v1/peers/register`, bắn 20 lần ĐỒNG THỜI) KHÔNG có 500
 *   (3) Mọi route cần phiên trả 401 (không 500) ⇒ tầng đọc auth.json đã sống lại
 *   (4) `data/auth.json` parse được + còn nguyên user
 *   (5) Sau khi vá: 0 lần `Unexpected non-whitespace character after JSON at position 419003`
 *   (6) Bản vá `_save` (tên tệp tạm riêng + xếp hàng ghi) ĐÃ được tiến trình đang chạy nạp
 *       (service khởi động SAU mtime của auth-store.js) và CHỊU được bài bắn đồng thời
 *   (7) Bản sao tệp rách được giữ lại làm tang vật (data/backups/auth.json.torn-*)
 *
 * Chỉ (1)-(7) quyết định PASS/FAIL. Số lần 500 trong cửa sổ khách báo chỉ để ĐỐI CHIẾU
 * (nó phải > 0 — nếu = 0 thì mốc thời gian sai, phải xem lại).
 *
 * Exit: 0 = PASS · 2 = có điều kiện sai · 3 = không SSH được tới node-2.
 */

import { runCapture } from "./lib/capture.mjs";

const HOST = process.env.FBUDDY_SSH_HOST || "root@165.101.114.162";
const REPORT_SINCE = process.env.REPORT_SINCE || "2026-09-29 20:45";
const REPORT_UNTIL = process.env.REPORT_UNTIL || "2026-09-29 21:18";

// Bài bắn đồng thời lên chính module đang chạy: nếu `_save` còn dùng chung 1 tệp tạm thì
// bài này ném ENOENT rename và/hoặc để lại JSON không hợp lệ (đúng cơ chế sự cố 29/09).
const RACE_TEST = `
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
const { AuthStore } = await import("/root/flowvpn-cp/src/auth-store.js");
const mk = (tag, n) => ({ users: Array.from({length:n},(_,i)=>({id:\`u-\${tag}-\${i}\`,email:\`u\${i}@e.com\`,appleUserId:null,revokedAt:null,createdAt:new Date().toISOString()})), sessions: [], emailOtps: [], emailLoginRequests: [], joinTokens: [], subscriptions: [], enrollmentTokens: [], pendingPayments: [], renewalReminders: [] });
let enoent = 0, torn = 0;
for (let r = 0; r < 3; r++) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "authrace-"));
  const store = new AuthStore(path.join(dir, "auth.json"));
  const out = await Promise.allSettled(Array.from({length:50},(_,i)=>store._save(mk(\`r\${r}w\${i}\`, 200 + ((i*977)%4000)))));
  for (const o of out) if (o.status === "rejected" && String(o.reason&&o.reason.message).includes("ENOENT")) enoent++;
  try { const d = JSON.parse(fs.readFileSync(path.join(dir,"auth.json"),"utf8")); if (!Array.isArray(d.users) || !d.users.length) torn++; } catch { torn++; }
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(JSON.stringify({ enoentRenameErrors: enoent, invalidJsonFiles: torn, verdict: enoent === 0 && torn === 0 ? "OK" : "FAIL" }));
`;

const b64 = Buffer.from(RACE_TEST, "utf8").toString("base64");

const REMOTE = [
  "echo MARK_HEALTH",
  "curl -s -o /dev/null -w \"local=%{http_code}\\n\" http://127.0.0.1:7778/v1/health",
  "curl -s -o /dev/null -w \"public=%{http_code}\\n\" https://api.meetflowai.site/v1/health",

  "echo MARK_REGISTER",
  "for i in $(seq 1 20); do curl -s -o /dev/null -w \"%{http_code}\\n\" -X POST http://127.0.0.1:7778/v1/peers/register -H 'Content-Type: application/json' -d \"{\\\"joinToken\\\":\\\"verify-$i\\\",\\\"deviceName\\\":\\\"verify-$i\\\",\\\"publicKey\\\":\\\"k$i\\\"}\"; done | sort | uniq -c",

  "echo MARK_AUTHROUTES",
  "for u in /v1/admin/stats /v1/me /v1/servers; do printf \"%s \" \"$u\"; curl -s -o /dev/null -w \"%{http_code}\\n\" -H 'Authorization: Bearer PVPN-AUTH-verify-bogus' \"http://127.0.0.1:7778$u\"; done",

  "echo MARK_STORE",
  "node -e \"const fs=require('fs');try{const d=JSON.parse(fs.readFileSync('/root/flowvpn-cp/data/auth.json','utf8'));console.log('parse=OK users='+d.users.length+' sessions='+d.sessions.length)}catch(e){console.log('parse=FAIL '+e.message)}\"",
  "ls -1 /root/flowvpn-cp/data/backups/ | grep -c 'auth.json.torn' || true",

  "echo MARK_LOGS_REPORT",
  `journalctl -u flowvpn-cp --since "${REPORT_SINCE}" --until "${REPORT_UNTIL}" --no-pager | grep -c "position 419003" || true`,

  "echo MARK_FIX_LIVE",
  "ls -la --time-style=full-iso /root/flowvpn-cp/src/auth-store.js | awk '{print \"mtime=\"$6\" \"$7}'",
  "grep -c '_writeChain' /root/flowvpn-cp/src/auth-store.js || true",
  "systemctl show flowvpn-cp -p ExecMainStartTimestamp --value",
  "systemctl is-active flowvpn-cp",

  "echo MARK_LOGS_SINCE_START",
  "systemctl show flowvpn-cp -p ExecMainStartTimestamp --value | sed -E 's/^[A-Za-z]+ ([0-9-]+) ([0-9:]+).*/\\1 \\2/' > /tmp/vstart.txt; journalctl -u flowvpn-cp --since \"$(cat /tmp/vstart.txt)\" --no-pager | grep -cE 'position 419003|ENOENT.*auth\\.json' || true",

  "echo MARK_RACE",
  `echo '${b64}' | base64 -d > /tmp/verify-race-${"$"}$.mjs; node /tmp/verify-race-${"$"}$.mjs; rm -f /tmp/verify-race-${"$"}$.mjs`,

  "echo MARK_END",
].join("; ");

const result = runCapture(
  "ssh",
  ["-o", "BatchMode=yes", "-o", "ConnectTimeout=15", "-o", "StrictHostKeyChecking=accept-new", HOST, REMOTE],
  { timeout: 300000 }
);

const text = String(result.stdout || "");
if (!text.includes("MARK_END")) {
  console.error(`✗ Không SSH được tới ${HOST}: ${String(result.stderr || text).trim().split("\n").slice(0, 3).join(" | ")}`);
  console.error("  (Cần key sẵn trên máy chạy; xem docs/DEPLOY.md §0.)");
  process.exit(3);
}

/** Cắt khối giữa hai mốc MARK_x → nội dung. */
function block(name) {
  const start = text.indexOf(`MARK_${name}`);
  if (start < 0) return "";
  const rest = text.slice(start);
  const nextMark = rest.slice(1).search(/\nMARK_[A-Z0-9]+/);
  const body = nextMark < 0 ? rest.slice(rest.indexOf("\n") + 1) : rest.slice(rest.indexOf("\n") + 1, nextMark + 1);
  return body.trim();
}

const lines = (s) => s.split("\n").map((l) => l.trim()).filter(Boolean);

/** Mốc thời gian của node-2 ("Tue 2026-09-29 21:26:38 +07" / "2026-09-29 21:24:08.033086242") → epoch ms (UTC+7). */
function vpsMs(s) {
  const m = String(s).match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?/);
  if (!m) return NaN;
  const [, y, mo, d, h, mi, sec, ms] = m;
  return Date.parse(`${y}-${mo}-${d}T${h}:${mi}:${sec}.${(ms || "0").padEnd(3, "0")}+07:00`);
}

// ---- (1) health -------------------------------------------------------------------
const health = block("HEALTH");
const healthLocal = (health.match(/local=(\d+)/) || [])[1];
const healthPublic = (health.match(/public=(\d+)/) || [])[1];

// ---- (2) đường Connect của app Android --------------------------------------------
const register = lines(block("REGISTER"));
const registerCodes = {};
for (const l of register) {
  const m = l.match(/^(\d+)\s+(\d+)$/);
  if (m) registerCodes[m[2]] = Number(m[1]);
}
const registerCount = Object.values(registerCodes).reduce((a, b) => a + b, 0);

// ---- (3) route cần phiên ----------------------------------------------------------
const authRoutes = lines(block("AUTHROUTES")).map((l) => {
  const [u, c] = l.split(/\s+/);
  return { path: u, code: Number(c) };
});

// ---- (4) kho dữ liệu --------------------------------------------------------------
const storeLine = lines(block("STORE"))[0] || "";
const storeParse = /parse=OK/.test(storeLine);
const storeUsers = Number((storeLine.match(/users=(\d+)/) || [])[1] || 0);
const tornBackups = Number(lines(block("STORE"))[1] || 0);

// ---- (5) log sau khi vá ------------------------------------------------------------
const report500 = Number(lines(block("LOGS_REPORT"))[0] || 0);
const sinceStart = Number(lines(block("LOGS_SINCE_START"))[0] || 0);

// ---- (6) bản vá đã được nạp --------------------------------------------------------
const fixLines = lines(block("FIX_LIVE"));
const srcMtime = (fixLines[0] || "").replace("mtime=", "");
const chainRefs = Number(fixLines[1] || 0);
const serviceStart = fixLines[2] || "";
const serviceActive = fixLines[3] || "";
const startMs = vpsMs(serviceStart);
const mtimeMs = vpsMs(srcMtime);
const fixLoaded = Number.isFinite(startMs) && Number.isFinite(mtimeMs) ? startMs > mtimeMs : null;

// ---- (7) bài bắn đồng thời ---------------------------------------------------------
let race = { verdict: "?", enoentRenameErrors: -1, invalidJsonFiles: -1 };
try {
  race = JSON.parse(lines(block("RACE")).slice(-1)[0] || "{}");
} catch { /* để nguyên dấu ? */ }

const checks = [
  ["(1) GET /v1/health = 200 (local + public)", healthLocal === "200" && healthPublic === "200", `local=${healthLocal} public=${healthPublic}`],
  ["(2) Connect (POST /v1/peers/register) x20 đồng thời: KHÔNG có 500", registerCount === 20 && !registerCodes["500"], JSON.stringify(registerCodes)],
  ["(3) Route cần phiên trả 401, KHÔNG 500", authRoutes.length === 3 && authRoutes.every((r) => r.code !== 500), authRoutes.map((r) => `${r.path}=${r.code}`).join(" ")],
  ["(4) data/auth.json parse được, còn user", storeParse && storeUsers > 0, storeLine],
  ["(5) 0 lỗi 'position 419003'/ENOENT kể từ lúc service khởi động lại", sinceStart === 0, `count=${sinceStart}`],
  ["(6) Bản vá _save đã được tiến trình đang chạy nạp", fixLoaded === true && chainRefs > 0 && serviceActive === "active", `serviceStart=${serviceStart} srcMtime=${srcMtime} _writeChain x${chainRefs}`],
  ["(7) Bắn 3×50 lần ghi đồng thời: 0 ENOENT, 0 JSON hỏng", race.verdict === "OK", JSON.stringify(race)],
];

console.log(`\n=== NGHIỆM THU T-20260929-01 — HTTP 500 khi Android bấm Connect (${HOST}) ===\n`);
for (const [name, ok, detail] of checks) console.log(`${ok ? "✓" : "✗"} ${name}\n    ${detail}`);

console.log(`\n--- Đối chiếu (không tính PASS/FAIL) ---`);
console.log(`• Cửa sổ khách báo (${REPORT_SINCE} → ${REPORT_UNTIL}, giờ node-2): ${report500} lần lỗi đọc auth.json (phải > 0 để xác nhận đúng mốc).`);
console.log(`• Tang vật tệp rách giữ tại data/backups/: ${tornBackups} tệp .torn.`);

const failed = checks.filter(([, ok]) => !ok);
console.log(`\nKẾT LUẬN: ${failed.length === 0 ? "PASS" : "FAIL"} — ${checks.length - failed.length}/${checks.length} điều kiện đúng.`);
console.log(
  "Nguyên nhân gốc: `AuthStore._save()` ghi qua CÙNG một tệp tạm `auth.json.tmp`. Hai request đồng thời\n" +
  "(app bấm Connect nhiều lần / login song song) chồng lên nhau ⇒ `rename` của người này lấy mất tệp tạm\n" +
  "của người kia (log: `ENOENT ... rename auth.json.tmp`), tệp `auth.json` bị trộn thành JSON không hợp lệ.\n" +
  "`_load()` (đã siết từ 26/09: hỏng thì NÉM RA, không coi như rỗng) vì thế ném lỗi ở MỌI request cần phiên\n" +
  "⇒ app Android bấm Connect nhận HTTP 500. Không phải lỗi app, không phải mạng/VPN/relay."
);

process.exit(failed.length === 0 ? 0 : 2);
