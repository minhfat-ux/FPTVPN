#!/usr/bin/env bash
# Một vòng canh hàng đợi UDID TRÊN SERVER: có máy chờ ký ⇒ ký lại IPA bằng zsign (không build lại).
# Được gọi bởi flowvpn-sign.timer mỗi 15 giây (thay cho watcher chạy trên máy Mac).
set -euo pipefail
SIGN_DIR="${SIGN_DIR:-/root/flowvpn-sign}"
LOCK="$SIGN_DIR/.lock"
LOG() { printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$*"; }

[ -f "$SIGN_DIR/dist.p12" ] || { echo "chưa có dist.p12 — bỏ qua (xem make-p12.sh)"; exit 0; }

T=$(systemctl show -p Environment flowvpn-cp | tr " " "\n" | sed -n 's/^AUTH_TOKEN=//p' | head -1)
[ -n "$T" ] || { echo "không lấy được AUTH_TOKEN"; exit 0; }

PENDING=$(curl -s --max-time 10 -H "Authorization: Bearer $T" http://127.0.0.1:7778/v1/admin/ios/devices \
  | python3 -c 'import json,sys
try: d=json.load(sys.stdin)
except Exception: print(0); raise SystemExit
print(sum(1 for x in d.get("devices",[]) if not x.get("built")))')
[ "${PENDING:-0}" -gt 0 ] || exit 0

if ! mkdir "$LOCK" 2>/dev/null; then LOG "vòng trước còn chạy — bỏ qua"; exit 0; fi
trap 'rmdir "$LOCK" 2>/dev/null || true' EXIT

LOG "có $PENDING máy chờ — ký lại trên server (zsign)"
if bash "$SIGN_DIR/resign-ipa.sh"; then
  LOG "xong: khách mở trang cài là thấy nút Tải & cài"
else
  LOG "LỖI khi ký lại — xem log trên"
fi
