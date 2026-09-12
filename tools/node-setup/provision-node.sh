#!/usr/bin/env bash
# Provision a VPNFlow exit node (hysteria2 on several UDP ports + TCP relays).
#
# Run ON the new VPS as root:
#
#   ./provision-node.sh --hysteria-bin /root/hysteria --hyrelay-bin /root/hyrelay
#
# Everything is idempotent: re-running only fills in what is missing, and all
# services run under systemd (so they survive reboots — the older nodes were
# started with setsid nohup and did not).
set -euo pipefail

# ---------------------------------------------------------------- parameters
UDP_PORTS_DEFAULT="8443 28443 54443"
# TCP relay port:UDP target pairs (the app dials the TCP side)
RELAYS_DEFAULT="8443:8443 9445:8443"

UDP_PORTS="${UDP_PORTS:-$UDP_PORTS_DEFAULT}"
RELAYS="${RELAYS:-$RELAYS_DEFAULT}"
AUTH_PASS="${AUTH_PASS:-}"
OBFS_PASS="${OBFS_PASS:-}"
CERT_CN="${CERT_CN:-meetflowai.site}"
HYSTERIA_URL="${HYSTERIA_URL:-}"
HYSTERIA_BIN_SRC=""
HYRELAY_BIN_SRC=""

while [ $# -gt 0 ]; do
  case "$1" in
    --hysteria-bin) HYSTERIA_BIN_SRC="$2"; shift 2 ;;
    --hyrelay-bin)  HYRELAY_BIN_SRC="$2";  shift 2 ;;
    --udp-ports)    UDP_PORTS="$2";        shift 2 ;;
    --relays)       RELAYS="$2";           shift 2 ;;
    --auth)         AUTH_PASS="$2";        shift 2 ;;
    --obfs)         OBFS_PASS="$2";        shift 2 ;;
    *) echo "unknown option: $1" >&2; exit 1 ;;
  esac
done

log() { echo "==> $*"; }

# Credentials are NOT stored in this repo (public). Provide them explicitly:
#   AUTH_PASS / OBFS_PASS env vars, or --auth / --obfs. For an existing fleet the
#   real values live in the server configs (/etc/hysteria-server-*.yaml) and in
#   the app's Config.kt — copy them from there, never from git.
if [ -z "$AUTH_PASS" ] || [ -z "$OBFS_PASS" ]; then
  echo "!! AUTH_PASS and OBFS_PASS must be provided (--auth/--obfs or env)." >&2
  echo "   Values are kept out of this repo (public). See docs/AGENT_NEW_NODE_GUIDE.md." >&2
  exit 1
fi

# ---------------------------------------------------------------- packages
if ! command -v openssl >/dev/null 2>&1; then
  log "installing openssl"
  (apt-get update -qq && apt-get install -y -qq openssl curl >/dev/null) || true
fi

# ---------------------------------------------------------------- binaries
install -d /usr/local/bin

if [ -n "$HYSTERIA_BIN_SRC" ]; then
  install -m 0755 "$HYSTERIA_BIN_SRC" /usr/local/bin/hysteria
  log "installed hysteria from $HYSTERIA_BIN_SRC"
elif [ ! -x /usr/local/bin/hysteria ]; then
  if [ -z "$HYSTERIA_URL" ]; then
    echo "!! /usr/local/bin/hysteria is missing and HYSTERIA_URL is not set." >&2
    echo "   Get it from https://github.com/apernet/hysteria/releases (linux-amd64)" >&2
    exit 1
  fi
  log "downloading hysteria"
  curl -fsSL "$HYSTERIA_URL" -o /usr/local/bin/hysteria
  chmod 0755 /usr/local/bin/hysteria
else
  log "hysteria already installed"
fi

if [ -n "$HYRELAY_BIN_SRC" ]; then
  install -m 0755 "$HYRELAY_BIN_SRC" /usr/local/bin/hyrelay
  log "installed hyrelay from $HYRELAY_BIN_SRC"
