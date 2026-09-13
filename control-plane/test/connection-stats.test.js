import test from "node:test";
import assert from "node:assert/strict";
import {
  ONLINE_HANDSHAKE_WINDOW_SEC,
  clientIPFromEndpoint,
  isPeerOnline,
  ispHintFromPTR,
  aggregateConnections,
  createPTRLookup,
} from "../src/connection-stats.js";

const NOW = 1_800_000_000; // giây, mốc thời gian cố định cho test

test("clientIPFromEndpoint tách IP công khai khỏi endpoint của wg", () => {
  assert.equal(clientIPFromEndpoint("1.2.3.4:51820"), "1.2.3.4");
  assert.equal(clientIPFromEndpoint("[2001:db8::1]:51820"), "2001:db8::1");
  assert.equal(clientIPFromEndpoint("2001:db8::1"), "2001:db8::1");
  assert.equal(clientIPFromEndpoint("(none)"), "(none)");
  assert.equal(clientIPFromEndpoint(""), null);
  assert.equal(clientIPFromEndpoint(null), null);
  assert.equal(clientIPFromEndpoint(undefined), null);
});

test("isPeerOnline dùng cửa sổ handshake 3 phút", () => {
  assert.equal(ONLINE_HANDSHAKE_WINDOW_SEC, 180);
  assert.equal(isPeerOnline({ latestHandshakeSec: NOW - 5 }, NOW), true);
  assert.equal(isPeerOnline({ latestHandshakeSec: NOW - 179 }, NOW), true);
  assert.equal(isPeerOnline({ latestHandshakeSec: NOW - 181 }, NOW), false);
  // Chưa từng handshake (wg trả 0) => không tính là đang kết nối.
  assert.equal(isPeerOnline({ latestHandshakeSec: 0 }, NOW), false);
  assert.equal(isPeerOnline({}, NOW), false);
  // Handshake "ở tương lai" (lệch đồng hồ) không tính là online.
  assert.equal(isPeerOnline({ latestHandshakeSec: NOW + 30 }, NOW), false);
});

test("ispHintFromPTR suy ra ISP + country hint từ tên PTR", () => {
  assert.deepEqual(ispHintFromPTR("static.vnpt.vn"), { isp: "vnpt", country: "VN" });
  assert.deepEqual(ispHintFromPTR("static.vnpt.vn."), { isp: "vnpt", country: "VN" });
  assert.deepEqual(ispHintFromPTR("123.45.static.viettel.com.vn"), { isp: "viettel", country: "VN" });
  assert.deepEqual(ispHintFromPTR("pool-1.fpt.net"), { isp: "fpt", country: null });
  assert.deepEqual(ispHintFromPTR("host-1-2-3-4.example.net"), { isp: "example", country: null });
  assert.deepEqual(ispHintFromPTR("dynamic-ip-1.isp.com"), { isp: "isp", country: null });
  assert.deepEqual(ispHintFromPTR("vnpt-hanoi-1.vn"), { isp: "vnpt", country: "VN" });
  assert.deepEqual(ispHintFromPTR("dns.google"), { isp: "google", country: null });
  // Không có PTR / PTR vô nghĩa => null, không bịa dữ liệu.
  assert.deepEqual(ispHintFromPTR(null), { isp: null, country: null });
  assert.deepEqual(ispHintFromPTR(""), { isp: null, country: null });
  assert.deepEqual(ispHintFromPTR("static.dynamic.pool"), { isp: null, country: null });
});

