import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AuthStore } from "../src/auth-store.js";

test("legacy join token: createJoinToken returns PVPN-JOIN- token with 30-min expiry", async () => {
  const { store, cleanup } = await makeStore();
  try {
    const { token, expiresAt } = await store.createJoinToken();
    assert.match(token, /^PVPN-JOIN-/);
    const ttl = Date.parse(expiresAt) - Date.now();
    assert.ok(ttl > 29 * 60 * 1000 && ttl <= 30 * 60 * 1000, `unexpected TTL ${ttl}`);
  } finally {
    await cleanup();
  }
});

test("legacy join token: consumed once, second use rejected", async () => {
  const { store, cleanup } = await makeStore();
  try {
    const { token } = await store.createJoinToken();
    await assert.doesNotReject(() => store.consumeJoinToken(token));
    await assert.rejects(() => store.consumeJoinToken(token), /already been consumed/);
  } finally {
    await cleanup();
  }
});

test("legacy join token: invalid token rejected", async () => {
  const { store, cleanup } = await makeStore();
  try {
    await assert.rejects(() => store.consumeJoinToken("PVPN-JOIN-bogus"), /Invalid or expired join token/);
  } finally {
    await cleanup();
  }
});

test("legacy join token: expired token rejected", async () => {
  const { store, cleanup } = await makeStore();
  try {
    const { token } = await store.createJoinToken();
    // Manually backdate the expiry to simulate a stale token.
    const data = JSON.parse(await import("node:fs/promises").then((fs) => fs.readFile(store.filePath, "utf8")));
    data.joinTokens[0].expiresAt = new Date(Date.now() - 1000).toISOString();
    await import("node:fs/promises").then((fs) => fs.writeFile(store.filePath, JSON.stringify(data)));
    await assert.rejects(() => store.consumeJoinToken(token), /has expired/);
  } finally {
    await cleanup();
  }
});

async function makeStore() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "privatevpn-legacy-"));
  return {
    store: new AuthStore(path.join(dir, "auth.json")),
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}
