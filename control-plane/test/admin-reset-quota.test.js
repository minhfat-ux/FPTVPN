import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AuthStore } from "../src/auth-store.js";

const DAY_MS = 24 * 60 * 60 * 1000;

async function makeStore() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "auth-reset-"));
  const store = new AuthStore(path.join(dir, "auth.json"));
  return { store, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

async function createUser(store, email) {
  const { code } = await store.startEmailLogin(email);
  const session = await store.verifyEmailLogin(email, code);
  return session.user;
}

async function rowFor(store, userId) {
  const rows = await store.listUsersWithExpiry();
  return rows.find((row) => row.id === userId);
}

function daysFromNow(iso) {
  return Math.round((Date.parse(iso) - Date.now()) / DAY_MS);
}

test("resetSubscription ĐẶT hạn = hôm nay + 30 ngày, KHÔNG cộng dồn hạn cũ", async () => {
  process.env.ENABLE_FREE_TRIAL = "0";
  const { store, cleanup } = await makeStore();
  try {
    const user = await createUser(store, "reset-a@example.com");
    await store.grantSubscription(user.id, { days: 300 });
    const before = await rowFor(store, user.id);
    assert.ok(daysFromNow(before.expires_at) > 250, "tiền đề: hạn cũ phải ~300 ngày");

    await store.resetSubscription(user.id, { days: 30 });
    const after = await rowFor(store, user.id);
    assert.equal(daysFromNow(after.expires_at), 30, "hạn mới phải là 30 ngày, không phải 330");
    assert.equal(after.expiry_status, "active");
  } finally {
    await cleanup();
  }
});

test("resetSubscription idempotent: bấm 2 lần vẫn 30 ngày (không thành 60)", async () => {
  process.env.ENABLE_FREE_TRIAL = "0";
  const { store, cleanup } = await makeStore();
  try {
    const user = await createUser(store, "reset-b@example.com");
    await store.grantSubscription(user.id, { days: 10 });
    await store.resetSubscription(user.id, { days: 30 });
    await store.resetSubscription(user.id, { days: 30 });
    const row = await rowFor(store, user.id);
    assert.equal(daysFromNow(row.expires_at), 30);
  } finally {
    await cleanup();
  }
});

test("resetSubscription với days <= 0 = vĩnh viễn (expires_at null)", async () => {
  process.env.ENABLE_FREE_TRIAL = "0";
  const { store, cleanup } = await makeStore();
  try {
    const user = await createUser(store, "reset-c@example.com");
    await store.grantSubscription(user.id, { days: 5 });
    await store.resetSubscription(user.id, { days: 0 });
    const row = await rowFor(store, user.id);
    assert.equal(row.expires_at, null);
    assert.equal(row.expiry_status, "lifetime");
  } finally {
    await cleanup();
  }
});

test("resetSubscription user không tồn tại ⇒ báo lỗi, không ghi gì", async () => {
  const { store, cleanup } = await makeStore();
  try {
    await assert.rejects(() => store.resetSubscription("khong-co-user-nay", { days: 30 }), /User not found/);
  } finally {
    await cleanup();
  }
});
