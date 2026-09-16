#!/usr/bin/env bash
# sync-from-prod.sh — đồng bộ workspace của agent theo ĐÚNG bản đang chạy.
#
# Vì sao: `/deploy` chỉ nên phát những gì agent sửa. Nếu workspace lệch sẵn (bản copy cũ hơn
# hoặc có thay đổi của người khác chưa deploy) thì agent sẽ vô tình đẩy cả phần đó lên.
# Chạy script này trước khi giao việc, hoặc khi nghi ngờ workspace lệch.
set -euo pipefail
WS="${WS:-/root/flowvpn-agent/control-plane}"
LIVE="${LIVE:-/root/flowvpn-cp}"

[ -d "$WS/src" ] || { echo "LỖI: không thấy $WS/src" >&2; exit 1; }
changed=0
for f in "$LIVE"/src/*.js; do
  base="$(basename "$f")"
  if [ ! -f "$WS/src/$base" ] || ! cmp -s "$f" "$WS/src/$base"; then
    install -m 644 "$f" "$WS/src/$base"
    echo "  cập nhật $base"
    changed=$((changed + 1))
  fi
done
echo "đồng bộ $changed file từ $LIVE/src → $WS/src"
if [ -d "$WS/../.git" ]; then
  ( cd "$WS/.." && git add -A control-plane/src >/dev/null && git commit -qm "sync workspace theo bản đang chạy ($(date -u +%F\ %T))" >/dev/null 2>&1 || true )
fi
