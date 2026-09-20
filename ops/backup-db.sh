#!/usr/bin/env bash
#
# Sao lưu DB fBuddy bằng VACUUM INTO (bản sao nhất quán, KHÔNG cần dừng app), nén, kiểm tra, giữ N bản.
#
#   bash ops/backup-db.sh                 # chạy tay
#   bash ops/backup-db.sh --remote        # chạy trên node-2 qua SSH (mặc định khi gọi từ Mac)
#
# Chạy bằng systemd timer: fbuddy-backup.timer (4 lần/ngày). Đọc docs/PORTS-AND-SERVICES.md §6.
set -euo pipefail

DB="${FBUDDY_DB:-/var/lib/fbuddy/fbuddy.db}"
OUT="${BACKUP_DIR:-/var/backups/fbuddy}"
KEEP="${BACKUP_KEEP:-14}"
STAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p "$OUT"

TARGET="$OUT/fbuddy-$STAMP.db"

# Viết phần JS ra FILE riêng, KHÔNG nhúng vào chuỗi nháy kép của bash: bản đầu nhúng thẳng nên bash
# diễn giải backtick và ${...} (thành command substitution) ⇒ "ERR_INVALID_ARG_TYPE"/"SQL logic error".
# Dấu nháy đơn quanh JSCODE là bắt buộc: nó chặn mọi khai triển của bash.
JS_FILE="$(mktemp /tmp/fbuddy-backup-XXXXXX.cjs)"
cat > "$JS_FILE" <<'JSCODE'
const { DatabaseSync } = require("node:sqlite");
const [dbPath, target] = process.argv.slice(2);
if (!dbPath || !target) {
  console.error("Thiếu tham số: backup-db.js <db> <target>");
  process.exit(2);
}
const db = new DatabaseSync(dbPath);
// SQLite coi dấu NHÁY KÉP là tên định danh ⇒ đường dẫn phải đặt trong nháy đơn.
db.exec("VACUUM INTO '" + target.replace(/'/g, "''") + "'");
const check = db.prepare("PRAGMA integrity_check").get();
console.log("integrity_check:", Object.values(check)[0]);
const rows = (table) => {
  try {
    return db.prepare("select count(*) c from " + table).get().c;
  } catch {
    return "n/a";
  }
};
console.log("users:", rows("users"), "· conversations:", rows("conversations"), "· messages:", rows("messages"), "· hub_skills:", rows("hub_skills"));
db.close();
JSCODE
"${NODE_BIN:-/usr/bin/node}" "$JS_FILE" "$DB" "$TARGET"
rm -f "$JS_FILE"

gzip -f "$TARGET"
echo "đã sao lưu: $TARGET.gz ($(du -h "$TARGET.gz" | cut -f1))"

# Giữ N bản gần nhất, xoá phần cũ hơn.
find "$OUT" -maxdepth 1 -name "fbuddy-*.db.gz" -printf "%T@ %p\n" 2>/dev/null | sort -rn | tail -n +$((KEEP + 1)) | cut -d" " -f2- | while read -r old; do
  rm -f "$old"
  echo "xoá bản cũ: $old"
done

echo "tổng số bản đang giữ: $(find "$OUT" -maxdepth 1 -name "fbuddy-*.db.gz" | wc -l)"