test("aggregateConnections gom thiết bị online theo từng server", () => {
  const nodes = [
    { id: "vn-hn", name: "Vietnam Hanoi", country: "VN", city: "Hanoi" },
    { id: "sg-1", name: "Singapore 1", country: "SG", city: "Singapore" },
  ];
  const peersByNode = new Map([
    ["vn-hn", [
      { publicKey: "key-a", endpoint: "1.2.3.4:51820", latestHandshakeSec: NOW - 10, rxBytes: 100, txBytes: 200 },
      { publicKey: "key-b", endpoint: "5.6.7.8:51820", latestHandshakeSec: NOW - 400 }, // stale
    ]],
    ["sg-1", [
      { publicKey: "key-c", endpoint: "9.9.9.9:51820", latestHandshakeSec: NOW - 30 },
      { publicKey: "key-d", endpoint: "8.8.8.8:51820", latestHandshakeSec: NOW - 60 },
    ]],
  ]);
  const devicesByPublicKey = new Map([
    ["key-a", { id: "dev-1", deviceName: "iPhone của Minh", platform: "ios", userId: "u1" }],
    ["key-c", { id: "dev-3", deviceName: "Pixel", platform: "android", userId: "u2" }],
  ]);
  const ispByIP = new Map([
    ["1.2.3.4", { isp: "vnpt", country: "VN" }],
    ["9.9.9.9", { isp: "singtel", country: "SG" }],
    ["8.8.8.8", { isp: null, country: null }],
  ]);

  const result = aggregateConnections({ nodes, peersByNode, devicesByPublicKey, ispByIP, nowSec: NOW });

  // Chart "số thiết bị đang kết nối theo từng server".
  assert.equal(result.by_node.length, 2);
  assert.equal(result.by_node[0].node_id, "sg-1");
  assert.equal(result.by_node[0].online, 2);
  assert.equal(result.by_node[0].location, "Singapore, SG");
  assert.equal(result.by_node[1].node_id, "vn-hn");
  assert.equal(result.by_node[1].online, 1);
  assert.equal(result.by_node[1].total, 2); // stale peer vẫn nằm trong tổng peer
  assert.deepEqual(result.totals, { online: 3, total: 4, nodes: 2 });

  // Bảng thiết bị: ghép được device registry + IP/ISP.
  assert.equal(result.online_devices.length, 3);
  const first = result.online_devices[0];
  assert.equal(first.device_name, "iPhone của Minh");
  assert.equal(first.platform, "ios");
  assert.equal(first.user_id, "u1");
  assert.equal(first.node_id, "vn-hn");
  assert.equal(first.node_name, "Vietnam Hanoi");
  assert.equal(first.client_ip, "1.2.3.4");
  assert.equal(first.isp, "vnpt");
  assert.equal(first.country, "VN");
  assert.equal(first.connected_sec, 10);
  assert.equal(first.rx_bytes, 100);
  assert.equal(first.tx_bytes, 200);

  // Peer không có trong registry vẫn hiện (không giấu thiết bị lạ).
  const unknown = result.online_devices.find((d) => d.client_ip === "8.8.8.8");
  assert.equal(unknown.device_id, null);
  assert.equal(unknown.device_name, null);

  // Chart theo ISP: IP không tra được gom vào "unknown ISP".
  assert.deepEqual(result.by_location, { "vnpt (VN)": 1, "singtel (SG)": 1, "unknown ISP": 1 });
});

test("aggregateConnections không trộn peer giữa các node và xử lý node rỗng", () => {
  const nodes = [
    { id: "n1", name: "Node 1" },
    { id: "n2", name: "Node 2" },
  ];
  const peersByNode = new Map([["n1", [{ publicKey: "dup", endpoint: "1.1.1.1:1", latestHandshakeSec: NOW - 5 }]]]);
  const result = aggregateConnections({ nodes, peersByNode, nowSec: NOW });
  assert.equal(result.by_node.find((n) => n.node_id === "n1").online, 1);
  assert.equal(result.by_node.find((n) => n.node_id === "n2").online, 0);
  assert.equal(result.by_node.find((n) => n.node_id === "n2").total, 0);
  assert.equal(result.by_location["unknown ISP"], 1);

  // Không có node nào => mọi thứ rỗng, không throw.
  const empty = aggregateConnections({});
  assert.deepEqual(empty.by_node, []);
  assert.deepEqual(empty.online_devices, []);
  assert.deepEqual(empty.totals, { online: 0, total: 0, nodes: 0 });
});

test("createPTRLookup có cache và chịu được resolver treo/lỗi", async () => {
  let calls = 0;
  const lookup = createPTRLookup({
    resolve: async (ip) => {
      calls += 1;
      return ip === "1.2.3.4" ? ["static.vnpt.vn"] : [];
    },
  });

  const first = await lookup.lookupMany(["1.2.3.4", "5.6.7.8"]);
  assert.equal(first.get("1.2.3.4").isp, "vnpt");
  assert.equal(first.get("1.2.3.4").country, "VN");
  assert.equal(first.get("5.6.7.8").isp, null);
  assert.equal(calls, 2);

  // Lần 2 lấy từ cache => không gọi resolver thêm.
  await lookup.lookupMany(["1.2.3.4"]);
  assert.equal(calls, 2);

  // Resolver treo => timeout, trả null thay vì treo request dashboard.
  const hanging = createPTRLookup({ resolve: () => new Promise(() => {}), timeoutMs: 20 });
  const timedOut = await hanging.lookupMany(["9.9.9.9"]);
  assert.deepEqual(timedOut.get("9.9.9.9"), { isp: null, country: null, hostname: null });

  // Resolver lỗi => null, không throw.
  const failing = createPTRLookup({ resolve: async () => { throw new Error("ENOTFOUND"); } });
  const failed = await failing.lookupMany(["7.7.7.7"]);
  assert.equal(failed.get("7.7.7.7").isp, null);
});

test("createPTRLookup bắt buộc có resolver", () => {
  assert.throws(() => createPTRLookup({}), /requires a resolve/);
});
