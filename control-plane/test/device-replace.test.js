import test from "node:test";
import assert from "node:assert/strict";
import { deviceReplaceDecision, applyDeviceReplace } from "../src/device-replace.js";

/**
 * Vì sao nhóm test này quan trọng: đây là đường DUY NHẤT cho phép thu hồi một bản ghi thiết bị của
 * người khác (trong cùng tài khoản). Nới một điều kiện ở đây là app Mac có thể "cướp" slot của điện
 * thoại khách, hoặc tệ hơn là đụng vào thiết bị của tài khoản khác. Ca thật 14/09: macOS xoay khoá
 * ⇒ server coi là thiết bị mới ⇒ 403 device_limit_reached ⇒ tunnel lên mà không có mạng.
 */

const OLD_MAC = {
  id: "dev-old-mac",
  userId: "user-1",
  platform: "macos",
  publicKey: "OLDKEY=",
  deviceName: "mac-ow6fo14m",
  active: true,
};

function makeStore(records = []) {
  const state = { deactivated: [], all: records };
  return {
    state,
    async findById(id) {
      return records.find((r) => r.id === id) ?? null;
    },
    async deactivate(id) {
      state.deactivated.push(id);
      return { ...records.find((r) => r.id === id), active: false };
    },
  };
}

test("chỉ cho nhường slot khi: cùng user, cùng platform, bản ghi còn active, khác khoá", () => {
  const base = { target: OLD_MAC, userId: "user-1", platform: "macos", publicKey: "NEWKEY=" };
  assert.deepEqual(deviceReplaceDecision(base), { allowed: true, reason: "previous_install_same_platform" });

  assert.equal(deviceReplaceDecision({ ...base, target: null }).reason, "not_found");
  assert.equal(deviceReplaceDecision({ ...base, userId: "user-2" }).reason, "not_owner", "không được đụng thiết bị của tài khoản khác");
  assert.equal(deviceReplaceDecision({ ...base, userId: null }).reason, "not_owner");
  assert.equal(deviceReplaceDecision({ ...base, target: { ...OLD_MAC, active: false } }).reason, "already_inactive");
  assert.equal(deviceReplaceDecision({ ...base, publicKey: "OLDKEY=" }).reason, "same_device");
  assert.equal(
    deviceReplaceDecision({ ...base, platform: "ios" }).reason,
    "different_platform",
    "app Mac KHÔNG được lấy slot của điện thoại",
  );
});

test("không khai replace_device_id thì không đụng gì", async () => {
  const store = makeStore([OLD_MAC]);
  let removed = 0;
  const res = await applyDeviceReplace({
    body: {},
    userId: "user-1",
    platform: "macos",
    publicKey: "NEWKEY=",
    store,
    removePeer: async () => { removed++; },
    log: { log() {} },
  });
  assert.equal(res.replaced, null);
  assert.deepEqual(store.state.deactivated, []);
  assert.equal(removed, 0);
});

test("nhường slot hợp lệ: xoá peer cũ + thu hồi bản ghi, trả về thông tin đã thay", async () => {
  const store = makeStore([OLD_MAC]);
  const removedKeys = [];
  const res = await applyDeviceReplace({
    body: { replace_device_id: "dev-old-mac" },
    userId: "user-1",
    platform: "macos",
    publicKey: "NEWKEY=",
    store,
    removePeer: async (device) => { removedKeys.push(device.publicKey); },
    log: { log() {} },
  });
  assert.deepEqual(res.replaced, { device_id: "dev-old-mac", name: "mac-ow6fo14m" });
  assert.deepEqual(removedKeys, ["OLDKEY="], "phải xoá peer cũ trên exit node");
  assert.deepEqual(store.state.deactivated, ["dev-old-mac"], "phải thu hồi bản ghi để nhả slot");
});

test("không hợp lệ thì KHÔNG thu hồi ai (và nói rõ lý do)", async () => {
  const store = makeStore([OLD_MAC]);
  const res = await applyDeviceReplace({
    body: { replace_device_id: "dev-old-mac" },
    userId: "user-1",
    platform: "ios",
    publicKey: "NEWKEY=",
    store,
    removePeer: async () => { throw new Error("không được gọi tới đây"); },
    log: { log() {} },
  });
  assert.equal(res.replaced, null);
  assert.equal(res.reason, "different_platform");
  assert.deepEqual(store.state.deactivated, [], "không được thu hồi khi khác platform");
});
