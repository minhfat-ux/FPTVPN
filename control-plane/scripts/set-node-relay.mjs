#!/usr/bin/env node
/**
 * Đặt relay WebSocket cho một exit node — đường dự phòng khi client bị chặn UDP trực tiếp.
 *
 * VÌ SAO PHẢI LÀ TÊN MIỀN VÀ PHẢI THEO TỪNG NODE: IP node đổi (nhà cung cấp/GFW) thì client
 * nhận endpoint mới qua `/v1/nodes`, nhưng đường dự phòng phải là một hostname cố định —
 * đó là giá trị ở đây. Một relay chỉ forward tới MỘT cổng UDP, nên có hai field riêng:
 *   --wg  wg_relay_url  relay WireGuard (UDP 443) — iOS/macOS đọc
 *   --hy  hy_relay_url  relay Hysteria (UDP 8443) — Android đọc
 * (`ws_relay_url` cũ giữ lại chỉ để tương thích ngược với app đã phát hành; đừng ghi vào đó.)
 *
 * Dùng (trên node-2, trong /root/flowvpn-cp):
 *   node scripts/set-node-relay.mjs --show
 *   node scripts/set-node-relay.mjs vietnam-2 --wg wss://fcnvpn.tail303be3.ts.net/vn2
 *   node scripts/set-node-relay.mjs vietnam-2 --hy wss://fcnvpn.tail303be3.ts.net/vn2hy
 *   node scripts/set-node-relay.mjs vietnam-2 --wg --clear
 *
 * Ghi qua chính `NodeStore.update()` nên mọi kiểm tra (URL tuyệt đối, bắt buộc wss://) đều áp dụng.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NodeStore } from "../src/node-store.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DB = process.env.NODES_DB_FILE || path.join(HERE, "..", "data", "nodes.db");
const FIELDS = { wg: "wg_relay_url", hy: "hy_relay_url" };

function show(store) {
  for (const r of store.db.prepare("SELECT id, endpoint, wg_relay_url, hy_relay_url, active FROM exit_nodes ORDER BY priority").all()) {
    console.log(`  ${r.id.padEnd(12)} endpoint=${String(r.endpoint).padEnd(22)} wg=${r.wg_relay_url ?? "—"} hy=${r.hy_relay_url ?? "—"} active=${r.active}`);
  }
}

const argv = process.argv.slice(2);
if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
  console.log("Dùng: node scripts/set-node-relay.mjs <node-id> --wg|--hy <wss-url|--clear> | --show");
  process.exit(argv.length === 0 ? 2 : 0);
}

const store = new NodeStore(DB);
if (argv[0] === "--show") {
  show(store);
  process.exit(0);
}

const [id, flag, value] = argv;
const field = FIELDS[String(flag).replace(/^--/, "")];
if (!field) {
  console.error(`LỖI: phải chọn --wg hoặc --hy (nhận: ${flag ?? "(không có)"})`);
  process.exit(2);
}
if (!value) {
  console.error("LỖI: thiếu URL (hoặc --clear)");
  process.exit(2);
}
const next = value === "--clear" ? null : value;
if (next != null && !next.startsWith("wss://")) {
  console.error("LỖI: relay phải là wss:// (ws:// trần không mã hoá và bị mạng chặn).");
  process.exit(2);
}

try {
  const updated = await store.update(id, { [field]: next });
  if (!updated) {
    console.error(`LỖI: không có node id=${id}`);
    process.exit(1);
  }
  console.log(`  ${updated.id}: ${field} = ${updated[field] ?? "(đã xoá)"}`);
  show(store);
} catch (err) {
  console.error("LỖI:", err.message);
  process.exit(2);
}
