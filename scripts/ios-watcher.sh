#!/usr/bin/env bash
# Quản lý watcher "khách đăng ký thiết bị → tự ký lại + phát bản iOS mới" trên máy Mac này.
#
#   scripts/ios-watcher.sh start     # bật (nếu chưa chạy)
#   scripts/ios-watcher.sh stop      # tắt
#   scripts/ios-watcher.sh status    # đang chạy? hàng đợi còn máy nào?
#   scripts/ios-watcher.sh logs      # xem log 20 dòng cuối
#   scripts/ios-watcher.sh once      # chạy 1 vòng ngay (không cần bật watcher)
#
# Vì sao cần: bước ký lại IPA chỉ chạy được trên macOS (codesign + khoá chứng chỉ trong keychain),
# nên máy này phải bật khi khách đăng ký. Watcher chạy nền bằng nohup (macOS chặn launchd đọc ổ ngoài
# /Volumes) ⇒ SAU KHI REBOOT phải chạy lại: scripts/ios-watcher.sh start
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; cd "$ROOT"
NODE2="${NODE2:-root@165.101.114.162}"; SSH_KEY="${KEY:-$HOME/.ssh/fpt_vpn_node}"
LOG="${WATCH_LOG:-/tmp/ios-udid-watch.log}"
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=12 -o StrictHostKeyChecking=accept-new); [ -f "$SSH_KEY" ] && SSH_OPTS+=(-i "$SSH_KEY")

queue() {
  local t
  t=$(ssh "${SSH_OPTS[@]}" "$NODE2" 'systemctl show flowvpn-cp -p Environment | tr " " "\n" | grep "^AUTH_TOKEN=" | cut -d= -f2-' 2>/dev/null || true)
  [ -n "$t" ] || { echo "  (không lấy được AUTH_TOKEN từ node-2 — mạng?)"; return 1; }
  ssh "${SSH_OPTS[@]}" "$NODE2" "curl -s -H 'Authorization: Bearer $t' http://127.0.0.1:7778/v1/admin/ios/devices" \
    | python3 -c "import json,sys; d=json.load(sys.stdin); p=[x for x in d['devices'] if not x['built']]; print('  thiết bị: %d | chờ ký lại: %d | buildSerial: %d' % (len(d['devices']), len(p), d['buildSerial'])); [print('   -', x['udid'], x.get('model'), x.get('registeredAt')) for x in p]"
}

case "${1:-status}" in
  start)
    if pgrep -f "ios-udid-watch.sh" >/dev/null 2>&1; then echo "  watcher đang chạy rồi (PID $(pgrep -f ios-udid-watch.sh | head -1))"; exit 0; fi
    nohup bash scripts/ios-udid-watch.sh > "$LOG" 2>&1 &
    sleep 4
    if pgrep -f "ios-udid-watch.sh" >/dev/null 2>&1; then
      echo "  ✔ đã bật watcher (PID $(pgrep -f ios-udid-watch.sh | head -1)) · log: $LOG"; queue
    else
      echo "  ✖ không bật được — xem $LOG"; tail -5 "$LOG"; exit 1
    fi
    ;;
  stop)
    pkill -f "ios-udid-watch.sh" 2>/dev/null && echo "  đã tắt watcher" || echo "  watcher không chạy"
    ;;
  status)
    if pgrep -f "ios-udid-watch.sh" >/dev/null 2>&1; then echo "  watcher: ĐANG CHẠY (PID $(pgrep -f ios-udid-watch.sh | head -1))"; else echo "  watcher: KHÔNG chạy  → bật bằng: scripts/ios-watcher.sh start"; fi
    queue || true
    ;;
  logs) tail -20 "$LOG" 2>/dev/null || echo "  (chưa có log)" ;;
  once) echo "  chạy 1 vòng ngay:"; bash scripts/ios-adhoc-export.sh ;;
  *) echo "usage: $0 [start|stop|status|logs|once]" >&2; exit 2 ;;
esac
