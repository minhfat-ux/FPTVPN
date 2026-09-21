#!/usr/bin/env bash
#
# VỚT DỮ LIỆU từ bản làm việc CŨ trên ổ ngoài (BIWIN) sang ổ trong + repo.
#
#   bash ops/backup-old-worktree.sh              # sao chép + liệt kê phần KHÁC bản clone
#   bash ops/backup-old-worktree.sh --dry-run    # chỉ liệt kê
#
# Vì sao cần: ổ BIWIN đang hỏng (mount treo). Bản clone trên ổ trong chỉ có những gì ĐÃ push lên
# GitHub, còn thư mục cũ có thể chứa file sửa dở / file chưa từng commit. Format ổ mà không vớt là mất.
set -euo pipefail

OLD="${OLD_WORKTREE:-/Volumes/BIWIN/FlowGPT}"
NEW="${NEW_WORKTREE:-$HOME/FlowGPT}"
OUT="${BACKUP_DIR:-$HOME/backup-old-worktree-$(date +%Y%m%d-%H%M)}"
DRY=0
[ "${1:-}" = "--dry-run" ] && DRY=1

if [ ! -d "$OLD" ]; then
  echo "! Không thấy $OLD — ổ chưa mount. Chạy:"
  echo "    sudo pkill -9 diskutil && sudo fsck_exfat -y /dev/rdiskXsY && diskutil mount diskXsY"
  exit 1
fi

echo "== 1/3: sao chép toàn bộ cây cũ (bỏ .git, node_modules) =="
echo "   nguồn: $OLD"
echo "   đích : $OUT"
if [ $DRY -eq 0 ]; then
  mkdir -p "$OUT"
  rsync -a --info=progress2 \
    --exclude '.git/' --exclude 'node_modules/' --exclude '.npm-cache/' \
    --exclude 'web/dist/' --exclude 'ops/ui-out-*/' \
    "$OLD/" "$OUT/" || true
  echo "   đã sao chép: $(du -sh "$OUT" | cut -f1)"
fi

echo "== 2/3: file có ở cây CŨ mà KHÔNG có ở bản clone (đáng soi nhất) =="
if [ $DRY -eq 0 ]; then
  ( cd "$OUT" && find . -type f ! -path './.git/*' ! -path '*/node_modules/*' -print0 ) |
  while IFS= read -r -d '' f; do
    [ -e "$NEW/$f" ] || echo "  CHỈ CÓ Ở CŨ: $f"
  done | head -60
fi

echo "== 3/3: file cùng đường dẫn nhưng NỘI DUNG khác =="
if [ $DRY -eq 0 ]; then
  ( cd "$OUT" && find . -type f ! -path './.git/*' ! -path '*/node_modules/*' -print0 ) |
  while IFS= read -r -d '' f; do
    if [ -f "$NEW/$f" ] && ! cmp -s "$OUT/$f" "$NEW/$f"; then echo "  KHÁC NỘI DUNG: $f"; fi
  done | head -60
fi

echo
echo "Xong. Bản sao ở: $OUT"
echo "Bước tiếp: soi hai danh sách trên, chép những gì còn giá trị vào $NEW rồi commit + push."
