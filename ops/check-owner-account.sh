#!/usr/bin/env bash
# Verify the owner's account state and the Resend delivery status of the login mail.
set -u
echo "== users =="
python3 - <<'PY'
import sqlite3
con = sqlite3.connect('/var/lib/fbuddy/fbuddy.db')
for r in con.execute("select email, role, created_at from users order by created_at"):
    print("  %-34s %-6s %s" % (r[0], r[1], r[2][:19]))
print("  total:", con.execute("select count(*) from users").fetchone()[0])
PY

echo
echo "== email_tokens (mới nhất) =="
python3 - <<'PY'
import sqlite3
con = sqlite3.connect('/var/lib/fbuddy/fbuddy.db')
for r in con.execute("select email, attempts, expires_at, consumed_at, created_at from email_tokens order by created_at desc limit 5"):
    print("  %-34s attempts=%s exp=%s consumed=%s created=%s" % (r[0], r[1], r[2][11:19], (r[3] or '-')[11:19], r[4][11:19]))
PY

echo
echo "== audit gần nhất =="
python3 - <<'PY'
import sqlite3
con = sqlite3.connect('/var/lib/fbuddy/fbuddy.db')
for r in con.execute("select action, detail_json, created_at from audit_log order by created_at desc limit 6"):
    print("  %-20s %-52s %s" % (r[0], (r[1] or '')[:52], r[2][11:19]))
PY

echo
echo "== trạng thái gửi mail qua Resend (không in key) =="
KEY=$(grep -hoP '^FBUDDY_RESEND_API_KEY=\K.*' /etc/fbuddy/fbuddy.env | head -1)
if [ -n "${KEY:-}" ]; then
  curl -sS --max-time 15 "https://api.resend.com/emails?limit=3" -H "Authorization: Bearer $KEY" \
    | python3 -c '
import json,sys
try:
    d=json.load(sys.stdin)
except Exception as e:
    print("  không đọc được phản hồi:", e); raise SystemExit
items = d.get("data") or d.get("items") or []
if not items:
    print("  (không có bản ghi / API không hỗ trợ liệt kê)")
for m in items[:3]:
    print("  %-28s %-14s %s" % (m.get("to"), m.get("last_event"), m.get("created_at")))
'
else
  echo "  không thấy key trong env"
fi
