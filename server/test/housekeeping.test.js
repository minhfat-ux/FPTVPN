import "./helpers.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const { initDb, db } = await import("../src/db.js");
const { config } = await import("../src/config.js");
const { runHousekeeping, dbStats, defaultRetention } = await import("../src/housekeeping.js");
const filesApi = await import("../src/files.js");

initDb();
// Kho tệp trong môi trường test chưa chắc tồn tại — housekeeping có đụng tới đĩa.
fs.mkdirSync(config.filesDir, { recursive: true });

const NOW = Date.parse("2026-09-20T00:00:00.000Z");
const daysAgo = (n) => new Date(NOW - n * 24 * 60 * 60 * 1000).toISOString();

let seq = 0;
function seedUser() {
  const id = `u-hk-${++seq}`;
  db.prepare("INSERT INTO users (id, email, name, password_hash, role, created_at, updated_at) VALUES (?,?,?,?,?,?,?)")
    .run(id, `${id}@test.local`, "HK", "x", "user", daysAgo(400), daysAgo(400));
  return id;
}

function seedConversation(userId, { ageDays, pinned = 0, withFile = false, messages = 3 }) {
  const id = `c-hk-${++seq}`;
  const at = daysAgo(ageDays);
  db.prepare(
    "INSERT INTO conversations (id, user_id, title, skill, pinned, archived, message_count, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
  ).run(id, userId, "Hội thoại test", "auto", pinned, 0, messages, at, at);
  for (let i = 0; i < messages; i += 1) {
    db.prepare(
      "INSERT INTO messages (id, conversation_id, user_id, role, content, created_at) VALUES (?,?,?,?,?,?)",
    ).run(`m-hk-${++seq}`, id, userId, "user", `nội dung ${i}`, at);
  }
  if (withFile) {
    const stored = `hk-${seq}.bin`;
    fs.writeFileSync(path.join(config.filesDir, stored), "x");
    db.prepare(
      "INSERT INTO files (id, user_id, conversation_id, name, mime, size, stored_name, kind, origin, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
    ).run(`f-hk-${++seq}`, userId, id, "tệp.bin", "application/octet-stream", 1, stored, "document", "upload", at);
  }
  return id;
}

test("dry-run KHÔNG xoá gì nhưng báo đúng số ứng viên", () => {
  const userId = seedUser();
  const convId = seedConversation(userId, { ageDays: 200 });
  const before = dbStats().tables.messages;
  const report = runHousekeeping({ apply: false, now: NOW });
  assert.ok(report.steps.conversations.candidates >= 1);
  assert.equal(dbStats().tables.messages, before, "dry-run không được xoá dòng nào");
  assert.ok(db.prepare("SELECT id FROM conversations WHERE id = ?").get(convId), "hội thoại vẫn còn");
});

