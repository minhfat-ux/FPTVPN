#!/usr/bin/env bash
# Read-only check of the FlowGpt deployment state on node-2.
set -u
echo "== host =="; hostname
echo "== app dir =="; ls -la /opt/flowgpt 2>/dev/null | head -15
echo "== server node_modules =="; [ -d /opt/flowgpt/server/node_modules ] && echo "present ($(ls /opt/flowgpt/server/node_modules | wc -l) entries)" || echo "MISSING"
echo "== web dist =="; [ -f /opt/flowgpt/web/dist/index.html ] && echo "present ($(du -sh /opt/flowgpt/web/dist | cut -f1))" || echo "MISSING"
echo "== env file =="; [ -f /etc/flowgpt/flowgpt.env ] && echo "present (mode $(stat -c %a /etc/flowgpt/flowgpt.env))" || echo "MISSING"
echo "== data dir =="; ls -la /var/lib/flowgpt 2>/dev/null | head -8
echo "== unit =="; systemctl is-enabled flowgpt 2>&1; systemctl is-active flowgpt 2>&1
echo "== caddy block =="; grep -n "flowgpt.meetflowai.site" /etc/caddy/Caddyfile 2>/dev/null || echo "chưa có block Caddy"
echo "== port 7790 =="; ss -tlnp | grep 7790 || echo "chưa listen"
echo "== health =="; curl -s --max-time 5 http://127.0.0.1:7790/api/health || echo "(không phản hồi)"
echo
echo "== last log =="; journalctl -u flowgpt -n 12 --no-pager 2>/dev/null || true
