#!/bin/sh
# flowvpn watchdog v3 — 2026-10-28
# Nguyên tắc: ổn định khi đang xem > tối ưu throughput.
#  - 1 instance duy nhất (pid lock)
#  - CF IP: KHÔNG ghim IP chết. Có danh sách ứng viên, tự probe và chọn IP trả lời nhanh nhất.
#    Chỉ đổi khi IP hiện tại fail 2 lần liên tiếp, tối đa 1 lần / 10 phút; đổi xong mới restart relay.
#  - Relay down (cả 1081+1085 đóng 3 lần liên tiếp) -> chọn lại CF IP rồi restart relay (rate-limited 10 phút).
#  - Node switch tối đa 1 lần / 15 phút (tránh restart sing-box liên tục khi WAN chập chờn).
#  - Guard sing-box: 3 lần mất 7893/18081 -> khôi phục config.good + restart.
CONF=/etc/sing-box/config.json
GOOD=/etc/sing-box/config.json.good
STATE=/tmp/flowvpn-node
MODE=/tmp/relay-transport   # "udp" = hysteria2 direct tới VPS (mặc định), "wsrelay" = qua Cloudflare
LOG=/var/log/flowvpn-health.log
CURL=/usr/bin/curl
NODES="1081 1085"
# Ứng viên CF IP (đã kiểm tra trả 200 cho zone api.meetflowai.site). Không phụ thuộc thứ tự: cf_pick() đo thật.
CF_LIST="104.17.232.29 172.64.80.1 188.114.96.1 104.18.32.115 104.26.10.78 104.21.83.112 172.67.175.138 104.16.132.229"
LOCKDIR=/tmp/health.lock

if ! mkdir $LOCKDIR 2>/dev/null; then
  old=$(cat $LOCKDIR/pid 2>/dev/null)
  [ -n "$old" ] && kill -0 "$old" 2>/dev/null && exit 0
  rm -rf $LOCKDIR; mkdir $LOCKDIR 2>/dev/null || exit 0
fi
echo $$ > $LOCKDIR/pid
trap "rm -rf $LOCKDIR" EXIT

cur=1081; [ -f $STATE ] && cur=$(cat $STATE)
case " $NODES " in *" $cur "*) ;; *) cur=1081; echo 1081 > $STATE ;; esac
log() { echo "$(date +%H:%M:%S) $*" >> $LOG; }
probe() {
  t=$($CURL -s -o /dev/null -m 8 -w "%{time_total}" --socks5-hostname 127.0.0.1:$1 "$2" 2>/dev/null)
  [ $? -eq 0 ] && [ -n "$t" ] && echo "$t" || echo fail
}
port_open() { netstat -ltn 2>/dev/null | grep -q ":$1 "; }
relay_for() { case $1 in 1081) echo 2 ;; 1085) echo 1 ;; 1083) echo 3 ;; esac; }
other_node() { [ "$cur" = "1081" ] && echo 1085 || echo 1081; }
setport() {
  sed -i "/\"tag\": \"node\"/,/}/ s/\"server_port\": [0-9]*/\"server_port\": $1/" $CONF
  sing-box check -c $CONF >/dev/null 2>&1 && /etc/init.d/sing-box restart >/dev/null 2>&1 && echo $1 > $STATE
}
hosts_ip() { awk '/meetflowai/{print $1; exit}' /etc/hosts 2>/dev/null; }
cf_ok() {
  [ -z "$1" ] && return 1
  c=$($CURL -s -o /dev/null -m 5 -w "%{http_code}" --resolve api.meetflowai.site:443:$1 https://api.meetflowai.site/ 2>/dev/null)
  case "$c" in 2*|3*|4*) return 0 ;; esac
  return 1
}
# chọn IP sống có time_connect nhỏ nhất; $1 = IP cần tránh
cf_pick() {
  avoid="$1"; best=""; bestt=99
  for ip in $CF_LIST; do
    [ "$ip" = "$avoid" ] && continue
    out=$($CURL -s -o /dev/null -m 5 -w "%{http_code} %{time_connect}" --resolve api.meetflowai.site:443:$ip https://api.meetflowai.site/ 2>/dev/null)
    code=${out%% *}; t=${out##* }
    case "$code" in 2*|3*|4*) ;; *) continue ;; esac
    case "$t" in 0.*) ;; *) continue ;; esac
    ms=$(awk -v x="$t" 'BEGIN{printf "%d", x*1000}')
    if [ "$ms" -lt "$bestt" ]; then bestt=$ms; best=$ip; fi
  done
  echo "$best"
}
cf_sets() {
  grep -v meetflowai /etc/hosts > /tmp/h 2>/dev/null && cp /tmp/h /etc/hosts
  echo "$1 api.meetflowai.site" >> /etc/hosts
}

