#!/usr/bin/env bash
# Wire the Resend API key (already present on node-2 for the control plane) into
# fBuddy's env file, restart, and reset the data so the owner's email becomes
# the first (admin) account. The key value is never printed.
set -u

ENV_FILE=/etc/fbuddy/fbuddy.env
KEY=""
for f in /etc/systemd/system/flowvpn-cp.service.d/*.conf /etc/systemd/system/flowvpn-cp.service; do
  [ -f "$f" ] || continue
  found=$(grep -hoP 'RESEND_API_KEY=\K[^"'"'"' ]+' "$f" 2>/dev/null | head -1)
  if [ -n "${found:-}" ]; then KEY="$found"; SRC="$f"; break; fi
done

if [ -z "$KEY" ]; then
  echo "Không tìm thấy RESEND_API_KEY trên máy này."
  exit 1
fi
echo "Đã lấy được Resend key từ $SRC (độ dài ${#KEY}, không in giá trị)"

# Keep the file at 600 and never duplicate the line.
grep -v '^FBUDDY_RESEND_API_KEY=' "$ENV_FILE" > "$ENV_FILE.tmp" 2>/dev/null || true
printf 'FBUDDY_RESEND_API_KEY=%s\n' "$KEY" >> "$ENV_FILE.tmp"
install -m 600 "$ENV_FILE.tmp" "$ENV_FILE"
rm -f "$ENV_FILE.tmp"
echo "Đã ghi FBUDDY_RESEND_API_KEY vào $ENV_FILE (mode $(stat -c %a "$ENV_FILE"))"

echo
echo "== khởi động lại + kiểm tra mailer =="
systemctl restart fbuddy
sleep 3
curl -s --max-time 8 http://127.0.0.1:7790/api/meta | python3 -c 'import json,sys; d=json.load(sys.stdin); m=d["mailer"]; print("  mailer.configured =", m["configured"], "| provider =", m["provider"], "| from =", m["from"])'

echo
echo "== dọn dữ liệu (email thật sẽ là admin) =="
systemctl stop fbuddy
rm -rf /var/lib/fbuddy/*
install -d -m 755 /var/lib/fbuddy
systemctl start fbuddy
sleep 3
curl -s --max-time 8 http://127.0.0.1:7790/api/meta | python3 -c 'import json,sys; d=json.load(sys.stdin); print("  hasUsers =", d["hasUsers"], "| firstUserIsAdmin =", d["firstUserIsAdmin"])'
