#!/usr/bin/env bash
# inbox-poller.sh — "thức" agent khi có thông báo mới từ các máy khác qua VPS.
#
# Mô hình 3 lớp (chống mất tin):
#   1. FILE (nguồn sự thật): node-2:/var/lib/flowvpn-coord/inbox/<target>/*.md
#   2. PING người: Telegram (do /usr/local/bin/flowvpn-notify gửi khi publish)
#   3. AWAKE agent (script này): mỗi 30–60s tải file mới về máy mình, chạy lệnh "thức" rồi ghi .ack
#
# Dùng:
#   scripts/notify/inbox-poller.sh --target mac --once                                       # 1 lượt
#   scripts/notify/inbox-poller.sh --target mac --wake '/opt/homebrew/bin/dsh --profile headless -p'
#   scripts/notify/inbox-poller.sh --target mac --once --no-ping                             # dọn tồn đọng
#
# Đường SSH khác nhau theo máy (xem PROTOCOL.md §4) — khai báo bằng biến môi trường:
#   Mac     : FPT_JUMP=""  FPT_SSH_IDENTITY="$HOME/.ssh/fpt_vpn_node"
#             (nối THẲNG node-2 bằng khoá riêng — root@node-2 không nhận khoá mặc định)
#   Windows : để mặc định (đi qua jump host node-1)
#
# Cài định kỳ:
#   · macOS   : launchd StartInterval 60
#   · Windows : Task Scheduler "FPT-Notify-Poller" (mỗi 1 phút, chạy bash.exe script này)
#   · server  : systemd timer (OnUnitActiveSec=60)
set -uo pipefail

TARGET=""; WAKE=""; ONCE=0; INTERVAL=60; PING=1
# Dùng `-` chứ KHÔNG phải `:-`: FPT_JUMP="" phải có nghĩa "nối thẳng, không qua jump host".
JUMP="${FPT_JUMP-root@103.173.155.50}"
REMOTE="${FPT_NODE2:-root@165.101.114.162}"
STATE_DIR="${FPT_INBOX_STATE:-$HOME/.flowvpn-inbox}"

# Tuỳ chọn SSH. Mac cần thêm -i vì root@node-2 chỉ nhận khoá fpt_vpn_node/fpt_tunnel;
# thiếu -i sẽ báo "Permission denied (publickey,password)".
# ServerAlive* chặn trường hợp kết nối "sống nhưng đứng": ConnectTimeout chỉ giới hạn lúc
# bắt tay, còn một SSH treo giữa chừng sẽ giữ poller kẹt vô hạn (launchd không mở phiên mới).
SSH_COMMON=(-o BatchMode=yes -o ConnectTimeout=10 -o ServerAliveInterval=15 -o ServerAliveCountMax=3)
[ -n "$JUMP" ] && SSH_COMMON+=(-J "$JUMP")
[ -n "${FPT_SSH_IDENTITY:-}" ] && SSH_COMMON+=(-i "$FPT_SSH_IDENTITY")

# `-n` là BẮT BUỘC: vòng lặp bên dưới đọc danh sách file từ stdin, mà ssh mặc định cũng đọc
# stdin ⇒ ssh ăn hết phần còn lại của danh sách, mỗi lượt chỉ xử lý được ĐÚNG 1 file.
# (scp không có cờ -n nên dùng bộ tuỳ chọn riêng.)
SSH_OPTS=(-n "${SSH_COMMON[@]}")
SCP_OPTS=("${SSH_COMMON[@]}")

while [ $# -gt 0 ]; do
  case "$1" in
    --target) TARGET="${2:-}"; shift 2 ;;
    --wake) WAKE="${2:-}"; shift 2 ;;
    --once) ONCE=1; shift ;;
    --interval) INTERVAL="${2:-60}"; shift 2 ;;
    --no-ping) PING=0; shift ;;
    -h|--help) sed -n '2,24p' "$0"; exit 0 ;;
    *) echo "tham so la: $1" >&2; exit 2 ;;
  esac
done
[ -n "$TARGET" ] || { echo "can --target <mac|windows|server>" >&2; exit 2; }

