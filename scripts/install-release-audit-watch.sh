#!/usr/bin/env bash
# install-release-audit-watch.sh — cài audit TOÀN KÊNH chạy định kỳ (launchd, macOS).
#
# Sinh plist từ chính đường dẫn checkout hiện tại rồi nạp, nhờ vậy không hard-code đường dẫn máy.
# Mặc định 6 giờ/lần (audit tải ~230 MB mỗi vòng), ghi log JSONL và alert Telegram khi có kênh lệch.
#
#   scripts/install-release-audit-watch.sh                 # cài + nạp
#   scripts/install-release-audit-watch.sh --dry-run       # chỉ in plist, không ghi gì
#   scripts/install-release-audit-watch.sh --uninstall     # gỡ
#   INTERVAL=3600 scripts/install-release-audit-watch.sh   # đổi nhịp (giây)
#   AUDIT_PYTHON=/usr/bin/python3 scripts/...              # đổi python
#
# Chạy từ checkout nhánh `main` (có scripts/audit-releases.py), không phải nhánh sản phẩm khác.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="site.meetflowai.release-audit-watch"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
STATE_DIR="$HOME/.local/state/vpnflow-release-audit"
INTERVAL="${INTERVAL:-21600}"
PYTHON="${AUDIT_PYTHON:-$(command -v python3 || true)}"
MODE="install"

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) MODE="dry"; shift ;;
    --uninstall) MODE="uninstall"; shift ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
    *) echo "tham so la: $1" >&2; exit 2 ;;
  esac
done

if [ "$MODE" = "uninstall" ]; then
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || launchctl unload -w "$PLIST" 2>/dev/null || true
  rm -f "$PLIST"
  echo "Đã gỡ $LABEL"
  exit 0
fi

[ -f "$REPO/scripts/audit-releases.py" ] || {
  echo "không thấy $REPO/scripts/audit-releases.py — chạy từ checkout nhánh main" >&2
  exit 1
}
[ -n "$PYTHON" ] || {
  echo "không thấy python3 (đặt AUDIT_PYTHON=/đường/dẫn/python3)" >&2
  exit 1
}

PLIST_CONTENT="$(cat <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$PYTHON</string>
    <string>$REPO/scripts/audit-releases.py</string>
    <string>--log</string>
    <string>$STATE_DIR/audit.jsonl</string>
    <string>--alert-cmd</string>
    <string>$REPO/scripts/release-audit-alert.sh</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$(dirname "$PYTHON"):/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>HOME</key><string>$HOME</string>
  </dict>
  <key>ProcessType</key><string>Background</string>
  <key>RunAtLoad</key><true/>
  <key>StartInterval</key><integer>$INTERVAL</integer>
  <key>StandardOutPath</key><string>$STATE_DIR/watch.out.log</string>
  <key>StandardErrorPath</key><string>$STATE_DIR/watch.err.log</string>
</dict>
</plist>
EOF
)"

if [ "$MODE" = "dry" ]; then
  printf '%s\n' "$PLIST_CONTENT"
  exit 0
fi

mkdir -p "$STATE_DIR" "$HOME/Library/LaunchAgents"
printf '%s\n' "$PLIST_CONTENT" > "$PLIST"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
if ! launchctl bootstrap "gui/$(id -u)" "$PLIST" 2>/dev/null; then
  launchctl load -w "$PLIST"
fi
if launchctl print "gui/$(id -u)/$LABEL" >/dev/null 2>&1; then
  echo "✅ đã cài $LABEL (mỗi ${INTERVAL}s) — log $STATE_DIR/audit.jsonl"
else
  echo "❌ nạp $LABEL thất bại — kiểm $PLIST" >&2
  exit 1
fi
