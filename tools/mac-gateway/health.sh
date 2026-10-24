#!/bin/bash
# Kiem tra gateway Mac moi 5 phut; relay treo -> restart.
# 24/10/2026: them kiem Flow3 (TV360) — truoc day relay3 chet (DNS "no such host") ma
# watchdog chi nhin Flow2 nen TV360 chet am tham.
log() { logger -t flowvpn-health "$1"; }

# Flow2 (FPT Play + moi traffic): qua bridge 18081
if ! curl -s -o /dev/null -m 12 -x http://127.0.0.1:18081 \
     "https://speed.cloudflare.com/__down?bytes=200000"; then
  log "relay(Flow2) treo -> restart"
  launchctl kickstart -k "gui/$(id -u)/site.flowvpn.relay"
fi

# Flow3 (TV360): qua socks 1083. Route .tv360.vn cua bridge tro vao day.
if ! curl -s -o /dev/null -m 15 --socks5-hostname 127.0.0.1:1083 https://tv360.vn/; then
  log "relay3(Flow3/TV360) treo -> restart"
  launchctl kickstart -k "gui/$(id -u)/site.flowvpn.relay3"
fi
