#!/usr/bin/env bash
# T-20261002 — áp 2 việc bus #652/#653 lên workspace control-plane trên node-2 (nguồn của deploy).
set -euo pipefail
WS=/root/flowvpn-agent/control-plane
TS=$(date -u +%Y%m%d-%H%M%S)
BK=/root/cp-backup-ai-buy-$TS
mkdir -p "$BK"
cp -a "$WS/src/payments.js" "$WS/src/index.js" "$BK/"
echo "backup: $BK"
sha256sum "$BK"/*
echo "--- chay patch ---"
node /tmp/patch-ai-buy.mjs
echo "--- node --check ---"
node --check "$WS/src/payments.js" && echo "check OK payments.js"
node --check "$WS/src/index.js" && echo "check OK index.js"
echo "--- sha256 sau patch ---"
sha256sum "$WS/src/payments.js" "$WS/src/index.js"
echo "--- dong da sua (payments.js) ---"
grep -n 'emailLabel: "Email"\|emailLabel: "邮箱"\|emailLabel: "メールアドレス"\|emailLabel: "이메일"' "$WS/src/payments.js" || true
grep -n 'const windowsUrl' "$WS/src/payments.js" || true
echo "--- dong da sua (index.js) ---"
grep -n 'ai_windows_url' "$WS/src/index.js" || true
echo "BK=$BK" > /tmp/cp-ai-buy-backup-path
