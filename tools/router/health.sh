#!/bin/sh
# flowvpn watchdog v4 (2026-10-28)
# Mục tiêu: KHÔNG để "tối nào cũng phải fix tay".
#  - 1 instance (pid lock + leader check)
#  - Tự áp sysctl (tcp_mem...) ở đầu (phòng OOM "TCP: out of memory")
#  - CF IP động: probe danh sách, chỉ đổi khi IP hiện tại fail 2 lần, tối đa 1 lần/10 phút
#  - END-TO-END: mỗi ~60s test FPT Play qua sing-box. Hỏng 2 lần liên tiếp -> thang tự chữa:
#      (1) restart relay đang dùng -> (2) đổi node (<=1 lần/15 phút) -> (3) thử transport udp
#      (nếu có nodeN.json.udp) -> không được thì quay lại wsrelay.
#  - DNS sạch: mỗi ~5 phút kiểm www.facebook.com/chatgpt.com/gemini.google.com;
#      trả IP rác hoặc thiếu file -> chạy lại dns-clean.sh ở nền (rate-limit 20 phút).
#  - Guard sing-box: mất 7893/18081 3 lần -> khôi phục config.good.
CONF=/etc/sing-box/config.json
GOOD=/etc/sing-box/config.json.good
STATE=/tmp/flowvpn-node
MODE=/tmp/relay-transport
LOG=/var/log/flowvpn-health.log
CURL=/usr/bin/curl
NODES="1081 1085 1083"
CF_LIST="104.17.232.29 172.64.80.1 188.114.96.1 104.18.32.115 104.26.10.78 104.21.83.112 172.67.175.138 104.16.132.229"
LOCKDIR=/tmp/health.lock
PROXY=http://127.0.0.1:18081

if ! mkdir $LOCKDIR 2>/dev/null; then
  old=$(cat $LOCKDIR/pid 2>/dev/null)
  [ -n "$old" ] && kill -0 "$old" 2>/dev/null && exit 0
  rm -rf $LOCKDIR; mkdir $LOCKDIR 2>/dev/null || exit 0
fi
echo $$ > $LOCKDIR/pid
trap "rm -rf $LOCKDIR" EXIT

sysctl -p /etc/sysctl.d/99-flowvpn.conf >/dev/null 2>&1

cur=1081; [ -f $STATE ] && cur=$(cat $STATE)
# uu tien cong dang cau hinh that trong config (sau reboot /tmp co the lech)
cfgport=$(sed -n 's/.*"tag": "node".*"server_port": \([0-9]*\).*/\1/p' $CONF | head -1)
[ -n "$cfgport" ] && cur=$cfgport
case " $NODES " in *" $cur "*) ;; *) cur=1081 ;; esac
echo $cur > $STATE
log() { echo "$(date +%H:%M:%S) $*" >> $LOG; }
probe() {
  t=$($CURL -s -o /dev/null -m 8 -w "%{time_total}" --socks5-hostname 127.0.0.1:$1 "$2" 2>/dev/null)
  [ $? -eq 0 ] && [ -n "$t" ] && echo "$t" || echo fail
}
port_open() { netstat -ltn 2>/dev/null | grep -q ":$1 "; }
relay_for() { case $1 in 1081) echo 2 ;; 1085) echo 1 ;; 1083) echo 3 ;; esac; }
other_node() { [ "$cur" = "1081" ] && echo 1085 || echo 1081; }
pick_node() { # thu lan luot cac relay con lai, tra ve cai dau tien tra loi
  for n in 1081 1085 1083; do
    [ "$n" = "$cur" ] && continue
    r=$(probe $n "https://www.youtube.com/generate_204")
    case "$r" in fail|"") ;; *) echo $n; return ;; esac
  done
  echo ""
}
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
set_transport() { # wsrelay | udp
  if [ "$1" = "udp" ]; then
    for n in 1 2 3; do [ -f /etc/flowvpn/node$n.json.udp ] && cp /etc/flowvpn/node$n.json.udp /etc/flowvpn/node$n.json; done
  else
    for n in 1 2 3; do [ -f /etc/flowvpn/node$n.json.wsrelay ] && cp /etc/flowvpn/node$n.json.wsrelay /etc/flowvpn/node$n.json; done
  fi
  echo "$1" > $MODE
  for s in 1 2 3; do /etc/init.d/flowvpnrelay$s restart >/dev/null 2>&1; done
}
e2e() { # 0 = ok
  c=$($CURL -s -o /dev/null -m 15 -w "%{http_code}" -x $PROXY https://fptplay.vn/ 2>/dev/null)
  case "$c" in 2*) return 0 ;; esac
  return 1
}
dns_bad() { # 0 = can chay lai dns-clean
  [ -f /etc/flowvpn/dns-hosts ] || return 0
  [ "$(wc -l < /etc/flowvpn/dns-hosts)" -ge 15 ] || return 0
  want=$(awk '/ www.facebook.com$/{print $1; exit}' /etc/flowvpn/dns-hosts)
  got=$(nslookup www.facebook.com 127.0.0.1 2>/dev/null | awk '/^Address: /{print $2; exit}')
  [ "$want" = "$got" ] && return 1
  return 0
}

