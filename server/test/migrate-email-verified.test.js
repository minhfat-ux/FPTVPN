/**
 * Hồi quy: tài khoản CÓ TRƯỚC tính năng xác thực email phải được grandfather = ĐÃ xác thực.
 *
 * Bài học: bản đầu móc backfill vào lúc thêm cột `email_verified`, nhưng câu UPDATE có dùng
 * `email_verified_at` (cột được thêm SAU đó) ⇒ SQLite báo "no such column" và lỗi bị nuốt im lặng.
 * Trên production, hậu quả là deploy xong TOÀN BỘ người dùng cũ bị coi là chưa xác thực.
 * Test này dựng lại đúng DB phiên bản cũ rồi mở db.js để migration chạy.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fbuddy-migrate-"));
process.env.FBUDDY_DATA_DIR = dir;
process.env.FBUDDY_SECRET = "test-secret-migrate-0123456789";
process.env.FBUDDY_PORT = "0";
process.env.NODE_ENV = "test";

// DB "phiên bản cũ": bảng users chưa có email_verified / email_verified_at, và có sẵn một người dùng.
const dbFile = path.join(dir, "fbuddy.db");
const legacy = new DatabaseSync(dbFile);
legacy.exec(`CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  token_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`);
legacy.exec(`INSERT INTO users (id, email, password_hash, role, token_version, created_at, updated_at)
  VALUES ('u-cu', 'nguoi-cu@fbuddy.test', 'x', 'user', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`);
legacy.close();

test("tài khoản cũ được đánh dấu đã xác thực email khi nâng cấp", async () => {
  const { initDb, one } = await import("../src/db.js");
  initDb(); // migration + backfill chạy ở đây (lúc khởi động app), không tự chạy khi import
  const row = one("users", "id = ?", ["u-cu"]);
  assert.ok(row, "phải đọc được tài khoản cũ");
  assert.equal(Number(row.email_verified), 1, "tài khoản cũ KHÔNG được để ở trạng thái chưa xác thực");
  assert.ok(row.email_verified_at, "phải có mốc thời gian xác thực");

  const { isEmailVerified, publicUser } = await import("../src/auth.js");
  assert.equal(isEmailVerified(row), true);
  assert.equal(publicUser(row).emailVerified, true);

  // Hai con đường tạo tài khoản sau migration phải khác nhau, và không bị grandfather nhầm:
  //  - khách tự đăng ký / admin tạo hộ ⇒ `emailVerifiedAt: null` ⇒ CHƯA active;
  //  - primitive nội bộ (seed/test) ⇒ mặc định đã active.
  const { createUser } = await import("../src/auth.js");
  const khach = createUser({ email: "khach-moi@fbuddy.test", password: "matkhau12345", emailVerifiedAt: null });
  assert.equal(Number(khach.email_verified), 0, "tài khoản khách đăng ký phải CHƯA xác thực");
  assert.equal(isEmailVerified(khach), false);

  const noiBo = createUser({ email: "noi-bo@fbuddy.test", password: "matkhau12345" });
  assert.equal(isEmailVerified(noiBo), true, "primitive nội bộ mặc định đã active");
});
