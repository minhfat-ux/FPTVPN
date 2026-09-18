import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { api, closeServer, registerAdmin, safeJson } from "./helpers.js";

/**
 * Test cầu nối fBuddy ⇄ flowdesk (bản Windows).
 *
 * `flowdesk` được GIẢ LẬP bằng một HTTP server nhỏ trong test: mục tiêu ở đây là
 * chứng minh fBuddy gọi đúng endpoint, đúng user/đơn, có token admin, và **mọi
 * lời gọi đều không thể làm hỏng đường xác nhận thanh toán**.
 */

const DESK_ADMIN_TOKEN = "test-desk-admin-token";

const received = [];
let codeCounter = 0;

const fakeDesk = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const body = chunks.length ? safeJson(Buffer.concat(chunks).toString("utf8")) : null;
    const entry = {
      method: req.method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams.entries()),
      adminToken: req.headers["x-desk-admin-token"] ?? null,
      body,
    };
    received.push(entry);

    const json = (status, payload) => {
      const text = JSON.stringify(payload);
      res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(text) });
      res.end(text);
    };

    if (url.pathname === "/v1/desktop/health") {
      return json(200, { ok: true, service: "flowdesk", entitlementSource: { available: true } });
    }
    if (url.pathname === "/v1/desktop/activations" && req.method === "GET") {
      return json(200, { ok: true, activations: [{ id: "act_gia_lap", userId: url.searchParams.get("userId"), deviceLabel: "Máy giả lập", activatedAt: new Date().toISOString(), lastSeenAt: new Date().toISOString(), revokedAt: null }] });
    }
    const revokeMatch = /^\/v1\/desktop\/activations\/([^/]+)\/revoke$/.exec(url.pathname);
    if (revokeMatch && req.method === "POST") {
      if (entry.adminToken !== DESK_ADMIN_TOKEN) return json(401, { error: "Token admin không hợp lệ", code: "bad_admin_token" });
      return json(200, { ok: true, activation: { id: decodeURIComponent(revokeMatch[1]), revokedAt: new Date().toISOString() } });
    }
    if (url.pathname === "/v1/desktop/invitations" && req.method === "POST") {
      if (entry.adminToken !== DESK_ADMIN_TOKEN) return json(401, { error: "Token admin không hợp lệ", code: "bad_admin_token" });
      if (!body?.userId) return json(400, { error: "Thiếu userId", code: "missing_user" });
      codeCounter += 1;
      const code = `FBW-${String(codeCounter).padStart(4, "0")}-0000-0000`;
      return json(201, {
        ok: true,
        code,
        invitation: {
          id: `inv_gia_lap_${codeCounter}`,
          userId: body.userId,
          orderId: body.orderId ?? null,
          codeHint: code.slice(-4),
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        },
        order: body.orderId ? { id: body.orderId, paidAt: new Date().toISOString() } : null,
      });
    }
    return json(404, { error: "Không có route này", code: "no_route" });
  });
});

await new Promise((resolve) => fakeDesk.listen(0, "127.0.0.1", resolve));
const deskUrl = `http://127.0.0.1:${fakeDesk.address().port}`;
process.env.FBUDDY_DESK_URL = deskUrl;
process.env.FBUDDY_DESK_ADMIN_TOKEN = DESK_ADMIN_TOKEN;

const { confirmTopupOrder } = await import("../src/topup.js");
const { activationLink } = await import("../src/desktop.js");

test.after(async () => {
  await new Promise((resolve) => fakeDesk.close(resolve));
  // Server fBuddy do helpers boot lên phải đóng, nếu không tiến trình test không thoát.
  await closeServer();
});

const admin = await registerAdmin("desk-admin@fbuddy.test");

async function waitFor(predicate, timeoutMs = 3000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return false;
}

test("đơn được xác nhận paid ⇒ tự động nhờ flowdesk phát mã (đúng user, đúng token admin)", async () => {
  const created = await api("POST", "/topup/orders", { packageId: "starter" }, admin.token);
  const orderId = created.order.id;
  const before = received.length;

  const result = confirmTopupOrder({ orderId, confirmedBy: "test" });
  assert.equal(result.alreadyPaid, false);

  const arrived = await waitFor(() => received.length > before);
  assert.equal(arrived, true, "flowdesk phải nhận được yêu cầu phát mã");
  const call = received[received.length - 1];
  assert.equal(call.path, "/v1/desktop/invitations");
  assert.equal(call.body.userId, admin.user.id);
  assert.equal(call.body.orderId, orderId);
  assert.equal(call.body.reason, "order_paid");
  assert.equal(call.adminToken, DESK_ADMIN_TOKEN);
});

test("xác nhận lại đơn đã paid ⇒ không phát mã lần hai (idempotent)", async () => {
  const created = await api("POST", "/topup/orders", { packageId: "pro" }, admin.token);
  const before = received.length;
  confirmTopupOrder({ orderId: created.order.id, confirmedBy: "test" });
  assert.equal(await waitFor(() => received.length > before), true, "lần xác nhận đầu phải phát mã");
  const afterFirst = received.length;
  const again = confirmTopupOrder({ orderId: created.order.id, confirmedBy: "test" });
  assert.equal(again.alreadyPaid, true);
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(received.length, afterFirst, "không được gọi flowdesk thêm lần nào");
});

