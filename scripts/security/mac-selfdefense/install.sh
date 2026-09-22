#!/bin/bash
# Cài mac-selfdefense thành LaunchAgent chạy thường trực.
#
# Vì sao COPY vào ~/.local/share thay vì chạy thẳng từ repo: repo nằm trên volume rời
# /Volumes/BIWIN — volume unmount là launchd không khởi động được, cơ chế tự bảo vệ chết
# đúng lúc cần nhất. Bản chạy phải nằm trên đĩa trong máy.
#
#   install.sh              cài / cập nhật
#   install.sh --dry-run    in ra sẽ làm gì
#   install.sh --uninstall  gỡ
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="$HOME/.local/share/mac-selfdefense"
STATE="$HOME/.local/state/mac-selfdefense"
CONF_DIR="$HOME/.config/mac-selfdefense"
LA="$HOME/Library/LaunchAgents"
NODE_BIN="/opt/homebrew/bin/node"
LABEL="site.meetflowai.mac-selfdefense"
LABEL_WD="site.meetflowai.mac-selfdefense-watchdog"
UID_NUM="$(id -u)"
DRY=0
ACTION=install

for a in "$@"; do
  case "$a" in
    --dry-run) DRY=1 ;;
    --uninstall) ACTION=uninstall ;;
    *) echo "tham số lạ: $a" >&2; exit 2 ;;
  esac
done

run() { if [ "$DRY" = "1" ]; then echo "  [dry-run] $*"; else "$@"; fi; }

if [ "$ACTION" = "uninstall" ]; then
  run launchctl bootout "gui/$UID_NUM/$LABEL" 2>/dev/null || true
  run launchctl bootout "gui/$UID_NUM/$LABEL_WD" 2>/dev/null || true
  run rm -f "$LA/$LABEL.plist" "$LA/$LABEL_WD.plist"
  echo "Đã gỡ LaunchAgent. Bản chạy vẫn còn ở $DEST (xoá tay nếu muốn)."
  exit 0
fi

command -v "$NODE_BIN" >/dev/null || { echo "Không thấy $NODE_BIN" >&2; exit 1; }

echo "1) Cài bản chạy → $DEST"
run mkdir -p "$DEST/lib" "$STATE/logs" "$CONF_DIR"
run cp "$SRC/selfdefense.mjs" "$DEST/"
run cp "$SRC/iocs.json" "$DEST/"
if [ "$DRY" = "1" ]; then echo "  [dry-run] cp $SRC/lib/*.mjs $DEST/lib/"; else cp "$SRC"/lib/*.mjs "$DEST/lib/"; fi
[ -f "$CONF_DIR/config.json" ] || { echo "  tạo config mặc định"; run cp "$SRC/config.example.json" "$CONF_DIR/config.json"; }

write_plist() {
  local label="$1" out="$2" args_xml="$3" extra="$4"
  cat > "$out" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$label</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>$DEST/selfdefense.mjs</string>
$args_xml
  </array>
  <key>WorkingDirectory</key><string>$DEST</string>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>$STATE/logs/$label.out.log</string>
  <key>StandardErrorPath</key><string>$STATE/logs/$label.err.log</string>
$extra
</dict>
</plist>
PLIST
}

echo "2) Ghi LaunchAgent"
if [ "$DRY" = "1" ]; then
  echo "  [dry-run] ghi $LA/$LABEL.plist (run, KeepAlive) và $LA/$LABEL_WD.plist (watchdog, 300s)"
else
  mkdir -p "$LA"
  write_plist "$LABEL" "$LA/$LABEL.plist" "    <string>run</string>" \
    "  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>15</integer>
  <key>Nice</key><integer>5</integer>"
  write_plist "$LABEL_WD" "$LA/$LABEL_WD.plist" "    <string>watchdog</string>" \
    "  <key>RunAtLoad</key><true/>
  <key>StartInterval</key><integer>300</integer>"
fi

echo "3) Nạp vào launchd"
# bootout là bất đồng bộ: bootstrap ngay sau đó có thể lỗi "5: Input/output error"
# vì launchd chưa nhả label. Phải đợi job biến mất rồi mới nạp.
wait_gone() {
  local label="$1" i
  for i in $(seq 1 30); do
    launchctl print "gui/$UID_NUM/$label" >/dev/null 2>&1 || return 0
    sleep 0.5
  done
  return 1
}

load_job() {
  local label="$1" plist="$2" i
  [ "$DRY" = "1" ] && { echo "  [dry-run] load $label"; return 0; }
  launchctl bootout "gui/$UID_NUM/$label" 2>/dev/null || true
  wait_gone "$label" || true
  for i in 1 2 3 4 5; do
    if launchctl bootstrap "gui/$UID_NUM" "$plist" 2>/dev/null; then
      echo "  nạp OK: $label"
      return 0
    fi
    # Job có thể vẫn tồn tại dù bootstrap báo lỗi (launchd hay trả EIO khi vừa bootout).
    # Khi đó chỉ cần khởi động lại nó thay vì nạp mới.
    if launchctl print "gui/$UID_NUM/$label" >/dev/null 2>&1; then
      if launchctl kickstart -k "gui/$UID_NUM/$label" 2>/dev/null; then
        echo "  nạp OK (kickstart): $label"
        return 0
      fi
    fi
    sleep "$i"
    launchctl bootout "gui/$UID_NUM/$label" 2>/dev/null || true
    wait_gone "$label" || true
  done
  echo "  LỖI nạp: $label (thử tay: launchctl bootstrap gui/$UID_NUM $plist)" >&2
  return 1
}

run_twice_ok=0
load_job "$LABEL" "$LA/$LABEL.plist" || run_twice_ok=1
load_job "$LABEL_WD" "$LA/$LABEL_WD.plist" || run_twice_ok=1
[ "$run_twice_ok" = "1" ] && echo "  (có job nạp lỗi — xem hướng dẫn ở trên)" >&2 || true

echo "4) Tin thử Telegram"
if [ "$DRY" = "1" ]; then echo "  [dry-run] node $DEST/selfdefense.mjs test-alert"; else "$NODE_BIN" "$DEST/selfdefense.mjs" test-alert || true; fi

echo
echo "Xong. Kiểm tra: $NODE_BIN $DEST/selfdefense.mjs status"
