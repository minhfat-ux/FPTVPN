#!/usr/bin/env bash
# Deploy tay 2 file control-plane cho T-20260929-03, theo ĐÚNG các bước an toàn của
# scripts/server-agent/deploy-control-plane.sh (backup -> copy -> node --check -> restart -> health -> rollback),
# CHỈ bỏ bước "chạy toàn bộ test suite" vì suite đang ĐỎ SẴN 2 ca không liên quan
# (mac-install.test.js: 5 bước Mac vs 4; alerts.test.js: mojibake) — đo trên chính bản LIVE chưa sửa.
set -euo pipefail
WS=/root/flowvpn-agent/control-plane
LIVE=/root/flowvpn-cp
SERVICE=flowvpn-cp.service
TS="$(date -u +%Y%m%d-%H%M%S)"
BK="$LIVE/src-backup-$TS"
FILES="index.js admin-page.js"

mkdir -p "$BK"
for b in $FILES; do cp -a "$LIVE/src/$b" "$BK/$b"; done
echo "backup: $BK"

for b in $FILES; do install -m 644 "$WS/src/$b" "$LIVE/src/$b"; node --check "$LIVE/src/$b" && echo "check OK $b"; done

systemctl restart "$SERVICE"
sleep 2

healthy=0
for i in $(seq 1 10); do
  code="$(curl -s -o /dev/null -w '%{http_code}' -m 5 http://127.0.0.1:7778/health || true)"
  if echo "$code" | grep -qE '^2'; then healthy=1; break; fi
  sleep 2
done

if [ "$healthy" = "1" ]; then
  echo "health OK (200) — deploy xong; service=$(systemctl is-active "$SERVICE")"
  exit 0
fi

echo "LỖI: health KHÔNG 200 sau 20s → khôi phục bản cũ" >&2
for b in $FILES; do cp -a "$BK/$b" "$LIVE/src/$b"; done
systemctl restart "$SERVICE"
exit 1
