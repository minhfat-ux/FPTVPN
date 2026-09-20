import fs from "node:fs";
import path from "node:path";
import { db } from "./db.js";
import { config } from "./config.js";

/**
 * Housekeeping định kỳ cho SQLite của fBuddy.
 *
 * Vì sao cần: VPS chỉ có ~960 MB RAM và 20 GB đĩa; `messages` + chỉ mục FTS5 +
 * ảnh/tệp do khách tải lên chỉ có tăng. Bảng không bao giờ được dọn thì:
 *   - DB phình ⇒ mọi truy vấn chậm dần (FTS đặc biệt nặng), WAL to ⇒ checkpoint lâu,
 *   - kho tệp trên đĩa đầy ⇒ ghi tệp mới thất bại,
 *   - `auth_sessions`/`email_tokens`/`usage_log`/`audit_log` giữ rác vĩnh viễn.
 *
 * Nguyên tắc an toàn (không được vi phạm khi sửa file này):
 *   1. KHÔNG bao giờ xoá: users, credit_ledger, credit_requests, topup_orders,
 *      hub_purchases, providers, app_settings, model_pricing — tiền và cấu hình.
 *   2. Hội thoại `pinned = 1` giữ mãi (khách tự đánh dấu quan trọng).
 *   3. Mặc định `apply = false` (chỉ đếm) — muốn xoá thật phải truyền `apply`.
 *   4. Mọi lượt xoá đều có trần `maxDeletePerRun` để một lần chạy không khoá DB lâu.
 *   5. Xoá theo lô + xoá blob tệp tương ứng, không để bản ghi mồ côi.
 */

/** Mặc định ngày giữ dữ liệu; đổi được bằng env (không cần build lại). */
export function defaultRetention(env = process.env) {
  const num = (key, fallback) => {
    const value = Number(env[key]);
    return Number.isFinite(value) && value >= 0 ? value : fallback;
  };
  return {
    conversationDays: num("HK_CONVERSATION_DAYS", 120),
    fileDays: num("HK_FILE_DAYS", 90),
    emailTokenDays: num("HK_EMAIL_TOKEN_DAYS", 2),
    sessionDays: num("HK_SESSION_DAYS", 14),
    usageLogDays: num("HK_USAGE_LOG_DAYS", 365),
    auditLogDays: num("HK_AUDIT_LOG_DAYS", 730),
    memoryPerUser: num("HK_MEMORY_PER_USER", 200),
    memoryStaleDays: num("HK_MEMORY_STALE_DAYS", 540),
    batchSize: num("HK_BATCH_SIZE", 400),
    maxDeletePerRun: num("HK_MAX_DELETE_PER_RUN", 20000),
    orphanGraceHours: num("HK_ORPHAN_GRACE_HOURS", 24),
    vacuumFreePageRatio: num("HK_VACUUM_FREE_PAGE_RATIO", 0.2),
  };
}

function isoDaysAgo(days, now = Date.now()) {
  return new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
}

function count(sql, params = []) {
  return Number(db.prepare(sql).get(...params)?.n ?? 0);
}

/** Thống kê nhanh để biết DB có đang phình hay không (dùng cho log/API). */
export function dbStats() {
  const sizeOf = (file) => {
    try {
      return fs.statSync(file).size;
    } catch {
      return 0;
    }
  };
  const pageCount = Number(db.prepare("PRAGMA page_count").get()?.page_count ?? 0);
  const freelist = Number(db.prepare("PRAGMA freelist_count").get()?.freelist_count ?? 0);
  const tables = {};
  for (const name of ["messages", "messages_fts", "conversations", "files", "user_memories", "usage_log", "audit_log", "auth_sessions", "email_tokens"]) {
    try {
      tables[name] = count(`SELECT COUNT(*) AS n FROM "${name}"`);
    } catch {
      tables[name] = null;
    }
  }
  return {
    dbBytes: sizeOf(config.dbFile),
    walBytes: sizeOf(`${config.dbFile}-wal`),
    pageCount,
    freelistCount: freelist,
    freeRatio: pageCount ? freelist / pageCount : 0,
    filesDir: config.filesDir,
    tables,
  };
}

