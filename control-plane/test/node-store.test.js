import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import os from "node:os";
import path from "node:path";
import { NodeStore, publicNode } from "../src/node-store.js";

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

// Vì sao nhóm test này quan trọng: một WS relay chỉ hạ cánh ở MỘT node. Client
// được cấp khoá của node A mà đi qua relay của node B thì WireGuard im lặng hoàn
// toàn (handshake mã hoá tới khoá A, tới wg0 của B => B không giải được và không
// có peer). Đó đúng là lỗi "connected nhưng không có mạng" trên iPad 13/09. Nên
// relay URL phải theo TỪNG node, và client phải phân biệt được "node không có
// relay" (field = null) với "coordinator cũ chưa biết" (không có field).

test("ws_relay_url: lưu và đọc lại theo từng node", async () => {
  const { store, cleanup } = await makeStore();
  try {
    const withRelay = await store.create({
      id: "node-1", name: "Hanoi 1", country: "VN", city: "Hanoi",
      endpoint: "103.173.155.50:443", public_key: "pk1",
      ws_relay_url: "wss://fcnvpn.tail303be3.ts.net:10000",
    });
    const withoutRelay = await store.create({
      id: "node-2", name: "Hanoi 2", country: "VN", city: "Hanoi",
      endpoint: "165.101.114.162:443", public_key: "pk2",
    });

    assert.equal(withRelay.ws_relay_url, "wss://fcnvpn.tail303be3.ts.net:10000");
    assert.equal(withoutRelay.ws_relay_url, null, "node không khai relay => null, không phải undefined");

    const reloaded = await store.findById("node-1");
    assert.equal(reloaded.ws_relay_url, "wss://fcnvpn.tail303be3.ts.net:10000");
    assert.equal((await store.findById("node-2")).ws_relay_url, null);

    // Sửa node khác KHÔNG được làm mất relay của node này (update spread dữ liệu cũ).
    await store.update("node-1", { name: "Hanoi 1 (renamed)" });
    assert.equal((await store.findById("node-1")).ws_relay_url, "wss://fcnvpn.tail303be3.ts.net:10000");

    // Gỡ relay thì phải gỡ được thật.
    await store.update("node-1", { ws_relay_url: null });
    assert.equal((await store.findById("node-1")).ws_relay_url, null);
  } finally {
    await cleanup();
  }
});

test("ws_relay_url: đi ra payload cho client (publicNode)", async () => {
  const { store, cleanup } = await makeStore();
  try {
    const node = await store.create({
      id: "node-1", name: "Hanoi 1", country: "VN", city: "Hanoi",
      endpoint: "103.173.155.50:443", public_key: "pk1",
      ws_relay_url: "wss://fcnvpn.tail303be3.ts.net:10000",
    });
    const payload = publicNode(node);
    assert.equal(payload.ws_relay_url, "wss://fcnvpn.tail303be3.ts.net:10000");
    // Không được lộ thông tin nội bộ ra endpoint công khai.
    assert.equal(payload.ssh_target, undefined);
    assert.equal(publicNode({ id: "x", public_key: "k" }).ws_relay_url, null);
  } finally {
    await cleanup();
  }
});

test("ws_relay_url: chỉ nhận wss:// tuyệt đối", async () => {
  const { store, cleanup } = await makeStore();
  const base = { name: "N", country: "VN", city: "HN", endpoint: "1.1.1.1:443", public_key: "pk" };
  try {
    await assert.rejects(
      () => store.create({ ...base, id: "bad1", ws_relay_url: "ws://relay.example:10000" }),
      (err) => err.statusCode === 400 && /wss:\/\//.test(err.message),
    );
    await assert.rejects(
      () => store.create({ ...base, id: "bad2", ws_relay_url: "not a url" }),
      (err) => err.statusCode === 400 && /absolute URL/.test(err.message),
    );
    // Chuỗi rỗng coi như "không có relay" chứ không phải lỗi.
    const blank = await store.create({ ...base, id: "ok1", ws_relay_url: "   " });
    assert.equal(blank.ws_relay_url, null);
  } finally {
    await cleanup();
  }
});

