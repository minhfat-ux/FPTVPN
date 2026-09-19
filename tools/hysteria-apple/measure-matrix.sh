#!/usr/bin/env bash
# Đo ma trận cấu hình transport macOS (chế độ lấy gói / MTU / Brutal kbps / relay) trên máy thật.
#
#   ./measure-matrix.sh                     # chạy bộ cấu hình mặc định
#   CONFIGS="baseline direct mtu1420" ./measure-matrix.sh
#   BYTES=30000000 ROUNDS=3 ./measure-matrix.sh
#
# Cách làm: ghi `Documents/hysteria-diag.txt` trong container của extension (chỉ đọc lúc
# startTunnel), rồi với mỗi cấu hình: bật tunnel → kiểm có mạng QUA tunnel (≤30s, không thì
# stop NGAY) → 1 lượt warm-up (bỏ) + ROUNDS lượt đo → stop tunnel → kiểm route về en0.
#
# AN TOÀN: trap luôn stop tunnel; kết thúc in trạng thái + IP nhà. Không chứa credential.
#
# GHI CHÚ MÔI TRƯỜNG (đo 19/09/2026): máy này có **Tailscale exit node** — nó supercede
# phiên VPNFlow và làm traffic không-bind đi qua Tailscale. Script TỰ TẮT exit node lúc bắt
# đầu và BẬT LẠI đúng cấu hình cũ khi thoát (giá trị đọc từ prefs trước khi tắt).
set -uo pipefail

VPN_NAME="${VPN_NAME:-VPNFlow}"
# Cloudflare nhanh nhất nhưng rate-limit (HTTP 429) sau ~15 lượt liên tục ⇒ có URL dự phòng
# và retry. Xoay vòng URL theo từng lượt để không dồn vào một host.
URL_HOSTS_RAW="${URL_HOSTS_RAW:-https://speed.cloudflare.com/__down?bytes=__BYTES__ https://ash-speed.hetzner.com/100MB.bin}"
URL_HOSTS=()
for u in $URL_HOSTS_RAW; do URL_HOSTS+=("$u"); done
spin=0
BYTES="${BYTES:-30000000}"
ROUNDS="${ROUNDS:-3}"
IP_URL="${IP_URL:-https://icanhazip.com}"
TSCLI="${TSCLI:-/Applications/Tailscale.app/Contents/MacOS/Tailscale}"
DIAG="$HOME/Library/Containers/com.privatevpn.mac.packet-tunnel/Data/Documents/hysteria-diag.txt"
LOG="$HOME/Library/Containers/com.privatevpn.mac.packet-tunnel/Data/Documents/relay.log"
CONFIGS="${CONFIGS:-base direct+1420 direct+1350 1420+20/50 direct+1420+off vn1}"

tunnel_started=0
ts_exit_host=""
ts_touched=0

stop_tunnel() {
  if [ "$tunnel_started" = 1 ]; then
    scutil --nc stop "$VPN_NAME" >/dev/null 2>&1
    for _ in $(seq 1 15); do
      scutil --nc list | grep -q "\"$VPN_NAME\".*Connected" || break
      sleep 1
    done
    tunnel_started=0
  fi
}
restore_tailscale() {
  if [ "$ts_touched" = 1 ] && [ -n "$ts_exit_host" ]; then
    "$TSCLI" set --exit-node="$ts_exit_host" >/dev/null 2>&1
    "$TSCLI" up >/dev/null 2>&1
    ts_touched=0
  fi
}
cleanup() { stop_tunnel; rm -f "$DIAG"; restore_tailscale; }
trap cleanup EXIT INT TERM

# ---- tắt exit node của Tailscale (nhớ giá trị cũ để trả lại) ----
# Exit node của máy này (đo 19/09/2026): peer "fcnvpn". Cho phép ép qua env nếu máy khác.
TS_EXIT_NODE="${TS_EXIT_NODE:-fcnvpn}"
ts_exit_host="$("$TSCLI" status 2>/dev/null | grep "exit node" | awk '{print $2}' | head -1)"
[ -z "$ts_exit_host" ] && ts_exit_host="$TS_EXIT_NODE"
ts_pref="$("$TSCLI" debug prefs 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin).get("ExitNodeID") or "")' 2>/dev/null)"
if [ -n "$ts_pref" ]; then
  echo "== tắt exit node Tailscale ($ts_exit_host) cho lúc đo (sẽ bật lại khi thoát)"
  "$TSCLI" set --exit-node= >/dev/null 2>&1
  ts_touched=1
  sleep 4