/**
 * Xoá theo lô để không giữ transaction quá lâu (DB nhỏ trên VPS yếu: một lượt xoá
 * vài chục nghìn dòng sẽ khoá ghi suốt thời gian đó).
 *
 * @param {string} table tên bảng (hằng số trong file này, KHÔNG nhận input ngoài)
 * @param {string} where điều kiện đã tham số hoá
 * @param {unknown[]} params
 */
function deleteBatched(table, where, params, { batchSize, limit }) {
  let deleted = 0;
  while (deleted < limit) {
    const size = Math.min(batchSize, limit - deleted);
    // Chọn id theo lô rồi xoá theo id: SQLite mặc định KHÔNG hỗ trợ `DELETE … LIMIT`
    // (chỉ có khi build kèm SQLITE_ENABLE_UPDATE_DELETE_LIMIT), nên cách này mới chạy được.
    const rows = db.prepare(`SELECT id FROM ${table} WHERE ${where} LIMIT ?`).all(...params, size);
    if (!rows.length) break;
    const ids = rows.map((row) => row.id);
    const info = db.prepare(`DELETE FROM ${table} WHERE id IN (${ids.map(() => "?").join(",")})`).run(...ids);
    const changed = Number(info.changes ?? 0);
    deleted += changed;
    if (changed < size) break;
  }
  return deleted;
}

/**
 * Chạy housekeeping. `apply = false` (mặc định) chỉ ĐẾM và trả báo cáo.
 *
 * @param {{apply?: boolean, retention?: object, now?: number, log?: Function}} [options]
 */
