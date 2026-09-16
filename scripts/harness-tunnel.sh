#!/usr/bin/env bash
# Mo harness (DSH web) tren server ra may anh qua tunnel SSH — KHONG mo ra Internet.
#
#   Mac --ssh--> node-1 (jump) --ssh--> node-2, forward 127.0.0.1:<PORT> -> node-2:3080
#
# Dung:  scripts/harness-tunnel.sh          # mo tunnel + in URL + mo browser
#        HARNESS_CHECK=1 scripts/harness-tunnel.sh   # tu kiem tra 1 lan roi thoat
#
# Env: HARNESS_PORT (mac dinh 3081), HARNESS_KEY, HARNESS_JUMP, HARNESS_TARGET
set -euo pipefail

PORT="${HARNESS_PORT:-3081}"
KEY="${HARNESS_KEY:-$HOME/.ssh/fpt_tunnel}"
JUMP="${HARNESS_JUMP:-root@100.76.147.111}"
TARGET="${HARNESS_TARGET:-root@165.101.114.162}"
REMOTE_PORT=3080
LOG="${TMPDIR:-/tmp}/flowvpn-harness-tunnel.log"

SSH_OPTS=(-o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ExitOnForwardFailure=yes -o ServerAliveInterval=30)
PROXY="ssh -i $KEY -o BatchMode=yes -W %h:%p $JUMP"

cleanup() { [ -n "${TUN_PID:-}" ] && kill "$TUN_PID" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

echo "→ mo tunnel 127.0.0.1:$PORT → node-2:$REMOTE_PORT (qua $JUMP)"
ssh "${SSH_OPTS[@]}" -o ProxyCommand="$PROXY" -i "$KEY" "$TARGET" \
    -N -L "$PORT:127.0.0.1:$REMOTE_PORT" >"$LOG" 2>&1 &
TUN_PID=$!

for _ in $(seq 1 15); do
  code=$(curl -s -o /dev/null -w '%{http_code}' -m 4 "http://127.0.0.1:$PORT/" 2>/dev/null || true)
  code="${code:-000}"
  [ "$code" != "000" ] && break
  sleep 1
done
if [ "${code:-000}" = "000" ]; then
  echo "✗ khong mo duoc tunnel. Log: $LOG" >&2; tail -5 "$LOG" >&2; exit 1
fi

URL=$(ssh "${SSH_OPTS[@]}" -o ProxyCommand="$PROXY" -i "$KEY" "$TARGET" '/usr/local/bin/flowvpn-harness-url') || {
  echo "✗ khong lay duoc URL (service flowvpn-harness da chay chua?)" >&2; exit 1; }
TOKEN="${URL##*token=}"
LOCAL_URL="http://127.0.0.1:$PORT/?token=$TOKEN"

echo "✓ tunnel OK (HTTP $code khi thieu token = dung, harness doi token)"
echo "  GUI: $LOCAL_URL"
if [ "${HARNESS_CHECK:-0}" = "1" ]; then
  CJ=$(mktemp)
  final=$(curl -sL -c "$CJ" -b "$CJ" -o /dev/null -w '%{http_code}' -m 8 "$LOCAL_URL")
  rm -f "$CJ"
  echo "  kiem tra co token (co cookie) → HTTP $final (200 la tot)"
  [ "$final" = "200" ] || exit 1
  exit 0
fi
[ "${HARNESS_NO_OPEN:-0}" = "1" ] || open "$LOCAL_URL" 2>/dev/null || true
echo "  (Ctrl+C de dong tunnel)"
wait "$TUN_PID"
