import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, "..", "sync-config-allowlist.py");

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sd-sync-"));
}

test("bổ sung đường dẫn allowlist còn thiếu và GIỮ NGUYÊN phần người dùng tự thêm", () => {
  // Hồi quy 25/09/2026: config.json đè hẳn mặc định trong code, nên mặc định mới thêm vào
  // (ví dụ /Library/Developer/) không được áp dụng ⇒ CoreSimulator bắn alert oan.
  const dir = tmp();
  const ex = path.join(dir, "example.json");
  const cur = path.join(dir, "config.json");
  fs.writeFileSync(ex, JSON.stringify({ allow: { pathPrefixes: ["/System/", "/Library/Developer/"] } }));
  fs.writeFileSync(
    cur,
    JSON.stringify({ allow: { pathPrefixes: ["/System/", "/Tu/Them/"] }, mode: "alert" }),
  );

  const out = execFileSync("python3", [SCRIPT, ex, cur], { encoding: "utf8" });
  assert.match(out, /Library\/Developer/);

  const after = JSON.parse(fs.readFileSync(cur, "utf8"));
  assert.deepEqual(after.allow.pathPrefixes, ["/System/", "/Tu/Them/", "/Library/Developer/"]);
  assert.equal(after.mode, "alert", "các khoá khác phải giữ nguyên");
});

test("đã đủ thì không sửa file", () => {
  const dir = tmp();
  const ex = path.join(dir, "example.json");
  const cur = path.join(dir, "config.json");
  fs.writeFileSync(ex, JSON.stringify({ allow: { pathPrefixes: ["/System/"] } }));
  const body = JSON.stringify({ allow: { pathPrefixes: ["/System/"] } });
  fs.writeFileSync(cur, body);

  const out = execFileSync("python3", [SCRIPT, ex, cur], { encoding: "utf8" });
  assert.match(out, /đã đủ/);
  assert.equal(fs.readFileSync(cur, "utf8"), body, "không được ghi lại file");
});

test("config hỏng ⇒ bỏ qua và KHÔNG làm chết installer", () => {
  const dir = tmp();
  const ex = path.join(dir, "example.json");
  const cur = path.join(dir, "config.json");
  fs.writeFileSync(ex, "{ khong phai json");
  fs.writeFileSync(cur, "{}");
  const out = execFileSync("python3", [SCRIPT, ex, cur], { encoding: "utf8" });
  assert.match(out, /bỏ qua/);
});

test("config chưa có mục allow ⇒ tạo mới được", () => {
  const dir = tmp();
  const ex = path.join(dir, "example.json");
  const cur = path.join(dir, "config.json");
  fs.writeFileSync(ex, JSON.stringify({ allow: { pathPrefixes: ["/System/", "/usr/"] } }));
  fs.writeFileSync(cur, JSON.stringify({ mode: "enforce" }));
  execFileSync("python3", [SCRIPT, ex, cur], { encoding: "utf8" });
  const after = JSON.parse(fs.readFileSync(cur, "utf8"));
  assert.deepEqual(after.allow.pathPrefixes, ["/System/", "/usr/"]);
  assert.equal(after.mode, "enforce");
});
