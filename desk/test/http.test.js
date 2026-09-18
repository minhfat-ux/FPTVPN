import test from "node:test";
import assert from "node:assert/strict";
import { ADMIN_TOKEN, SECRET, api, bootDesk, closeDesk, issueCodeViaAdmin, seedOrder, seedUser } from "./helpers.js";

/**
 * Test HTTP đầu-cuối trên service thật (port ngẫu nhiên).
 * Mỗi test dùng một IP riêng để rate limit không lẫn nhau.
 */

seedUser({ id: "u_http", email: "http@example.com", name: "Khách HTTP" });
seedUser({ id: "u_chua_tra", email: "chuatra@example.com" });
seedOrder({ id: "ord_http", userId: "u_http", status: "paid" });

test.after(async () => {
  await closeDesk();
});

test("GET /health công khai, 200, không chứa secret", async () => {
  await bootDesk();
  const res = await api("GET", "/v1/desktop/health", undefined, { ip: "10.2.0.1" });
  assert.equal(res.status, 200);
  assert.equal(res.json.ok, true);
  assert.equal(res.json.service, "flowdesk");
  assert.equal(res.json.entitlementSource.available, true);
  assert.equal(res.text.includes(SECRET), false);
  assert.equal(res.text.includes(ADMIN_TOKEN), false);
  assert.equal(res.headers.get("cache-control"), "no-store");
});

test("đường dẫn lạ ⇒ 404, sai method ⇒ 405", async () => {
  assert.equal((await api("GET", "/v1/desktop/khong-co", undefined, { ip: "10.2.0.2" })).status, 404);
  assert.equal((await api("GET", "/v1/desktop/activate", undefined, { ip: "10.2.0.3" })).status, 405);
});

