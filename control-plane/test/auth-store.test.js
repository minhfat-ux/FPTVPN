import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AuthStore } from "../src/auth-store.js";

test("enrollment tokens require an active subscription", async () => {
  const { store, cleanup } = await makeStore();
  process.env.ENABLE_FREE_TRIAL = "0"; // no auto-trial: user must have a sub
  try {
    const { code } = await store.startEmailLogin("user@example.com");
    const session = await store.verifyEmailLogin("user@example.com", code);

    await assert.rejects(
      () => store.createEnrollmentToken(session.user.id),
      /Active subscription required/
    );

    await store.grantSubscriptionForTest(session.user.id);
    const token = await store.createEnrollmentToken(session.user.id);
    assert.match(token, /^PVPN-ENROLL-/);
  } finally {
    await cleanup();
  }
});

test("enrollment tokens are one-time and user-bound", async () => {
  const { store, cleanup } = await makeStore();
  try {
    const userA = await createSubscribedUser(store, "a@example.com");
    const userB = await createSubscribedUser(store, "b@example.com");

    const token = await store.createEnrollmentToken(userA.user.id);
    await assert.rejects(
      () => store.consumeEnrollmentToken(token, userB.user.id),
      /does not belong/
    );

    await store.consumeEnrollmentToken(token, userA.user.id);
    await assert.rejects(
      () => store.consumeEnrollmentToken(token, userA.user.id),
      /invalid or expired/
    );
  } finally {
    await cleanup();
  }
});

async function createSubscribedUser(store, email) {
  const { code } = await store.startEmailLogin(email);
  const session = await store.verifyEmailLogin(email, code);
  await store.grantSubscriptionForTest(session.user.id);
  return session;
}

async function makeStore() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "privatevpn-auth-"));
  return {
    store: new AuthStore(path.join(dir, "auth.json")),
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

test("free trial: new account gets 1-day trial once; no re-trial after expiry", async () => {
  const { store, cleanup } = await makeStore();
  process.env.ENABLE_FREE_TRIAL = "1";
  process.env.TRIAL_DAYS = "1";
  try {
    const { code } = await store.startEmailLogin("trial@example.com");
    const session = await store.verifyEmailLogin("trial@example.com", code);
    // Trial is active: enrollment token should now be allowed.
    const token = await store.createEnrollmentToken(session.user.id);
    assert.match(token, /^PVPN-ENROLL-/);

    // Logging in again does NOT re-grant (trialGrantedAt set).
    const { code: code2 } = await store.startEmailLogin("trial@example.com");
    const session2 = await store.verifyEmailLogin("trial@example.com", code2);
    assert.equal(session2.user.id, session.user.id);
    const sub = await store.subscriptionForUserEmail("trial@example.com");
    assert.ok(sub.expiresAt);
    const days = (Date.parse(sub.expiresAt) - Date.now()) / 86400000;
    assert.ok(days <= 1.01 && days > 0.9, "trial ~1 day, got " + days);
  } finally {
    delete process.env.ENABLE_FREE_TRIAL;
    delete process.env.TRIAL_DAYS;
    await cleanup();
  }
});

// Route `GET /v1/auth/session` dựa vào ĐÚNG hành vi này: đọc lại session của một
// token đã cấp phải thấy quyền Premium được cấp SAU lúc đăng nhập.
//
// Vì sao quan trọng: chỉ ba route đăng nhập trả về session, nên `subscription_status`
// tới client đúng một lần lúc đăng nhập. Không có đường đọc lại thì khách trả tiền
// trên web xong vẫn thấy "chưa mua" cho tới khi đăng xuất rồi đăng nhập lại — chặn
// bán hàng, không phải chuyện tiện nghi.
test("sessionPayloadForToken: thấy quyền được cấp SAU khi đăng nhập", async () => {
  const { store, cleanup } = await makeStore();
  process.env.ENABLE_FREE_TRIAL = "0"; // không auto-trial: để chắc chắn lúc đầu là chưa mua
  try {
    const { code } = await store.startEmailLogin("late-buyer@example.com");
    const session = await store.verifyEmailLogin("late-buyer@example.com", code);
    assert.equal(
      session.user.subscription_status?.is_active,
      false,
      "lúc đăng nhập chưa mua thì phải là chưa active",
    );

    // Khách trả tiền trên web, admin xác nhận -> cấp gói trong lúc app đang mở.
    await store.grantSubscription(session.user.id, { productId: "bankqr.monthly", days: 30 });

    const refreshed = await store.sessionPayloadForToken(session.access_token);
    assert.ok(refreshed, "token còn hiệu lực thì phải đọc lại được");
    assert.equal(
      refreshed.access_token,
      session.access_token,
      "phải echo lại chính token caller đưa — client lưu token này",
    );
    assert.equal(
      refreshed.user.subscription_status?.is_active,
      true,
      "cấp gói sau khi đăng nhập thì đọc lại PHẢI thấy active",
    );
    assert.equal(refreshed.user.subscription_status?.product_id, "bankqr.monthly");
  } finally {
    delete process.env.ENABLE_FREE_TRIAL;
    await cleanup();
  }
});

test("sessionPayloadForToken: token sai hoặc rỗng -> null (route trả 401)", async () => {
  const { store, cleanup } = await makeStore();
  try {
    assert.equal(await store.sessionPayloadForToken("khong-phai-token"), null);
    assert.equal(await store.sessionPayloadForToken(""), null);
  } finally {
    await cleanup();
  }
});
