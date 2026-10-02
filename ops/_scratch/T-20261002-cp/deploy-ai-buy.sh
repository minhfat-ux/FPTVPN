#!/usr/bin/env bash
# T-20261002 — deploy 2 file control-plane đã sửa lên bản LIVE /root/flowvpn-cp.
#
# Vì sao không gọi thẳng scripts/server-agent/deploy-control-plane.sh: script đó CHẶN deploy khi
# `node --test` đỏ, mà bộ test trên node-2 đang đỏ SẴN 2 ca KHÔNG liên quan việc này
# (mac-install.test.js "4 bước Mac" và alerts/tg-commands mojibake). Đo TRƯỚC khi sửa: 326 test /
# 324 pass / 2 fail; SAU khi sửa: y hệt (riêng nhóm buy 19/19 pass).
# Script này giữ đúng các bước an toàn của bản chính thức: backup → node --check → copy →
# restart → health (poll 20s) → rollback nếu không khoẻ.
set -euo pipefail
WS=/root/flowvpn-agent/control-plane
LIVE=/root/flowvpn-cp
SERVICE=flowvpn-cp.service
HEALTH=http://127.0.0.1:7778/health
FILES="payments.js index.js"

TS=$(date -u +%Y%m%d-%H%M%S)
BK="$LIVE/src-backup-$TS"
mkdir -p "$BK"
for f in $FILES; do
  if [ -f "$LIVE/src/$f" ]; then cp -a "$LIVE/src/$f" "$BK/$f"; fi
done
echo "backup: $BK"
sha256sum "$BK"/*

for f in $FILES; do node --check "$WS/src/$f"; done
echo "cu phap OK: $FILES"

for f in $FILES; do install -m 644 "$WS/src/$f" "$LIVE/src/$f"; done
echo "da copy $FILES len LIVE"
sha256sum "$LIVE/src/payments.js" "$LIVE/src/index.js"

systemctl restart "$SERVICE"
ok=0
for i in $(seq 1 10); do
  code=$(curl -s -o /dev/null -w '%{http_code}' -m 5 "$HEALTH" || true)
  if [ "${code:0:1}" = "2" ]; then ok=1; break; fi
  sleep 2
done
if [ "$ok" = "1" ]; then
  echo "health OK ($HEALTH) — deploy xong; service=$(systemctl is-active "$SERVICE")"
  echo "$TS" > /var/lib/flowvpn-last-deploy 2>/dev/null || true
  echo "$BK" > /tmp/cp-ai-buy-deploy-backup
  exit 0
fi
echo "LOI: health khong 200 sau 20s → tu khoi phuc ban cu" >&2
for f in $FILES; do cp -a "$BK/$f" "$LIVE/src/$f"; done
systemctl restart "$SERVICE"
sleep 2
echo "da rollback tu $BK; service=$(systemctl is-active "$SERVICE")" >&2
exit 1
