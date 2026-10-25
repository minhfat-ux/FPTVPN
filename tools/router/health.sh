#!/bin/sh
# Daemon chon node cho gateway AX3000T (OpenWrt).
# - Do do tre qua tung socks relay (node-1: 1085, node-2: 1081) toi
#   https://www.youtube.com/generate_204 moi 30 s.
# - Chi doi node khi node hien tai chet hoac node kia nhanh hon >=25% (tranh dao).
# - Ca 2 node fail 3 lan lien tiep -> restart ca 2 relay (procd se bat lai).
# Khong chua credential; config relay nam trong /etc/flowvpn/node{1,2}.json tren thiet bi.
CONF=/etc/sing-box/config.json
STATE=/tmp/flowvpn-node
NODES="1085 1081"
PROBE="https://www.youtube.com/generate_204"
LOG=/var/log/flowvpn-health.log
cur=1085; [ -f $STATE ] && cur=$(cat $STATE)
fails=0
probe() {
  t=$(curl -s -o /dev/null -m 8 -w "%{time_total}" --socks5-hostname 127.0.0.1:$1 "$PROBE" 2>/dev/null)
  rc=$?
  if [ $rc -ne 0 ] || [ -z "$t" ]; then echo fail; else echo "$t"; fi
}
restart_relays() {
  echo "$(date +%H:%M:%S) RESTART relays" >> $LOG
  /etc/init.d/flowvpnrelay2 restart >/dev/null 2>&1; /etc/init.d/flowvpnrelay1 restart >/dev/null 2>&1; return 0
}
while true; do
  best=""; bestscore=999
  for p in $NODES; do
    r=$(probe $p)
    [ "$r" = "fail" ] && { echo "$(date +%H:%M:%S) $p FAIL" >> $LOG; continue; }
    awk "BEGIN{exit !($r < $bestscore)}" && { best=$p; bestscore=$r; }
  done
  if [ -z "$best" ]; then
    fails=$((fails+1)); echo "$(date +%H:%M:%S) all fail ($fails)" >> $LOG
    [ $fails -ge 3 ] && { restart_relays; fails=0; }
  else
    fails=0
    curscore=$(probe $cur); [ "$curscore" = "fail" ] && curscore=999
    if [ "$best" != "$cur" ] && awk "BEGIN{exit !($bestscore*4 < $curscore*3)}"; then
      echo "$(date +%H:%M:%S) SWITCH $cur($curscore) -> $best($bestscore)" >> $LOG
      sed -i "s/\"server_port\": [0-9]*/\"server_port\": $best/" $CONF
      if sing-box check -c $CONF >/dev/null 2>&1; then
        echo $best > $STATE; cur=$best; /etc/init.d/sing-box restart >/dev/null 2>&1
      fi
    fi
  fi
  sleep 30
done
