#!/usr/bin/env bash
# Reinstall production dependencies cleanly on node-2, then restart fBuddy.
set -u
cd /opt/fbuddy || exit 1

echo "== npm install (production) =="
npm install --omit=dev --no-audit --no-fund 2>&1 | tail -6

echo "== dependency sanity =="
missing=0
for pkg in express multer pptxgenjs exceljs unzipper binary @modelcontextprotocol/sdk; do
  if [ -d "node_modules/$pkg" ]; then echo "  have $pkg"; else echo "  MISSING $pkg"; missing=1; fi
done

echo "== module load check =="
node -e "
Promise.all([
  import('express'), import('multer'), import('pptxgenjs'), import('exceljs'),
  import('@modelcontextprotocol/sdk/client/index.js')
]).then(() => { console.log('  all imports OK'); })
  .catch((err) => { console.error('  import FAILED:', err.message); process.exit(1); });
"
rc=$?

if [ $rc -ne 0 ]; then echo "Cài đặt chưa đủ — dừng, không restart."; exit 1; fi

echo "== restart service =="
systemctl restart fbuddy
sleep 3
systemctl is-active fbuddy
for i in 1 2 3 4 5; do
  body=$(curl -s --max-time 5 http://127.0.0.1:7790/api/health || true)
  if [ -n "$body" ]; then echo "health: $body"; break; fi
  echo "  chờ service (lần $i)…"; sleep 3
done
echo "== log =="
journalctl -u fbuddy -n 8 --no-pager | tail -8
