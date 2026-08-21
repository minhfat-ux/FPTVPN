#!/usr/bin/env bash
# deploy-node.sh — provision a PrivateVPN WireGuard node + control plane.
#
# Run ON the node as root (or with sudo). Idempotent.
#
#   bash deploy-node.sh
#
# Env overrides:
#   WG_INTERFACE      (default wg0)
#   WG_LISTEN_PORT    (default 51820)  UDP port WireGuard listens on
#   WG_SUBNET         (default 10.77.0.0/24) client pool
#   CONTROL_PORT      (default 8080) control plane HTTP/HTTPS port
#   AUTH_TOKEN        (required) control plane bearer token
#   PUBLIC_IP         (required) node public IP (default auto-detect)
#   WG_PRIVATE_KEY    (optional) server private key; generated if unset
set -euo pipefail

WG_INTERFACE="${WG_INTERFACE:-wg0}"
WG_LISTEN_PORT="${WG_LISTEN_PORT:-51820}"
WG_SUBNET="${WG_SUBNET:-10.77.0.0/24}"
CONTROL_PORT="${CONTROL_PORT:-8080}"
AUTH_TOKEN="${AUTH_TOKEN:?AUTH_TOKEN is required}"
PUBLIC_IP="${PUBLIC_IP:-$(curl -s --max-time 10 https://api.ipify.org || echo '')}"

if [[ -z "$PUBLIC_IP" ]]; then
  echo "ERROR: could not detect public IP; set PUBLIC_IP explicitly" >&2
  exit 1
fi

echo "==> Node public IP: $PUBLIC_IP"
echo "==> Installing WireGuard + Node.js (Ubuntu/Debian assumed) ..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y >/dev/null 2>&1 || true
apt-get install -y wireguard wireguard-tools nodejs npm >/dev/null 2>&1 || true

# Node 18+ for the control plane (ESM + fetch). If the distro ships older node, install from NodeSource.
if ! node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 18 ? 0 : 1)" 2>/dev/null; then
  echo "==> Node <18 detected; installing Node 20 LTS ..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1 || true
  apt-get install -y nodejs >/dev/null 2>&1 || true
fi

echo "==> Enabling IP forwarding ..."
sysctl -w net.ipv4.ip_forward=1 >/dev/null
echo "net.ipv4.ip_forward=1" > /etc/sysctl.d/99-ipforward.conf

echo "==> Setting up WireGuard interface $WG_INTERFACE ..."
if [[ -z "${WG_PRIVATE_KEY:-}" ]]; then
  WG_PRIVATE_KEY="$(wg genkey)"
  echo "   Generated server private key. Server public key:"
  echo "$WG_PRIVATE_KEY" | wg pubkey
  echo "   NOTE: add this peer public key to the iOS app config."
fi

# Server address = first usable host of the subnet (e.g. 10.77.0.1/24).
SERVER_IP="$(python3 - "$WG_SUBNET" <<'PY' 2>/dev/null || echo "${WG_SUBNET%/*}/1"
import sys
net, bits = sys.argv[1].split('/')
parts = [int(x) for x in net.split('.')]
parts[3] += 1
print('.'.join(map(str, parts)) + '/' + bits)
PY
)"

# Derive the server's public key once, for both output and the systemd unit.
if [[ -n "${WG_PRIVATE_KEY:-}" ]]; then
  SERVER_PUBKEY="$(echo "$WG_PRIVATE_KEY" | wg pubkey)"
else
  SERVER_PUBKEY="$(wg show "$WG_INTERFACE" public-key 2>/dev/null || echo '')"
fi

umask 077
cat > "/etc/wireguard/${WG_INTERFACE}.conf" <<EOF
[Interface]
Address = ${SERVER_IP}
ListenPort = ${WG_LISTEN_PORT}
PrivateKey = ${WG_PRIVATE_KEY}
EOF

# Bring the interface up (creates it if missing).
wg-quick up "$WG_INTERFACE" 2>/dev/null || systemctl enable --now "wg-quick@${WG_INTERFACE}" 2>/dev/null || true

echo "==> Configuring NAT + firewall ..."
# NAT all tunnel traffic out the default route interface.
DEFAULT_IF="$(ip route show default | awk '{print $5; exit}')"
iptables -t nat -C POSTROUTING -s "$WG_SUBNET" -o "$DEFAULT_IF" -j MASQUERADE 2>/dev/null || \
  iptables -t nat -A POSTROUTING -s "$WG_SUBNET" -o "$DEFAULT_IF" -j MASQUERADE
# Allow forwarding in and out of the tunnel.
iptables -C FORWARD -i "$WG_INTERFACE" -j ACCEPT 2>/dev/null || iptables -A FORWARD -i "$WG_INTERFACE" -j ACCEPT
iptables -C FORWARD -o "$WG_INTERFACE" -j ACCEPT 2>/dev/null || iptables -A FORWARD -o "$WG_INTERFACE" -j ACCEPT
# Open WireGuard UDP + control plane TCP.
iptables -C INPUT -p udp --dport "$WG_LISTEN_PORT" -j ACCEPT 2>/dev/null || \
  iptables -A INPUT -p udp --dport "$WG_LISTEN_PORT" -j ACCEPT
iptables -C INPUT -p tcp --dport "$CONTROL_PORT" -j ACCEPT 2>/dev/null || \
  iptables -A INPUT -p tcp --dport "$CONTROL_PORT" -j ACCEPT

echo "==> Installing control plane ..."
mkdir -p /opt/privatevpn
cp -r "$(dirname "$0")/.." /opt/privatevpn/control-plane 2>/dev/null || true
cd /opt/privatevpn/control-plane
npm install --omit=dev >/dev/null 2>&1 || true

echo "==> Installing systemd unit for control plane ..."
cat > /etc/systemd/system/privatevpn-control.service <<EOF
[Unit]
Description=PrivateVPN Control Plane
After=network-online.target
Wants=network-online.target

[Service]
WorkingDirectory=/opt/privatevpn/control-plane
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=3
Environment=PORT=${CONTROL_PORT}
Environment=WG_INTERFACE=${WG_INTERFACE}
Environment=WG_BIN=/usr/bin/wg
Environment=WG_PUBLIC_ENDPOINT=${PUBLIC_IP}:${WG_LISTEN_PORT}
Environment=WG_SERVER_PUBKEY=${SERVER_PUBKEY}
Environment=AUTH_TOKEN=${AUTH_TOKEN}
Environment=IP_POOL_CIDR=${WG_SUBNET}
Environment=DATA_FILE=/opt/privatevpn/devices.json

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now privatevpn-control

echo
echo "==> DONE =="
echo "WireGuard interface : $WG_INTERFACE  (UDP ${WG_LISTEN_PORT})"
echo "Server tunnel IP    : ${SERVER_IP}"
echo "Server public key   : ${SERVER_PUBKEY}"
echo "Control plane       : http://${PUBLIC_IP}:${CONTROL_PORT}"
echo "AUTH_TOKEN          : (set)"
echo "In the iOS app set: endpoint=${PUBLIC_IP}:${WG_LISTEN_PORT}, peer public key=<server pubkey above>, control plane URL=http://${PUBLIC_IP}:${CONTROL_PORT}"
