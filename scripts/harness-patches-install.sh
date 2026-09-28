#!/usr/bin/env bash
# harness-patches-install.sh — cài bộ tự-vá theme/brand FlowTech vào ổ TRONG và bật LaunchAgent.
#
# Vì sao phải copy sang ổ trong: launchd (LaunchAgent) bị TCC chặn đọc `/Volumes/BIWIN`
# ("Operation not permitted"), nên agent chạy script trên ổ ngoài sẽ chết im lặng.
# Bản cài: ~/.local/share/harness-patches/{harness-ensure-patches.sh,patches/*}
#
# LaunchAgent: RunAtLoad + StartInterval 900 s + WatchPaths (package.json + dist của DSH) — máy ngủ thì
# launchd gộp nhịp StartInterval, WatchPaths bảo đảm vá ngay khi DSH bị đổi/nâng cấp lúc máy thức.
#
# Chạy lại script này mỗi khi sửa script/patch trong repo; cuối script có `--verify-install` so sha256
# để chắc bản trong $HOME đúng bằng repo.
set -euo pipefail

REPO_SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$HOME/.local/share/harness-patches"
AGENT_SRC="$REPO_SELF/.dhs-setup/fpt-harness-package/mac/site.meetflowai.harness-patches.plist"
AGENT_DST="$HOME/Library/LaunchAgents/site.meetflowai.harness-patches.plist"
LABEL="site.meetflowai.harness-patches"

# Đường dẫn DSH đang cài — dùng cho WatchPaths: launchd gộp nhịp StartInterval khi máy ngủ (F6), nên
# phải chạy NGAY khi DSH bị thay/nâng cấp (package.json + dist) chứ không tin vào 900 s.
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
NPM_ROOT="$(npm root -g 2>/dev/null || true)"
DSH_ROOT="${DSH_ROOT:-${NPM_ROOT:-/opt/homebrew/lib/node_modules}/@deepseek-ai/dsh}"
DSH_PKG="$DSH_ROOT/package.json"
DSH_DIST="$DSH_ROOT/node_modules/@deepseek-ai/dsh-web-frontend/dist"
DSH_SCOPE="$(dirname "$DSH_ROOT")"   # .../node_modules/@deepseek-ai — đổi khi `npm i -g` thay cả package

mkdir -p "$DEST/patches"
cp "$REPO_SELF/scripts/harness-ensure-patches.sh" "$DEST/"
# Chỉ copy FILE ở mức 1 (glob `patches/*` bỏ file ẩn). Bản cũ `cp patches/*` làm cả script chết vì
# `set -e` khi gặp thư mục con — thật đã gặp `__pycache__` do `python3 -m py_compile` tạo: installer
# exit 1 rồi KHÔNG reload LaunchAgent ⇒ fix không sống mà không ai biết. Thư mục con bị bỏ qua có ý
# thức; còn lỗi copy THẬT (DEST không ghi được, hết đĩa…) vẫn phải DỪNG và in rõ.
copied=0
for f in "$REPO_SELF"/.dhs-setup/fpt-harness-package/patches/*; do
  [ -f "$f" ] || continue
  if ! cp "$f" "$DEST/patches/"; then
    echo "LỖI: copy thất bại: $f → $DEST/patches/ — DỪNG (chưa ghi plist / chưa reload LaunchAgent)" >&2
    exit 1
  fi
  copied=$((copied + 1))
done
if [ "$copied" -eq 0 ]; then
  echo "LỖI: không thấy file patch nào trong $REPO_SELF/.dhs-setup/fpt-harness-package/patches — DỪNG" >&2
  exit 1
fi
chmod +x "$DEST/harness-ensure-patches.sh"
echo "Đã copy sang $DEST ($copied file patch ở mức 1):"
ls -1 "$DEST" "$DEST/patches" | head -14

# WatchPaths: chỉ ghi path đang tồn tại — launchd từ chối nạp job có WatchPaths trỏ vào path không có.
WATCH_XML=""
for p in "$DSH_PKG" "$DSH_DIST" "$DSH_SCOPE"; do
  if [ -e "$p" ]; then
    WATCH_XML="${WATCH_XML}    <string>${p}</string>
"
  fi
done
WATCH_BLOCK=""
if [ -z "$WATCH_XML" ]; then
  echo "CẢNH BÁO: không thấy đường dẫn DSH nào ⇒ không có WatchPaths (chỉ còn StartInterval 900 s)." >&2
else
  WATCH_BLOCK="  <key>WatchPaths</key>
  <array>
${WATCH_XML}  </array>
"
fi

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
${WATCH_BLOCK}  <key>StartInterval</key><integer>900</integer>
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
echo "--- kiểm lệch repo ↔ bản cài (F7) ---"
HARNESS_REPO_ROOT="$REPO_SELF" bash "$DEST/harness-ensure-patches.sh" --verify-install
