#!/usr/bin/env bash
# inbox-poller.sh — "thức" agent khi có thông báo mới từ các máy khác qua VPS.
#
# Mô hình 3 lớp (chống mất tin):
#   1. FILE (nguồn sự thật): node-2:/var/lib/flowvpn-coord/inbox/<target>/*.md
#   2. PING người: Telegram (do /usr/local/bin/flowvpn-notify gửi khi publish)
#   3. AWAKE agent (script này): mỗi 30–60s tải file mới về máy mình, chạy lệnh "thức" rồi ghi .ack
#
# Dùng:
#   scripts/notify/inbox-poller.sh --target windows --wake 'dsh --profile headless -p'          # vòng lặp
#   scripts/notify/inbox-poller.sh --target windows --once                                      # 1 lượt (test/cron)
#
# Cài định kỳ:
#   · macOS   : launchd StartInterval 60
#   · Windows : Task Scheduler "FPT-Notify-Poller" (mỗi 1 phút, chạy bash.exe script này)
#   · server  : systemd timer (OnUnitActiveSec=60)
set -uo pipefail

TARGET=""; WAKE=""; ONCE=0; INTERVAL=60
JUMP="${FPT_JUMP:-root@103.173.155.50}"
REMOTE="${FPT_NODE2:-root@165.101.114.162}"
STATE_DIR="${FPT_INBOX_STATE:-$HOME/.flowvpn-inbox}"

while [ $# -gt 0 ]; do
  case "$1" in
    --target) TARGET="${2:-}"; shift 2 ;;
    --wake) WAKE="${2:-}"; shift 2 ;;
    --once) ONCE=1; shift ;;
    --interval) INTERVAL="${2:-60}"; shift 2 ;;
    -h|--help) sed -n '2,16p' "$0"; exit 0 ;;
    *) echo "tham so la: $1" >&2; exit 2 ;;
  esac
done
[ -n "$TARGET" ] || { echo "can --target <mac|windows|server>" >&2; exit 2; }

REMOTE_DIR="/var/lib/flowvpn-coord/inbox/$TARGET"
mkdir -p "$STATE_DIR/seen" "$STATE_DIR/$TARGET"

log() { printf '%s [%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$TARGET" "$*"; }

fetch_once() {
  local files
  files="$(ssh -o BatchMode=yes -o ConnectTimeout=10 -J "$JUMP" "$REMOTE" "ls -1 $REMOTE_DIR/*.md 2>/dev/null" || true)"
  [ -n "$files" ] || return 0

  local remote base local_path
  while IFS= read -r remote; do
    [ -n "$remote" ] || continue
    base="$(basename "$remote")"
    [ -f "$STATE_DIR/seen/$base" ] && continue

    if scp -q -o BatchMode=yes -J "$JUMP" "$REMOTE:$remote" "$STATE_DIR/$TARGET/$base" 2>/dev/null; then
      local_path="$STATE_DIR/$TARGET/$base"
      log "THU MOI: $base ($(wc -c < "$local_path" 2>/dev/null || echo 0) byte)"
      if [ -n "$WAKE" ]; then
        log "thuc agent: $WAKE \"$local_path\""
        bash -c "$WAKE \"$local_path\"" >>"$STATE_DIR/$TARGET/wake.log" 2>&1 || log "lenh thuc tra loi loi (xem wake.log)"
      fi
      touch "$STATE_DIR/seen/$base"
      ssh -o BatchMode=yes -o ConnectTimeout=10 -J "$JUMP" "$REMOTE" "touch '$remote.ack'" 2>/dev/null && log "da ghi ack"
    else
      log "tai that bai: $base (de lan sau)"
    fi
  done <<< "$files"
}

log "bat dau (once=$ONCE, interval=${INTERVAL}s, state=$STATE_DIR)"
if [ "$ONCE" = "1" ]; then
  fetch_once
  log "xong 1 luot"
  exit 0
fi

while true; do
  fetch_once
  sleep "$INTERVAL"
done
