#!/usr/bin/env bash
# harness-patches-install.sh — cài bộ tự-vá theme/brand FlowTech vào ổ TRONG và bật LaunchAgent.
#
# Vì sao phải copy sang ổ trong: launchd (LaunchAgent) bị TCC chặn đọc `/Volumes/BIWIN`
# ("Operation not permitted"), nên agent chạy script trên ổ ngoài sẽ chết im lặng.
# Bản cài: ~/.local/share/harness-patches/{harness-ensure-patches.sh,patches/*}
#
# Chạy lại script này mỗi khi sửa script/patch trong repo.
set -euo pipefail

REPO_SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$HOME/.local/share/harness-patches"
AGENT_SRC="$REPO_SELF/.dhs-setup/fpt-harness-package/mac/site.meetflowai.harness-patches.plist"
AGENT_DST="$HOME/Library/LaunchAgents/site.meetflowai.harness-patches.plist"
LABEL="site.meetflowai.harness-patches"

mkdir -p "$DEST/patches"
cp "$REPO_SELF/scripts/harness-ensure-patches.sh" "$DEST/"
cp "$REPO_SELF"/.dhs-setup/fpt-harness-package/patches/* "$DEST/patches/"
chmod +x "$DEST/harness-ensure-patches.sh"
echo "Đã copy sang $DEST:"
ls -1 "$DEST" "$DEST/patches" | head -14

# plist trỏ vào bản trên ổ trong (khác template trong repo — template ghi path ổ trong luôn).
cat > "$AGENT_DST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$DEST/harness-ensure-patches.sh</string>
    <string>--quiet</string>
    <string>--notify</string>
  </array>
  <key>StartInterval</key><integer>900</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>/tmp/harness-patches.log</string>
  <key>StandardErrorPath</key><string>/tmp/harness-patches.log</string>
</dict>
</plist>
PLIST
plutil -lint "$AGENT_DST" >/dev/null

launchctl unload "$AGENT_DST" 2>/dev/null || true
launchctl load "$AGENT_DST"
sleep 4
launchctl list | grep "$LABEL" || true
echo "--- log (trong = OK) ---"
tail -5 /tmp/harness-patches.log 2>/dev/null || echo "(chưa có log)"
echo "--- kiểm tra thủ công ---"
bash "$DEST/harness-ensure-patches.sh" --check && echo "KẾT LUẬN: theme/brand FlowTech nguyên vẹn"
