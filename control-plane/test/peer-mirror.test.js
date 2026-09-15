import test from "node:test";
import assert from "node:assert/strict";
import { provisionEverywhere, revokeEverywhere } from "../src/peer-mirror.js";

const silent = { error: () => {} };
const node1 = { id: "node-1" };
const node2 = { id: "vietnam-2" };

test("cấp peer trên node chính VÀ mirror sang node còn lại", async () => {
  const calls = [];
  const result = await provisionEverywhere({
    primaryNode: node1,
    nodes: [node1, node2],
    publicKey: "PUB",
    allowedIPs: "10.77.0.42/32",
    upsert: async (node, key, ips) => calls.push([node.id, key, ips]),
    log: silent,
  });
  assert.deepEqual(calls, [
    ["node-1", "PUB", "10.77.0.42/32"],
    ["vietnam-2", "PUB", "10.77.0.42/32"],
  ]);
  assert.deepEqual(result.provisioned, ["node-1", "vietnam-2"]);
  assert.deepEqual(result.failures, []);
});

test("node chính lỗi ⇒ ném lỗi 502 exit_node_provision_failed (không 'thành công' giả)", async () => {
  const tried = [];
  await assert.rejects(
    provisionEverywhere({
      primaryNode: node1,
      nodes: [node1, node2],
      publicKey: "PUB",
      allowedIPs: "10.77.0.42/32",
      upsert: async (node) => {
        tried.push(node.id);
        if (node.id === "node-1") throw new Error("Permission denied (publickey)");
      },
      log: silent,
    }),
    (error) => {
      assert.equal(error.statusCode, 502);
      assert.equal(error.code, "exit_node_provision_failed");
      assert.match(error.message, /node-1/);
      assert.match(error.message, /Permission denied/);
      return true;
    },
  );
  // node còn lại vẫn được thử, để khách có đường dự phòng
  assert.deepEqual(tried, ["node-1", "vietnam-2"]);
});

test("node phụ lỗi thì KHÔNG ném (khách vẫn dùng được node chính), nhưng có trong failures", async () => {
  const result = await provisionEverywhere({
    primaryNode: node1,
    nodes: [node1, node2],
    publicKey: "PUB",
    allowedIPs: "10.77.0.42/32",
    upsert: async (node) => {
      if (node.id === "vietnam-2") throw new Error("ssh timeout");
    },
    log: silent,
  });
  assert.deepEqual(result.provisioned, ["node-1"]);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].nodeId, "vietnam-2");
});

test("node chính trùng trong danh sách ⇒ chỉ gọi 1 lần; node thiếu id bị bỏ", async () => {
  const calls = [];
  await provisionEverywhere({
    primaryNode: node1,
    nodes: [node1, { id: "" }, null, node2],
    publicKey: "PUB",
    allowedIPs: "10.77.0.42/32",
    upsert: async (node) => calls.push(node.id),
    log: silent,
  });
  assert.deepEqual(calls, ["node-1", "vietnam-2"]);
});

test("thu hồi peer trên mọi node; lỗi ở một node không làm ném ra", async () => {
  const removed = [];
  const result = await revokeEverywhere({
    nodes: [node1, node2],
    publicKey: "PUB",
    remove: async (node) => {
      if (node.id === "vietnam-2") throw new Error("ssh timeout");
      removed.push(node.id);
    },
    log: silent,
  });
  assert.deepEqual(removed, ["node-1"]);
  assert.equal(result.failures.length, 1);
});

test("thu hồi không có publicKey ⇒ không gọi node nào", async () => {
  let called = 0;
  const result = await revokeEverywhere({
    nodes: [node1, node2],
    publicKey: "",
    remove: async () => { called += 1; },
    log: silent,
  });
  assert.equal(called, 0);
  assert.deepEqual(result.failures, []);
});
