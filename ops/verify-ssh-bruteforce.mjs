#!/usr/bin/env node
/**
 * NGHIỆM THU `T-20260926-01` — Brute-force SSH node-2 (sự việc 26/09/2026).
 *
 * Chạy: node ops/verify-ssh-bruteforce.mjs
 * Đổi máy đích: đặt env FBUDDY_SSH_HOST (mặc định root@165.101.114.162).
 *
 * Script này KHÔNG đọc lại báo cáo — nó ĐO LẠI trên node-2 và kiểm đúng 2 kết luận an ninh
 * quan trọng nhất của báo cáo docs/INCIDENT-2026-09-26-SSH-BRUTEFORCE.md:
 *
 *   (1) Chưa từng có lần đăng nhập nào bằng MẬT KHẨU thành công  → phải = 0
 *   (2) Giao của {IP đăng nhập sai} và {IP đăng nhập đúng} = RỖNG ⇒ chưa IP tấn công nào vào được
 *
 * Phần còn lại chỉ in ra để người đọc biết "còn nợ gì" (mật khẩu root, fail2ban, ufw) — đó là
 * quyết định của chủ dự án, không phải điều kiện pass/fail.
 *
 * Exit: 0 = 2 kết luận trên vẫn đúng · 2 = có điều kiện sai (phải điều tra lại) · 3 = không SSH được.
 */

import fs from "node:fs";
import path from "node:path";
import { runCapture } from "./lib/capture.mjs";

const HOST = process.env.FBUDDY_SSH_HOST || "root@165.101.114.162";
const REPORT = path.join("docs", "INCIDENT-2026-09-26-SSH-BRUTEFORCE.md");

// Một lượt SSH duy nhất: mỗi mục có mốc MARK_ để tách output (không phụ thuộc thứ tự/định dạng log).
const REMOTE = [
  'echo MARK_ACCEPTEDPW; journalctl -u ssh --no-pager -o cat | grep -c "Accepted password"',
  'echo MARK_INTERSECT; journalctl -u ssh --no-pager -o cat | grep "Failed password" | grep -oE "from [0-9.]+" | cut -d" " -f2 | sort -u > /tmp/vatt.txt; journalctl -u ssh --no-pager -o cat | grep "Accepted" | grep -oE "from [0-9.]+" | cut -d" " -f2 | sort -u > /tmp/vok.txt; echo "attacker=$(wc -l < /tmp/vatt.txt) accepted=$(wc -l < /tmp/vok.txt)"; comm -12 /tmp/vatt.txt /tmp/vok.txt',
  'echo MARK_24H; journalctl -u ssh --since "-24h" --no-pager -o cat | grep -c "Failed password"',
  'echo MARK_IPS; journalctl -u ssh --since "-24h" --no-pager -o cat | grep "Failed password" | grep -oE "from [0-9.]+" | cut -d" " -f2 | sort -u | wc -l',
  'echo MARK_TOP5; journalctl -u ssh --since "-24h" --no-pager -o cat | grep "Failed password" | grep -oE "from [0-9.]+" | cut -d" " -f2 | sort | uniq -c | sort -rn | head -5',
  'echo MARK_SSHD; sshd -T 2>/dev/null | grep -Ei "^(permitrootlogin|passwordauthentication|kbdinteractiveauthentication|maxauthtries|port)"',
  'echo MARK_DEBT; (command -v fail2ban-client >/dev/null && echo "fail2ban: DA CAI" || echo "fail2ban: CHUA CO"); (systemctl is-active ufw >/dev/null 2>&1 && echo "ufw: active" || echo "ufw: inactive")',
  "echo MARK_END",
].join("; ");

const result = runCapture(
  "ssh",
  ["-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "-o", "StrictHostKeyChecking=accept-new", HOST, REMOTE],
  { timeout: 180000 },
);

if (!result.ok && !String(result.stdout).includes("MARK_END")) {
  console.error(`✗ Không SSH được tới ${HOST}: ${String(result.stderr || result.stdout).trim().split("\n").slice(0, 3).join(" | ")}`);
  console.error("  (Cần key sẵn trên máy WIN; xem docs/DEPLOY.md §0.)");
  process.exit(3);
}

const text = String(result.stdout);
/** Cắt khối giữa hai mốc MARK_x → nội dung. */
function block(name) {
  const start = text.indexOf(`MARK_${name}`);
  if (start < 0) return "";
  const rest = text.slice(start);
  const nextMark = rest.slice(1).search(/\nMARK_[A-Z0-9]+/);
  const body = nextMark < 0 ? rest.slice(rest.indexOf("\n") + 1) : rest.slice(rest.indexOf("\n") + 1, nextMark + 1);
  return body.trim();
}

const acceptedPassword = Number(block("ACCEPTEDPW").split("\n").pop() ?? "NaN");
const intersect = block("INTERSECT").split("\n").filter((line) => line && !line.startsWith("attacker="));
const counts = block("INTERSECT").split("\n").find((line) => line.startsWith("attacker=")) ?? "attacker=?";
const fails24h = block("24H").split("\n").pop() ?? "?";
const ips24h = block("IPS").split("\n").pop() ?? "?";
const top5 = block("TOP5");
const sshd = block("SSHD");
const debt = block("DEBT");

const checks = [
  {
    ok: acceptedPassword === 0,
    name: "Chưa từng có đăng nhập bằng MẬT KHẨU thành công",
    detail: `Accepted password = ${block("ACCEPTEDPW")}`,
  },
  {
    ok: intersect.length === 0,
    name: "Không IP tấn công nào từng đăng nhập thành công (giao hai tập = rỗng)",
    detail: intersect.length ? `CÓ GIAO: ${intersect.join(", ")}` : `${counts} · giao = (rỗng)`,
  },
];

console.log(`NGHIỆM THU T-20260926-01 — brute-force SSH trên ${HOST}`);
console.log(`báo cáo: ${fs.existsSync(REPORT) ? REPORT : `(THIẾU ${REPORT})`}`);
console.log("");
console.log(`Quy mô 24h   : ${fails24h} lần "Failed password" từ ${ips24h} IP khác nhau`);
console.log("Top 5 IP     :");
for (const line of top5.split("\n")) if (line.trim()) console.log(`               ${line.trim()}`);
console.log("sshd hiện tại:");
for (const line of sshd.split("\n")) if (line.trim()) console.log(`               ${line.trim()}`);
console.log("Còn nợ (quyết định của chủ dự án):");
for (const line of debt.split("\n")) if (line.trim()) console.log(`               ${line.trim()}`);
console.log("");
for (const check of checks) console.log(`${check.ok ? "✅ PASS" : "❌ FAIL"}  ${check.name}\n         ${check.detail}`);

if (!fs.existsSync(REPORT)) console.log("\n⚠ Chưa thấy tệp báo cáo — phần kết luận chưa có chỗ đối chiếu.");

const failed = checks.filter((check) => !check.ok).length;
console.log("");
if (failed) {
  console.log(`❌ NGHIỆM THU FAIL — ${failed}/${checks.length} điều kiện sai. Phải điều tra lại (xem lại log, kiểm authorized_keys, xoay khoá).`);
  process.exit(2);
}
console.log("✅ NGHIỆM THU PASS — 2 kết luận an ninh của báo cáo vẫn đúng trên node-2: chưa bị chiếm;");
console.log("   vấn đề còn lại là cấu hình phơi mở (mật khẩu/fail2ban/ufw) — chờ chủ dự án chốt §7.");
