#!/bin/bash
# Dọn cache build sinh lại được để volume repo không đầy (ca thật 25/09/2026: /Volumes/BIWIN
# đầy 100% — 466G/466G còn 232Mi ⇒ `sed` báo "No space left on device" và build chết giữa đường;
# `build/` chiếm 59G + `.privatevpn/tmp` 11G, phần lớn là cache DerivedData của từng lần build).
#
# Dùng:
#   bash scripts/clean-build-cache.sh            # dọn thật
#   bash scripts/clean-build-cache.sh --dry-run  # chỉ in ra sẽ xoá gì
#   KEEP=1 bash scripts/clean-build-cache.sh     # giữ 1 bản mới nhất mỗi loại (mặc định 2)
#   MIN_FREE_GB=5 bash scripts/clean-build-cache.sh   # chỉ dọn khi trống < 5 GB (0 = luôn dọn)
#
# KHÔNG BAO GIỜ xoá: source, docs, .git, release/, `build/ios-adhoc-export/ipa` (artifact đang phát),
# các file `build/*.md` (bằng chứng §2c), hay bất cứ gì ngoài danh sách dưới đây.
set -uo pipefail
cd "$(dirname "$0")/.."

DRY=0
[ "${1:-}" = "--dry-run" ] && DRY=1
KEEP="${KEEP:-2}"
MIN_FREE_GB="${MIN_FREE_GB:-0}"

free_gb() { df -g . | awk 'NR==2{print $4}'; }
BEFORE=$(free_gb)
if [ "$MIN_FREE_GB" -gt 0 ] && [ "$BEFORE" -ge "$MIN_FREE_GB" ]; then
  echo "bỏ qua: còn ${BEFORE}GB ≥ ngưỡng ${MIN_FREE_GB}GB"
  exit 0
fi
echo "trống trước: ${BEFORE}GB · giữ ${KEEP} bản mới nhất mỗi loại"

# Giữ KEEP bản mới nhất, xoá phần còn lại. `ls -dt` = mới nhất trước.
for pattern in 'build/dd-*' 'build/DerivedData' 'build/mac-verify' 'build/Release*' \
               'build/Debug' 'build/XCBuildData' 'build/SourcePackages' \
               '.privatevpn/tmp/ios-*' '.privatevpn/tmp/dd-*'; do
  # shellcheck disable=SC2086
  items=$(ls -dt $pattern 2>/dev/null | tail -n +$((KEEP + 1)))
  [ -z "$items" ] && continue
  while IFS= read -r d; do
    [ -z "$d" ] && continue
    sz=$(du -sh "$d" 2>/dev/null | awk '{print $1}')
    if [ "$DRY" = "1" ]; then echo "  [dry] xoá $d ($sz)"; else echo "  xoá $d ($sz)"; rm -rf "$d"; fi
  done <<< "$items"
done

# Cache ModuleCache ngoài repo (DerivedData mặc định của Xcode) — chỉ xoá khi dung lượng lớn.
for d in "$HOME/Library/Developer/Xcode/DerivedData"/PrivateVPN-*; do
  [ -d "$d" ] || continue
  sz=$(du -sm "$d" 2>/dev/null | awk '{print $1}')
  [ "${sz:-0}" -lt 500 ] && continue
  if [ "$DRY" = "1" ]; then echo "  [dry] xoá $d (${sz}MB)"; else echo "  xoá $d (${sz}MB)"; rm -rf "$d"; fi
done

AFTER=$(free_gb)
echo "trống sau: ${AFTER}GB (giải phóng $((AFTER - BEFORE))GB)"
