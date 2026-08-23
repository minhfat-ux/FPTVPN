import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AuthStore } from "../src/auth-store.js";

test("resend limit: max 3 startEmailLogin calls per 15 min per email -> 429 on the 4th", async () => {
  const { store, cleanup } = await makeStore();
  try {
    for (let i = 0; i < 3; i++) {
      const { email, code } = await store.startEmailLogin("limit@example.com");
      assert.equal(email, "limit@example.com");
      assert.match(code, /^\d{6}$/);
    }
    await assert.rejects(
      () => store.startEmailLogin("limit@example.com"),
      (err) => {
        assert.equal(err.statusCode, 429);
        assert.match(err.message, /Too many login code requests/);
        return true;
      }
    );
  } finally {
    await cleanup();
  }
});

test("resend limit is tracked per email address", async () => {
  const { store, cleanup } = await makeStore();
  try {
    for (let i = 0; i < 3; i++) await store.startEmailLogin("a@example.com");
    const other = await store.startEmailLogin("b@example.com");
    assert.match(other.code, /^\d{6}$/);
  } finally {
    await cleanup();
  }
});

test("verify limit: 5 failed attempts invalidate the code", async () => {
  const { store, cleanup } = await makeStore();
  try {
    const { email, code } = await store.startEmailLogin("user@example.com");
    for (let i = 0; i < 5; i++) {
      await assert.rejects(
        () => store.verifyEmailLogin(email, "000000"),
        (err) => {
          assert.equal(err.statusCode, 401);
          return true;
        }
      );
    }
    await assert.rejects(
      () => store.verifyEmailLogin(email, code),
      /Invalid or expired login code/
    );
  } finally {
    await cleanup();
  }
});

async function makeStore() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "privatevpn-ratelimit-"));
  return {
    store: new AuthStore(path.join(dir, "auth.json")),
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}
