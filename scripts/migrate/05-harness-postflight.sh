#!/bin/bash
# B6 — Sau cutover: kiểm tra tham chiếu + bật lại harness.
#
# Chạy SAU `04-cutover.sh` (đã đổi tên volume mới thành BIWIN).
# Dùng: ./05-harness-postflight.sh
set -uo pipefail

SRC="${SRC:-/Volumes/BIWIN}"
HERE="$(cd "$(dirname "$0")" && pwd)"
FAIL=0
log() { printf '  %s\n' "$*"; }
ok()  { printf '  OK    %s\n' "$*"; }
bad() { printf '  LỖI   %s\n' "$*"; FAIL=1; }

echo "== B6 postflight ==========================================="
log "SRC = $SRC"
echo

echo "1) Volume mới đã đúng chỗ chưa"
if [ -d "$SRC" ]; then
  fs="$(diskutil info "$SRC" 2>/dev/null | awk -F: '/File System Personality/{gsub(/^ +/,"",$2); print $2}')"
  size="$(df -h "$SRC" | awk 'NR==2{print $2}')"
  dev="$(df -P "$SRC" | awk 'NR==2{print $1}')"
  log "device=$dev  fs=${fs:-?}  size=$size"
  case "${fs:-}" in
    APFS*) ok "đúng APFS (ổ cũ là ExFAT)" ;;
    ExFAT*|*NTFS*|*FAT*) bad "VẪN LÀ ${fs} — cutover chưa xong?" ;;
    *) log "không đọc được loại filesystem — kiểm tra tay" ;;
  esac
else
  bad "không thấy $SRC"
fi
echo

echo "2) Tham chiếu đường dẫn còn đúng không"
# Chỉ kiểm những thứ ĐÃ BIẾT là trỏ vào ổ này; không quét cả cây (rất chậm).
for p in "$SRC/SourcesCode" "$SRC/SourcesCode/PrivateVPN/scripts/coord/flowvpn-coord.mjs" \
         "$SRC/SourcesCode/Culi/bin/culi-report.sh"; do
  [ -e "$p" ] && ok "có: ${p}" || bad "THIẾU: $p"
done

echo
echo "3) crontab trỏ đúng chưa"
CRON_HITS="$(crontab -l 2>/dev/null | grep -F "$SRC" || true)"
if [ -z "$CRON_HITS" ]; then
  log "không có dòng crontab nào chạm $SRC (nếu vừa --stop thì nhớ --resume)"
else
  missing=0
  while IFS= read -r line; do
    # lấy token đầu tiên trông như đường dẫn tuyệt đối trong $SRC
    for tok in $(printf '%s' "$line" | tr ' ' '\n' | grep -F "$SRC" || true); do
      [ -e "$tok" ] || { bad "crontab trỏ vào file không tồn tại: $tok"; missing=1; }
    done
  done <<< "$CRON_HITS"
  [ "$missing" = 0 ] && ok "mọi đường dẫn trong crontab đều tồn tại"
fi

echo
echo "4) Vault của mac-selfdefense (nằm trong $SRC/SourcesCode/_quarantine)"
Q="$SRC/SourcesCode/_quarantine"
if [ -d "$Q" ]; then
  n=$(find "$Q" -maxdepth 2 -type d 2>/dev/null | wc -l | tr -d ' ')
  ok "vault còn nguyên ($n thư mục cấp ≤2)"
else
  log "chưa có $Q (chưa từng cách ly gì, hoặc đường dẫn đã đổi)"
fi

echo
echo "5) Bật lại harness"
bash "$HERE/00-harness-preflight.sh" --resume 2>&1 | sed 's/^/  /'

echo
echo "6) Kiểm tra sống"
if [ -x "$HOME/.local/share/mac-selfdefense/selfdefense.mjs" ]; then
  node "$HOME/.local/share/mac-selfdefense/selfdefense.mjs" status 2>&1 | head -4 | sed 's/^/  /'
fi
launchctl list 2>/dev/null | grep -E "mac-selfdefense|notify-poller|keepawake" | sed 's/^/  /'

echo
echo "7) Việc còn lại của người"
log "- Build lại node_modules/DerivedData trên ổ mới (MODE=code đã bỏ chúng có chủ đích)."
log "- Mở 1 session DSH mới với cwd trong $SRC, xác nhận lịch sử/đường dẫn vẫn nhận."
log "- GIỮ Ổ CŨ 1–2 TUẦN, CHƯA FORMAT — rollback chỉ cần cắm lại và đổi tên ngược."
echo
[ "$FAIL" = 0 ] && echo "==> postflight: không thấy vấn đề." || echo "==> postflight: CÓ VẤN ĐỀ ở mục đánh dấu LỖI."
exit "$FAIL"
