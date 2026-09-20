#!/usr/bin/env node
/**
 * Dọn dẹp định kỳ DB fBuddy (SQLite) + kho tệp.
 *
 *   node ops/housekeeping.mjs              # chỉ ĐẾM, không xoá (mặc định an toàn)
 *   node ops/housekeeping.mjs --apply      # xoá thật + tối ưu DB
 *   node ops/housekeeping.mjs --json       # in báo cáo JSON (cho cron/log)
 *
 * Chạy tự động: systemd timer `fbuddy-housekeeping.timer` (xem deploy/).
 */
import { initDb, db } from "../server/src/db.js";
import { dbStats, runHousekeeping, defaultRetention } from "../server/src/housekeeping.js";

const apply = process.argv.includes("--apply");
const asJson = process.argv.includes("--json");

initDb();
// App đang chạy vẫn giữ DB mở: chờ thay vì lỗi SQLITE_BUSY (VACUUM cần quyền ghi riêng).
db.exec("PRAGMA busy_timeout = 15000;");

if (asJson && !apply) {
  console.log(JSON.stringify({ apply, stats: dbStats(), retention: defaultRetention() }, null, 2));
  process.exit(0);
}

const report = runHousekeeping({
  apply,
  log: asJson ? null : (line) => console.log(line),
});

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else if (!apply) {
  console.log("[housekeeping] DRY-RUN (chưa xoá gì). Thêm --apply để chạy thật.");
  console.log(JSON.stringify(report.steps, null, 2));
}
