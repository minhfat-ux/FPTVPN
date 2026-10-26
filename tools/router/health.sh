#!/bin/sh
# Gateway watchdog + chon node theo BANG THONG (khong chi do tre).
# node = relay nhanh nhat trong node-1(1085)/node-2(1081); node3(1083) co dinh cho TV360.
CONF=/etc/sing-box/config.json
STATE=/tmp/flowvpn-node
LOG=/var/log/flowvpn-health.log
cur=1085; [ -f $STATE ] && cur=$(cat $STATE)
f1=0; f3=0; tick=0
probe() {
  t=$(curl -s -o /dev/null -m 8 -w "%{time_total}" --socks5-hostname 127.0.0.1:$1 "$2" 2>/dev/null)
  [ $? -ne 0 ] && echo fail && return
  [ -z "$t" ] && echo fail && return
  echo "$t"
}
speed() {
  s=$(curl -s --socks5-hostname 127.0.0.1:$1 -o /dev/null -m 12 -w "%{speed_download}" "https://speed.cloudflare.com/__down?bytes=600000" 2>/dev/null)
  [ -z "$s" ] && s=0
  printf "%.0f" "$s"
}
setport() {
  sed -i "/\"tag\": \"node\"/,/}/ s/\"server_port\": [0-9]*/\"server_port\": $1/" $CONF
  sing-box check -c $CONF >/dev/null 2>&1 && /etc/init.d/sing-box restart >/dev/null 2>&1 && echo $1 > $STATE
}
while true; do
  avail=$(awk "/MemAvailable/{print \$2}" /proc/meminfo)
  if [ -n "$avail" ] && [ "$avail" -lt 5000 ]; then
    echo "$(date +%H:%M:%S) MEM LOW ${avail}kB -> drop caches" >> $LOG
    echo 3 > /proc/sys/vm/drop_caches 2>/dev/null
  fi
  if ! ping -c1 -W2 192.168.100.1 >/dev/null 2>&1; then
    f1=0; f3=0; sleep 15; continue
  fi
  tick=$((tick+1))
  if [ $((tick % 15)) -eq 0 ]; then
    s1=$(speed 1085); s2=$(speed 1081)
    echo "$(date +%H:%M:%S) throughput node1=${s1}B/s node2=${s2}B/s cur=$cur" >> $LOG
    best=$s1; bp=1085
    [ "$s2" -gt "$s1" ] && { best=$s2; bp=1081; }
    cs=$s1; [ "$cur" = "1081" ] && cs=$s2
    if [ "$bp" != "$cur" ] && [ "$best" -gt $((cs + cs/4)) ] && [ "$best" -gt 20000 ]; then
      echo "$(date +%H:%M:%S) SWITCH(node) $cur -> $bp (${best}B/s)" >> $LOG
      setport $bp && cur=$bp
    fi
  fi
  r=$(probe $cur "https://www.youtube.com/generate_204")
  case "$r" in fail|"") f1=$((f1+1)); echo "$(date +%H:%M:%S) node $cur FAIL ($f1)" >> $LOG
     [ $f1 -ge 2 ] && { /etc/init.d/flowvpnrelay1 restart >/dev/null 2>&1; /etc/init.d/flowvpnrelay2 restart >/dev/null 2>&1; f1=0; } ;;
  esac
  case "$r" in fail|"") ;; *) f1=0 ;; esac
  r3=$(probe 1083 "https://ws.tv360.vn/")
  case "$r3" in fail|"") f3=$((f3+1)); echo "$(date +%H:%M:%S) node3 FAIL ($f3)" >> $LOG
     [ $f3 -ge 2 ] && { /etc/init.d/flowvpnrelay3 restart >/dev/null 2>&1; f3=0; } ;;
  esac
  case "$r3" in fail|"") ;; *) f3=0 ;; esac
  sleep 20
done
