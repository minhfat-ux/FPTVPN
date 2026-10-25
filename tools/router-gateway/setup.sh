#!/bin/sh
# setup.sh — cài gateway VPN (2 relay + sing-box TPROXY) lên OpenWrt của Xiaomi AX3000T RD03v2.
#
#   sh setup.sh full    # 2 relay: node-2 (1081) + node-3 (1083), TV360 -> node-3
#   sh setup.sh slim    # 1 relay: node-2 (1081) thôi (RAM ~30 MB khả dụng, an toàn hơn)
#
# Chạy TRÊN ROUTER, trong thư mục có: flowvpnrelay-linux-arm64, node2.json, node3.json,
# sing-box-router*.json, sing-box.apk (tuỳ chọn).
set -e

MODE="${1:-slim}"
D="$(cd "$(dirname "$0")" && pwd)"
BIN=/usr/bin/flowvpnrelay
CFG=/etc/flowvpn
SING=/etc/sing-box/config.json

case "$MODE" in
    full) SB="$D/sing-box-router.json"; RELAYS="node2 node3" ;;
    slim) SB="$D/sing-box-router-slim.json"; RELAYS="node2" ;;
    *) echo "dung: sh setup.sh [full|slim]"; exit 2 ;;
esac

[ -f "$D/flowvpnrelay-linux-arm64" ] || { echo "THIEU $D/flowvpnrelay-linux-arm64"; exit 1; }
[ -f "$SB" ] || { echo "THIEU $SB"; exit 1; }

echo "== 1. sing-box"
if ! command -v sing-box >/dev/null 2>&1; then
    if [ -f "$D/sing-box.apk" ]; then
        opkg install "$D/sing-box.apk" 2>/dev/null || apk add --allow-untrusted "$D/sing-box.apk"
    else
        opkg update && opkg install sing-box || apk add sing-box
    fi
fi
command -v sing-box >/dev/null 2>&1 || { echo "KHONG cai duoc sing-box"; exit 1; }

echo "== 2. relay + config"
mkdir -p "$CFG"
cp "$D/flowvpnrelay-linux-arm64" "$BIN"; chmod 755 "$BIN"
for r in $RELAYS; do
    [ -f "$D/$r.json" ] || { echo "THIEU $D/$r.json"; exit 1; }
    cp "$D/$r.json" "$CFG/$r.json"; chmod 600 "$CFG/$r.json"
done
mkdir -p /etc/sing-box
cp "$SB" "$SING"; chmod 600 "$SING"

# port trong config sing-box phải khớp config relay
grep -q '127.0.0.1' "$SING" || { echo "config sing-box khong co outbound 127.0.0.1"; exit 1; }

echo "== 3. init.d"
i=0
for r in $RELAYS; do
    i=$((i+1))
    case "$r" in node2) port=1081 ;; node3) port=1083 ;; esac
    cat > "/etc/init.d/flowvpnrelay$i" <<INIT
#!/bin/sh /etc/rc.common
START=90$i
USE_PROCD=1
start_service() {
    procd_open_instance
    procd_set_param command $BIN -c $CFG/$r.json
    procd_set_param respawn 3600 5 0
    procd_set_param stdout 1
    procd_set_param stderr 1
    procd_close_instance
}
INIT
    chmod 755 "/etc/init.d/flowvpnrelay$i"
    "/etc/init.d/flowvpnrelay$i" enable
    "/etc/init.d/flowvpnrelay$i" restart || "/etc/init.d/flowvpnrelay$i" start
    echo "   relay $i ($r) -> socks 127.0.0.1:$port"
done

echo "== 4. TPROXY (nft + ip rule)"
mkdir -p /etc/nftables.d
cat > /etc/nftables.d/10-singbox.nft <<'NFT'
table inet singbox {
  chain prerouting {
    type filter hook prerouting priority mangle; policy accept;
    ip daddr { 0.0.0.0/8, 10.0.0.0/8, 127.0.0.0/8, 169.254.0.0/16, 172.16.0.0/12, 192.168.0.0/16, 224.0.0.0/4 } return
    meta l4proto { tcp, udp } tproxy ip to :7893 meta mark set 0x1 accept
  }
}
NFT
ip rule add fwmark 1 table 100 2>/dev/null || true
ip route add local default dev lo table 100 2>/dev/null || true
fw4 restart 2>/dev/null || /etc/init.d/firewall restart 2>/dev/null || true

echo "== 5. sing-box"
/etc/init.d/sing-box enable 2>/dev/null || true
/etc/init.d/sing-box restart 2>/dev/null || /etc/init.d/sing-box start || true

echo "== 6. kiem tra"
sleep 3
free -m 2>/dev/null | awk 'NR==1||NR==2'
for p in 1081 1083; do
    if netstat -ltn 2>/dev/null | grep -q ":$p "; then echo "   sock $p: LISTEN"; fi
done
echo "   youtube qua 1081: $(curl -s -o /dev/null -w '%{http_code}' --socks5-hostname 127.0.0.1:1081 https://www.youtube.com/ 2>/dev/null)"
if [ "$MODE" = "full" ]; then
    echo "   tv360 qua 1083:  $(curl -s -o /dev/null -w '%{http_code}' --socks5-hostname 127.0.0.1:1083 https://tv360.vn/ 2>/dev/null)"
fi
echo "   exit ip: $(curl -s -m 8 https://1.1.1.1/cdn-cgi/trace 2>/dev/null | sed -n 's/^ip=//p')"
echo "== XONG ($MODE). TV: noi Wi-Fi/LAN cua router, xoa proxy cu tren TV."
