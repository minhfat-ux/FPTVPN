import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NodeStore } from "../src/node-store.js";

async function makeStore(extra) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "privatevpn-nodestore-"));
  const dbPath = path.join(dir, "nodes.db");
  return {
    store: new NodeStore(dbPath, null, extra),
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

test("empty db seeds from legacy JSON once", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "privatevpn-nodestore-"));
  const legacy = path.join(dir, "nodes.json");
  await writeFile(legacy, JSON.stringify({ nodes: [{ id: "vietnam-1", name: "Vietnam 1", country: "VN", city: "Hanoi", endpoint: "1.2.3.4:443", public_key: "pk1" }] }));
  const store = new NodeStore(path.join(dir, "nodes.db"), null, { legacyJsonPath: legacy });
  const nodes = await store.all();
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].id, "vietnam-1");
  assert.equal(nodes[0].active, true);
  await rm(dir, { recursive: true, force: true });
});

test("create + active + findById + disable (sqlite)", async () => {
  const { store, cleanup } = await makeStore();
  try {
    const node = await store.create({ id: "vietnam-2", name: "Vietnam 2", country: "VN", city: "HCM", endpoint: "5.6.7.8:443", public_key: "pk2" });
    assert.equal(node.id, "vietnam-2");
    assert.equal((await store.findById("vietnam-2")).name, "Vietnam 2");
    assert.equal((await store.active()).length, 1);
    await store.disable("vietnam-2");
    assert.equal((await store.active()).length, 0);
    assert.equal((await store.findActiveById("vietnam-2")), null);
  } finally {
    await cleanup();
  }
});

test("duplicate create -> 409", async () => {
  const { store, cleanup } = await makeStore();
  try {
    await store.create({ id: "vietnam-3", name: "V3", country: "VN", city: "HN", endpoint: "9.9.9.9:443", public_key: "pk3" });
    await assert.rejects(
      () => store.create({ id: "vietnam-3", name: "V3b", country: "VN", city: "HN", endpoint: "9.9.9.9:443", public_key: "pk3" }),
      (err) => err.statusCode === 409
    );
  } finally {
    await cleanup();
  }
});
