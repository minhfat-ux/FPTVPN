#!/usr/bin/env bash
set -u
WS=/root/flowvpn-agent/control-plane
LIVE=/root/flowvpn-cp
TS="$(date -u +%Y%m%d-%H%M%S)"
BK="/root/backups/ws-cp-before-sync-$TS"
mkdir -p "$BK"

FILES="admin-page.js auth-store.js home-page.js index.js"
echo "=== 1) Backup ban WS truoc khi dong bo ==="
for b in $FILES; do cp -a "$WS/src/$b" "$BK/$b"; echo "  $BK/$b"; done
echo "  (git HEAD cua WS van giu nguyen cac ban cu — khong mat gi)"

echo
echo "=== 2) Copy LIVE -> WS (4 file lech) ==="
for b in $FILES; do install -m 644 "$LIVE/src/$b" "$WS/src/$b"; done
for b in $FILES; do
  if cmp -s "$WS/src/$b" "$LIVE/src/$b"; then echo "  OK $b"; else echo "  LECH $b"; fi
done

echo
echo "=== 3) node --check ==="
for b in $FILES; do node --check "$WS/src/$b" && echo "  --check OK $b"; done

echo
echo "=== 4) Bo loc account revoked co trong WS chua ==="
grep -n "excludeRevoked" "$WS/src/index.js" | head -3
grep -n "purgeRevokedUsers\|options.excludeRevoked" "$WS/src/auth-store.js" | head -5
grep -c "_writeChain" "$WS/src/auth-store.js" | sed 's/^/  _writeChain (va _save): /'

echo
echo "=== 5) DRY-RUN deploy: deploy mac dinh gio phai la NO-OP ==="
bash /root/flowvpn-agent/scripts/server-agent/deploy-control-plane.sh --dry-run 2>&1 | tail -5
