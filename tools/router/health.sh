#!/bin/sh
# Watchdog on dinh: khong doi node, khong restart sing-box.
# - MemAvailable < 6 MB: drop caches + restart relay (chong OOM lam mat Wi-Fi ca nha).
# - WAN down: chi log; hotplug se restart relay khi WAN len lai.
# - WAN up: probe node-1 (FPT Play) / node-3 (TV360); fail 2 lan -> restart relay.
LOG=/var/log/flowvpn-health.log
f1=0; f3=0
probe() {
  t=$(curl -s -o /dev/null -m 8 -w "%{time_total}" --socks5-hostname 127.0.0.1:$1 "$2" 2>/dev/null)
  [ $? -ne 0 ] && echo fail && return
  [ -z "$t" ] && echo fail && return
  echo "$t"
}
while true; do
  avail=$(awk "/MemAvailable/{print \$2}" /proc/meminfo)
  if [ -n "$avail" ] && [ "$avail" -lt 6000 ]; then
    echo "$(date +%H:%M:%S) MEM LOW avail=${avail}kB -> drop caches + restart relays" >> $LOG
    echo 3 > /proc/sys/vm/drop_caches 2>/dev/null
    /etc/init.d/flowvpnrelay1 restart >/dev/null 2>&1
    /etc/init.d/flowvpnrelay3 restart >/dev/null 2>&1
  fi
  if ! ping -c1 -W2 192.168.100.1 >/dev/null 2>&1; then
    echo "$(date +%H:%M:%S) WAN DOWN - cho hotplug" >> $LOG
    f1=0; f3=0; sleep 15; continue
  fi
  r1=$(probe 1085 "https://www.youtube.com/generate_204")
  case "$r1" in fail|"") f1=$((f1+1)); echo "$(date +%H:%M:%S) node1 FAIL ($f1)" >> $LOG
     [ $f1 -ge 2 ] && { /etc/init.d/flowvpnrelay1 restart >/dev/null 2>&1; f1=0; echo "$(date +%H:%M:%S) RESTART relay1" >> $LOG; } ;;
  esac
  case "$r1" in fail|"") ;; *) f1=0 ;; esac
  r3=$(probe 1083 "https://ws.tv360.vn/")
  case "$r3" in fail|"") f3=$((f3+1)); echo "$(date +%H:%M:%S) node3 FAIL ($f3)" >> $LOG
     [ $f3 -ge 2 ] && { /etc/init.d/flowvpnrelay3 restart >/dev/null 2>&1; f3=0; echo "$(date +%H:%M:%S) RESTART relay3" >> $LOG; } ;;
  esac
  case "$r3" in fail|"") ;; *) f3=0 ;; esac
  sleep 20
done