elif [ ! -x /usr/local/bin/hyrelay ]; then
  echo "!! /usr/local/bin/hyrelay missing — pass --hyrelay-bin /path/to/hyrelay-linux-amd64" >&2
  echo "   (build it from tools/node-setup/relay.go with: go build -o hyrelay relay.go)" >&2
  exit 1
else
  log "hyrelay already installed"
fi

# ---------------------------------------------------------------- TLS cert
if [ ! -f /etc/hysteria-cert.pem ] || [ ! -f /etc/hysteria-key.pem ]; then
  log "generating self-signed certificate (CN=$CERT_CN)"
  openssl req -x509 -nodes -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 \
    -keyout /etc/hysteria-key.pem -out /etc/hysteria-cert.pem \
    -days 3650 -subj "/CN=$CERT_CN" >/dev/null 2>&1
  chmod 600 /etc/hysteria-key.pem
else
  log "certificate already present"
fi

# ---------------------------------------------------------------- configs
for p in $UDP_PORTS; do
  f="/etc/hysteria-server-$p.yaml"
  if [ ! -f "$f" ]; then
    log "writing $f"
    cat > "$f" <<YAML
listen: :$p
tls:
  cert: /etc/hysteria-cert.pem
  key: /etc/hysteria-key.pem
obfs:
  type: salamander
  salamander:
    password: $OBFS_PASS
auth:
  type: password
  password: $AUTH_PASS
# Brutal congestion control is driven by the CLIENT's declared bandwidth; do not
# set ignoreClientBandwidth here or the app falls back to the standard CC.
YAML
  fi
done

# ---------------------------------------------------------------- systemd
install -m 0644 systemd/hysteria@.service /etc/systemd/system/hysteria@.service
install -m 0644 systemd/hyrelay@.service  /etc/systemd/system/hyrelay@.service
systemctl daemon-reload

for p in $UDP_PORTS; do
  systemctl enable --now "hysteria@$p" >/dev/null 2>&1 || true
  log "hysteria@$p: $(systemctl is-active hysteria@$p)"
done

for pair in $RELAYS; do
  tcp="${pair%%:*}"; udp="${pair##*:}"
  install -d "/etc/systemd/system/hyrelay@$tcp.service.d"
  cat > "/etc/systemd/system/hyrelay@$tcp.service.d/target.conf" <<CONF
[Service]
Environment=HYRELAY_TARGET=127.0.0.1:$udp
CONF
  systemctl daemon-reload
  systemctl enable --now "hyrelay@$tcp" >/dev/null 2>&1 || true
  log "hyrelay@$tcp (-> udp $udp): $(systemctl is-active hyrelay@$tcp)"
done

# ---------------------------------------------------------------- firewall
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
  for p in $UDP_PORTS; do ufw allow "$p"/udp >/dev/null 2>&1 || true; done
  for pair in $RELAYS; do ufw allow "${pair%%:*}"/tcp >/dev/null 2>&1 || true; done
  log "ufw rules added"
fi

# ---------------------------------------------------------------- summary
IP=$(curl -fsS --max-time 5 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
cat <<SUMMARY

================ VPNFlow node ready ================
public IP      : $IP
UDP (hysteria) : $UDP_PORTS
TCP relays     : $RELAYS
auth password  : $AUTH_PASS
obfs (salamander): $OBFS_PASS
cert           : /etc/hysteria-cert.pem (self-signed, CN=$CERT_CN)
services       : systemctl status 'hysteria@*' 'hyrelay@*'

Verify locally:
  hysteria client test: /tmp/hyconn style probe, or from another host:
  curl --socks5 <this-host>:1080 ...   (after configuring a client)

Then register the node in the control plane (nodes.json → nodes[]) and, if it
should be listed offline, in the app's ExitNodeFallback (android .../api/Models.kt).
====================================================
SUMMARY
