#!/usr/bin/env bash
# harness-patches-install.sh — cài bộ tự-vá theme/brand FlowTech vào ổ TRONG và bật LaunchAgent.
#
# Vì sao phải copy sang ổ trong: launchd (LaunchAgent) bị TCC chặn đọc `/Volumes/BIWIN`
# ("Operation not permitted"), nên agent chạy script trên ổ ngoài sẽ chết im lặng.
# Bản cài: ~/.local/share/harness-patches/{harness-ensure-patches.sh,patches/*,housekeeping/harness-dsh.sh}
#
# 2 LaunchAgent đều trỏ vào BẢN Ổ TRONG này (launchd bị TCC chặn đọc /Volumes/BIWIN):
#   - site.meetflowai.harness-patches: RunAtLoad + StartInterval 900 s + WatchPaths (DSH package.json
#     + dist) — máy ngủ thì launchd gộp nhịp StartInterval, WatchPaths bảo đảm vá ngay khi DSH bị đổi.
#   - site.meetflowai.dsh-housekeeping: Chủ nhật 10:00, lớp dự phòng TUẦN (dọn ~/.dsh + gọi ensure).
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

# ---- Housekeeping: bản sao trên Ổ TRONG (lớp dự phòng TUẦN) ----
# Vì sao: launchd bị TCC chặn đọc /Volumes/BIWIN ⇒ agent `site.meetflowai.dsh-housekeeping` trỏ vào
# repo chết ngay (`/bin/bash: …/harness-dsh.sh: Operation not permitted`, last exit code = 126,
# runs = 0 suốt từ 20/09) ⇒ lớp dự phòng tuần cho bộ tự-vá chưa bao giờ chạy (audit t1/t4/t7).
# NGUỒN SỰ THẬT: `scripts/housekeeping/harness-dsh.sh` trong repo. Bản trong $HOME là BẢN SAO
# (đặt ở $DEST/housekeeping/ để dòng `$(dirname $0)/..` của script trỏ đúng vào bản ensure trên ổ
# trong). Muốn cập nhật: sửa file trong repo rồi chạy lại chính script này — sha256 hai bản phải
# trùng, lệch là DỪNG ngay để không có 2 bản lệch nhau im lặng.
HK_SRC="$REPO_SELF/scripts/housekeeping/harness-dsh.sh"
HK_DEST="$DEST/housekeeping/harness-dsh.sh"
HK_LABEL="site.meetflowai.dsh-housekeeping"
HK_AGENT_DST="$HOME/Library/LaunchAgents/$HK_LABEL.plist"
if [ ! -f "$HK_SRC" ]; then
  echo "LỖI: không thấy $HK_SRC — DỪNG (chưa ghi plist housekeeping)" >&2
  exit 1
fi
mkdir -p "$DEST/housekeeping"
if ! cp "$HK_SRC" "$HK_DEST"; then
  echo "LỖI: copy thất bại: $HK_SRC → $HK_DEST — DỪNG (chưa ghi plist housekeeping)" >&2
  exit 1
fi
chmod +x "$HK_DEST"
HK_SRC_SHA="$(shasum -a 256 "$HK_SRC" | awk '{print $1}')"
HK_DEST_SHA="$(shasum -a 256 "$HK_DEST" | awk '{print $1}')"
if [ "$HK_SRC_SHA" != "$HK_DEST_SHA" ]; then
  echo "LỖI: bản housekeeping trong \$HOME lệch repo ($HK_DEST_SHA ≠ $HK_SRC_SHA) — DỪNG" >&2
  exit 1
fi
echo "housekeeping (ổ trong): $HK_DEST — sha256 ${HK_DEST_SHA:0:12}… trùng repo (nguồn sự thật: $HK_SRC)"

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

# plist housekeeping cũng trỏ vào BẢN Ổ TRONG (không phải /Volumes/BIWIN — TCC chặn). Giữ nguyên
# lịch cũ: Chủ nhật 10:00, --days 30 --apply, RunAtLoad=false.
cat > "$HK_AGENT_DST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$HK_LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$HK_DEST</string>
    <string>--days</string><string>30</string>
    <string>--apply</string>
  </array>
  <!-- Chủ nhật 10:00 hằng tuần; máy ngủ thì chạy bù khi thức (StartCalendarInterval + RunAtLoad=false). -->
  <key>StartCalendarInterval</key>
  <dict><key>Weekday</key><integer>0</integer><key>Hour</key><integer>10</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardOutPath</key><string>/tmp/dsh-housekeeping.log</string>
  <key>StandardErrorPath</key><string>/tmp/dsh-housekeeping.err</string>
  <key>RunAtLoad</key><false/>
</dict>
</plist>
PLIST
plutil -lint "$HK_AGENT_DST" >/dev/null

launchctl unload "$AGENT_DST" 2>/dev/null || true
launchctl load "$AGENT_DST"
launchctl unload "$HK_AGENT_DST" 2>/dev/null || true
launchctl load "$HK_AGENT_DST"
sleep 4
launchctl list | grep "$LABEL" || true
launchctl list | grep "$HK_LABEL" || true
echo "--- log (trong = OK) ---"
tail -5 /tmp/harness-patches.log 2>/dev/null || echo "(chưa có log)"
echo "--- kiểm tra thủ công ---"
bash "$DEST/harness-ensure-patches.sh" --check && echo "KẾT LUẬN: theme/brand FlowTech nguyên vẹn"
echo "--- kiểm lệch repo ↔ bản cài (F7) ---"
HARNESS_REPO_ROOT="$REPO_SELF" bash "$DEST/harness-ensure-patches.sh" --verify-install
echo "--- housekeeping bản ổ trong chạy được? (dry-run, không xoá gì) ---"
bash "$HK_DEST" --days 30 | tail -4
