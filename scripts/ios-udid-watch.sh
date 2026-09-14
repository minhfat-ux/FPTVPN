#!/usr/bin/env bash
# Canh hàng đợi UDID trên server: khách vừa đăng ký thiết bị là tự ký lại IPA + phát bản mới.
#
# Chạy trên máy Mac (cần Xcode cho codesign). Để chạy nền:
#   nohup scripts/ios-udid-watch.sh > /tmp/ios-udid-watch.log 2>&1 &
# Dừng: kill theo PID trong /tmp/ios-udid-watch.pid
#
# Vòng lặp: mỗi ${INTERVAL:-60} giây hỏi server "có máy nào chờ ký lại không" → có thì chạy
# scripts/ios-adhoc-export.sh (tạo/cập nhật profile ad-hoc đủ UDID → export → Diawi → đổi link →
# báo server) ⇒ trang chờ của khách tự hiện nút Cài đặt.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; cd "$ROOT"
INTERVAL="${INTERVAL:-60}"
NODE2="${NODE2:-root@165.101.114.162}"; SSH_KEY="${KEY:-$HOME/.ssh/fpt_vpn_node}"
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=12 -o StrictHostKeyChecking=accept-new); [ -f "$SSH_KEY" ] && SSH_OPTS+=(-i "$SSH_KEY")
echo $$ > /tmp/ios-udid-watch.pid
log() { printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$*"; }
log "bắt đầu canh UDID mỗi ${INTERVAL}s (PID $$)"

while true; do
  T=$(ssh "${SSH_OPTS[@]}" "$NODE2" 'systemctl show flowvpn-cp -p Environment | tr " " "\n" | grep "^AUTH_TOKEN=" | cut -d= -f2-' 2>/dev/null || true)
  if [ -z "$T" ]; then log "không lấy được token (server/mạng?) — thử lại sau"; sleep "$INTERVAL"; continue; fi
  PENDING=$(ssh "${SSH_OPTS[@]}" "$NODE2" "curl -s -H 'Authorization: Bearer $T' http://127.0.0.1:7778/v1/admin/ios/devices" | python3 -c '
import json,sys
try: d=json.load(sys.stdin)
except Exception: print(0); raise SystemExit
print(sum(1 for x in d.get("devices",[]) if not x.get("built")))' || echo 0)
  if [ "${PENDING:-0}" -gt 0 ]; then
    log "có $PENDING máy đang chờ — ký lại + phát bản mới"
    if bash scripts/ios-adhoc-export.sh; then log "xong: khách mở lại /install/ios là cài được";
    else log "LỖI khi export (xem log trên) — sẽ thử lại vòng sau"; fi
  fi
  sleep "$INTERVAL"
done
