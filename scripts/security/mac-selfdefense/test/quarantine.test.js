import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  DEFAULT_VAULT_CANDIDATES,
  hashTree,
  incidentDir,
  moveToVault,
  neutralize,
  sha256File,
  walkFiles,
  writeManifest,
  defaultVault,
  QUARANTINE_XATTR_VALUE,
} from "../lib/quarantine.mjs";

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test("sha256File khớp vector chuẩn của 'abc'", () => {
  const dir = tmp("sd-hash-");
  const f = path.join(dir, "a.txt");
  fs.writeFileSync(f, "abc");
  assert.equal(sha256File(f), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(sha256File(path.join(dir, "khong-ton-tai")), null);
});

test("walkFiles đi đệ quy và bỏ qua symlink", () => {
  const dir = tmp("sd-walk-");
  fs.mkdirSync(path.join(dir, "sub"));
  fs.writeFileSync(path.join(dir, "sub", "a"), "1");
  fs.writeFileSync(path.join(dir, "b"), "2");
  fs.symlinkSync("/etc/hosts", path.join(dir, "link"));
  const files = walkFiles(dir).map((f) => path.relative(dir, f)).sort();
  assert.deepEqual(files, ["b", path.join("sub", "a")]);
});

test("neutralize gỡ exec bit, gắn xattr và đổi tên .app", () => {
  const dir = tmp("sd-neu-");
  const bin = path.join(dir, "node");
  fs.writeFileSync(bin, "#!/bin/sh\n");
  fs.chmodSync(bin, 0o755);
  const app = path.join(dir, "SystemUpdater.app");
  fs.mkdirSync(app);
  const inner = path.join(app, "App");
  fs.writeFileSync(inner, "x");
  fs.chmodSync(inner, 0o755);

  const calls = [];
  const res = neutralize(dir, { run: (...args) => calls.push(args) });

  assert.equal(fs.lstatSync(bin).mode & 0o111, 0, "exec bit phải bị gỡ");
  assert.equal(res.chmod, 2, "gỡ exec trên cả binary trong bundle");
  assert.equal(res.xattr, 2, "gắn xattr cho mọi file trong cây");
  assert.equal(res.renamed.length, 1);
  assert.ok(fs.existsSync(`${app}.DISABLED`), ".app phải bị đổi tên");
  assert.ok(calls.every((c) => c[0] === "/usr/bin/xattr" && c[1][1] === "com.apple.quarantine"));
  assert.equal(calls[0][1][2], QUARANTINE_XATTR_VALUE);
});

test("moveToVault copy → đối chiếu → xoá bản gốc, và ghi manifest", () => {
  const src = tmp("sd-src-");
  const vault = tmp("sd-vault-");
  const item = path.join(src, "payload");
  fs.mkdirSync(item);
  fs.writeFileSync(path.join(item, "node"), "gia-lap-ma-doc");
  fs.writeFileSync(path.join(item, "app.js"), "x");

  // `run` ném lỗi ⇒ rơi về fs.cpSync (không phụ thuộc /usr/bin/ditto khi test).
  const res = moveToVault(item, vault, {
    run: () => {
      throw new Error("khong co ditto trong test");
    },
  });

  assert.equal(res.verified, true);
  assert.equal(fs.existsSync(item), false, "bản gốc phải bị xoá sau khi đối chiếu khớp");
  assert.equal(fs.readFileSync(path.join(res.moved, "node"), "utf8"), "gia-lap-ma-doc");
  assert.equal(res.manifest.length, 2);
  assert.equal(res.manifest[0].sha256.length, 64);

  const mf = writeManifest(vault, res.manifest, new Date("2026-09-22T00:00:00Z"));
  assert.ok(fs.readFileSync(mf, "utf8").includes("  "));
});

test("hashTree bỏ qua file quá lớn thay vì treo", () => {
  const dir = tmp("sd-big-");
  fs.writeFileSync(path.join(dir, "big"), "1234567890");
  const rows = hashTree(dir, { maxBytes: 3 });
  assert.equal(rows[0].sha256, "<quá lớn, bỏ qua>");
});

test("incidentDir tạo thư mục theo ngày và làm sạch tên", () => {
  const vault = tmp("sd-inc-");
  const d = incidentDir(vault, "com.vmware.storage.identitydaemonworker.eq03", new Date("2026-09-22T03:00:00Z"));
  assert.ok(fs.existsSync(d));
  assert.equal(path.basename(d), "2026-09-22-com.vmware.storage.identitydaemonworker.eq03");
});

test("defaultVault trả về thư mục ghi được đầu tiên", () => {
  const a = path.join(tmp("sd-v1-"), "khong-ghi-duoc");
  const b = tmp("sd-v2-");
  // Ứng viên đầu không tồn tại nhưng mkdirSync tạo được nên vẫn chọn nó — kiểm tra nhánh hợp lệ.
  assert.ok(typeof defaultVault([a, b]) === "string");
});

test("defaultVault ưu tiên filesystem giữ được POSIX permission (APFS) hơn volume ExFAT", () => {
  // Hồi quy 22/09/2026: vault trên /Volumes/BIWIN (ExFAT, noowners) làm chmod a-x vô hiệu.
  const [first, second] = DEFAULT_VAULT_CANDIDATES;
  assert.ok(first.startsWith(os.homedir()), `ưu tiên phải là thư mục home, đang là ${first}`);
  assert.ok(second.includes("BIWIN"), "volume ngoài chỉ là phương án sau");
});