REMOTE_DIR="/var/lib/flowvpn-coord/inbox/$TARGET"
# "Nhịp tim" ghi lên node-2 mỗi vòng, để lệnh /wakeup trên Telegram biết máy này đang THỨC hay
# đang NGỦ. Cần thật vì trên mạng công ty không có cách nào đánh thức Mac từ VPS (không có
# quyền forward cổng ở router) — thay vì hứa suông, bot nói đúng trạng thái.
ALIVE_FILE="${FPT_ALIVE_FILE:-/var/lib/flowvpn-coord/inbox/$TARGET/.alive.json}"
mkdir -p "$STATE_DIR/seen" "$STATE_DIR/$TARGET"

log() { printf '%s [%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$TARGET" "$*"; }

# Trạng thái máy này, JSON một dòng. `ac` = đang cắm sạc; `nosleep` = có tiến trình chặn ngủ.
heartbeat_json() {
  local ac=false nosleep=false
  pmset -g ps 2>/dev/null | head -1 | grep -q "AC Power" && ac=true
  pgrep -f "caffeinate -s" >/dev/null 2>&1 && nosleep=true
  printf '{"epoch":%s,"ts":"%s","host":"%s","target":"%s","ac":%s,"nosleep":%s}' \
    "$(date +%s)" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(hostname -s)" "$TARGET" "$ac" "$nosleep"
}

# Tiêu đề ngắn của một file việc: dòng không rỗng đầu tiên, bỏ dấu # đầu dòng.
title_of() { sed -e 's/^#\+\s*//' -e '/^[[:space:]]*$/d' "$1" 2>/dev/null | head -n 1 | cut -c1-90; }

# Gửi 1 tin Telegram qua node-2 (bot @Minhnb2_bot, hàm --ping của flowvpn-notify).
# Đây là kênh "báo lại cho bên giao việc biết đã nhận": chỉ gửi, KHÔNG ghi thêm file inbox.
# Lỗi mạng thì chỉ ghi log — không được làm hỏng vòng poll.
notify_ping() {
  local text="$1" out
  [ "$PING" = "1" ] || { log "ping Telegram: bo qua (--no-ping)"; return 0; }
  out="$(ssh "${SSH_OPTS[@]}" "$REMOTE" \
        "flowvpn-notify --ping $(printf '%q' "$text")" 2>&1)" \
    || { log "ping Telegram that bai (bo qua)"; return 0; }
  log "ping Telegram: $(printf '%s' "$out" | tr '\n' ' ' | cut -c1-160)"
}

fetch_once() {
  local files
  # Gộp nhịp tim + liệt kê file vào CHUNG 1 lần SSH: thêm một SSH riêng mỗi vòng là quá đắt.
  # Dùng SSH_COMMON (KHÔNG có -n) vì cần đẩy JSON qua stdin cho `tee`. Lệnh này chạy TRƯỚC
  # vòng `while read` nên không nuốt mất danh sách file.
  files="$(heartbeat_json | ssh "${SSH_COMMON[@]}" "$REMOTE" \
      "tee $ALIVE_FILE >/dev/null; ls -1 $REMOTE_DIR/*.md 2>/dev/null" || true)"
  [ -n "$files" ] || return 0

  local remote base local_path
  while IFS= read -r remote; do
    [ -n "$remote" ] || continue
    base="$(basename "$remote")"
    [ -f "$STATE_DIR/seen/$base" ] && continue

    if scp -q "${SCP_OPTS[@]}" "$REMOTE:$remote" "$STATE_DIR/$TARGET/$base" 2>/dev/null; then
      local_path="$STATE_DIR/$TARGET/$base"
      log "THU MOI: $base ($(wc -c < "$local_path" 2>/dev/null || echo 0) byte)"
      if [ -n "$WAKE" ]; then
        log "thuc agent: $WAKE \"$local_path\""
        bash -c "$WAKE \"$local_path\"" >>"$STATE_DIR/$TARGET/wake.log" 2>&1 || log "lenh thuc tra loi loi (xem wake.log)"
      fi
      touch "$STATE_DIR/seen/$base"
      if ssh "${SSH_OPTS[@]}" "$REMOTE" "touch '$remote.ack'" 2>/dev/null; then
        log "da ghi ack"
        # Báo lại qua Telegram NGAY khi đã nhận (đúng yêu cầu: hai bên xác nhận thì phải
        # thấy trên Telegram là "đã nhận"), kèm tiêu đề việc để người đọc biết là việc nào.
        notify_ping "📥 [$TARGET] đã nhận việc: $base
$(title_of "$local_path")"
      else
        log "ghi ack that bai (de lan sau)"
      fi
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