test("trang ?view=desktop lấy được trạng thái: có quyền, backend sống, có thiết bị", async () => {
  const status = await api("GET", "/desktop/status", undefined, admin.token);
  assert.equal(status.entitled, true);
  assert.equal(status.configured, true);
  assert.equal(status.healthy, true);
  assert.equal(status.paidOrder.id.length > 0, true);
  assert.equal(status.activations.length, 1);
  assert.equal(status.downloadUrl.includes("MeetFlowAI-Overlay-latest-win-x64.zip"), true);
});

test("trạng thái yêu cầu đăng nhập", async () => {
  await assert.rejects(() => api("GET", "/desktop/status"), (err) => err.status === 401);
});

test("POST /api/desktop/code trả mã đúng định dạng, không lộ token admin", async () => {
  const before = received.length;
  const result = await api("POST", "/desktop/code", {}, admin.token);
  assert.match(result.code, /^FBW-\d{4}-\d{4}-\d{4}$/);
  assert.equal(result.emailed, false);
  assert.equal(result.mailReason, "mailer_not_configured");
  assert.equal(JSON.stringify(result).includes(DESK_ADMIN_TOKEN), false);
  assert.equal(received.length, before + 1);
});

test("trang công khai từ email: token sai ⇒ 403, token đúng ⇒ 200 kèm nút lấy mã", async () => {
  const { bootServer } = await import("./helpers.js");
  const { baseUrl } = await bootServer();

  const bad = await fetch(`${baseUrl}/api/desktop?u=${admin.user.id}&t=rac.rac`);
  assert.equal(bad.status, 403);

  const expired = await fetch(`${baseUrl}/api/desktop?u=${admin.user.id}&t=1.rac`);
  assert.equal(expired.status, 410);

  const token = new URL(activationLink(admin.user.id)).searchParams.get("t");
  const good = await fetch(`${baseUrl}/api/desktop?u=${admin.user.id}&t=${encodeURIComponent(token)}`);
  assert.equal(good.status, 200);
  const html = await good.text();
  assert.match(html, /Kích hoạt MeetFlow AI trên Windows/);
  assert.match(html, /name="action" value="new"/);
  assert.equal(html.includes(DESK_ADMIN_TOKEN), false);
});

test("bấm 'lấy mã' trên trang công khai ⇒ phát mã mới và hiện ngay trên trang", async () => {
  const { bootServer } = await import("./helpers.js");
  const { baseUrl } = await bootServer();
  const token = new URL(activationLink(admin.user.id)).searchParams.get("t");
  const before = received.length;

  const res = await fetch(
    `${baseUrl}/api/desktop?u=${admin.user.id}&t=${encodeURIComponent(token)}&action=new`,
  );
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /FBW-\d{4}-\d{4}-\d{4}/);
  assert.equal(received.length, before + 1);
  assert.equal(received[received.length - 1].body.reason, "public_link");
});

test("thu hồi thiết bị: chỉ thu hồi được thiết bị của chính mình", async () => {
  const ok = await api("POST", "/desktop/activations/act_gia_lap/revoke", {}, admin.token);
  assert.equal(ok.ok, true);
  assert.equal(ok.activation.id, "act_gia_lap");

  // Thiết bị không nằm trong danh sách của mình ⇒ 404 (không tin id client gửi lên).
  await assert.rejects(
    () => api("POST", "/desktop/activations/act_cua_nguoi_khac/revoke", {}, admin.token),
    (err) => err.status === 404,
  );

  // Chưa đăng nhập ⇒ 401.
  await assert.rejects(
    () => api("POST", "/desktop/activations/act_gia_lap/revoke", {}),
    (err) => err.status === 401,
  );
});

test("flowdesk chết: trạng thái báo lỗi, /desktop/code trả 503, nhưng xác nhận thanh toán VẪN xong", async () => {
  const good = process.env.FBUDDY_DESK_URL;
  process.env.FBUDDY_DESK_URL = "http://127.0.0.1:1";
  try {
    const status = await api("GET", "/desktop/status", undefined, admin.token);
    assert.equal(status.configured, true);
    assert.equal(status.healthy, false);
    assert.equal(status.entitled, true);

    await assert.rejects(() => api("POST", "/desktop/code", {}, admin.token), (err) => err.status === 503);

    const created = await api("POST", "/topup/orders", { packageId: "business" }, admin.token);
    const result = confirmTopupOrder({ orderId: created.order.id, confirmedBy: "test" });
    assert.equal(result.order.status, "paid");
    assert.equal(result.order.tokens > 0, true);
    await new Promise((resolve) => setTimeout(resolve, 150));
  } finally {
    process.env.FBUDDY_DESK_URL = good;
  }
});
