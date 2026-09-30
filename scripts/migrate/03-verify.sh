#!/bin/bash
# B3 — Đối chiếu sau khi copy.
# Dùng: DST=/Volumes/BIWIN_NEW RSYNC=/opt/homebrew/bin/rsync ./03-verify.sh
set -uo pipefail

SRC="${SRC:-/Volumes/BIWIN}"
DST="${DST:-}"
MODE="${MODE:-code}"
RSYNC="${RSYNC:-rsync}"
HERE="$(cd "$(dirname "$0")" && pwd)"
FAIL=0

[ -n "$DST" ] || { echo "Thiếu DST. Ví dụ: DST=/Volumes/BIWIN_NEW $0"; exit 1; }

EXCLUDES=(--exclude-from="$HERE/exclude-junk.txt")
[ "$MODE" = "code" ] && EXCLUDES+=(--exclude-from="$HERE/exclude-rebuildable.txt")

echo "== 1) Đối chiếu nội dung: rsync dry-run phải KHÔNG in ra dòng nào =="
echo "   (kiểm tra có thẩm quyền: nội dung, size, quyền, symlink, timestamp)"
DIFF="$("$RSYNC" -aHAX --numeric-ids --dry-run --itemize-changes "${EXCLUDES[@]}" "$SRC/" "$DST/" 2>&1 | grep -v '^$' || true)"
if [ -z "$DIFF" ]; then
  echo "   OK: hai bên khớp."
else
  echo "   LỆCH ($(printf '%s\n' "$DIFF" | wc -l | tr -d ' ') mục), 40 dòng đầu:"
  printf '%s\n' "$DIFF" | head -40 | sed 's/^/   /'
  FAIL=1
fi

echo
echo "== 2) Symlink & exec bit (thứ exFAT đã phá) =="
s_src="$(find "$SRC" -type l 2>/dev/null | wc -l | tr -d ' ')"
s_dst="$(find "$DST" -type l 2>/dev/null | wc -l | tr -d ' ')"
x_dst="$(find "$DST" -type f -perm -u+x 2>/dev/null | wc -l | tr -d ' ')"
echo "   symlink: SRC=$s_src  DST=$s_dst"
echo "   file có exec bit trên DST: $x_dst"
[ "$s_dst" -lt "$s_src" ] && { echo "   CẢNH BÁO: thiếu symlink."; FAIL=1; }

echo
echo "== 3) Toàn vẹn git repo trên DST (tối đa 5 repo) =="
found=0
while IFS= read -r g; do
  r="$(dirname "$g")"
  out="$(git -C "$r" fsck --no-progress --no-dangling 2>&1 | head -5)"
  if [ -z "$out" ]; then
    echo "   OK       $r"
  else
    echo "   CẢNH BÁO  $r"; printf '%s\n' "$out" | sed 's/^/            /'
  fi
  found=$((found+1))
  [ "$found" -ge 5 ] && break
done < <(find "$DST" -maxdepth 5 -name .git -type d 2>/dev/null | sort)

echo
echo "== 4) Dung lượng DST theo thư mục cấp 1 (tham khảo) =="
du -sh "$DST"/* 2>/dev/null | sort -h | tail -15 | sed 's/^/   /'
echo "   Tổng: $(df -h "$DST" | awk 'NR==2{print $3" đã dùng / "$4" trống"}')"

echo
if [ "$FAIL" = 0 ]; then
  echo "==> Không phát hiện lệch. Sang B4 (build lại) rồi B5 (cutover)."
else
  echo "==> CÓ VẤN ĐỀ — xử lý xong mới cutover."
fi
exit "$FAIL"
