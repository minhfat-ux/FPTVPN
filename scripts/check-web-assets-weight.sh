#!/usr/bin/env bash
# check-web-assets-weight.sh — CỔNG CHẶN trọng lượng ảnh của trang chủ/trang bán (meetflowai.site).
#
# Vì sao có: đo 25/09/2026 — trang chủ nặng 588 KB, trong đó **95% là 6 ảnh logo PNG**
# (256x256 / 512x512) trong khi chỉ hiển thị 34–54 px; tốc độ tải từ Trung Quốc về Cloudflare
# đo được 190–300 KB/s (có mẫu rơi 37,9 KB/s) ⇒ lần vào đầu mất 3–15 s. Origin KHÔNG phải chỗ
# nghẽn (TTFB từ node-2 chỉ 0,08 s, HTML đã nén brotli).
#
# Dùng:
#   bash scripts/check-web-assets-weight.sh                                  # đọc control-plane/assets/
#   bash scripts/check-web-assets-weight.sh --url https://meetflowai.site    # đo bản ĐANG PHÁT
# Ngưỡng (đổi bằng biến môi trường): MAX_ONE_KB=40 · MAX_TOTAL_KB=120
# exit 0 = ĐẠT · exit 1 = có ảnh quá nặng (in rõ file + số đo).
set -u

MAX_ONE_KB="${MAX_ONE_KB:-40}"
MAX_TOTAL_KB="${MAX_TOTAL_KB:-120}"
DIR="${ASSETS_DIR:-control-plane/assets}"
URL=""
while [ $# -gt 0 ]; do
  case "$1" in
    --url) URL="${2%/}"; shift 2 ;;
    --dir) DIR="$2"; shift 2 ;;
    *) echo "tham so la: $1" >&2; exit 2 ;;
  esac
done

ASSETS="vpnflow-logo.png meetflow-logo.png fbuddy-logo.png supermom-logo.png flowtech-mark.png flowtech-icon.png"
TMP=""
if [ -n "$URL" ]; then
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT
  echo "nguồn: $URL (bản đang phát)"
else
  echo "nguồn: $DIR (file trong repo)"
  [ -d "$DIR" ] || { echo "KHÔNG ĐẠT: không thấy thư mục $DIR" >&2; exit 2; }
fi

total=0
bad=0
printf '%-22s %10s\n' "ảnh" "byte"
for a in $ASSETS; do
  if [ -n "$URL" ]; then
    n=$(curl -sS -o "$TMP/$a" --max-time 30 -w '%{size_download}' "$URL/assets/$a" 2>/dev/null || echo 0)
    [ "${n:-0}" -gt 0 ] || { echo "KHÔNG KIỂM ĐƯỢC: $a (tải hỏng)" >&2; exit 2; }
  else
    [ -f "$DIR/$a" ] || { echo "KHÔNG ĐẠT: thiếu $a trong $DIR" >&2; exit 1; }
    n=$(wc -c < "$DIR/$a" | tr -d ' ')
  fi
  total=$((total + n))
  flag=""
  if [ "$n" -gt $((MAX_ONE_KB * 1024)) ]; then flag="  <-- QUÁ NẶNG (> ${MAX_ONE_KB} KB)"; bad=1; fi
  printf '%-22s %10s%s\n' "$a" "$n" "$flag"
done

printf '\nTỔNG: %s byte = %s KB (ngưỡng %s KB) · mỗi ảnh tối đa %s KB\n' \
  "$total" "$((total / 1024))" "$MAX_TOTAL_KB" "$MAX_ONE_KB"
if [ "$total" -gt $((MAX_TOTAL_KB * 1024)) ]; then
  echo "KẾT LUẬN: KHÔNG ĐẠT — tổng ảnh vượt ngưỡng. Dùng gói đã tối ưu:"
  echo "  docs/handoff/web-assets-2026-09-25/ (Tier 1: 94 KB · Tier 2: 29 KB PNG / 19 KB WebP)"
  exit 1
fi
if [ "$bad" -ne 0 ]; then
  echo "KẾT LUẬN: KHÔNG ĐẠT — có ảnh lẻ vượt ${MAX_ONE_KB} KB (xem dòng đánh dấu)."
  exit 1
fi
echo "KẾT LUẬN: ĐẠT — 6 ảnh logo trong ngưỡng."
