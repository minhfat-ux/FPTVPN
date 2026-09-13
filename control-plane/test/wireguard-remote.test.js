import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, chmod } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { WireGuardManager } from "../src/wireguard.js";

/**
 * Stub `ssh` trong PATH để verify rằng dump()/listPeers()/serverPublicKey()
 * thực sự chạy qua SSH khi node có ssh_target (node remote), thay vì luôn đọc
 * wg của máy coordinator.
 */
async function withStubSSH(script) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "privatevpn-ssh-"));
  const bin = path.join(dir, "ssh");
  await writeFile(bin, script);
  await chmod(bin, 0o755);
  const originalPath = process.env.PATH;
  process.env.PATH = `${dir}:${originalPath}`;
  return {
    async cleanup() {
      process.env.PATH = originalPath;
      await rm(dir, { recursive: true, force: true });
    },
  };
}

test("dump() đọc peer của node remote qua SSH", async () => {
  const stub = await withStubSSH(`#!/usr/bin/env bash
case "$*" in
  *"show wg0 dump")
    printf '%s\\n' "SGKEY	(none)	51820	off"
    printf '%s\\n' "REMOTE_PEER_1	(none)	103.6.150.9:33112	10.77.0.9/32	1800000000	777	888"
    ;;
  *"show wg0 peers") printf '%s\\n' SGKEY REMOTE_PEER_1 ;;
  *"show wg0 public-key") echo SGKEY ;;
  *) echo "unexpected: $*" >&2; exit 2 ;;
esac
`);
  try {
    const mgr = new WireGuardManager({ interfaceName: "wg0", wgBin: "wg", sshTarget: "root@203.0.113.10", sshKey: "/tmp/fake_key" });
    const rows = await mgr.dump();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].publicKey, "REMOTE_PEER_1");
    assert.equal(rows[0].endpoint, "103.6.150.9:33112");
    assert.equal(rows[0].allowedIps, "10.77.0.9/32");
    assert.equal(rows[0].latestHandshakeSec, 1800000000);
    assert.equal(rows[0].rxBytes, 777);
    assert.equal(rows[0].txBytes, 888);

    const peers = await mgr.listPeers();
    assert.deepEqual(peers, ["SGKEY", "REMOTE_PEER_1"]);

    assert.equal(await mgr.serverPublicKey(), "SGKEY");
  } finally {
    await stub.cleanup();
  }
});

test("node local (không ssh_target) không gọi ssh", async () => {
  const stub = await withStubSSH(`#!/usr/bin/env bash
echo "SHOULD_NOT_BE_CALLED" >&2
exit 3
`);
  try {
    const mgr = new WireGuardManager({ interfaceName: "wg0-nonexistent", wgBin: "wg", sshTarget: null });
    // Không có interface thật => trả [] / null, KHÔNG đi qua ssh.
    assert.deepEqual(await mgr.dump(), []);
    assert.equal(await mgr.listPeers(), null);
  } finally {
    await stub.cleanup();
  }
});

test("node remote lỗi SSH thì trả [] / null thay vì throw", async () => {
  const stub = await withStubSSH(`#!/usr/bin/env bash
echo "ssh: connect to host failed" >&2
exit 255
`);
  try {
    const mgr = new WireGuardManager({ interfaceName: "wg0", wgBin: "wg", sshTarget: "root@unreachable.invalid" });
    assert.deepEqual(await mgr.dump(), []);
    assert.equal(await mgr.listPeers(), null);
    assert.equal(await mgr.serverPublicKey(), null);
  } finally {
    await stub.cleanup();
  }
});

test("dry-run không chạy lệnh nào và trả giá trị rỗng", async () => {
  const mgr = new WireGuardManager({ interfaceName: "wg0", wgBin: "wg", dryRun: true, sshTarget: "root@203.0.113.10" });
  assert.deepEqual(await mgr.dump(), []);
  assert.equal(await mgr.listPeers(), null);
});
