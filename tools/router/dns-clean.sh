#!/bin/sh
# dns-clean.sh — sửa DNS bị FPT đầu độc cho Facebook / ChatGPT / Gemini.
# FPT trả IP rác (facebook.com -> 185.45.5.35, chatgpt.com -> 128.242.250.157,
# gemini.google.com -> 103.228.130.61). Thiết bị nhận IP rác -> relay không tới được
# -> hysteria trả code=4 -> app lỗi.
# Cách làm: lấy IP thật qua DoH trong tunnel, thử từng IP qua relay với đúng SNI,
# ghi IP sống vào /etc/flowvpn/dns-hosts, HUP dnsmasq. Cron 20 phút -> IP chết tự đổi.
OUT=/etc/flowvpn/dns-hosts
TMP=/tmp/dns-hosts.new
PROXY=http://127.0.0.1:18081
SOCKS=127.0.0.1:1081
FAMILIES="www.facebook.com:57.144.64.1
chatgpt.com:104.18.32.47
gemini.google.com:142.251.152.2"
map_domains() {
  case "$1" in
    www.facebook.com) echo "facebook.com www.facebook.com m.facebook.com graph.facebook.com edge-mqtt.facebook.com api.facebook.com instagram.com www.instagram.com i.instagram.com messenger.com www.messenger.com" ;;
    chatgpt.com) echo "chatgpt.com www.chatgpt.com auth.openai.com platform.openai.com cdn.oaistatic.com ab.chatgpt.com" ;;
    gemini.google.com) echo "gemini.google.com aistudio.google.com" ;;
  esac
}
: > $TMP
for fam in $FAMILIES; do
  probe=${fam%%:*}
  fbip=${fam#*:}
  cands=""
  json=$(curl -s -m 12 -x $PROXY -H "accept: application/dns-json" "https://cloudflare-dns.com/dns-query?name=$probe&type=A" 2>/dev/null)
  for ip in $(echo "$json" | grep -oE '"data":"[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+"' | cut -d'"' -f4 | head -3); do
    case " $cands " in *" $ip "*) ;; *) cands="$cands $ip" ;; esac
  done
  cands="$cands $fbip"
  best=""
  for ip in $cands; do
    code=$(curl -s -k -o /dev/null -m 8 -w "%{http_code}" --socks5 $SOCKS --resolve $probe:443:$ip https://$probe/ 2>/dev/null)
    case "$code" in 2*|3*|4*) best=$ip; break ;; esac
  done
  [ -z "$best" ] && continue
  for d in $(map_domains "$probe"); do echo "$best $d" >> $TMP; done
done
if [ -s $TMP ]; then
  cp $TMP $OUT
  kill -HUP $(pidof dnsmasq) 2>/dev/null
fi
