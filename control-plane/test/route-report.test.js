import test from "node:test";
import assert from "node:assert/strict";
import express from "express";

import {
  ROUTE_REPORT_PATH,
  decideRoute,
  registerRouteReport,
  validateRouteReport,
} from "../src/route-report.js";

/** Body hợp lệ tối thiểu — mỗi test chỉ sửa phần cần kiểm. */
function validReport(overrides = {}) {
  return {
    platform: "ios",
    app_version: "1.5.0",
    device_id: "vpn-abc123",
    credential: "cred-xyz",
    network: { type: "cell", identity_hash: "a".repeat(64), raw_kbps: 21000 },
    current: {
      transport: "ws",
      node: "165.101.114.162",
      port: null,
      rtt_ms: 1800,
      goodput_kbps: 6400,
      stable_kbps: 6400,
      reconnects: 1,
      window_s: 600,
    },
    candidates: [{ transport: "tcp", port: 8443, node: "103.173.155.50", connect_ms: 320, result: "ok" }],
    ...overrides,
  };
}

/** Khởi động app thật rồi trả {url, close} để test qua HTTP. */
async function withServer(registerOptions = {}, env = {}) {
  const app = express();
  app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));
  const store = registerOptions.store ?? {
    findById: async (id) => (id === "vpn-abc123" ? { id, active: true, peerCredential: "cred-xyz" } : null),
    all: async () => [],
    _save: async () => {},
  };
  registerRouteReport(app, { store, log: { log() {}, warn() {}, error() {} }, env: { ROUTE_REPORT: "1", ...env }, ...registerOptions });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  return {
    url: `http://127.0.0.1:${server.address().port}${ROUTE_REPORT_PATH}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

test("validateRouteReport: body hợp lệ đi qua, giữ đúng số đo", () => {
  const result = validateRouteReport(validReport());
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.value.platform, "ios");
  assert.equal(result.value.network.raw_kbps, 21000);
  assert.equal(result.value.current.transport, "ws");
  assert.equal(result.value.candidates.length, 1);
  assert.equal(result.value.candidates[0].connectMs, 320);
});

test("validateRouteReport: TỪ CHỐI dữ liệu định danh thô (luật riêng tư §2f.3)", () => {
  const withSsid = validateRouteReport(validReport({ network: { type: "wifi", ssid: "Nha-Anh-Minh", identity_hash: "b".repeat(64), raw_kbps: 50000 } }));
  assert.equal(withSsid.ok, false);
  assert.match(withSsid.errors.join(","), /forbidden_keys:ssid/);

  const withEmail = validateRouteReport(validReport({ email: "a@b.com" }));
  assert.equal(withEmail.ok, false);
  assert.match(withEmail.errors.join(","), /forbidden_keys:email/);
});

test("validateRouteReport: identity_hash phải là BĂM, không nhận giá trị thô", () => {
  const raw = validateRouteReport(validReport({ network: { type: "cell", identity_hash: "Viettel-4G", raw_kbps: 1000 } }));
  assert.equal(raw.ok, false);
  assert.match(raw.errors.join(","), /identity_hash:not_a_hash/);
});

test("validateRouteReport: chặn transport lạ, thiếu current, quá nhiều candidates", () => {
  assert.equal(validateRouteReport(validReport({ current: { transport: "quic-xyz", goodput_kbps: 1 } })).ok, false);
  assert.equal(validateRouteReport(validReport({ current: undefined })).ok, false);
  const many = validReport({ candidates: Array.from({ length: 7 }, () => ({ transport: "tcp", result: "ok" })) });
  const result = validateRouteReport(many);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(","), /candidates:too_many/);
});

test("decideRoute: đang đi cầu WS mà có đường trực tiếp chạy được ⇒ đề xuất thoát WS", () => {
  const report = validateRouteReport(validReport()).value;
  const decision = decideRoute(report);
  assert.equal(decision.reason, "ws_bottleneck");
  assert.equal(decision.recommended.transport, "tcp");
  assert.equal(decision.recommended.port, 8443);
  assert.equal(decision.ttl_s, 1800);
});

test("decideRoute: không có đường nào khác đã chứng minh ⇒ GIỮ NGUYÊN (recommended null)", () => {
  const report = validateRouteReport(validReport({
    current: { transport: "tcp", node: "165.101.114.162", port: 8443, rtt_ms: 200, goodput_kbps: 18000, stable_kbps: 18000, reconnects: 0 },
    network: { type: "wifi", identity_hash: "c".repeat(64), raw_kbps: 20000 },
    candidates: [{ transport: "ws", node: "165.101.114.162", result: "fail", connect_ms: -1 }],
  })).value;
  const decision = decideRoute(report);
  assert.equal(decision.recommended, null);
  assert.match(decision.reason, /không có đường nào khác/);
});

test("decideRoute: goodput < 50% mạng gốc ⇒ đề xuất đường khác đã chạy được", () => {
  const report = validateRouteReport(validReport({
    current: { transport: "tcp", node: "165.101.114.162", port: 8443, rtt_ms: 300, goodput_kbps: 3000, stable_kbps: 3000, reconnects: 0 },
    network: { type: "cell", identity_hash: "d".repeat(64), raw_kbps: 20000 },
    candidates: [{ transport: "udp", port: 8443, node: "165.101.114.162", rtt_ms: 150, result: "ok" }],
  })).value;
  const decision = decideRoute(report);
  assert.equal(decision.reason, "under_half_of_raw");
  assert.equal(decision.recommended.transport, "udp");
});

test("decideRoute: node hiện tại reconnect nhiều + có node khác chạy được ⇒ đổi node", () => {
  const report = validateRouteReport(validReport({
    current: { transport: "tcp", node: "165.101.114.162", port: 8443, rtt_ms: 300, goodput_kbps: 9000, stable_kbps: 9000, reconnects: 3 },
    network: { type: "cell", identity_hash: "e".repeat(64), raw_kbps: 12000 },
    candidates: [{ transport: "tcp", port: 8443, node: "103.173.155.50", rtt_ms: 1500, result: "ok" }],
  })).value;
  const decision = decideRoute(report);
  assert.equal(decision.reason, "current_node_unstable");
  assert.equal(decision.recommended.node, "103.173.155.50");
});

test("HTTP: gửi báo cáo hợp lệ ⇒ 200 kèm recommended + ttl_s", async () => {
  const server = await withServer();
  try {
    const res = await fetch(server.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validReport()),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.recommended.transport, "tcp");
    assert.equal(body.ttl_s, 1800);
  } finally {
    await server.close();
  }
});

test("HTTP: báo dày hơn nhịp 5 phút ⇒ trả null + retry_after_s (KHÔNG phạt lỗi)", async () => {
  const server = await withServer();
  try {
    const send = () => fetch(server.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validReport()),
    });
    const first = await send();
    assert.equal((await first.json()).recommended.transport, "tcp");

    const second = await send();
    assert.equal(second.status, 200);
    const body = await second.json();
    assert.equal(body.recommended, null);
    assert.equal(body.reason, "too_soon");
    assert.ok(body.retry_after_s > 0 && body.retry_after_s <= 300);
  } finally {
    await server.close();
  }
});

test("HTTP: sai credential ⇒ 403; thiết bị lạ ⇒ 404", async () => {
  const server = await withServer();
  try {
    const wrong = await fetch(server.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validReport({ credential: "cred-sai" })),
    });
    assert.equal(wrong.status, 403);

    const unknown = await fetch(server.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validReport({ device_id: "vpn-la-hoac" })),
    });
    assert.equal(unknown.status, 404);
  } finally {
    await server.close();
  }
});

test("HTTP: body chứa khoá định danh thô ⇒ 400 (không bao giờ ghi nhận)", async () => {
  const server = await withServer();
  try {
    const res = await fetch(server.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validReport({ network: { type: "wifi", ssid: "Nha", identity_hash: "f".repeat(64), raw_kbps: 1000 } })),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, "invalid_route_report");
  } finally {
    await server.close();
  }
});

test("HTTP: tắt bằng env ⇒ vẫn trả null để app chạy y như chưa có endpoint", async () => {
  const server = await withServer({}, { ROUTE_REPORT: "0" });
  try {
    const res = await fetch(server.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validReport()),
    });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).recommended, null);
  } finally {
    await server.close();
  }
});
