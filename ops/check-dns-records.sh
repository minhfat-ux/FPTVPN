#!/usr/bin/env bash
# Read-only: is the '/' 404 on meetflowai.site expected, and which DNS records exist?
set -u
echo "== /var/www/flowvpn (top) =="
ls -1 /var/www/flowvpn 2>/dev/null | head -20
echo "index.html? $([ -f /var/www/flowvpn/index.html ] && echo yes || echo no)"
echo "open.html?   $([ -f /var/www/flowvpn/open.html ] && echo yes || echo no)"

echo
echo "== Cloudflare records in zone meetflowai.site =="
DROPIN="/etc/systemd/system/flowvpn-cp.service.d/alerts.conf"
TOKEN=$(grep -hoP 'CLOUDFLARE_API_TOKEN=\K.*' "$DROPIN" 2>/dev/null | tr -d '"' | tr -d "'" | head -1 || true)
if [ -z "${TOKEN:-}" ]; then echo "không đọc được token"; exit 0; fi
ZONE=$(curl -sS "https://api.cloudflare.com/client/v4/zones?name=meetflowai.site" -H "Authorization: Bearer $TOKEN" \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["result"][0]["id"] if d.get("result") else "")')
curl -sS "https://api.cloudflare.com/client/v4/zones/$ZONE/dns_records?per_page=100" -H "Authorization: Bearer $TOKEN" \
  | python3 -c '
import json,sys
d=json.load(sys.stdin)
rows=sorted(d.get("result",[]), key=lambda r: r["name"])
for r in rows:
    print("  %-34s %-6s %-42s proxied=%s" % (r["name"], r["type"], r["content"][:42], r.get("proxied")))
print("  total:", len(rows))
'
