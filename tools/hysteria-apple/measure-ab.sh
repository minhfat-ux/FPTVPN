#!/usr/bin/env bash
# Đo A/B đường ra cho tunnel macOS của VPNFlow: RAW (bind en0) vs VPN (không bind).
#
#   ./measure-ab.sh                     # URL/2 lượt mặc định
#   ROUNDS=3 URL=... ./measure-ab.sh
#
# AN TOÀN (bắt buộc, vì tunnel hỏng = mất mạng cả máy):
#   1. Bật tunnel, chờ tối đa 30s cho tới khi IP thoát là IP NODE (NODE_IPS); không
#      được thì `scutil --nc stop` NGAY và thoát với lỗi.
#   2. `trap` luôn stop tunnel khi thoát, kể cả khi lỗi/Ctrl-C.
#   3. Cuối cùng kiểm lại đường ra: default route phải về en0 và curl phải 200.
#
# Không có credential nào trong file này (không cần: tunnel đã cấu hình trong NE).
set -uo pipefail

VPN_NAME="${VPN_NAME:-VPNFlow}"
URL="${URL:-https://speed.cloudflare.com/__down?bytes=50000000}"
ROUNDS="${ROUNDS:-2}"
NODE_IPS="${NODE_IPS:-165.101.114.162 103.173.155.50}"
IP_URLS=(https://icanhazip.com https://ifconfig.me/ip https://api.ipify.org)

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

echo "== IP nhà (trước khi bật tunnel): $(exit_ip || echo 'không lấy được')"
echo "== RAW (bind en0), URL=$URL, $ROUNDS lượt"
run "RAW" en0

echo "== bật tunnel: scutil --nc start \"$VPN_NAME\""
scutil --nc start "$VPN_NAME" >/dev/null 2>&1
tunnel_started=1
ip=""
# Tối đa ~30s (10 vòng × 4s): không thấy IP node thì DỪNG NGAY, đừng để máy mất mạng.
for _ in $(seq 1 10); do
  ip="$(exit_ip 4 fast || true)"
  for node in $NODE_IPS; do
    if [ "$ip" = "$node" ]; then break 2; fi
  done
done
if [ -z "$ip" ]; then
  echo "LỖI: tunnel bật nhưng không ra được Internet (curl không trả IP) — dừng tunnel"; exit 1
fi
matched=0
for node in $NODE_IPS; do [ "$ip" = "$node" ] && matched=1; done
echo "== IP thoát khi bật tunnel: $ip (node mong đợi: $NODE_IPS)"
if [ "$matched" != 1 ]; then
  echo "LỖI: IP thoát KHÔNG phải IP node ⇒ tunnel không chở traffic (rò qua en0?). Dừng tunnel."; exit 1
fi

echo "== VPN (không bind interface), cùng URL, $ROUNDS lượt"
run "VPN" ""

stop_tunnel
echo "== kiểm tra sau khi tắt tunnel"
route -n get default 2>&1 | sed -n 's/^ *interface: /   default interface: /p'
curl -s -o /dev/null -w "   curl http://www.gstatic.com/generate_204 -> http=%{http_code}\n" --max-time 15 http://www.gstatic.com/generate_204
echo "== IP sau khi tắt tunnel: $(exit_ip || echo 'không lấy được')"
