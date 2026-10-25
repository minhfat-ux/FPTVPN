#!/bin/sh
CONF=/etc/sing-box/config.json
STATE=/tmp/flowvpn-node
NODES="1085"
PROBE="https://www.youtube.com/generate_204"
LOG=/var/log/flowvpn-health.log
cur=1085
fails=0; fails3=0
probe() {
  t=$(curl -s -o /dev/null -m 8 -w "%{time_total}" --socks5-hostname 127.0.0.1:$1 "$2" 2>/dev/null)
  rc=$?
  if [ $rc -ne 0 ] || [ -z "$t" ]; then echo fail; else echo "$t"; fi
}
restart_relays() {
  echo "$(date +%H:%M:%S) RESTART relays" >> $LOG
  /etc/init.d/flowvpnrelay1 restart >/dev/null 2>&1
  return 0
}
while true; do
  best=""; bestscore=999
  for p in $NODES; do
    r=$(probe $p "$PROBE")
    [ "$r" = "fail" ] && { echo "$(date +%H:%M:%S) $p FAIL" >> $LOG; continue; }
    awk "BEGIN{exit !($r < $bestscore)}" && { best=$p; bestscore=$r; }
  done
  if [ -z "$best" ]; then
    fails=$((fails+1)); echo "$(date +%H:%M:%S) all fail ($fails)" >> $LOG
    [ $fails -ge 3 ] && { restart_relays; fails=0; }
  else
    fails=0
    curscore=$(probe $cur "$PROBE"); [ "$curscore" = "fail" ] && curscore=999
    if [ "$best" != "$cur" ] && awk "BEGIN{exit !($bestscore*4 < $curscore*3)}"; then
      echo "$(date +%H:%M:%S) SWITCH $cur($curscore) -> $best($bestscore)" >> $LOG
      sed -i "/\"tag\": \"node\"/,/}/ s/\"server_port\": [0-9]*/\"server_port\": $best/" $CONF
      if sing-box check -c $CONF >/dev/null 2>&1; then
        echo $best > $STATE; cur=$best; /etc/init.d/sing-box restart >/dev/null 2>&1
      fi
    fi
  fi
  r3=$(probe 1083 "https://ws.tv360.vn/")
  if [ "$r3" = "fail" ]; then
    fails3=$((fails3+1)); echo "$(date +%H:%M:%S) node3 FAIL ($fails3)" >> $LOG
    [ $fails3 -ge 3 ] && { /etc/init.d/flowvpnrelay3 restart >/dev/null 2>&1; fails3=0; }
  else
    fails3=0
  fi
  sleep 30
done
