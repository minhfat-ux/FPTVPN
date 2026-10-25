#!/bin/sh
# Chuyen DNS cua cac domain bi chan sang listener DoT cua sing-box (127.0.0.1:5353),
# con lai giu DNS nha (tunnel chet khong mat internet toan mang).
# Chay tren router OpenWrt: sh dnsmasq-blocked-domains.sh
set -e
uci set dhcp.@dnsmasq[0].noresolv=0
uci -q delete dhcp.@dnsmasq[0].server 2>/dev/null || true
for d in google.com googleapis.com gstatic.com googleusercontent.com googletagmanager.com \
         google-analytics.com gvt1.com gvt2.com firebaseio.com firebaseapp.com firebase.com \
         youtube.com googlevideo.com ytimg.com ggpht.com \
         facebook.com facebook.net fbcdn.net instagram.com cdninstagram.com \
         tiktok.com tiktokcdn.com tiktokv.com ibytedtos.com byteoversea.com \
         twitter.com x.com twimg.com telegram.org t.me whatsapp.com whatsapp.net \
         chatgpt.com openai.com oaistatic.com oaiusercontent.com; do
  uci add_list dhcp.@dnsmasq[0].server="/$d/127.0.0.1#5353"
done
uci commit dhcp
/etc/init.d/dnsmasq restart
echo "dnsmasq: xong"