f_node=0; f3=0; dead=0; last_fo=0; sb_f=0; last_sw=0; last_cf=0; cf_f=0; dfail=0; i=0
e2e_f=0; last_e2e_sw=0; last_dns=0; last_tr=0; last_relay_restart=0; last_relay3=0
while true; do
  i=$((i+1))
  lk=$(cat $LOCKDIR/pid 2>/dev/null)
  if [ -n "$lk" ] && [ "$lk" != "$$" ] && [ -d /proc/$lk ]; then exit 0; fi
  avail=$(awk "/MemAvailable/{print \$2}" /proc/meminfo)
  if [ -n "$avail" ] && [ "$avail" -lt 4000 ]; then echo 3 > /proc/sys/vm/drop_caches 2>/dev/null; fi
  if ! ping -c1 -W2 192.168.100.1 >/dev/null 2>&1; then dead=0; f_node=0; f3=0; cf_f=0; sleep 20; continue; fi

  # --- CF IP health (60s)
  if [ "$((i % 3))" -eq 0 ]; then
    hipp=$(hosts_ip)
    if ! cf_ok "$hipp"; then
      cf_f=$((cf_f+1))
      if [ "$cf_f" -ge 2 ]; then
        now=$(date +%s)
        if [ $((now-last_cf)) -ge 600 ]; then
          new=$(cf_pick "$hipp")
          if [ -n "$new" ] && [ "$new" != "$hipp" ]; then
            last_cf=$now; cf_f=0; cf_sets "$new"
            log "CF IP $hipp -> $new"
            for s in 1 2 3; do /etc/init.d/flowvpnrelay$s restart >/dev/null 2>&1; done
            sleep 10
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
    if [ "$sb_f" -ge 3 ]; then log "SING-BOX DOWN -> restore config.good"; cp $GOOD $CONF 2>/dev/null; /etc/init.d/sing-box restart >/dev/null 2>&1; sb_f=0; fi
  else
    sb_f=0
  fi

  # --- relay down
  if ! port_open 1081 && ! port_open 1085; then
    dead=$((dead+1))
    if [ "$dead" -ge 3 ]; then
      now=$(date +%s)
      if [ $((now-last_fo)) -lt 600 ]; then log "RELAYS DOWN (rate-limited)"
      else
        last_fo=$now; dfail=$((dfail+1))
        hipp=$(hosts_ip)
        if ! cf_ok "$hipp"; then new=$(cf_pick "$hipp"); [ -n "$new" ] && cf_sets "$new" && log "CF IP $hipp -> $new (relays down)"; fi
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
    if [ "$f_node" -ge 4 ] && ! e2e; then
      now2=$(date +%s)
      if [ $((now2-last_relay_restart)) -ge 900 ]; then
        rl=$(relay_for $cur); log "restart relay$rl for node $cur (e2e hong)"; last_relay_restart=$now2
        /etc/init.d/flowvpnrelay$rl restart >/dev/null 2>&1
      else
        log "node $cur fail nhung vua restart relay, bo qua"
      fi
      f_node=0; sleep 12
    fi ;;
  *) f_node=0 ;;
  esac

  # --- node3 (TV360)
  r3=$(probe 1083 "https://ws.tv360.vn/")
  case "$r3" in fail|"")
    f3=$((f3+1))
    if [ "$f3" -ge 4 ]; then
      now3=$(date +%s)
      if [ $((now3-last_relay3)) -ge 900 ]; then log "restart relay3"; /etc/init.d/flowvpnrelay3 restart >/dev/null 2>&1; last_relay3=$now3; fi
      f3=0
    fi ;;
  *) f3=0 ;;
  esac

  # --- END-TO-END (moi vong ~20s): FPT Play qua sing-box
  if true; then
    if e2e; then
      e2e_f=0
    else
      e2e_f=$((e2e_f+1)); log "E2E FPT Play FAIL ($e2e_f)"
      if [ "$e2e_f" -ge 3 ]; then
        now=$(date +%s)
        mode=$(cat $MODE 2>/dev/null)
        if [ "$mode" = "udp" ]; then
          # FPT chan UDP -> ve wsrelay NGAY, khong restart relay truoc (tranh gian doan 2 lan)
          if [ $((now-last_tr)) -ge 60 ]; then
            last_tr=$now; log "E2E -> udp bi chan, quay ve wsrelay ngay"
            set_transport wsrelay; sleep 10
          fi
        else
          nb=$(pick_node)
          if [ -n "$nb" ] && [ $((now-last_e2e_sw)) -ge 900 ]; then
            last_e2e_sw=$now; log "E2E -> SWITCH node $cur -> $nb (relay kia OK)"
            setport $nb && cur=$nb; sleep 8
          elif [ $((now-last_relay_restart)) -ge 900 ]; then
            rl=$(relay_for $cur); log "E2E -> khong relay nao OK, restart relay$rl"; last_relay_restart=$now
            /etc/init.d/flowvpnrelay$rl restart >/dev/null 2>&1; sleep 12
          fi
        fi
        e2e_f=0
      fi
    fi
  fi

  # --- DNS sach (moi ~10 vong = 200s), chay lai toi da 20 phut/lan
  if [ "$((i % 10))" -eq 5 ]; then
    if dns_bad; then
      now=$(date +%s)
      if [ $((now-last_dns)) -ge 1200 ]; then
        last_dns=$now; log "DNS sach sai/thieu -> chay dns-clean"
        ( /etc/flowvpn/dns-clean.sh >/dev/null 2>&1 & )
      else
        log "DNS sach sai (rate-limited)"
      fi
    fi
  fi

  sleep 20
done
