import test from "node:test";
import assert from "node:assert/strict";
import { deviceLimitDecision, isDeviceLimitExempt, parseExemptEmails } from "../src/device-limit.js";

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

// --- Exemption list (env DEVICE_LIMIT_EXEMPT_EMAILS) -------------------------

test("device-limit: exempt account never blocked, even over max", () => {
  for (const activeCount of [3, 4, 20]) {
    assert.deepEqual(
      deviceLimitDecision({ activeCount, isOwnDevice: false, max: 3, exempt: true }),
      { blocked: false, code: null },
    );
  }
});

test("device-limit: exempt account allowed for a brand new device at/over max", () => {
  const exemptEmails = parseExemptEmails("minhnb2@me.com");
  const exempt = isDeviceLimitExempt("minhnb2@me.com", exemptEmails);
  assert.equal(exempt, true);
  assert.deepEqual(
    deviceLimitDecision({ activeCount: 3, isOwnDevice: false, max: 3, exempt }),
    { blocked: false, code: null },
  );
  assert.deepEqual(
    deviceLimitDecision({ activeCount: 5, isOwnDevice: false, max: 3, exempt }),
    { blocked: false, code: null },
  );
});

test("device-limit: non-exempt account still blocked as before", () => {
  const exemptEmails = parseExemptEmails("minhnb2@me.com");
  const exempt = isDeviceLimitExempt("stranger@example.com", exemptEmails);
  assert.equal(exempt, false);
  assert.deepEqual(
    deviceLimitDecision({ activeCount: 3, isOwnDevice: false, max: 3, exempt }),
    { blocked: true, code: "device_limit_reached" },
  );
  // over the cap without the exempt flag (previous behaviour, unchanged)
  assert.deepEqual(
    deviceLimitDecision({ activeCount: 3, isOwnDevice: false, max: 3 }),
    { blocked: true, code: "device_limit_reached" },
  );
});

test("device-limit: no exemption list (unset env) changes nothing", () => {
  for (const raw of [undefined, null, "", "   ", ",,,"]) {
    const exemptEmails = parseExemptEmails(raw);
    assert.equal(exemptEmails.size, 0, `env ${JSON.stringify(raw)} must yield an empty list`);
    const exempt = isDeviceLimitExempt("minhnb2@me.com", exemptEmails);
    assert.equal(exempt, false);
    assert.deepEqual(
      deviceLimitDecision({ activeCount: 3, isOwnDevice: false, max: 3, exempt }),
      { blocked: true, code: "device_limit_reached" },
    );
  }
});

test("device-limit: parseExemptEmails tolerates spaces, case and blank entries", () => {
  assert.deepEqual(
    [...parseExemptEmails(" MinhNB2@Me.com , , owner@Example.IO ,\n")].sort(),
    ["minhnb2@me.com", "owner@example.io"],
  );
  assert.deepEqual([...parseExemptEmails("a@b.com,,c@d.com")], ["a@b.com", "c@d.com"]);
  assert.deepEqual([...parseExemptEmails("a@b.com")], ["a@b.com"]);
});

test("device-limit: isDeviceLimitExempt ignores case/whitespace, rejects empty", () => {
  const exemptEmails = parseExemptEmails("minhnb2@me.com, other@x.io");
  assert.equal(isDeviceLimitExempt("MinhNB2@Me.com", exemptEmails), true);
  assert.equal(isDeviceLimitExempt("  minhnb2@ME.com ", exemptEmails), true);
  assert.equal(isDeviceLimitExempt("other@x.io", exemptEmails), true);
  assert.equal(isDeviceLimitExempt("", exemptEmails), false);
  assert.equal(isDeviceLimitExempt("   ", exemptEmails), false);
  assert.equal(isDeviceLimitExempt(null, exemptEmails), false);
  assert.equal(isDeviceLimitExempt(undefined, exemptEmails), false);
  assert.equal(isDeviceLimitExempt("minhnb2@me.com.evil.io", exemptEmails), false);
});
