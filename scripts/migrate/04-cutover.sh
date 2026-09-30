#!/bin/bash
# B5 — Cutover: đổi tên volume mới thành BIWIN để GIỮ NGUYÊN mọi đường dẫn
# (session history DSH, path trong .pbxproj/.env/script đều khoá theo /Volumes/BIWIN).
#
# Dùng: ./04-cutover.sh            # mặc định /Volumes/BIWIN_NEW -> BIWIN
set -euo pipefail

NEW="${1:-/Volumes/BIWIN_NEW}"
NAME="${2:-BIWIN}"

[ -d "$NEW" ] || { echo "Không thấy volume mới: $NEW"; diskutil list external; exit 1; }

if mount | grep -q " on /Volumes/$NAME "; then
  echo "Ổ cũ vẫn đang mount tại /Volumes/$NAME."
  echo "Hãy đóng mọi app/terminal đang dùng nó, DỪNG các session DSH, rồi:"
  echo "    diskutil unmount /Volumes/$NAME     # hoặc eject hẳn ổ cũ"
  exit 1
fi

echo "Đổi tên '$NEW' -> '$NAME' ..."
diskutil rename "$NEW" "$NAME"

echo
diskutil info "/Volumes/$NAME" | grep -E 'Volume Name|File System Personality|Mount Point|Volume Total Space'
echo
echo "Kiểm tra nhanh:"
echo "    df -h /Volumes/$NAME          # phải là SSD mới (~1 TB)"
echo "    ls /Volumes/$NAME/SourcesCode"
echo
echo "Việc còn lại: mở session DSH mới trong workspace (cwd /Volumes/$NAME/...),"
echo "build lại node_modules/DerivedData, chạy thử vài repo. GIỮ Ổ CŨ 1-2 tuần, chưa format."
