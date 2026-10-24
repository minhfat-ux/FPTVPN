#!/bin/bash
# Bật Mac thành gateway trong suốt cho TV Xiaomi — CHẠY BẰNG SUDO (1 lần).
#   sudo bash /Volumes/BIWIN/SourcesCode/PrivateVPN/tools/mac-gateway/pf-tv-gateway.sh
#
# Việc làm: bật IP forwarding, NAT cho TV ra Internet qua Mac, và CHUYỂN mọi kết nối
# TCP 443 của TV vào sni-proxy (127.0.0.1:18090) để đi qua tunnel VN theo tên miền.
set -euo pipefail
TV="${TV_IP:-192.168.100.104}"
IF="${IFACE:-en0}"
PORT="${SNI_PORT:-18090}"

if [ "$(id -u)" != "0" ]; then echo "phải chạy bằng sudo"; exit 2; fi

echo "== bật IP forwarding"
sysctl -w net.inet.ip.forwarding=1 >/dev/null

echo "== ghi anchor pf"
mkdir -p /etc/pf.anchors
cat > /etc/pf.anchors/tvflow <<ANCHOR
# TV $TV -> gateway Mac $IF: NAT ra ngoài, riêng TCP 443 đưa vào sni-proxy
rdr pass on $IF inet proto tcp from $TV to any port 443 -> 127.0.0.1 port $PORT
nat on $IF inet from $TV to any -> ($IF)
pass in on $IF from $TV to any keep state
pass out on $IF from $TV to any keep state
ANCHOR

if ! grep -q 'tvflow' /etc/pf.conf; then
  cp /etc/pf.conf "/etc/pf.conf.bak-$(date +%Y%m%d%H%M)"
  printf '\n# TVFlow gateway cho TV\nrdr-anchor "tvflow"\nanchor "tvflow"\nload anchor "tvflow" from "/etc/pf.anchors/tvflow"\n' >> /etc/pf.conf
fi

echo "== nạp pf"
pfctl -f /etc/pf.conf
pfctl -e 2>/dev/null || true
pfctl -a tvflow -sr

echo
echo "Xong. Giờ đặt TV: IP tĩnh $TV, gateway 192.168.100.6, DNS để 192.168.100.1 (hoặc 8.8.8.8)."
echo "Kiểm tra từ TV: mở TV360/FPT Play; log proxy: tail -f /tmp/sni-proxy.log"
echo "Gỡ bỏ: sudo bash $(dirname "$0")/pf-tv-gateway-off.sh"
