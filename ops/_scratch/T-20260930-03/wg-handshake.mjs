// CLI mỏng dùng ops/lib/wgprobe.mjs để phát MỘT handshake WireGuard từ máy này tới một node.
// (Bản cài đặt chuẩn nằm ở ops/lib/wgprobe.mjs — đã đối chiếu byte-for-byte với bản tham chiếu
//  Python và với kernel WireGuard thật; xem docs/evidence/T-20260930-03/README.md.)
//
//   node ops/_scratch/T-20260930-03/wg-handshake.mjs --endpoint 103.173.155.50:443 \
//        --responder <base64 public key của node> [--timeout 6000] [--hex]
//
// Exit 0 = có message type 2 khớp sender_index (bắt tay OK); 1 = không có phản hồi.
// Khoá riêng thiết bị đọc từ %APPDATA%\VPNFlow\device.json lúc chạy — KHÔNG nằm trong repo.

import { buildInitiation, loadLocalDeviceKey, probeHandshake } from "../../lib/wgprobe.mjs";

const argv = process.argv.slice(2);
const opt = (name, def = null) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};
const has = (name) => argv.includes(`--${name}`);

const endpoint = opt("endpoint", "103.173.155.50:443");
const [host, portStr] = endpoint.split(":");
const responderPub = Buffer.from(opt("responder", ""), "base64");
if (responderPub.length !== 32) {
  console.error("--responder <base64 public key 32 byte> là bắt buộc");
  process.exit(2);
}

const key = loadLocalDeviceKey({ profilePath: opt("device") });
if (!key) {
  console.error("không thấy khoá thiết bị VPNFlow (device.json) trên máy này");
  process.exit(2);
}

console.log(`thiết bị: pubkey=${key.pub.toString("base64")} (từ ${key.file})`);
console.log(`đích: ${host}:${portStr} (responder=${responderPub.toString("base64")})`);

if (has("hex")) {
  const { packet } = buildInitiation(key.priv, key.pub, responderPub);
  console.log(`HEX ${packet.toString("hex")}`);
  process.exit(0);
}

const timeoutMs = Number(opt("timeout", 6000));
const result = await probeHandshake({
  host,
  port: Number(portStr),
  responderPub,
  staticPriv: key.priv,
  staticPub: key.pub,
  timeoutMs,
});
console.log(`${result.ok ? "OK" : "KHONG"}: ${result.reason} (${result.rttMs.toFixed(1)} ms)`);
process.exit(result.ok ? 0 : 1);
