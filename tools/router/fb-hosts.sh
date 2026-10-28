#!/bin/sh
# fb-hosts.sh - sua DNS nhiem doc cua FPT cho Facebook/Instagram/Meta.
# FPT tra facebook.com -> 185.45.5.35 (IP rac, relay khong toi duoc).
# Cach lam: lay IP that qua DoH (within tunnel), thu tung IP qua relay voi SNI dung,
# ghi IP song vao /etc/flowvpn/fb-hosts va HUP dnsmasq. Chay lai moi 20 phut -> khong bam IP chet.
OUT=/etc/flowvpn/fb-hosts
TMP=/tmp/fb-hosts.new
PROXY=http://127.0.0.1:18081
SOCKS=127.0.0.1:1085
DOMAINS="facebook.com www.facebook.com m.facebook.com graph.facebook.com edge-mqtt.facebook.com api.facebook.com instagram.com www.instagram.com i.instagram.com messenger.com www.messenger.com scontent.xx.fbcdn.net"
CAND=""
for d in www.facebook.com graph.facebook.com instagram.com; do
  json=$(curl -s -m 12 -x $PROXY -H "accept: application/dns-json" "https://cloudflare-dns.com/dns-query?name=$d&type=A" 2>/dev/null)
  ips=$(echo "$json" | grep -oE "\"data\":\"[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+\"" | cut -d"\"" -f4)
  for ip in $ips; do case " $CAND " in *" $ip "*) ;; *) CAND="$CAND $ip" ;; esac; done
done
CAND="$CAND 57.144.8.1 57.144.24.1 57.144.100.141"
BEST=""
for ip in $CAND; do
  code=$(curl -s -k -o /dev/null -m 8 -w "%{http_code}" --socks5 $SOCKS --resolve www.facebook.com:443:$ip https://www.facebook.com/ 2>/dev/null)
  case "$code" in 2*|3*) BEST=$ip; break ;; esac
done
[ -z "$BEST" ] && exit 0
: > $TMP
for d in $DOMAINS; do echo "$BEST $d" >> $TMP; done
cp $TMP $OUT
kill -HUP $(pidof dnsmasq) 2>/dev/null
