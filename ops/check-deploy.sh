#!/usr/bin/env bash
# Read-only check of the fBuddy deployment state on node-2.
set -u
echo "== host =="; hostname
echo "== app dir =="; ls -la /opt/fbuddy 2>/dev/null | head -15
echo "== server node_modules =="; [ -d /opt/fbuddy/server/node_modules ] && echo "present ($(ls /opt/fbuddy/server/node_modules | wc -l) entries)" || echo "MISSING"
echo "== web dist =="; [ -f /opt/fbuddy/web/dist/index.html ] && echo "present ($(du -sh /opt/fbuddy/web/dist | cut -f1))" || echo "MISSING"
echo "== env file =="; [ -f /etc/fbuddy/fbuddy.env ] && echo "present (mode $(stat -c %a /etc/fbuddy/fbuddy.env))" || echo "MISSING"
echo "== data dir =="; ls -la /var/lib/fbuddy 2>/dev/null | head -8
echo "== unit =="; systemctl is-enabled fbuddy 2>&1; systemctl is-active fbuddy 2>&1
echo "== caddy block =="; grep -n "fbuddy.meetflowai.site" /etc/caddy/Caddyfile 2>/dev/null || echo "chưa có block Caddy"
echo "== port 7790 =="; ss -tlnp | grep 7790 || echo "chưa listen"
echo "== health =="; curl -s --max-time 5 http://127.0.0.1:7790/api/health || echo "(không phản hồi)"
echo
echo "== last log =="; journalctl -u fbuddy -n 12 --no-pager 2>/dev/null || true
