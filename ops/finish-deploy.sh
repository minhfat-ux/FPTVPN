#!/usr/bin/env bash
# Manual deploy of the extracted release (extract → deps → setup), verbose.
set -u
echo "== extract =="
mkdir -p /opt/flowgpt
tar -xzf /tmp/flowgpt-release.tar.gz -C /opt/flowgpt && echo "extract OK"
chmod -R go-w /opt/flowgpt 2>/dev/null || true

echo "== deps =="
cd /opt/flowgpt
for pkg in express multer pptxgenjs exceljs @modelcontextprotocol/sdk; do
  if [ -d "node_modules/$pkg" ]; then echo "  have $pkg"; else echo "  MISSING $pkg"; fi
done

echo "== remote-setup =="
bash /opt/flowgpt/deploy/remote-setup.sh
rc=$?
echo "remote-setup exit=$rc"

echo "== state =="
systemctl is-active flowgpt; echo "unit rc=$?"
curl -s --max-time 5 http://127.0.0.1:7790/api/health; echo
journalctl -u flowgpt -n 25 --no-pager 2>/dev/null | tail -25
exit $rc
