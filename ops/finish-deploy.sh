#!/usr/bin/env bash
# Manual deploy of the extracted release (extract → deps → setup), verbose.
set -u
echo "== extract =="
mkdir -p /opt/fbuddy
tar -xzf /tmp/fbuddy-release.tar.gz -C /opt/fbuddy && echo "extract OK"
chmod -R go-w /opt/fbuddy 2>/dev/null || true

echo "== deps =="
cd /opt/fbuddy
for pkg in express multer pptxgenjs exceljs @modelcontextprotocol/sdk; do
  if [ -d "node_modules/$pkg" ]; then echo "  have $pkg"; else echo "  MISSING $pkg"; fi
done

echo "== remote-setup =="
bash /opt/fbuddy/deploy/remote-setup.sh
rc=$?
echo "remote-setup exit=$rc"

echo "== state =="
systemctl is-active fbuddy; echo "unit rc=$?"
curl -s --max-time 5 http://127.0.0.1:7790/api/health; echo
journalctl -u fbuddy -n 25 --no-pager 2>/dev/null | tail -25
exit $rc
