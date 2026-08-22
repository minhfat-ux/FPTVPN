#!/usr/bin/env bash
# mac-test.sh — connect this Mac to the PrivateVPN exit node, exactly like the
# iOS app will: register with the coordinator, get an overlay IP, build the
# WireGuard config, and bring the tunnel up.
#
# Usage:
#   bash scripts/mac-test.sh up        # register + connect
#   bash scripts/mac-test.sh down      # disconnect
#   bash scripts/mac-test.sh status    # show tunnel + peers
#
# Env overrides:
#   COORDINATOR   (default https://api.meetflowai.site)
#   JOIN_TOKEN    (required for "up"; one-time use)
#   EXIT_ENDPOINT (default 103.173.155.50:443)
#   EXIT_PUBKEY   (default VPS exit node public key)
#   NAME          (default macbook)
set -euo pipefail

export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin"

COORDINATOR="${COORDINATOR:-https://api.meetflowai.site}"
EXIT_ENDPOINT="${EXIT_ENDPOINT:-103.173.155.50:443}"
EXIT_PUBKEY="${EXIT_PUBKEY:-N0vGtqZ2SARCXkvVUU/KfAZMvfwszkvF/ROLL4DLIQ8=}"
NAME="${NAME:-macbook}"
STATE_DIR="${STATE_DIR:-$HOME/.privatevpn}"
CONF="$STATE_DIR/privatevpn0.conf"

require() { command -v "$1" >/dev/null 2>&1 || { echo "ERROR: $1 not found"; exit 1; }; }
require wg; require wg-quick; require curl; require jq 2>/dev/null || true

mkdir -p "$STATE_DIR"

up() {
  [ -n "${JOIN_TOKEN:-}" ] || { echo "ERROR: JOIN_TOKEN is required"; exit 1; }

  # 1. Keypair (reuse if present so the peer stays stable).
  if [ ! -f "$STATE_DIR/privatekey" ]; then
    wg genkey > "$STATE_DIR/privatekey"
    chmod 600 "$STATE_DIR/privatekey"
  fi
  local PRIV; PRIV="$(cat "$STATE_DIR/privatekey")"
  local PUB; PUB="$(echo "$PRIV" | wg pubkey)"
  echo "==> Public key: $PUB"

  # 2. Register with the coordinator (same call the iOS app makes).
  echo "==> Registering with $COORDINATOR ..."
  local resp
  resp="$(curl -sS -X POST "$COORDINATOR/v1/peers/register" \
    -H 'Content-Type: application/json' \
    -d "{\"name\":\"$NAME\",\"platform\":\"macos\",\"wireguard_public_key\":\"$PUB\",\"endpoint\":\"0.0.0.0:51820\",\"join_token\":\"$JOIN_TOKEN\"}")"

  local overlay
  overlay="$(echo "$resp" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("overlay_ip",""))' 2>/dev/null || echo '')"
  if [ -z "$overlay" ]; then
    echo "ERROR: registration failed: $resp"; exit 1
  fi
  echo "==> Assigned overlay IP: $overlay"

  # 3. Write WireGuard config (same shape the iOS app builds).
  umask 077
  cat > "$CONF" <<EOF
[Interface]
PrivateKey = $PRIV
Address = ${overlay}/24
DNS = 1.1.1.1

[Peer]
PublicKey = $EXIT_PUBKEY
Endpoint = $EXIT_ENDPOINT
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25
EOF
  echo "==> Config written: $CONF"

  # 4. Bring the tunnel up.
  echo "==> wg-quick up ..."
  sudo wg-quick up "$CONF"
  echo "==> UP. Exit IP:"
  curl -sS --max-time 10 https://api.ipify.org; echo
}

down() {
  [ -f "$CONF" ] || { echo "No config at $CONF"; exit 0; }
  sudo wg-quick down "$CONF" || true
  echo "==> DOWN"
}

status() {
  echo "==> wg show:"
  sudo wg show 2>&1 || echo "(needs sudo)"
  echo "==> Exit IP:"
  curl -sS --max-time 10 https://api.ipify.org; echo
}

case "${1:-up}" in
  up) up ;;
  down) down ;;
  status) status ;;
  *) echo "Usage: $0 {up|down|status}"; exit 1 ;;
esac
