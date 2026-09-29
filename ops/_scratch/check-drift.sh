#!/usr/bin/env bash
set -u
WS=/root/flowvpn-agent/control-plane
LIVE=/root/flowvpn-cp
echo "=== File src/*.js KHAC nhau giua WS (nguon deploy) va LIVE ==="
n=0
for f in "$LIVE"/src/*.js; do
  b="$(basename "$f")"
  if [ ! -f "$WS/src/$b" ]; then
    echo "  [WS THIEU] $b"
    n=$((n+1))
  elif ! cmp -s "$WS/src/$b" "$f"; then
    echo "  [KHAC] $b  (WS $(stat -c%s "$WS/src/$b") B vs LIVE $(stat -c%s "$f") B)"
    n=$((n+1))
  fi
done
echo "TONG SO FILE LECH: $n"
echo
echo "=== git state cua /root/flowvpn-agent ==="
cd /root/flowvpn-agent
echo "branch: $(git rev-parse --abbrev-ref HEAD)"
echo "HEAD  : $(git log --oneline -1)"
echo "origin/master (ref cuc bo): $(git rev-parse --short origin/master 2>&1)"
echo "so commit HEAD di truoc origin/master: $(git rev-list --count origin/master..HEAD 2>&1)"
echo
echo "=== git co biet 2 file nay khac khong ==="
git status --short control-plane/src/index.js control-plane/src/auth-store.js
