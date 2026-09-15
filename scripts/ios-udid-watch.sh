#!/usr/bin/env bash
# Canh hàng đợi UDID trên server: khách vừa cài hồ sơ là tự KÝ LẠI IPA + phát bản mới.
#
# Vòng lặp mỗi ${INTERVAL:-15} giây: hỏi server "có máy nào chờ ký không" → có thì chạy
# scripts/ios-resign-ipa.sh — **KÝ LẠI, KHÔNG build lại** (tải IPA đang phát → profile mới đủ UDID →
# ký lại → upload → kiểm sha256 → báo server). Chỉ khi CODE app đổi mới cần build lại
# (archive-appstore.sh + ios-adhoc-export.sh); watcher này KHÔNG làm việc đó.
#
# Vì sao phải chạy trên macOS: bước ký cần `codesign` + khoá chứng chỉ trong keychain (Apple không
# cho ký trên Linux). Nếu máy này tắt thì khách vẫn đăng ký được nhưng phải chờ máy bật lại mới có bản cài.
#
# Lệnh:
#   scripts/ios-watcher.sh start|stop|status|logs|once     (khuyến nghị dùng cái này)
#   nohup scripts/ios-udid-watch.sh > /tmp/ios-udid-watch.log 2>&1 &   (chạy thẳng)
#
# Mạng: Mac thường KHÔNG SSH thẳng được node-2 (bị chặn) ⇒ mọi lệnh đi vòng qua node-1.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; cd "$ROOT"

INTERVAL="${INTERVAL:-15}"
NODE1="${NODE1:-root@100.76.147.111}"; NODE2_IP="${NODE2_IP:-165.101.114.162}"
SSH_KEY="${KEY:-$HOME/.ssh/fpt_tunnel}"
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=12 -o StrictHostKeyChecking=accept-new)
[ -f "$SSH_KEY" ] && SSH_OPTS+=(-i "$SSH_KEY")
LOCK=/tmp/ios-udid-watch.lock
PIDFILE=/tmp/ios-udid-watch.pid

# Chạy một script (stdin) trên node-2, đi vòng qua node-1.
on2() { ssh "${SSH_OPTS[@]}" "$NODE1" "ssh -o BatchMode=yes -o ConnectTimeout=12 root@$NODE2_IP 'bash -s'"; }

echo $$ > "$PIDFILE"
log() { printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$*"; }
log "bắt đầu canh UDID mỗi ${INTERVAL}s (PID $$)"

while true; do
  TOKEN=$(on2 <<'EOS' 2>/dev/null || true
systemctl show flowvpn-cp -p Environment | tr " " "\n" | grep "^AUTH_TOKEN=" | cut -d= -f2-
EOS
)
  if [ -z "${TOKEN:-}" ]; then
    log "không lấy được token (server/mạng?) — thử lại sau"
    sleep "$INTERVAL"; continue
  fi

  PENDING=$(on2 <<EOS 2>/dev/null | python3 -c '
import json,sys
try: d=json.load(sys.stdin)
except Exception: print(0); raise SystemExit
print(sum(1 for x in d.get("devices",[]) if not x.get("built")))'
curl -s --max-time 10 -H "Authorization: Bearer $TOKEN" http://127.0.0.1:7778/v1/admin/ios/devices
EOS
)
  PENDING="${PENDING:-0}"

  if [ "$PENDING" -gt 0 ]; then
    log "có $PENDING máy đang chờ — ký lại (không build lại)"
    if mkdir "$LOCK" 2>/dev/null; then
      if bash scripts/ios-resign-ipa.sh; then
        log "xong: $PENDING máy đã được ký — trang cài của khách tự hiện nút Tải & cài"
      else
        log "LỖI khi ký lại (xem log trên) — sẽ thử lại vòng sau"
      fi
      rmdir "$LOCK" 2>/dev/null || true
    else
      log "vòng trước còn đang ký — bỏ qua vòng này"
    fi
  fi
  sleep "$INTERVAL"
done
