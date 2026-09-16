import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DeviceStore } from "../src/device-store.js";

async function makeStore() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "pvn-device-store-"));
  const store = new DeviceStore(path.join(dir, "devices.json"));
  return { store, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

test("device: upsert assigns userId; devicesByUserId filters by owner", async () => {
  const { store, cleanup } = await makeStore();
  try {
    await store.upsertByPublicKey({ publicKey: "A", deviceName: "ios-a", assignedIP: "10.77.0.2", platform: "ios", userId: "u1" });
    await store.upsertByPublicKey({ publicKey: "B", deviceName: "mac-b", assignedIP: "10.77.0.3", platform: "macos", userId: "u2" });
    await store.upsertByPublicKey({ publicKey: "C", deviceName: "ios-c", assignedIP: "10.77.0.4", platform: "ios", userId: "u1" });

    const u1devices = await store.devicesByUserId("u1");
    assert.equal(u1devices.length, 2);
    assert.deepEqual(u1devices.map((d) => d.publicKey).sort(), ["A", "C"]);

    const all = await store.all();
    assert.equal(all.length, 3);
  } finally {
    await cleanup();
  }
});

test("device: re-register by same public key under a different user is rejected", async () => {
  const { store, cleanup } = await makeStore();
  try {
    await store.upsertByPublicKey({ publicKey: "A", deviceName: "ios-a", assignedIP: "10.77.0.2", userId: "u1" });
    await assert.rejects(
      () => store.upsertByPublicKey({ publicKey: "A", deviceName: "ios-a2", assignedIP: "10.77.0.2", userId: "u2" }),
      /belongs to another user/
    );
  } finally {
    await cleanup();
  }
});

test("device: revoked device rejects re-registration and disappears from active flow", async () => {
  const { store, cleanup } = await makeStore();
  try {
    const { device } = await store.upsertByPublicKey({ publicKey: "A", deviceName: "ios-a", assignedIP: "10.77.0.2", userId: "u1" });
    const deactivated = await store.deactivate(device.id);
    assert.equal(deactivated.active, false);
    await assert.rejects(
      () => store.upsertByPublicKey({ publicKey: "A", deviceName: "ios-a", assignedIP: "10.77.0.2", userId: "u1" }),
      /has been revoked/
    );
  } finally {
    await cleanup();
  }
});

test("device: deactivate keeps the record (revoke history preserved)", async () => {
  const { store, cleanup } = await makeStore();
  try {
    const { device } = await store.upsertByPublicKey({ publicKey: "A", deviceName: "ios-a", assignedIP: "10.77.0.2", userId: "u1" });
    const updated = await store.deactivate(device.id);
    const found = await store.findById(device.id);
    assert.equal(updated.active, false);
    assert.equal(found.active, false);
    assert.equal(found.publicKey, "A");
  } finally {
    await cleanup();
  }
});

test("device: markSeen ghi lastSeenAt + IP công khai mà server nhìn thấy", async () => {
  const { store, cleanup } = await makeStore();
  try {
    const created = await store.upsertByPublicKey({
      publicKey: "K1",
      deviceName: "ios-1",
      assignedIP: "10.77.0.9",
      platform: "ios",
      userId: "u1",
    });

    const seen = await store.markSeen(created.device.id, { at: "2026-09-16T10:00:00.000Z", clientIp: "113.161.80.1" });
    assert.equal(seen.lastSeenAt, "2026-09-16T10:00:00.000Z");
    assert.equal(seen.lastClientIp, "113.161.80.1");
    assert.equal(seen.lastClientIpAt, "2026-09-16T10:00:00.000Z");

    // Không truyền IP (vd request nội bộ/loopback) ⇒ chỉ cập nhật lastSeenAt, GIỮ IP cũ.
    const later = await store.markSeen(created.device.id, { at: "2026-09-16T11:00:00.000Z", clientIp: null });
    assert.equal(later.lastClientIp, "113.161.80.1", "IP cũ không được xoá khi lần này không có IP");
    assert.equal(later.lastSeenAt, "2026-09-16T11:00:00.000Z");

    assert.equal(await store.markSeen("khong-co-that", { clientIp: "8.8.8.8" }), null);
  } finally {
    await cleanup();
  }
});