f_node=0; f3=0; dead=0; last_fo=0; sb_f=0; last_sw=0; last_cf=0; cf_f=0; dfail=0; i=0
while true; do
  i=$((i+1))
  # chỉ instance đang giữ lock mới được hành động (procd có thể chồng tiến trình khi WAN ifup restart)
  lk=$(cat $LOCKDIR/pid 2>/dev/null)
  if [ -n "$lk" ] && [ "$lk" != "$$" ] && [ -d /proc/$lk ]; then exit 0; fi
  avail=$(awk "/MemAvailable/{print \$2}" /proc/meminfo)
  if [ -n "$avail" ] && [ "$avail" -lt 4000 ]; then echo 3 > /proc/sys/vm/drop_caches 2>/dev/null; fi

  # WAN: nếu gateway WAN không trả lời thì không quyết định gì cả
  if ! ping -c1 -W2 192.168.100.1 >/dev/null 2>&1; then dead=0; f_node=0; f3=0; cf_f=0; sleep 20; continue; fi

  # --- CF IP health, kiểm tra mỗi ~60s
  if [ "$((i % 3))" -eq 0 ]; then
    hip=$(hosts_ip)
    if ! cf_ok "$hip"; then
      cf_f=$((cf_f+1))
      if [ "$cf_f" -ge 2 ]; then
        now=$(date +%s)
        if [ $((now-last_cf)) -ge 600 ]; then
          new=$(cf_pick "$hip")
          if [ -n "$new" ] && [ "$new" != "$hip" ]; then
            last_cf=$now; cf_f=0
            cf_sets "$new"
            log "CF IP $hip -> $new (IP cu fail 2 lan)"
            for s in 1 2 3; do /etc/init.d/flowvpnrelay$s restart >/dev/null 2>&1; done
            sleep 10
          else
            log "CF IP $hip fail, khong co IP nao tot hon"
          fi
        fi
      fi
    else
      cf_f=0
    fi
  fi

  # --- guard sing-box
  if ! port_open 7893 || ! port_open 18081; then
    sb_f=$((sb_f+1))
    if [ "$sb_f" -ge 3 ]; then
      log "SING-BOX DOWN (7893/18081 closed) -> restore config.good"
      cp $GOOD $CONF 2>/dev/null
      /etc/init.d/sing-box restart >/dev/null 2>&1
      sb_f=0
    fi
  else
    sb_f=0
  fi

  # --- relay down khẩn cấp
  if ! port_open 1081 && ! port_open 1085; then
    dead=$((dead+1))
    if [ "$dead" -ge 3 ]; then
      now=$(date +%s)
      mode=$(cat $MODE 2>/dev/null); [ -z "$mode" ] && mode=udp
      if [ $((now-last_fo)) -lt 600 ]; then
        log "RELAYS DOWN (rate-limited)"
      elif [ "$mode" = "udp" ] && [ "$dfail" -ge 1 ]; then
        # direct UDP không lên sau 2 vòng -> về transport Cloudflare (chậm hơn nhưng chắc sống)
        last_fo=$now; dfail=0
        for n in 1 2 3; do [ -f /etc/flowvpn/node$n.json.wsrelay ] && cp /etc/flowvpn/node$n.json.wsrelay /etc/flowvpn/node$n.json; done
        echo wsrelay > $MODE
        log "TRANSPORT FALLBACK udp -> wsrelay (relay khong len sau 2 vong)"
        for s in 1 2 3; do /etc/init.d/flowvpnrelay$s restart >/dev/null 2>&1; done
      else
        last_fo=$now; dfail=$((dfail+1))
        hip=$(hosts_ip)
        if ! cf_ok "$hip"; then
          new=$(cf_pick "$hip")
          if [ -n "$new" ]; then cf_sets "$new"; log "CF IP $hip -> $new (relays down)"; fi
        else
          log "relays down but CF IP $hip ok -> restart relays"
        fi
        for s in 1 2 3; do /etc/init.d/flowvpnrelay$s restart >/dev/null 2>&1; done
      fi
      dead=0; sleep 30; continue
    fi
  else
    dead=0; dfail=0
  fi

  # --- node path health
  r=$(probe $cur "https://www.youtube.com/generate_204")
  case "$r" in fail|"")
    f_node=$((f_node+1)); log "node $cur FAIL ($f_node)"
    if [ "$f_node" -ge 3 ]; then
      rl=$(relay_for $cur); log "restart relay$rl for node $cur"
      /etc/init.d/flowvpnrelay$rl restart >/dev/null 2>&1
      f_node=0; sleep 12
      r2=$(probe $cur "https://www.youtube.com/generate_204")
      case "$r2" in fail|"")
        now2=$(date +%s)
        if [ $((now2-last_sw)) -lt 900 ]; then
          log "node $cur van fail, switch rate-limited"
        else
          nb=$(other_node); log "SWITCH node $cur -> $nb"
          last_sw=$now2; setport $nb && cur=$nb
        fi ;;
      esac
    fi ;;
  *) f_node=0 ;;
  esac

  # --- node3 path health (TV360)
  r3=$(probe 1083 "https://ws.tv360.vn/")
  case "$r3" in fail|"")
    f3=$((f3+1))
    if [ "$f3" -ge 3 ]; then log "restart relay3"; /etc/init.d/flowvpnrelay3 restart >/dev/null 2>&1; f3=0; fi ;;
  *) f3=0 ;;
  esac

  sleep 20
done
