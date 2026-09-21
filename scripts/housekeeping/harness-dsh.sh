#!/usr/bin/env bash
# Housekeeping cho dữ liệu harness DSH trên máy Mac (chạy tay hoặc theo lịch).
#
#   bash scripts/housekeeping/harness-dsh.sh                 # DRY-RUN (mặc định)
#   bash scripts/housekeeping/harness-dsh.sh --apply         # xoá thật
#   bash scripts/housekeeping/harness-dsh.sh --days 14 --apply
#
# Vì sao cần (đo 20/09/2026): ~/.dsh/sessions = 318 MB / 155 phiên, trong đó 43 phiên cũ
# hơn 7 ngày; thêm ~23 MB thư mục sao lưu `sessions.*` từ đợt sửa lỗi session tháng 8.
#
# Dọn: phiên cũ hơn `--days` (mặc định 30), thư mục `~/.dsh/sessions.*` cũ hơn `--days`,
# và file tạm `~/.dsh/storages/.*tmp` cũ hơn 1 ngày. KHÔNG đụng storages/*.json đang dùng.
set -euo pipefail

DAYS=30
APPLY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --apply) APPLY=1; shift ;;
    --days) DAYS="${2:?--days cần số}"; shift 2 ;;
    -h|--help) sed -n '2,16p' "$0"; exit 0 ;;
    *) echo "tham số lạ: $1" >&2; exit 2 ;;
  esac
done

DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
[ -d "$DSH_HOME" ] || { echo "không thấy $DSH_HOME"; exit 1; }

mb() { awk -v b="$1" 'BEGIN{printf "%.1f", b/1048576}'; }

echo "== DSH housekeeping (days=$DAYS apply=$APPLY) =="
BEFORE=$(du -sk "$DSH_HOME" 2>/dev/null | awk '{print $1}')

# 1) Phiên cũ: xoá cả thư mục phiên (mỗi phiên là 1 thư mục chứa session.jsonl.zstd).
mapfile -t OLD_SESSIONS < <(find "$DSH_HOME/sessions" -name "session.jsonl.zstd" -mtime "+$DAYS" -print 2>/dev/null)
SESS_BYTES=0
for f in "${OLD_SESSIONS[@]:-}"; do
  [ -n "$f" ] || continue
  size=$(stat -f%z "$f" 2>/dev/null || echo 0)
  SESS_BYTES=$((SESS_BYTES + size))
done
echo "  • phiên cũ hơn $DAYS ngày: ${#OLD_SESSIONS[@]} file, $(mb "$SESS_BYTES") MB"
if [ "$APPLY" = "1" ]; then
  for f in "${OLD_SESSIONS[@]:-}"; do
    [ -n "$f" ] || continue
    rm -rf "$(dirname "$f")"
  done
fi

# 2) Thư mục sao lưu sessions.* của đợt sửa lỗi (chỉ những cái cũ).
mapfile -t OLD_BACKUPS < <(find "$DSH_HOME" -maxdepth 1 -type d -name "sessions.*" -mtime "+$DAYS" -print 2>/dev/null)
BK_BYTES=0
for d in "${OLD_BACKUPS[@]:-}"; do
  [ -n "$d" ] || continue
  size=$(du -sk "$d" 2>/dev/null | awk '{print $1 * 1024}')
  BK_BYTES=$((BK_BYTES + size))
done
echo "  • thư mục sao lưu sessions.* cũ: ${#OLD_BACKUPS[@]} thư mục, $(mb "$BK_BYTES") MB"
if [ "$APPLY" = "1" ]; then
  for d in "${OLD_BACKUPS[@]:-}"; do
    [ -n "$d" ] || continue
    rm -rf "$d"
  done
fi

# 3) File tạm trong storages (ghi dở, cũ hơn 1 ngày).
mapfile -t OLD_TMP < <(find "$DSH_HOME/storages" -maxdepth 1 -name ".*tmp" -mtime +1 -print 2>/dev/null)
echo "  • file tạm storages: ${#OLD_TMP[@]} file"
if [ "$APPLY" = "1" ]; then
  for f in "${OLD_TMP[@]:-}"; do
    [ -n "$f" ] || continue
    rm -f "$f"
  done
fi

# 4) Patch theme/brand FlowTech: phát hiện DSH bị nâng cấp làm mất patch -> tự vá lại.
#    Sự cố 21/09/2026: `npm i -g @deepseek-ai/dsh` xoá sạch file đã patch (theme #33C773, logo
#    FlowTech, tên HarnessFlow) khiến harness mất theme/layout. Script dưới đây idempotent.
ENSURE="$(cd "$(dirname "$0")/.." && pwd)/harness-ensure-patches.sh"
if [ -f "$ENSURE" ]; then
  if [ "$APPLY" = "1" ]; then
    echo "-- patch theme/brand FlowTech --"
    bash "$ENSURE" || echo "   (vá patch thất bại — xem log phía trên)"
  else
    if bash "$ENSURE" --check >/dev/null 2>&1; then
      echo "  • patch theme/brand FlowTech: OK"
    else
      echo "  • patch theme/brand FlowTech: THIẾU (chạy với --apply để vá lại)"
    fi
  fi
fi

AFTER=$(du -sk "$DSH_HOME" 2>/dev/null | awk '{print $1}')
echo "== dung lượng ~/.dsh: $(mb $((BEFORE * 1024))) MB -> $(mb $((AFTER * 1024))) MB =="
[ "$APPLY" = "1" ] || echo "(DRY-RUN: chưa xoá gì. Thêm --apply để chạy thật.)"