test("JSON hỏng ⇒ 400 (không phải 500)", async () => {
  const { baseUrl } = await bootDesk();
  const response = await fetch(`${baseUrl}/v1/desktop/activate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "10.2.0.4" },
    body: "{khong-phai-json",
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, "bad_json");
});

test("route admin thiếu token ⇒ 401; sai token ⇒ 401 (không lộ token đúng)", async () => {
  const missing = await api("POST", "/v1/desktop/invitations", { userId: "u_http" }, { ip: "10.2.0.5" });
  assert.equal(missing.status, 401);
  const wrong = await api("POST", "/v1/desktop/invitations", { userId: "u_http" }, { admin: "sai-token", ip: "10.2.0.6" });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.text.includes(ADMIN_TOKEN), false);
});

test("admin không phát được mã cho tài khoản chưa trả tiền ⇒ 403", async () => {
  const res = await api("POST", "/v1/desktop/invitations", { userId: "u_chua_tra" }, { admin: ADMIN_TOKEN, ip: "10.2.0.7" });
  assert.equal(res.status, 403);
  assert.match(res.json.code, /^not_entitled_/);
});

test("luồng đầy đủ: cấp mã → activate → /me → gia hạn → thu hồi ⇒ 401", async () => {
  const ip = "10.2.0.8";
  const issued = await issueCodeViaAdmin({ userId: "u_http", orderId: "ord_http", ip });
  assert.match(issued.code, /^FBW-/);
  assert.equal(issued.invitation.codeHint.length, 4);

  const activated = await api(
    "POST",
    "/v1/desktop/activate",
    { code: issued.code, deviceId: "http-machine-1", deviceLabel: "Máy test" },
    { ip },
  );
  assert.equal(activated.status, 200);
  assert.equal(activated.json.plan, "desktop");
  assert.equal(typeof activated.json.token, "string");
  assert.equal(activated.json.order.id, "ord_http");
  // Không bao giờ trả key Soniox/OpenRouter, cũng không trả lại mã gốc.
  assert.equal(activated.text.includes(issued.code), false);
  assert.equal(/soniox|openrouter|api_key/i.test(activated.text), false);

  const me = await api("GET", "/v1/desktop/me", undefined, { token: activated.json.token, ip });
  assert.equal(me.status, 200);
  assert.equal(me.json.activation.userId, "u_http");
  assert.equal(me.json.usage.limitMinutes > 0, true);
  assert.equal(me.json.usage.exceeded, false);

  const refreshed = await api("POST", "/v1/desktop/session", { token: activated.json.token }, { ip });
  assert.equal(refreshed.status, 200);
  assert.notEqual(refreshed.json.token, activated.json.token);

  const revoked = await api("POST", "/v1/desktop/revoke", {}, { token: refreshed.json.token, ip });
  assert.equal(revoked.status, 200);
  assert.equal(revoked.json.activation.revokedAt !== null, true);

  const afterRevoke = await api("GET", "/v1/desktop/me", undefined, { token: refreshed.json.token, ip });
  assert.equal(afterRevoke.status, 401);
  assert.equal(afterRevoke.json.code, "activation_revoked");
});

test("thu hồi thiết bị của người khác bằng token phiên ⇒ 403", async () => {
  const ip = "10.2.0.9";
  const issued = await issueCodeViaAdmin({ userId: "u_http", orderId: "ord_http", ip });
  const activated = await api("POST", "/v1/desktop/activate", { code: issued.code, deviceId: "http-machine-2" }, { ip });
  const res = await api(
    "POST",
    "/v1/desktop/revoke",
    { activationId: "act_cua_nguoi_khac" },
    { token: activated.json.token, ip },
  );
  assert.equal(res.status, 403);
  assert.equal(res.json.code, "not_owner");
});

test("không có token ⇒ /me 401; token rác ⇒ 401", async () => {
  assert.equal((await api("GET", "/v1/desktop/me", undefined, { ip: "10.2.0.10" })).status, 401);
  assert.equal((await api("GET", "/v1/desktop/me", undefined, { token: "rac.rac", ip: "10.2.0.11" })).status, 401);
});

test("rate limit: quá số lần activate mỗi giờ từ một IP ⇒ 429", async () => {
  const ip = "10.9.9.9";
  let last = null;
  for (let i = 0; i < 6; i += 1) {
    last = await api("POST", "/v1/desktop/activate", { code: "FBW-0000-0000-0000" }, { ip });
  }
  assert.equal(last.status, 429);
  assert.equal(last.headers.get("retry-after") !== null, true);
});

test("chặn dò mã: 3 lần sai từ một IP ⇒ lần sau bị chặn trước cả khi thử mã", async () => {
  const ip = "10.8.8.8";
  const first = await api("POST", "/v1/desktop/activate", { code: "FBW-1111-1111-1111" }, { ip });
  assert.equal(first.status, 403);
  await api("POST", "/v1/desktop/activate", { code: "FBW-2222-2222-2222" }, { ip });
  await api("POST", "/v1/desktop/activate", { code: "FBW-3333-3333-3333" }, { ip });
  const blocked = await api("POST", "/v1/desktop/activate", { code: "FBW-4444-4444-4444" }, { ip });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.json.code, "too_many_failed_attempts");
});

test("admin xem được danh sách activation + audit (đã ghi mọi lần cấp/thu hồi)", async () => {
  const res = await api("GET", "/v1/desktop/activations?userId=u_http", undefined, { admin: ADMIN_TOKEN, ip: "10.2.0.12" });
  assert.equal(res.status, 200);
  assert.equal(res.json.activations.length >= 1, true);
  assert.equal("code_hash" in res.json.activations[0], false);

  const audit = await api("GET", "/v1/desktop/audit?limit=100", undefined, { admin: ADMIN_TOKEN, ip: "10.2.0.13" });
  assert.equal(audit.status, 200);
  const actions = audit.json.entries.map((entry) => entry.action);
  assert.equal(actions.includes("invitation_issued"), true);
  assert.equal(actions.includes("activation_created"), true);
  assert.equal(audit.text.includes(SECRET), false);
});

test("mã phát lại cho cùng (user, đơn) làm mã cũ chết ⇒ app cũ không activate lại được", async () => {
  const ip = "10.2.0.14";
  const first = await issueCodeViaAdmin({ userId: "u_http", orderId: "ord_http", ip });
  const second = await issueCodeViaAdmin({ userId: "u_http", orderId: "ord_http", ip });
  assert.notEqual(first.code, second.code);
  const oldTry = await api("POST", "/v1/desktop/activate", { code: first.code, deviceId: "may-moi-1" }, { ip });
  assert.equal(oldTry.status, 403);
  const newTry = await api("POST", "/v1/desktop/activate", { code: second.code, deviceId: "may-moi-2" }, { ip });
  assert.equal(newTry.status, 200);
});
