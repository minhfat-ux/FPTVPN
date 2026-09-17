#!/usr/bin/env bash
# Diagnose + clean-reinstall FlowGpt deps on node-2.
set -u
cd /opt/flowgpt || exit 1

echo "== diagnose binary pkg =="
ls -la node_modules/binary 2>/dev/null | head
echo "-- lib --"
ls -la node_modules/binary/lib 2>/dev/null | head
echo "-- version --"
grep -m1 '"version"' node_modules/binary/package.json 2>/dev/null
echo "-- files in binary tarball per npm cache --"
npm view binary dist.tarball 2>/dev/null | tail -1

echo
echo "== clean reinstall =="
rm -rf node_modules package-lock.json
npm install --omit=dev --no-audit --no-fund 2>&1 | tail -5

echo
echo "== verify binary =="
ls node_modules/binary/lib 2>/dev/null | head

echo "== module load check =="
if node -e "
Promise.all([
  import('express'), import('multer'), import('pptxgenjs'), import('exceljs'),
  import('@modelcontextprotocol/sdk/client/index.js')
]).then(() => { console.log('  all imports OK'); })
  .catch((err) => { console.error('  import FAILED:', err.message); process.exit(1); });
"; then
  echo "== restart service =="
  systemctl restart flowgpt
  sleep 3
  systemctl is-active flowgpt
  for i in 1 2 3 4 5; do
    body=$(curl -s --max-time 5 http://127.0.0.1:7790/api/health || true)
    if [ -n "$body" ]; then echo "health: $body"; break; fi
    echo "  chờ service (lần $i)…"; sleep 3
  done
  echo "== log =="
  journalctl -u flowgpt -n 10 --no-pager | tail -10
else
  echo "VẪN LỖI — không restart."
  exit 1
fi
