#!/bin/bash
# B1 — Format SSD external mới: APFS (case-insensitive) + scheme GPT
# Dùng: ./01-format-new-ssd.sh /dev/diskN      (tìm bằng: diskutil list)
set -euo pipefail

DISK="${1:-}"
VOLNAME="${VOLNAME:-BIWIN_NEW}"

if [ -z "$DISK" ]; then
  echo "Thiếu device. Dùng: $0 /dev/diskN"
  echo
  diskutil list external
  exit 1
fi

echo "== Thông tin ổ sẽ format =="
diskutil info "$DISK" | grep -E 'Device / Media Name|Disk Size|Protocol|Solid State|Removable|Device Block Size' || true
echo
echo "Sẽ XOÁ TOÀN BỘ dữ liệu trên $DISK và tạo APFS (case-insensitive) '$VOLNAME' với scheme GPT."
read -r -p 'Gõ chính xác ERASE để xác nhận: ' ans
[ "$ans" = "ERASE" ] || { echo "Đã huỷ."; exit 1; }

diskutil eraseDisk APFS "$VOLNAME" GPT "$DISK"
echo
diskutil apfs list
echo
echo "Xong. Bước tiếp theo: ./02-copy.sh"
echo "Tuỳ chọn — bật mã hoá:        diskutil apfs encryptVolume /Volumes/$VOLNAME -user disk"
echo "Tuỳ chọn — volume trao đổi:  diskutil apfs addVolume <containerRef> APFS Transfer"