else
  echo "== exit node Tailscale đang TẮT sẵn (đo sạch); sẽ bật lại $ts_exit_host khi thoát"
  ts_touched=1
fi
echo "== IP nhà qua en0: $(curl -s --interface en0 --max-time 10 https://www.cloudflare.com/cdn-cgi/trace | sed -n 's/^ip=//p' | head -1)"

diag_config() {  # $1 = đặc tả cấu hình, các phần ngăn bằng "+"
  #   direct | bridge      -> đổi chế độ lấy gói (Go đọc thẳng fd utun / qua cầu socketpair)
  #   1500|1420|1400|1350|1280 -> MTU
  #   20/50 | 30/100 | off -> upKbps/downKbps (Mbps) khai cho Brutal CC ("off" = 0/0)
  #   vn1 | vn2            -> relay vn1hy / vn2hy
  #   (rỗng / "base")      -> không ép gì: đúng cấu hình sản phẩm đang build
  local spec="$1" token; local -a lines=()
  [ "$spec" = "base" ] && spec=""
  local IFS='+'
  for token in $spec; do
    case "$token" in
      "")            ;;
      direct)        lines+=("mode=direct") ;;
      bridge)        lines+=("mode=bridge") ;;
      vn1)           lines+=("relay=wss://api.meetflowai.site/relay/vn1hy") ;;
      vn2)           lines+=("relay=wss://api.meetflowai.site/relay/vn2hy") ;;
      off)           lines+=("upKbps=0" "downKbps=0") ;;
      [0-9]*/[0-9]*) lines+=("upKbps=$(( ${token%%/*} * 1000 ))" "downKbps=$(( ${token##*/} * 1000 ))") ;;
      [0-9][0-9][0-9][0-9]) lines+=("mtu=$token") ;;
      *) echo "token lạ trong cấu hình: $token" >&2; return 1 ;;
    esac
  done
  rm -f "$DIAG"
  if [ "${#lines[@]}" -gt 0 ]; then
    mkdir -p "$(dirname "$DIAG")"
    printf '%s\n' "${lines[@]}" > "$DIAG"
  fi
}

measure_config() {  # $1 = tên
  local name="$1" iface ip code out b c
  diag_config "$name" || return 1
  echo
  if [ -f "$DIAG" ]; then
    echo "### cấu hình: $name   ($(tr '\n' ' ' < "$DIAG"))"
  else
    echo "### cấu hình: $name   (không có file diag = cấu hình sản phẩm hiện tại)"
  fi

  scutil --nc start "$VPN_NAME" >/dev/null 2>&1
  tunnel_started=1
  # BẮT BUỘC cả hai: curl 200 VÀ default route đã rời en0. Chỉ nhìn http_code là sai —
  # lần đầu sau start, gói còn đi thẳng en0 (route tunnel chưa ăn) nên 200 giả.
  local reachable=0
  sleep 3
  for attempt in $(seq 1 12); do
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 4 "$IP_URL" 2>/dev/null)"
    iface="$(route -n get default 2>/dev/null | sed -n 's/^ *interface: //p')"
    if [ "$code" = "200" ] && [ "$iface" != "en0" ] && [ -n "$iface" ]; then reachable=1; break; fi
    sleep 2
  done
  if [ "$reachable" != 1 ]; then
    echo "   LỖI: sau ~30s vẫn chưa có mạng QUA tunnel (http=${code:-000}, iface=$iface) — dừng tunnel, bỏ qua cấu hình"
    grep -E "tiến trình|không lấy được fd|failed to create tun stack|no gVisor|tun serve" "$LOG" 2>/dev/null | tail -3 | sed 's/^/     /'
    stop_tunnel
    return 1
  fi
  ip="$(curl -s --max-time 6 "$IP_URL" | tr -d '[:space:]')"
  echo "   vào được sau ${attempt} lần thử: iface=$iface ip=$ip"
  if [ -f "$DIAG" ] && ! grep -q "diag: ép\|dùng fd=.*direct" "$LOG" 2>/dev/null; then
    echo "   CẢNH BÁO: không thấy log áp cấu hình diag — kiểm lại file diag/đường dẫn"
  fi

  # warm-up (bỏ số)
  fetch_bytes >/dev/null 2>&1
  local -a vals=()
  for r in $(seq 1 "$ROUNDS"); do
    out="$(fetch_bytes)"; b="${out%% *}"; c="${out##* }"
    # 429 (rate-limit) / 000 (lỗi tạm) không phải số đo: chờ rồi thử lại 1 lần ở URL khác
    if [ "$c" = "429" ] || [ "$c" = "000" ]; then
      echo "   lượt $r: http_code=$c (rate-limit/lỗi tạm) — chờ 12s rồi thử lại"
      sleep 12
      out="$(fetch_bytes)"; b="${out%% *}"; c="${out##* }"
    fi
    vals+=("$b")
    awk -v b="$b" -v c="$c" -v r="$r" 'BEGIN{printf "   lượt %s: %.2f MB/s = %.1f Mbps (http_code=%s)\n", r, b/1048576, b*8/1000000, c}'
    sleep 3
  done
  printf '%s\n' "${vals[@]}" | sort -n | awk -v n="$ROUNDS" '
    {a[NR]=$1}
    END{
      med = (n%2)? a[(n+1)/2] : (a[n/2]+a[n/2+1])/2;
      min = a[1]; max = a[n];
      printf "   TỔNG HỢP %s lượt: min %.2f | median %.2f | max %.2f MB/s  ⇒ median %.1f Mbps (dao động %.1f-%.1f Mbps)\n",
        n, min/1048576, med/1048576, max/1048576, med*8/1000000, min*8/1000000, max*8/1000000;
    }'
  echo "   log tự-cứu/transport:"; grep -E "diag: ép|giám sát: (QUYẾT|TCP ĐÃ|XÁC NHẬN)|transport đã lên" "$LOG" 2>/dev/null | tail -4 | sed 's/^/     /'
  stop_tunnel
  sleep 5
  echo "   sau khi dừng: iface=$(route -n get default 2>/dev/null | sed -n 's/^ *interface: //p') curl=$(curl -s -o /dev/null -w '%{http_code}' --max-time 6 https://www.gstatic.com/generate_204)"
}

