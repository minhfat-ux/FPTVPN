#!/usr/bin/env bash
# Đo A/B đường ra cho tunnel macOS của VPNFlow: RAW (bind en0) vs VPN (không bind).
#
#   ./measure-ab.sh                     # URL/2 lượt mặc định
#   ROUNDS=3 URL=... ./measure-ab.sh
#
# AN TOÀN (bắt buộc, vì tunnel hỏng = mất mạng cả máy):
#   1. Bật tunnel, chờ tối đa 30s cho tới khi: curl ra được Internet, default route KHÔNG
#      còn là en0, và IP thoát KHÁC IP nhà (không rò). Không đạt ⇒ `scutil --nc stop` NGAY.
#   2. `trap` luôn stop tunnel khi thoát, kể cả khi lỗi/Ctrl-C.
#   3. Cuối cùng kiểm lại đường ra: default route phải về en0 và curl phải 200.
#
# LƯU Ý VỀ MÔI TRƯỜNG ĐO (đo thật 19/09/2026): máy này đang bật Tailscale với **exit
# node** (`netstat -rn`: `default … utun19`, IP thoát 103.173.155.50 — TRÙNG danh sách
# node của dự án). Vì vậy phải `scutil --nc stop Tailscale` trong lúc đo: nếu không,
# traffic không bind sẽ đi qua Tailscale chứ không qua VPNFlow, và IP thoát không còn
# phân biệt được đường nào. Nhớ BẬT LẠI Tailscale sau khi đo.
#
# Không có credential nào trong file này (không cần: tunnel đã cấu hình trong NE).
set -uo pipefail