test("ws_relay_url: db cũ (chưa có cột) vẫn mở được và được migrate", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "privatevpn-nodestore-old-"));
  const dbPath = path.join(dir, "nodes.db");
  try {
    // Dựng db theo schema CŨ (không có ws_relay_url) — giống nodes.db đang chạy
    // trên VPS trước khi deploy thay đổi này.
    const old = new DatabaseSync(dbPath);
    old.exec(`CREATE TABLE exit_nodes (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, country TEXT NOT NULL, city TEXT NOT NULL,
      endpoint TEXT NOT NULL, public_key TEXT NOT NULL, ssh_target TEXT,
      priority INTEGER NOT NULL DEFAULT 100, active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`);
    old.prepare(`INSERT INTO exit_nodes (id, name, country, city, endpoint, public_key, ssh_target, priority, active, created_at, updated_at)
      VALUES ('node-1','Hanoi 1','VN','Hanoi','103.173.155.50:443','pk1',NULL,100,1,'2026-01-01','2026-01-01')`).run();
    old.close();

    const store = new NodeStore(dbPath, null);
    const node = await store.findById("node-1");
    assert.equal(node.name, "Hanoi 1", "dữ liệu cũ phải còn nguyên sau migrate");
    assert.equal(node.ws_relay_url, null, "cột mới mặc định NULL");

    // Và ghi được giá trị mới lên db vừa migrate.
    await store.update("node-1", { ws_relay_url: "wss://relay.example:10000" });
    assert.equal((await store.findById("node-1")).ws_relay_url, "wss://relay.example:10000");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// Vì sao tách hai field: `ws_relay_url` cũ bị hai client hiểu theo hai nghĩa (iOS đọc là
// relay WireGuard UDP 443, Android đọc là relay Hysteria UDP 8443). Một relay chỉ forward
// tới MỘT cổng UDP, nên dùng chung một field thì client gửi Hysteria vào cổng WireGuard và
// handshake im lặng — không có lỗi nào để lần ra. Nay tách tường minh:
//   wg_relay_url = relay WireGuard (443) cho iOS/macOS
//   hy_relay_url = relay Hysteria (8443) cho Android
// `ws_relay_url` giữ lại chỉ để tương thích ngược (app đã phát hành vẫn đọc nó).
test("wg_relay_url + hy_relay_url: tách tường minh hai transport, lưu/đọc/xoá độc lập", async () => {
  const { store, cleanup } = await makeStore();
  try {
    await store.create({
      id: "node-1", name: "Hanoi 1", country: "VN", city: "Hanoi",
      endpoint: "103.173.155.50:443", public_key: "pk1",
      wg_relay_url: "wss://fcnvpn.tail303be3.ts.net:10000",
      hy_relay_url: "wss://fcnvpn.tail303be3.ts.net:8443",
    });
    await store.create({
      id: "node-2", name: "Hanoi 2", country: "VN", city: "Hanoi",
      endpoint: "165.101.114.162:443", public_key: "pk2",
    });

    const one = await store.findById("node-1");
    assert.equal(one.wg_relay_url, "wss://fcnvpn.tail303be3.ts.net:10000");
    assert.equal(one.hy_relay_url, "wss://fcnvpn.tail303be3.ts.net:8443");
    // Field cũ vẫn NULL: app đang phát hành đọc nó nên không được đổi hành vi của họ.
    assert.equal(one.ws_relay_url, null, "ws_relay_url phải giữ null cho tương thích ngược");

    const two = await store.findById("node-2");
    assert.equal(two.wg_relay_url, null);
    assert.equal(two.hy_relay_url, null);

    // API công khai phải trả cả hai (client mới chỉ đọc hai field này).
    const pub = publicNode(one);
    assert.equal(pub.wg_relay_url, "wss://fcnvpn.tail303be3.ts.net:10000");
    assert.equal(pub.hy_relay_url, "wss://fcnvpn.tail303be3.ts.net:8443");

    // Sửa trường khác không được làm mất relay; xoá riêng từng field phải xoá đúng field đó.
    await store.update("node-1", { city: "Hanoi (renamed)" });
    assert.equal((await store.findById("node-1")).hy_relay_url, "wss://fcnvpn.tail303be3.ts.net:8443");
    await store.update("node-1", { wg_relay_url: null });
    const afterClear = await store.findById("node-1");
    assert.equal(afterClear.wg_relay_url, null);
    assert.equal(afterClear.hy_relay_url, "wss://fcnvpn.tail303be3.ts.net:8443", "xoá field này không được xoá field kia");
  } finally {
    await cleanup();
  }
});

test("cả hai field relay đều phải là wss:// tuyệt đối", async () => {
  const { store, cleanup } = await makeStore();
  try {
    for (const field of ["wg_relay_url", "hy_relay_url"]) {
      await assert.rejects(
        () => store.create({
          id: `bad-${field}`, name: "Bad", country: "VN", city: "Hanoi",
          endpoint: "1.2.3.4:443", public_key: "pk", [field]: "ws://relay.example/plain",
        }),
        /must use wss:\/\//,
        `${field} phải từ chối ws:// trần`,
      );
      await assert.rejects(
        () => store.create({
          id: `rel-${field}`, name: "Rel", country: "VN", city: "Hanoi",
          endpoint: "1.2.3.4:443", public_key: "pk", [field]: "not-a-url",
        }),
        /must be an absolute URL/,
        `${field} phải từ chối chuỗi không phải URL`,
      );
    }
  } finally {
    await cleanup();
  }
});