# Cloudflare trả 429 khi bị rate-limit (đo thật: sau ~15 lượt liên tục). Gặp 429 thì
# "đóng băng" URL đó trong CF_COOLDOWN giây và dùng URL tiếp theo.
CF_COOLDOWN="${CF_COOLDOWN:-120}"
cf_cooldown_until=0

fetch_bytes() {  # in ra "<bytes_per_sec> <http_code>"
  local url n=${#URL_HOSTS[@]} now attempt code out
  now=$(date +%s)
  for attempt in 0 1 2; do
    if [ "$attempt" = 0 ] && [ "$now" -lt "$cf_cooldown_until" ]; then
      url="${URL_HOSTS[1]}"                      # URL dự phòng khi Cloudflare đang bị chặn
    else
      url="${URL_HOSTS[$((spin % n))]}"; spin=$((spin + 1))
    fi
    url="${url//__BYTES__/$BYTES}"
    out="$(curl -s -o /dev/null -w '%{speed_download} %{http_code}' --max-time 120 "$url")"
    code="${out##* }"
    if [ "$code" = "429" ]; then
      cf_cooldown_until=$(( $(date +%s) + CF_COOLDOWN ))
      sleep 3
      continue
    fi
    echo "$out"
    return 0
  done
  echo "$out"
}

echo "== cấu hình sẽ đo: $CONFIGS"
for cfg in $CONFIGS; do measure_config "$cfg"; done

echo
echo "== RAW (bind en0) để so:"
for r in 1 2 3; do
  url="${URL_HOSTS[$((spin % ${#URL_HOSTS[@]}))]}"; spin=$((spin + 1)); url="${url//__BYTES__/$BYTES}"
  out="$(curl -s --interface en0 -o /dev/null -w '%{speed_download} %{http_code}' --max-time 120 "$url")"
  b="${out%% *}"; c="${out##* }"
  [ "$c" = "429" ] && { sleep 10; out="$(curl -s --interface en0 -o /dev/null -w '%{speed_download} %{http_code}' --max-time 120 "$url")"; b="${out%% *}"; c="${out##* }"; }
  awk -v b="$b" -v c="$c" -v r="$r" 'BEGIN{printf "   RAW lượt %s: %.2f MB/s = %.1f Mbps (http_code=%s)\n", r, b/1048576, b*8/1000000, c}'
  sleep 2
done

rm -f "$DIAG"
echo "== kết thúc: state=$(scutil --nc list | grep "\"$VPN_NAME\"" | grep -o '(Connected)\|(Disconnected)') iface=$(route -n get default | sed -n 's/^ *interface: //p')"
restore_tailscale
echo "== Tailscale sau khi trả: $("$TSCLI" debug prefs 2>/dev/null | python3 -c 'import json,sys; d=json.load(sys.stdin); print("ExitNodeID=" + (d.get("ExitNodeID") or "(off)"), "WantRunning=" + str(d.get("WantRunning")))' 2>/dev/null)"
