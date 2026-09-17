#!/usr/bin/env bash
# Diagnose a failed login-by-code attempt. Read-only apart from nothing.
set -u
echo "== các lần gọi auth trong log (500 dòng gần nhất) =="
journalctl -u fbuddy -n 800 --no-pager | grep -E '"path":"/api/auth' | tail -25

echo
echo "== bảng email_tokens =="
python3 - <<'PY'
import sqlite3, datetime, json
con = sqlite3.connect('/var/lib/fbuddy/fbuddy.db')
con.row_factory = sqlite3.Row
rows = con.execute("select id,email,attempts,expires_at,consumed_at,created_at from email_tokens order by created_at desc limit 12").fetchall()
if not rows:
    print("  (không có bản ghi nào)")
for r in rows:
    print("  %-34s attempts=%s exp=%s consumed=%s created=%s" % (
        r["email"], r["attempts"], r["expires_at"][11:19], (r["consumed_at"] or "-")[11:19], r["created_at"][11:19]))
print("  total:", con.execute("select count(*) from email_tokens").fetchone()[0])

print()
print("== users ==")
for r in con.execute("select id,email,role,created_at,token_version from users order by created_at limit 10"):
    print("  %-34s role=%-6s created=%s tv=%s" % (r["email"], r["role"], r["created_at"][:19], r["token_version"]))

print()
print("== app_settings (trừ secret) ==")
for r in con.execute("select key, value_json from app_settings order by key"):
    if r["key"] == "resendApiKeyEnc":
        print("  %-28s %s" % (r["key"], "(đã lưu)" if r["value_json"] not in (None, "null") else "(trống)"))
    else:
        print("  %-28s %s" % (r["key"], (r["value_json"] or "")[:60]))

print()
print("== audit 15 dòng cuối ==")
for r in con.execute("select action,target,detail_json,created_at from audit_log order by created_at desc limit 15"):
    print("  %-22s %-24s %s" % (r["action"], (r["target"] or "-")[:24], (r["detail_json"] or "")[:70]))
PY