test("apply: xoá hội thoại cũ + tin nhắn + FTS + tệp trên đĩa, GIỮ hội thoại pinned", () => {
  const userId = seedUser();
  const oldId = seedConversation(userId, { ageDays: 200, withFile: true });
  const pinnedId = seedConversation(userId, { ageDays: 400, pinned: 1 });
  const freshId = seedConversation(userId, { ageDays: 3 });
  const fileRow = db.prepare("SELECT stored_name FROM files WHERE conversation_id = ?").get(oldId);

  runHousekeeping({ apply: true, now: NOW, retention: { conversationDays: 120, fileDays: 90 } });

  assert.equal(db.prepare("SELECT id FROM conversations WHERE id = ?").get(oldId), undefined, "hội thoại cũ phải bị xoá");
  assert.equal(db.prepare("SELECT COUNT(*) n FROM messages WHERE conversation_id = ?").get(oldId).n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM messages_fts WHERE conversation_id = ?").get(oldId).n, 0, "FTS phải sạch theo trigger");
  assert.equal(fs.existsSync(path.join(config.filesDir, fileRow.stored_name)), false, "blob phải bị xoá khỏi đĩa");
  assert.ok(db.prepare("SELECT id FROM conversations WHERE id = ?").get(pinnedId), "pinned phải được giữ");
  assert.ok(db.prepare("SELECT id FROM conversations WHERE id = ?").get(freshId), "hội thoại mới phải được giữ");
});

test("apply: blob mồ côi trên đĩa bị dọn, nhưng tệp mới ghi thì không", () => {
  const orphanOld = `orphan-old-${++seq}.bin`;
  const orphanNew = `orphan-new-${++seq}.bin`;
  fs.writeFileSync(path.join(config.filesDir, orphanOld), "x");
  fs.writeFileSync(path.join(config.filesDir, orphanNew), "x");
  const past = new Date(NOW - 5 * 24 * 60 * 60 * 1000);
  fs.utimesSync(path.join(config.filesDir, orphanOld), past, past);

  runHousekeeping({ apply: true, now: NOW });
  assert.equal(fs.existsSync(path.join(config.filesDir, orphanOld)), false, "blob mồ côi cũ phải bị xoá");
  assert.equal(fs.existsSync(path.join(config.filesDir, orphanNew)), true, "blob vừa ghi phải được giữ (ân hạn)");
});

test("apply: token hết hạn, phiên hết hạn, usage_log cũ bị dọn; KHÔNG đụng bảng tiền", () => {
  const userId = seedUser();
  db.prepare("INSERT INTO email_tokens (id, email, token_hash, expires_at, created_at) VALUES (?,?,?,?,?)")
    .run(`t-hk-${++seq}`, "a@test.local", "h", daysAgo(5), daysAgo(10));
  db.prepare(
    "INSERT INTO auth_sessions (id, user_id, created_at, updated_at, last_seen_at, expires_at) VALUES (?,?,?,?,?,?)",
  ).run(`s-hk-${++seq}`, userId, daysAgo(60), daysAgo(60), daysAgo(60), daysAgo(30));
  db.prepare("INSERT INTO usage_log (id, user_id, model, created_at) VALUES (?,?,?,?)")
    .run(`l-hk-${++seq}`, userId, "m", daysAgo(500));
  db.prepare(
    "INSERT INTO credit_ledger (id, user_id, delta, reason, balance_after, created_at) VALUES (?,?,?,?,?,?)",
  ).run(`cl-hk-${++seq}`, userId, 100, "topup", 100, daysAgo(500));
  const ledgerBefore = db.prepare("SELECT COUNT(*) n FROM credit_ledger").get().n;
  const usersBefore = db.prepare("SELECT COUNT(*) n FROM users").get().n;

  const report = runHousekeeping({
    apply: true,
    now: NOW,
    retention: { emailTokenDays: 2, sessionDays: 14, usageLogDays: 365 },
  });

  assert.ok(report.steps.emailTokens.deleted >= 1);
  assert.ok(report.steps.authSessions.deleted >= 1);
  assert.ok(report.steps.usageLog.deleted >= 1);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM credit_ledger").get().n, ledgerBefore, "sổ credit KHÔNG được đụng");
  assert.equal(db.prepare("SELECT COUNT(*) n FROM users").get().n, usersBefore, "users KHÔNG được đụng");
});

test("apply: bộ nhớ quá cũ (không phải do người dùng khai) bị dọn, ký ức do user khai được giữ", () => {
  const userId = seedUser();
  db.prepare("INSERT INTO user_memories (id, user_id, kind, key, value, source, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)")
    .run(`mm-old-${++seq}`, userId, "fact", "công ty", "cũ", "model", daysAgo(600), daysAgo(600));
  db.prepare("INSERT INTO user_memories (id, user_id, kind, key, value, source, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)")
    .run(`mm-user-${++seq}`, userId, "profile", "tên", "Anh Minh", "user", daysAgo(600), daysAgo(600));

  runHousekeeping({ apply: true, now: NOW, retention: { memoryStaleDays: 540 } });
  assert.equal(db.prepare("SELECT COUNT(*) n FROM user_memories WHERE user_id = ? AND source = 'model'").get(userId).n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM user_memories WHERE user_id = ? AND source = 'user'").get(userId).n, 1);
});

test("defaultRetention đọc được env và có trần an toàn", () => {
  const r = defaultRetention({ HK_CONVERSATION_DAYS: "30", HK_MAX_DELETE_PER_RUN: "5" });
  assert.equal(r.conversationDays, 30);
  assert.equal(r.maxDeletePerRun, 5);
  const fallback = defaultRetention({ HK_CONVERSATION_DAYS: "khong-phai-so" });
  assert.equal(fallback.conversationDays, 120);
});

// ---- Hạn mức dung lượng mỗi khách (mặc định 100MB, chủ dự án chốt 20/09/2026) -------------

function seedBigFile(userId, { mb, ageDays = 30, stored = null, conversationId = null }) {
  const name = stored ?? `big-${++seq}.bin`;
  fs.writeFileSync(path.join(config.filesDir, name), "x");
  const id = `f-quota-${++seq}`;
  db.prepare(
    "INSERT INTO files (id, user_id, conversation_id, name, mime, size, stored_name, kind, origin, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
  ).run(id, userId, conversationId, "to.bin", "application/octet-stream", mb * 1024 * 1024, name, "document", "upload", daysAgo(ageDays));
  return { id, stored: name };
}

test("hạn mức: chặn ghi khi vượt 100MB, cho qua khi còn chỗ", () => {
  const userId = seedUser();
  seedBigFile(userId, { mb: 60 });
  // Còn chỗ ⇒ không ném lỗi.
  filesApi.assertStorageQuota(userId, 10 * 1024 * 1024);
  // Vượt hạn mức ⇒ ném 413 kèm số liệu.
  const error = (() => {
    try {
      filesApi.assertStorageQuota(userId, 50 * 1024 * 1024);
      return null;
    } catch (err) {
      return err;
    }
  })();
  assert.ok(error, "phải chặn khi vượt hạn mức");
  assert.equal(error.statusCode, 413);
  assert.equal(error.code, "storage_quota_exceeded");
  assert.equal(error.usage.limitBytes, 100 * 1024 * 1024);
  assert.ok(/dung lượng/i.test(error.message));
});

test("hạn mức: userStorageUsage cộng đúng dung lượng và số tệp", () => {
  const userId = seedUser();
  seedBigFile(userId, { mb: 1 });
  seedBigFile(userId, { mb: 2 });
  const usage = filesApi.userStorageUsage(userId);
  assert.equal(usage.fileCount, 2);
  assert.equal(usage.usedBytes, 3 * 1024 * 1024);
  assert.equal(usage.limitBytes, 100 * 1024 * 1024);
});

test("housekeeping: khách vượt hạn mức bị dọn tệp CŨ NHẤT, giữ tệp trong hội thoại pinned", () => {
  const userId = seedUser();
  const pinnedConv = `c-hk-${++seq}`;
  const at = daysAgo(300);
  db.prepare(
    "INSERT INTO conversations (id, user_id, title, skill, pinned, archived, message_count, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
  ).run(pinnedConv, userId, "Ghim", "auto", 1, 0, 0, at, at);
  const oldest = seedBigFile(userId, { mb: 70, ageDays: 90 });
  const middle = seedBigFile(userId, { mb: 45, ageDays: 60 });
  const pinnedFile = seedBigFile(userId, { mb: 20, ageDays: 120, conversationId: pinnedConv });

  const report = runHousekeeping({
    apply: true,
    now: NOW,
    retention: { userStorageMb: 100, quotaMinAgeDays: 3, quotaTargetRatio: 0.9, conversationDays: 100000, fileDays: 100000 },
  });

  const entry = report.steps.userQuota.users.find((row) => row.user_id === userId);
  assert.ok(entry, "phải thấy user vượt hạn mức");
  assert.equal(entry.usedBytes, 135 * 1024 * 1024);
  assert.equal(db.prepare("SELECT id FROM files WHERE id = ?").get(oldest.id), undefined, "tệp cũ nhất phải bị xoá");
  assert.equal(fs.existsSync(path.join(config.filesDir, oldest.stored)), false, "blob tệp cũ nhất phải bị xoá");
  assert.ok(db.prepare("SELECT id FROM files WHERE id = ?").get(pinnedFile.id), "tệp trong hội thoại pinned phải được giữ");
  assert.ok(db.prepare("SELECT id FROM files WHERE id = ?").get(middle.id), "chỉ xoá tới khi xuống dưới ngưỡng");
});

test("housekeeping: tệp VỪA gửi không bị dọn dù khách vượt hạn mức", () => {
  const userId = seedUser();
  const fresh = seedBigFile(userId, { mb: 120, ageDays: 0 });
  const report = runHousekeeping({
    apply: true,
    now: NOW,
    retention: { userStorageMb: 100, quotaMinAgeDays: 3, conversationDays: 100000, fileDays: 100000 },
  });
  assert.equal(report.steps.userQuota.users.length >= 1, true);
  assert.ok(db.prepare("SELECT id FROM files WHERE id = ?").get(fresh.id), "tệp mới gửi phải được giữ");
});
