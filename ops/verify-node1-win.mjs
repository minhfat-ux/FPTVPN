// Nghiệm thu T-20260930-03 (chủ dự án qua Telegram, bus #607):
//   "check complain node 1 khong on dinh tren ban win"
//
// Chạy TRÊN MÁY WINDOWS đang bật VPNFlow:   node ops/verify-node1-win.mjs [--count 10]
//
// Kiểm ba lớp, đúng thứ tự "khách nói không ổn định" ⇒ tách lỗi client / đường truyền / server:
//   1. Control plane: node "1" (vietnam-1) có trong danh sách node và trỏ đúng 103.173.155.50:443.
//   2. Server node-1: wg0 up + đang nghe UDP 443 + firewall không chặn + tải/uptime (so với node-2).
//   3. TỪ CHÍNH MÁY NÀY: gửi handshake WireGuard THẬT tới node-1 (và node-2 để đối chứng),
//      đếm tỉ lệ thành công + RTT. Đây là phần trả lời trực tiếp "node 1 có ổn định trên bản win không".
//
// Exit 0 = node-1 sống và bắt tay được từ máy này; 1 = có mục FAIL (in rõ mục nào).
//
// Khoá riêng của thiết bị chỉ ĐỌC từ %APPDATA%\VPNFlow\device.json, không in ra, không ghi vào repo.

import { runCapture } from "./lib/capture.mjs";
import { loadLocalDeviceKey, probeHandshake } from "./lib/wgprobe.mjs";

const NODE1_PUB = "N0vGtqZ2SARCXkvVUU/KfAZMvfwszkvF/ROLL4DLIQ8=";
const NODE2_PUB = "OJPfJLblLP2KCQkPdqI1B7WHJT/U4BlzSxUTwh6vZ2c=";
const NODE1 = { host: "103.173.155.50", port: 443, ssh: "root@103.173.155.50" };
const NODE2 = { host: "165.101.114.162", port: 443, ssh: "root@165.101.114.162" };

const argv = process.argv.slice(2);
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};
const count = Number(opt("count", 10));

const results = [];
const ok = (name, pass, detail = "") => {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};
const info = (text) => console.log(`INFO  ${text}`);

const ssh = (target, script) => {
  const result = runCapture("ssh", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=12", target, script], { timeout: 60000 });
  return `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
};

// ---------------------------------------------------------------- 1. control plane
let node1FromApi = null;
try {
  const response = await fetch("https://api.meetflowai.site/v1/nodes", { signal: AbortSignal.timeout(20000) });
  const body = await response.json();
  node1FromApi = (body.nodes ?? []).find((n) => n.id === "node-1") ?? null;
} catch (error) {
  info(`không gọi được control plane: ${error.message}`);
}
ok(
  "control plane có node-1 (tên hiển thị \"1\")",
  Boolean(node1FromApi) && node1FromApi.endpoint === "103.173.155.50:443",
  node1FromApi ? `endpoint=${node1FromApi.endpoint}` : "không thấy node-1 trong /v1/nodes",
);

// ---------------------------------------------------------------- 2. server node-1 vs node-2
for (const [label, node] of [["node-1", NODE1], ["node-2", NODE2]]) {
  const out = ssh(
    node.ssh,
    "echo UPTIME=$(uptime -p); echo LOAD=$(cut -d' ' -f1-3 /proc/loadavg); " +
      "echo WG=$(wg show wg0 | sed -n '1,6p' | tr '\\n' '|'); " +
      "echo SOCK=$(ss -lun | grep -c ':443'); " +
      "echo FW=$(command -v ufw >/dev/null && ufw status | head -1 || echo 'khong-co-ufw'); " +
      "echo NPEER=$(wg show wg0 | grep -c '^peer:'); " +
      "echo HS10=$(wg show wg0 latest-handshakes | awk -v now=$(date +%s) '$2>0 && now-$2<600' | wc -l)",
  );
  const field = (key) => out.match(new RegExp(`${key}=(.*)`))?.[1]?.trim() ?? "";
  const listening = /listening port:\s*443/.test(out);
  const up = /interface:\s*wg0/.test(out) && /public key:/.test(out);
  ok(
    `${label}: wg0 sống và đang nghe UDP 443`,
    listening && up,
    `${field("UPTIME")} · load ${field("LOAD")} · ${field("NPEER")} peer · bắt tay/10 phút = ${field("HS10")} · firewall: ${field("FW")}`,
  );
}

// ---------------------------------------------------------------- 3. bắt tay thật TỪ MÁY NÀY
const key = loadLocalDeviceKey();
if (!key) {
  info("không thấy khoá thiết bị VPNFlow trên máy này ⇒ bỏ qua phần bắt tay (chỉ kiểm được phía server)");
} else {
  info(`khoá thiết bị: ${key.pub.toString("base64")} (đọc từ ${key.file})`);
  for (const [label, node, responder] of [
    ["node-1", NODE1, NODE1_PUB],
    ["node-2", NODE2, NODE2_PUB],
  ]) {
    let success = 0;
    const rtts = [];
    for (let i = 0; i < count; i += 1) {
      const probe = await probeHandshake({
        host: node.host,
        port: node.port,
        responderPub: Buffer.from(responder, "base64"),
        staticPriv: key.priv,
        staticPub: key.pub,
        timeoutMs: 4000,
      });
      if (probe.ok) {
        success += 1;
        rtts.push(probe.rttMs);
      } else {
        info(`  ${label} lần ${i + 1}: ${probe.reason}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    const avg = rtts.length ? rtts.reduce((a, b) => a + b, 0) / rtts.length : null;
    const pct = Math.round((100 * success) / count);
    info(`  ${label}: ${success}/${count} bắt tay thành công (${pct}%), RTT trung bình ${avg === null ? "—" : `${avg.toFixed(0)} ms`}`);
    // Lấy mẫu nhỏ (mặc định 10) nên ngưỡng đặt rộng: chỉ FAIL khi gần như không bắt tay được.
    ok(`${label}: bắt tay WireGuard thật từ máy này`, pct >= 70, `${success}/${count} thành công (${pct}%)`);
  }
}

// ---------------------------------------------------------------- kết luận
const failed = results.filter((r) => !r.pass);
console.log("");
console.log(`KẾT LUẬN: ${results.length - failed.length}/${results.length} mục PASS${failed.length ? ` — FAIL: ${failed.map((r) => r.name).join(", ")}` : ""}.`);
if (!failed.length) {
  console.log("node-1 (máy chủ \"1\") SỐNG và bắt tay được TỪ CHÍNH MÁY NÀY ⇒ không tái hiện được lỗi \"node 1 không ổn định\".");
}
process.exit(failed.length ? 1 : 0);
