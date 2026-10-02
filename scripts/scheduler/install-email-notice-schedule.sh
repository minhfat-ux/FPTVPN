#!/usr/bin/env bash
# Cài LaunchAgent chạy scripts/scheduler/email-notice-2026-10.sh mỗi ngày 09:00.
#
#   bash scripts/scheduler/install-email-notice-schedule.sh            # cài/ghi đè + nạp
#   bash scripts/scheduler/install-email-notice-schedule.sh --uninstall
#
# Vì sao copy sang Ổ TRONG (~/.local/share/flowvpn-scheduler): launchd bị TCC chặn đọc /Volumes
# (repo nằm trên ổ BIWIN) — ca thật 25/09/2026 với harness-dsh.sh: exit 126, runs = 0.
# Script chạy bằng /bin/bash (macOS 3.2) nên không dùng cú pháp bash 4+.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="$REPO_DIR/scripts/scheduler/email-notice-2026-10.sh"
DEST_DIR="$HOME/.local/share/flowvpn-scheduler"
DEST="$DEST_DIR/email-notice-2026-10.sh"
LABEL="site.meetflowai.email-notice-schedule"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
UID_NUM="$(id -u)"

if [ "${1:-}" = "--uninstall" ]; then
  launchctl bootout "gui/$UID_NUM/$LABEL" 2>/dev/null || true
  rm -f "$PLIST"
  echo "đã gỡ $LABEL (script trong $DEST_DIR vẫn giữ)"
  exit 0
fi

[ -f "$SRC" ] || { echo "KHÔNG thấy $SRC" >&2; exit 1; }
mkdir -p "$DEST_DIR/logs" "$(dirname "$PLIST")"
cp "$SRC" "$DEST"; chmod 755 "$DEST"
echo "đã copy script -> $DEST"

cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<!-- Sinh bởi scripts/scheduler/install-email-notice-schedule.sh — ĐỪNG sửa tay.
     Nhắc lịch đợt "bắt buộc đăng ký email" (MeetFlow AI): 06-09/10 nhắc chuẩn bị, 10/10 ngày
     publish, 11-14/10 đếm ngược, 15/10 ngày khoá. Script CHỈ đọc + Telegram, không publish. -->
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$DEST</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>9</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardOutPath</key><string>$DEST_DIR/logs/launchd.out.log</string>
  <key>StandardErrorPath</key><string>$DEST_DIR/logs/launchd.err.log</string>
  <key>RunAtLoad</key><false/>
</dict>
</plist>
PLISTEOF
plutil -lint "$PLIST" >/dev/null && echo "plist hợp lệ: $PLIST"

launchctl bootout "gui/$UID_NUM/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$UID_NUM" "$PLIST"
echo "=== trạng thái agent ==="
launchctl print "gui/$UID_NUM/$LABEL" 2>/dev/null | grep -E "state =|program =|runs =|last exit code" | head -6
echo "=== chạy thử --dry-run (không gửi Telegram) ==="
/bin/bash "$DEST" --dry-run | tail -6