export function runHousekeeping({ apply = false, retention = {}, now = Date.now(), log = null } = {}) {
  const r = { ...defaultRetention(), ...retention };
  const started = Date.now();
  const before = dbStats();
  const report = { apply, retention: r, startedAt: new Date(now).toISOString(), steps: {}, before };

  const convCutoff = isoDaysAgo(r.conversationDays, now);

  // 1) Hội thoại cũ (trừ pinned). Xoá messages trước để trigger FTS dọn chỉ mục theo,
  //    rồi xoá tệp của chính hội thoại đó (kèm blob trên đĩa), cuối cùng mới xoá hội thoại.
  const staleConversations = db
    .prepare("SELECT id FROM conversations WHERE pinned = 0 AND updated_at < ? LIMIT ?")
    .all(convCutoff, r.maxDeletePerRun);
  report.steps.conversations = { candidates: staleConversations.length, cutOff: convCutoff };
  if (apply && staleConversations.length) {
    let messages = 0;
    let files = 0;
    let blobs = 0;
    const ids = [];
    for (const { id } of staleConversations) {
      ids.push(id);
      const rows = db.prepare("SELECT id, stored_name FROM files WHERE conversation_id = ?").all(id);
      for (const row of rows) {
        if (row.stored_name) {
          try {
            fs.unlinkSync(path.join(config.filesDir, row.stored_name));
            blobs += 1;
          } catch {
            /* blob đã mất: bỏ qua */
          }
        }
      }
      files += rows.length;
      messages += Number(db.prepare("DELETE FROM messages WHERE conversation_id = ?").run(id).changes ?? 0);
      db.prepare("DELETE FROM files WHERE conversation_id = ?").run(id);
      db.prepare("UPDATE user_state SET last_conversation_id = NULL WHERE last_conversation_id = ?").run(id);
    }
    const placeholders = ids.map(() => "?").join(",");
    db.prepare(`DELETE FROM conversations WHERE id IN (${placeholders})`).run(...ids);
    report.steps.conversations = { ...report.steps.conversations, deleted: ids.length, messages, files, blobs };
  }

  // 2) Tệp cũ không còn thuộc hội thoại nào (hội thoại đã bị dọn ở bước 1 hoặc xoá tay).
  const fileCutoff = isoDaysAgo(r.fileDays, now);
  const orphanRows = db
    .prepare(
      `SELECT id, stored_name FROM files
        WHERE created_at < ?
          AND (conversation_id IS NULL OR conversation_id NOT IN (SELECT id FROM conversations))
        LIMIT ?`,
    )
    .all(fileCutoff, r.maxDeletePerRun);
  report.steps.files = { candidates: orphanRows.length, cutOff: fileCutoff };
  if (apply && orphanRows.length) {
    let blobs = 0;
    for (const row of orphanRows) {
      if (row.stored_name) {
        try {
          fs.unlinkSync(path.join(config.filesDir, row.stored_name));
          blobs += 1;
        } catch {
          /* bỏ qua */
        }
      }
      db.prepare("DELETE FROM files WHERE id = ?").run(row.id);
    }
    report.steps.files = { ...report.steps.files, deleted: orphanRows.length, blobs };
  }

  // 3) Blob mồ côi trên đĩa (không có bản ghi `files`) — chỉ xoá khi cũ hơn ân hạn,
  //    tránh đụng vào tệp vừa ghi xong nhưng chưa kịp cập nhật `stored_name`.
  const graceMs = r.orphanGraceHours * 60 * 60 * 1000;
  const known = new Set(db.prepare("SELECT stored_name FROM files WHERE stored_name <> ''").all().map((row) => row.stored_name));
  let orphanBlobs = [];
  try {
    orphanBlobs = fs
      .readdirSync(config.filesDir)
      .filter((name) => !known.has(name) && now - fs.statSync(path.join(config.filesDir, name)).mtimeMs > graceMs);
  } catch {
    orphanBlobs = [];
  }
  report.steps.orphanBlobs = { candidates: orphanBlobs.length };
  if (apply && orphanBlobs.length) {
    let removed = 0;
    for (const name of orphanBlobs) {
      try {
        fs.unlinkSync(path.join(config.filesDir, name));
        removed += 1;
      } catch {
        /* bỏ qua */
      }
    }
    report.steps.orphanBlobs = { ...report.steps.orphanBlobs, deleted: removed };
  }

  // 4) Token đăng nhập đã hết hạn (giữ thêm vài ngày cho việc tra soát).
  report.steps.emailTokens = {
    candidates: count("SELECT COUNT(*) AS n FROM email_tokens WHERE expires_at < ?", [isoDaysAgo(r.emailTokenDays, now)]),
  };
  if (apply) {
    report.steps.emailTokens.deleted = Number(
      db.prepare("DELETE FROM email_tokens WHERE expires_at < ?").run(isoDaysAgo(r.emailTokenDays, now)).changes ?? 0,
    );
  }

  // 5) Phiên đăng nhập đã hết hạn / đã thu hồi.
  const sessionCutoff = isoDaysAgo(r.sessionDays, now);
  report.steps.authSessions = {
    candidates: count(
      "SELECT COUNT(*) AS n FROM auth_sessions WHERE (expires_at IS NOT NULL AND expires_at < ?) OR (revoked_at IS NOT NULL AND revoked_at < ?)",
      [sessionCutoff, sessionCutoff],
    ),
  };
  if (apply) {
    report.steps.authSessions.deleted = Number(
      db
        .prepare(
          "DELETE FROM auth_sessions WHERE (expires_at IS NOT NULL AND expires_at < ?) OR (revoked_at IS NOT NULL AND revoked_at < ?)",
        )
        .run(sessionCutoff, sessionCutoff).changes ?? 0,
    );
  }

  // 6) Nhật ký dùng token + audit: giữ đủ dài để đối soát, không giữ vĩnh viễn.
  report.steps.usageLog = {
    candidates: count("SELECT COUNT(*) AS n FROM usage_log WHERE created_at < ?", [isoDaysAgo(r.usageLogDays, now)]),
  };
  if (apply) {
    report.steps.usageLog.deleted = deleteBatched(
      "usage_log",
      "created_at < ?",
      [isoDaysAgo(r.usageLogDays, now)],
      { batchSize: r.batchSize, limit: r.maxDeletePerRun },
    );
  }
  report.steps.auditLog = {
    candidates: count("SELECT COUNT(*) AS n FROM audit_log WHERE created_at < ?", [isoDaysAgo(r.auditLogDays, now)]),
  };
  if (apply) {
    report.steps.auditLog.deleted = deleteBatched(
      "audit_log",
      "created_at < ?",
      [isoDaysAgo(r.auditLogDays, now)],
      { batchSize: r.batchSize, limit: r.maxDeletePerRun },
    );
  }

  // 7) Bộ nhớ dài hạn: (a) quá cũ và không phải do người dùng tự khai, (b) vượt trần/người.
  const memoryCutoff = isoDaysAgo(r.memoryStaleDays, now);
  report.steps.memories = {
    candidates: count(
      "SELECT COUNT(*) AS n FROM user_memories WHERE updated_at < ? AND source <> 'user'",
      [memoryCutoff],
    ),
  };
  if (apply) {
    report.steps.memories.deleted = deleteBatched(
      "user_memories",
      "updated_at < ? AND source <> 'user'",
      [memoryCutoff],
      { batchSize: r.batchSize, limit: r.maxDeletePerRun },
    );
  }
  const overCap = db
    .prepare("SELECT user_id, COUNT(*) AS n FROM user_memories GROUP BY user_id HAVING n > ?")
    .all(r.memoryPerUser);
  report.steps.memoriesOverCap = { users: overCap.length };
  if (apply && overCap.length) {
    const pick = db.prepare(
      `SELECT id FROM user_memories WHERE user_id = ? ORDER BY updated_at DESC LIMIT -1 OFFSET ?`,
    );
    let removed = 0;
    for (const row of overCap) {
      for (const { id } of pick.all(row.user_id, r.memoryPerUser)) {
        db.prepare("DELETE FROM user_memories WHERE id = ?").run(id);
        removed += 1;
      }
    }
    report.steps.memoriesOverCap = { users: overCap.length, deleted: removed };
  }

  // 8) Tối ưu file DB: gộp WAL, cập nhật thống kê, và VACUUM khi có nhiều trang trống.
  const after = dbStats();
  report.steps.vacuum = { freeRatioBefore: before.freeRatio, threshold: r.vacuumFreePageRatio };
  if (apply) {
    try {
      db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
    } catch {
      /* checkpoint bận: lần sau */
    }
    try {
      db.exec("PRAGMA optimize;");
    } catch {
      /* không bắt buộc */
    }
    if (before.freeRatio >= r.vacuumFreePageRatio) {
      try {
        db.exec("VACUUM;");
        report.steps.vacuum.ran = true;
      } catch (error) {
        report.steps.vacuum.error = error?.message ?? String(error);
      }
    } else {
      report.steps.vacuum.ran = false;
      report.steps.vacuum.reason = "ít trang trống, không cần VACUUM";
    }
  }
  report.after = dbStats();
  report.durationMs = Date.now() - started;
  if (typeof log === "function") {
    const sizeBefore = Math.round(before.dbBytes / 1024);
    const sizeAfter = Math.round(report.after.dbBytes / 1024);
    const summary = Object.entries(report.steps)
      .filter(([, value]) => value && (value.deleted || value.candidates))
      .map(([key, value]) => `${key}=${value.deleted ?? value.candidates}`)
      .join(" ");
    log(
      `[housekeeping] apply=${apply} db=${sizeBefore}KB→${sizeAfter}KB wal=${Math.round(before.walBytes / 1024)}KB→${Math.round(report.after.walBytes / 1024)}KB ${summary || "(không có gì để dọn)"} (${report.durationMs}ms)`,
    );
  }
  return report;
}
