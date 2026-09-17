#!/usr/bin/env bash
# Restart Caddy so it retries ACME immediately for flowgpt.meetflowai.site
# (it was in a 20-minute backoff from an attempt made before DNS existed).
set -u
echo "== certs on disk (before) =="
ls /var/lib/caddy/.local/share/caddy/certificates/acme-v02.api.letsencrypt.org-directory/ 2>/dev/null | head -8

echo "== restart caddy =="
systemctl restart caddy
sleep 6
echo "active: $(systemctl is-active caddy)"

echo "== wait for certificate =="
for i in $(seq 1 14); do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 https://flowgpt.meetflowai.site/api/health || echo 000)
  printf '  lan %s: HTTP %s\n' "$i" "$code"
  if [ "$code" = "200" ]; then break; fi
  sleep 10
done

echo "== cert issued? =="
find /var/lib/caddy -maxdepth 7 -ipath '*flowgpt*' -name '*.crt' 2>/dev/null | head -3

echo "== recent acme log =="
journalctl -u caddy -n 120 --no-pager | grep -i flowgpt | tail -6
