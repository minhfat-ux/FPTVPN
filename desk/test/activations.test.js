import test from "node:test";
import assert from "node:assert/strict";
import { seedOrder, seedUser } from "./helpers.js";

const { redeemCode } = await import("../src/activations.js");
const { issueInvitation, revokeInvitation, getInvitation } = await import("../src/codes.js");
const { requireActivation, verifySessionToken, revokeActivation, listActivations } = await import("../src/sessions.js");
const { initDb } = await import("../src/db.js");
const { base64url, hmacHex } = await import("../src/util.js");
const { config } = await import("../src/config.js");

initDb();

seedUser({ id: "u_win", email: "win@example.com", name: "Khách Windows" });
seedUser({ id: "u_free", email: "free@example.com" });
seedOrder({ id: "ord_win", userId: "u_win", status: "paid" });

function redeem(code, extra = {}) {
  return redeemCode({ code, ip: "10.1.0.1", ...extra });
}

test("mã hợp lệ + đơn paid ⇒ cấp token phiên và ghi một activation", () => {
  const { code, invitation } = issueInvitation({ userId: "u_win", orderId: "ord_win" });
  const result = redeem(code, { deviceId: "machine-a", deviceLabel: "PC văn phòng" });
  assert.equal(result.plan, "desktop");
  assert.equal(result.order.id, "ord_win");
  assert.equal(result.activation.userId, "u_win");
  assert.equal(result.activation.deviceLabel, "PC văn phòng");
  assert.equal(verifySessionToken(result.session.token).ok, true);
  assert.equal(getInvitation(invitation.id).uses, 1);
  assert.equal(listActivations({ userId: "u_win" }).length, 1);
});

test("cùng deviceId kích hoạt lại ⇒ dùng lại activation, KHÔNG tiêu thêm lượt", () => {
  const { code, invitation } = issueInvitation({ userId: "u_win", orderId: "ord_win" });
  const first = redeem(code, { deviceId: "machine-b" });
  const again = redeem(code, { deviceId: "machine-b" });
  assert.equal(again.activation.id, first.activation.id);
  assert.equal(getInvitation(invitation.id).uses, 1);
});

test("thiết bị mới tiêu thêm lượt; quá số thiết bị ⇒ từ chối", () => {
  const { code, invitation } = issueInvitation({ userId: "u_win", orderId: "ord_win" });
  redeem(code, { deviceId: "machine-c1" });
  redeem(code, { deviceId: "machine-c2" });
  assert.equal(getInvitation(invitation.id).uses, 2);
  assert.throws(() => redeem(code, { deviceId: "machine-c3" }), (err) => {
    assert.equal(err.status, 403);
    assert.equal(err.code, "code_exhausted");
    return true;
  });
});

test("mã sai định dạng ⇒ 400, mã không tồn tại ⇒ 403 (không tiết lộ mã nào có thật)", () => {
  assert.throws(() => redeem("khong-phai-ma"), (err) => err.status === 400);
  assert.throws(() => redeem("FBW-2222-3333-4444"), (err) => {
    assert.equal(err.status, 403);
    assert.equal(err.code, "code_not_found");
    return true;
  });
});

test("mã của user KHÔNG có đơn paid ⇒ từ chối (quyền đọc từ DB, không tin client)", () => {
  const { code } = issueInvitation({ userId: "u_free", orderId: null });
  assert.throws(() => redeem(code), (err) => {
    assert.equal(err.status, 403);
    assert.match(err.code, /^not_entitled_/);
    return true;
  });
});

test("mã bị thu hồi ⇒ từ chối", () => {
  const { code, invitation } = issueInvitation({ userId: "u_win", orderId: "ord_win" });
  revokeInvitation({ id: invitation.id, reason: "test" });
  assert.throws(() => redeem(code), (err) => err.code === "code_revoked");
});

test("thu hồi thiết bị là DÍNH: cùng máy không tự kích hoạt lại được, máy khác vẫn được", () => {
  const { code } = issueInvitation({ userId: "u_win", orderId: "ord_win" });
  const first = redeem(code, { deviceId: "machine-sticky" });
  revokeActivation({ id: first.activation.id, reason: "admin_revoked" });

  assert.throws(() => redeem(code, { deviceId: "machine-sticky" }), (err) => {
    assert.equal(err.status, 403);
    assert.equal(err.code, "device_revoked");
    return true;
  });

  // Máy khác trong hạn mức thiết bị của mã vẫn kích hoạt bình thường.
  const other = redeem(code, { deviceId: "machine-khac" });
  assert.equal(other.activation.deviceId, "machine-khac");
});

test("activation bị thu hồi ⇒ token cũ mất hiệu lực ngay", () => {
  const { code } = issueInvitation({ userId: "u_win", orderId: "ord_win" });
  const result = redeem(code, { deviceId: "machine-d" });
  assert.equal(requireActivation(result.session.token).id, result.activation.id);
  revokeActivation({ id: result.activation.id, reason: "test_revoke" });
  assert.throws(() => requireActivation(result.session.token), (err) => {
    assert.equal(err.status, 401);
    assert.equal(err.code, "activation_revoked");
    return true;
  });
});

test("token sửa một ký tự ⇒ chữ ký sai, bị từ chối", () => {
  const { code } = issueInvitation({ userId: "u_win", orderId: "ord_win" });
  const { session } = redeem(code, { deviceId: "machine-e" });
  const tampered = `${session.token.slice(0, -2)}xy`;
  assert.equal(verifySessionToken(tampered).reason, "bad_signature");
  assert.throws(() => requireActivation(tampered), (err) => err.status === 401);
});

test("token hết hạn bị từ chối (exp trong quá khứ, chữ ký vẫn đúng)", () => {
  const payload = { v: "d1", aid: "act_khong_co", uid: "u_win", iat: Date.now() - 7_200_000, exp: Date.now() - 3_600_000 };
  const payloadB64 = base64url(JSON.stringify(payload));
  const signature = base64url(hmacHex(config.secret, `session:${payloadB64}`));
  assert.equal(verifySessionToken(`${payloadB64}.${signature}`).reason, "expired");
});
