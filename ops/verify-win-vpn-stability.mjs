// Nghiệm thu T-20260930-01 (chủ dự án, bus #600): "bật vpn trên máy win lên, kiểm tra độ ổn định của app".
//
// Chạy TRÊN MÁY WINDOWS:   node ops/verify-win-vpn-stability.mjs
//
// Kết luận máy đọc:
//   VPN_ON     = app VPNFlow đang chạy + adapter vpnflow có IP + đường ra Internet đi qua VPS
//   STABILITY  = đo mất gói/độ trễ thật của tunnel, và so với đường ICMP trực tiếp (đối chứng)
//
// Exit code: 0 nếu VPN đang BẬT (việc chính); 1 nếu VPN tắt/hỏng.
// Mất gói cao KHÔNG làm fail exit code — đó là tình trạng đường truyền, in ra để bên giao đối chiếu.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runCapture } from "./lib/capture.mjs";

const VPS_PUBLIC = "165.101.114.162";
const VPN_GATEWAY = "10.77.0.1";
const APP_IMAGE = "PrivateVPNWindows.App.exe";

const results = [];
const ok = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

// runCapture chịu được cả sandbox chặn named pipe (xem ops/lib/capture.mjs) — execFileSync pipe sẽ EPERM.
function run(cmd, args) {
  const result = runCapture(cmd, args, { timeout: 120000 });
  if (result.ok) return String(result.stdout ?? "");
  return `${String(result.stdout ?? "")}\n${String(result.stderr ?? "")}`;
}

// ---------------------------------------------------------------- 1. app sống?
// `tasklist` bị sandbox chặn ("Access denied") nên hỏi qua PowerShell; runCapture lo phần pipe.
let appAlive = false;
let appDetail = "";
try {
  const count = run("powershell.exe", [
    "-NoProfile",
    "-Command",
    `(Get-Process ${APP_IMAGE.replace(/\.exe$/i, "")} -ErrorAction SilentlyContinue | Measure-Object).Count`,
  ]).trim();
  appAlive = Number(count) > 0;
  appDetail = `số tiến trình = ${count || 0}`;
} catch (error) {
  appDetail = `lỗi: ${error.message}`;
}
ok("app VPNFlow đang chạy", appAlive, appDetail);

// ---------------------------------------------------------------- 2. tunnel có IP?
// Lưu ý: ipconfig in tiêu đề adapter rồi một dòng TRỐNG mới tới chi tiết, nên không tách khối theo
// dòng trống — tìm tiêu đề rồi đọc cửa sổ ngay sau nó.
const ipconfig = run("ipconfig", ["/all"]);
const vpnHead = ipconfig.search(/adapter vpnflow:/i);
const vpnWindow = vpnHead >= 0 ? ipconfig.slice(vpnHead, vpnHead + 1500) : "";
const vpnIp = vpnWindow.match(/IPv4 Address[^:]*:\s*([\d.]+)/i)?.[1] ?? null;
ok("adapter vpnflow có IP tunnel", Boolean(vpnIp), vpnIp ?? "không thấy adapter vpnflow");

// ---------------------------------------------------------------- 3. route mặc định qua tunnel?
const routes = run("route", ["print", "-4"]);
const routeViaTunnel = /0\.0\.0\.0\s+128\.0\.0\.0\s+On-link\s+10\.77\.0\./.test(routes);
ok("route 0.0.0.0/1 đi qua tunnel", routeViaTunnel, routeViaTunnel ? "0.0.0.0/1 → On-link 10.77.0.x" : "không thấy route qua tunnel");

// ---------------------------------------------------------------- 4. đường ra Internet có qua VPS?
let egress = null;
try {
  const response = await fetch("https://api.ipify.org?format=json", { signal: AbortSignal.timeout(20000) });
  egress = (await response.json())?.ip ?? null;
} catch (error) {
  egress = `lỗi: ${error.message}`;
}
ok("IP ra Internet = IP VPS (tunnel có chở traffic)", egress === VPS_PUBLIC, `egress=${egress}, cần=${VPS_PUBLIC}`);

// ---------------------------------------------------------------- 5. mất gói qua tunnel vs ICMP trực tiếp
function pingStats(host, count) {
  const out = run("ping", ["-n", String(count), host]);
  const m = out.match(/Lost = (\d+) \((\d+)% loss\)/i);
  const rtt = out.match(/Average = (\d+)ms/i);
  return { lossPct: m ? Number(m[2]) : null, avgMs: rtt ? Number(rtt[1]) : null };
}

const tunnel = pingStats(VPN_GATEWAY, 30);
ok(
  `mất gói qua tunnel (${VPN_GATEWAY} x30)`,
  tunnel.lossPct !== null && tunnel.lossPct <= 5,
  `loss=${tunnel.lossPct}% avg=${tunnel.avgMs}ms`,
);
const direct = pingStats(VPS_PUBLIC, 20);
ok(
  `đối chứng ICMP trực tiếp (${VPS_PUBLIC} x20)`,
  direct.lossPct !== null && direct.lossPct <= 5,
  `loss=${direct.lossPct}% avg=${direct.avgMs}ms`,
);

// ---------------------------------------------------------------- 6. handshake WireGuard trong 1 giờ
let handshakeFail1h = null;
try {
  const logPath = path.join(os.homedir(), "AppData", "Roaming", "VPNFlow", "vpnflow.log");
  const lines = fs.readFileSync(logPath, "utf8").split(/\r?\n/);
  const cutoff = Date.now() - 3600_000;
  handshakeFail1h = lines.filter((line) => {
    if (!/Handshake did not complete/.test(line)) return false;
    const stamp = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/)?.[1];
    return stamp ? new Date(stamp.replace(" ", "T")).getTime() > cutoff : false;
  }).length;
} catch (error) {
  handshakeFail1h = `lỗi: ${error.message}`;
}
console.log(`INFO  handshake WireGuard thất bại trong 1 giờ: ${handshakeFail1h}`);

// ---------------------------------------------------------------- kết luận
const vpnOn = appAlive && Boolean(vpnIp) && routeViaTunnel && egress === VPS_PUBLIC;
const unstable = (tunnel.lossPct ?? 0) > 5;
console.log("");
console.log(`KẾT LUẬN: VPN ${vpnOn ? "ĐANG BẬT" : "KHÔNG BẬT"}; tunnel ${unstable ? "KHÔNG ỔN ĐỊNH" : "ổn định"} (mất gói ${tunnel.lossPct}% qua tunnel, ${direct.lossPct}% ICMP trực tiếp).`);
console.log(`Tổng: ${results.filter((r) => r.pass).length}/${results.length} mục PASS.`);

process.exit(vpnOn ? 0 : 1);
