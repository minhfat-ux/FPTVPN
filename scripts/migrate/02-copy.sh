#!/bin/bash
# B2 — Copy /Volumes/BIWIN -> SSD mới, giữ metadata, loại rác + artifact build lại được.
#
# Chạy thử:  DRY=1 DST=/Volumes/BIWIN_NEW RSYNC=/opt/homebrew/bin/rsync ./02-copy.sh
# Chạy thật: DST=/Volumes/BIWIN_NEW RSYNC=/opt/homebrew/bin/rsync ./02-copy.sh
# MODE=full để copy nguyên trạng mọi thứ (trừ rác filesystem).
set -euo pipefail

SRC="${SRC:-/Volumes/BIWIN}"
DST="${DST:-}"
MODE="${MODE:-code}"   # code | full
DRY="${DRY:-0}"        # 1 = chỉ liệt kê
RSYNC="${RSYNC:-rsync}"
HERE="$(cd "$(dirname "$0")" && pwd)"

[ -n "$DST" ] || { echo "Thiếu DST. Ví dụ: DST=/Volumes/BIWIN_NEW $0"; exit 1; }
[ -d "$SRC" ] || { echo "Không thấy SRC: $SRC"; exit 1; }
[ -d "$DST" ] || { echo "Không thấy DST: $DST"; exit 1; }

# Chặn copy vào chính volume nguồn
src_dev="$(df -P "$SRC" | awk 'NR==2{print $1}')"
dst_dev="$(df -P "$DST" | awk 'NR==2{print $1}')"
if [ "$src_dev" = "$dst_dev" ]; then
  echo "SRC và DST cùng một volume ($src_dev) — dừng."
  exit 1
fi

if ! "$RSYNC" --version 2>/dev/null | grep -q 'version 3'; then
  echo "rsync hiện tại không phải GNU rsync 3.x (macOS 26 dùng openrsync 2.6.9, thiếu -X và -A)."
  echo "Cài rồi chạy lại:  brew install rsync"
  echo "                   RSYNC=/opt/homebrew/bin/rsync DST=$DST $0"
  exit 1
fi

ARGS=(-aHAX --numeric-ids --info=progress2 --human-readable
      --exclude-from="$HERE/exclude-junk.txt")
[ "$MODE" = "code" ] && ARGS+=(--exclude-from="$HERE/exclude-rebuildable.txt")
[ "$DRY" = "1" ] && ARGS+=(--dry-run --itemize-changes)

echo "SRC  = $SRC   ($src_dev, $(df -h "$SRC" | awk 'NR==2{print $4}') trống)"
echo "DST  = $DST   ($dst_dev, $(df -h "$DST" | awk 'NR==2{print $4}') trống)"
echo "MODE = $MODE    DRY = $DRY    RSYNC = $RSYNC"
echo

if [ "$DRY" != "1" ]; then
  echo "Bắt đầu sau 10 giây — Ctrl-C để huỷ."
  echo "Kiểm tra: đã đóng Xcode/IDE và DỪNG mọi session DSH đang chạy trong $SRC chưa?"
  sleep 10
fi

"$RSYNC" "${ARGS[@]}" "$SRC/" "$DST/"

echo
if [ "$DRY" = "1" ]; then
  echo "Dry-run xong. Nếu danh sách hợp lý thì bỏ DRY=1 để copy thật."
else
  echo "Copy xong. Bước tiếp theo: DST=$DST ./03-verify.sh"
fi
