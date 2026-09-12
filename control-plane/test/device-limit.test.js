import test from "node:test";
import assert from "node:assert/strict";
import { deviceLimitDecision } from "../src/device-limit.js";

test("device-limit: new device allowed while under max", () => {
  for (const activeCount of [0, 1, 2]) {
    assert.deepEqual(
      deviceLimitDecision({ activeCount, isOwnDevice: false, max: 3 }),
      { blocked: false, code: null },
    );
  }
});

test("device-limit: new device blocked at max", () => {
  assert.deepEqual(
    deviceLimitDecision({ activeCount: 3, isOwnDevice: false, max: 3 }),
    { blocked: true, code: "device_limit_reached" },
  );
});

test("device-limit: own device allowed at max", () => {
  assert.deepEqual(
    deviceLimitDecision({ activeCount: 3, isOwnDevice: true, max: 3 }),
    { blocked: false, code: null },
  );
});

test("device-limit: own device blocked when account is already over max", () => {
  assert.deepEqual(
    deviceLimitDecision({ activeCount: 4, isOwnDevice: true, max: 3 }),
    { blocked: true, code: "device_limit_reached" },
  );
});

test("device-limit: new device blocked when account is over max", () => {
  assert.deepEqual(
    deviceLimitDecision({ activeCount: 5, isOwnDevice: false, max: 3 }),
    { blocked: true, code: "device_limit_reached" },
  );
});

test("device-limit: custom max follows the same formula", () => {
  assert.deepEqual(
    deviceLimitDecision({ activeCount: 0, isOwnDevice: false, max: 1 }),
    { blocked: false, code: null },
  );
  assert.deepEqual(
    deviceLimitDecision({ activeCount: 1, isOwnDevice: false, max: 1 }),
    { blocked: true, code: "device_limit_reached" },
  );
  assert.deepEqual(
    deviceLimitDecision({ activeCount: 1, isOwnDevice: true, max: 1 }),
    { blocked: false, code: null },
  );
  assert.deepEqual(
    deviceLimitDecision({ activeCount: 2, isOwnDevice: true, max: 1 }),
    { blocked: true, code: "device_limit_reached" },
  );
});
