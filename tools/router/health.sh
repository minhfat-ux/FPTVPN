#!/bin/sh
# Watchdog on dinh: KHONG doi node, KHONG restart sing-box (tranh rot ket noi khi dang xem).
# Chi restart relay khi probe fail 3 lan lien tiep.
LOG=/var/log/flowvpn-health.log
f1=0; f3=0
probe() {
  t=$(curl -s -o /dev/null -m 8 -w "%{time_total}" --socks5-hostname 127.0.0.1:$1 "$2" 2>/dev/null)
  [ $? -ne 0 ] && echo fail && return
  [ -z "$t" ] && echo fail && return
  echo "$t"
}
while true; do
  r1=$(probe 1085 "https://www.youtube.com/generate_204")
  if [ "$r1" = "fail" ]; then
    f1=$((f1+1)); echo "$(date +%H:%M:%S) node1 FAIL ($f1)" >> $LOG
    [ $f1 -ge 3 ] && { /etc/init.d/flowvpnrelay1 restart >/dev/null 2>&1; f1=0; echo "$(date +%H:%M:%S) RESTART relay1" >> $LOG; }
  else
    f1=0
  fi
  r3=$(probe 1083 "https://ws.tv360.vn/")
  if [ "$r3" = "fail" ]; then
    f3=$((f3+1)); echo "$(date +%H:%M:%S) node3 FAIL ($f3)" >> $LOG
    [ $f3 -ge 3 ] && { /etc/init.d/flowvpnrelay3 restart >/dev/null 2>&1; f3=0; echo "$(date +%H:%M:%S) RESTART relay3" >> $LOG; }
  else
    f3=0
  fi
  sleep 30
done