VPN_NAME="${VPN_NAME:-VPNFlow}"
URL="${URL:-https://speed.cloudflare.com/__down?bytes=50000000}"
ROUNDS="${ROUNDS:-2}"
NODE_IPS="${NODE_IPS:-165.101.114.162 103.173.155.50}"
IP_URLS=(https://icanhazip.com https://ifconfig.me/ip https://api.ipify.org)

# App GUI phải ĐÓNG trong lúc đo: đo thật 19/09/2026, app VPNFlow đang mở thì phiên tunnel
# bị dừng giữa lúc đo (NEProviderStopReasonUserInitiated, app tự gọi stopVPNTunnel/khởi
# động lại phiên) ⇒ lượt đo rơi ra en0 và cho số ảo.
if pgrep -f "VPNFlow.app/Contents/MacOS/VPNFlow" >/dev/null 2>&1; then
  echo "CẢNH BÁO: app VPNFlow đang chạy — hãy đóng app trước khi đo (app có thể dừng/khởi động lại phiên giữa lúc đo)."
fi

tunnel_started=0
stop_tunnel() {
  if [ "$tunnel_started" = 1 ]; then
    echo "==> scutil --nc stop \"$VPN_NAME\""
    scutil --nc stop "$VPN_NAME" >/dev/null 2>&1
    for _ in $(seq 1 15); do
      scutil --nc list | grep -q "(Connected).*\"$VPN_NAME\"" || break
      sleep 1
    done
    tunnel_started=0
  fi
}
trap 'stop_tunnel' EXIT INT TERM

# Lấy IP thoát. $1 = timeout mỗi URL (mặc định 10s); "$2" = chỉ thử URL đầu (dùng cho
# vòng chờ 30s — 3 URL × 10s sẽ biến 30s thành 90s).
exit_ip() {
  local timeout="${1:-10}" urls=("${IP_URLS[@]}") ip
  [ "${2:-}" = "fast" ] && urls=("${IP_URLS[0]}")
  for url in "${urls[@]}"; do
    ip="$(curl -s --max-time "$timeout" "$url" 2>/dev/null | tr -d '[:space:]')"
    if [[ "$ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then echo "$ip"; return 0; fi
  done
  return 1
}

run() {  # $1 = nhãn, $2 = "" (không bind) hoặc "en0"
  local label="$1" iface="$2" out bytes code mbps mibs
  for round in $(seq 1 "$ROUNDS"); do
    out="$(curl -s ${iface:+--interface "$iface"} -o /dev/null \
      -w '%{speed_download} %{http_code}' --max-time 120 "$URL")"
    bytes="${out%% *}"; code="${out##* }"
    mibs="$(awk -v b="$bytes" 'BEGIN { printf "%.2f", b/1048576 }')"
    mbps="$(awk -v b="$bytes" 'BEGIN { printf "%.1f", b*8/1000000 }')"
    echo "   $label lượt $round: ${mibs} MB/s = ${mbps} Mbps (http_code=${code})"
  done
}

# IP nhà lấy qua đường ISP (bind en0) bằng endpoint trace — `icanhazip` trên mạng này
# trả IP khác nhau giữa các lần gọi (đo 19/09/2026: 120.234.32.53 lẫn 103.173.155.50),
# nên dùng trace của Cloudflare cho ổn định.
home_ip="$(curl -s --interface en0 --max-time 10 https://www.cloudflare.com/cdn-cgi/trace 2>/dev/null | sed -n 's/^ip=//p' | head -1)"
echo "== IP nhà qua en0 (trước khi bật tunnel): ${home_ip:-không lấy được}"
echo "== RAW (bind en0), URL=$URL, $ROUNDS lượt"
run "RAW" en0

echo "== bật tunnel: scutil --nc start \"$VPN_NAME\""
scutil --nc start "$VPN_NAME" >/dev/null 2>&1
tunnel_started=1
home_ip="${home_ip:-}"
# Chờ tối đa ~30s cho tunnel có mạng THẬT. Phải có `sleep` giữa các lần thử: lần đầu
# sau khi session lên, route/DNS của tunnel có thể chưa ăn, curl fail TỨC THÌ (không tốn
# timeout) nên vòng lặp không sleep sẽ đốt hết 10 lượt trong 1 giây rồi kết luận sai.
reachable=0
for attempt in $(seq 1 10); do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 4 https://icanhazip.com 2>/dev/null)"
  echo "   (thử $attempt: http_code=${code:-000})"
  if [ "$code" = "200" ]; then reachable=1; break; fi
  sleep 2
done
if [ "$reachable" != 1 ]; then
  echo "LỖI: tunnel bật nhưng sau ~30s vẫn không ra được Internet — dừng tunnel"; exit 1
fi
tunnel_iface="$(route -n get default 2>/dev/null | sed -n 's/^ *interface: //p')"
ip="$(exit_ip 5 || true)"
echo "== khi tunnel bật: IP thoát ${ip:-không lấy được}, default interface $tunnel_iface (IP nhà ${home_ip:-?}; node mong đợi: $NODE_IPS)"
if [ "$tunnel_iface" = "en0" ]; then
  echo "LỖI: default route vẫn là en0 ⇒ tunnel không giữ route. Dừng tunnel."; exit 1
fi
if [ -n "$home_ip" ] && [ "$ip" = "$home_ip" ]; then
  echo "LỖI: IP thoát TRÙNG IP nhà ⇒ traffic rò ra ngoài tunnel. Dừng tunnel."; exit 1
fi
matched=0
for node in $NODE_IPS; do [ "$ip" = "$node" ] && matched=1; done
if [ "$matched" != 1 ]; then
  echo "CẢNH BÁO: IP thoát (${ip:-?}) không nằm trong NODE_IPS ($NODE_IPS) — vẫn đo, nhưng phải"
  echo "          kiểm bằng chứng 'gói đi qua tunnel' trong log extension (bộ đếm bridge)."
fi

echo "== VPN (không bind interface), cùng URL, $ROUNDS lượt"
run "VPN" ""

stop_tunnel
echo "== kiểm tra sau khi tắt tunnel"
route -n get default 2>&1 | sed -n 's/^ *interface: /   default interface: /p'
curl -s -o /dev/null -w "   curl http://www.gstatic.com/generate_204 -> http=%{http_code}\n" --max-time 15 http://www.gstatic.com/generate_204
echo "== IP sau khi tắt tunnel: $(exit_ip || echo 'không lấy được')"
