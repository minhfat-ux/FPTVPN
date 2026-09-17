#!/usr/bin/env bash
# deploy-control-plane.sh — triển khai thay đổi control-plane TỪ WORKSPACE CỦA AGENT lên
# bản đang chạy, có kiểm tra + tự ROLLBACK nếu bản mới không khoẻ.
#
# Vì sao cần: agent trên server phải "tự sửa lỗi xong là chạy được", nhưng không được phép
# làm sập control plane của khách. Script này là ranh giới an toàn:
#   1) chỉ nhận file .js trong src/ (không đụng .env, systemd, dữ liệu)
#   2) node --check từng file + chạy test suite
#   3) backup bản đang chạy, copy, restart, kiểm tra /health
#   4) /health không 200 ⇒ tự khôi phục backup + restart lại
#
# Dùng:  scripts/server-agent/deploy-control-plane.sh [--dry-run] [--files a.js,b.js]
set -euo pipefail

WS="${WS:-/root/flowvpn-agent/control-plane}"
LIVE="${LIVE:-/root/flowvpn-cp}"
SERVICE="${SERVICE:-flowvpn-cp.service}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:7778/health}"
DRY_RUN=0
ONLY=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --files) shift; ONLY="${1:-}" ;;
    *) echo "tham số lạ: $1" >&2; exit 2 ;;
  esac
  shift
done

log() { printf '  %s\n' "$*"; }
[ -d "$WS/src" ] || { echo "LỖI: không thấy $WS/src" >&2; exit 1; }
[ -d "$LIVE/src" ] || { echo "LỖI: không thấy $LIVE/src" >&2; exit 1; }

# --- 0) chặn tai nạn: workspace cũ hơn bản đang chạy --------------------------
# Deploy copy MỌI file src/*.js khác nhau. Nếu bản đang chạy có file mà workspace không có,
# lần deploy đó sẽ làm live mất tính năng tương ứng (suýt xảy ra thật 17/09: live có
# geoip.js/gfw-watch.js/mmdb.js còn workspace thì không). Thà dừng lại bắt đồng bộ workspace.
missing=()
for f in "$LIVE"/src/*.js; do
  base="$(basename "$f")"
  [ -f "$WS/src/$base" ] || missing+=("$base")
done
if [ "${#missing[@]}" -gt 0 ]; then
  echo "LỖI: workspace thiếu file so với bản đang chạy: ${missing[*]}" >&2
  echo "  → đồng bộ workspace trước (cp -a $LIVE/src/. $WS/src/), nếu không deploy sẽ làm mất tính năng." >&2
  exit 1
fi

# --- 1) danh sách file .js khác nhau -----------------------------------------
changed=()
for f in "$WS"/src/*.js; do
  base="$(basename "$f")"
  if [ -n "$ONLY" ] && [[ ",$ONLY," != *",$base,"* ]]; then continue; fi
  if [ ! -f "$LIVE/src/$base" ] || ! cmp -s "$f" "$LIVE/src/$base"; then changed+=("$base"); fi
done

if [ "${#changed[@]}" -eq 0 ]; then
  log "không có file src/*.js nào khác bản đang chạy — không cần deploy"
  exit 0
fi
log "file thay đổi (${#changed[@]}): ${changed[*]}"
if [ "$DRY_RUN" = "1" ]; then log "--dry-run: chỉ liệt kê, không làm gì"; exit 0; fi

# --- 2) kiểm tra cú pháp + test ---------------------------------------------
log "node --check từng file thay đổi"
for base in "${changed[@]}"; do node --check "$WS/src/$base"; done
if [ -d "$WS/test" ]; then
  log "chạy test suite trong workspace"
  ( cd "$WS" && node --test test/*.test.js ) >/tmp/deploy-cp-test.log 2>&1 || {
    echo "LỖI: test suite FAIL — không deploy. Xem /tmp/deploy-cp-test.log" >&2
    tail -20 /tmp/deploy-cp-test.log >&2
    exit 1
  }
  grep -E '^ℹ (tests|pass|fail)' /tmp/deploy-cp-test.log | sed 's/^/    /' || true
fi

# --- 3) backup + copy + restart ---------------------------------------------
TS="$(date -u +%Y%m%d-%H%M%S)"
BK="$LIVE/src-backup-$TS"
mkdir -p "$BK"
for base in "${changed[@]}"; do cp -a "$LIVE/src/$base" "$BK/$base"; done
log "backup: $BK"
for base in "${changed[@]}"; do install -m 644 "$WS/src/$base" "$LIVE/src/$base"; done
log "đã copy ${#changed[@]} file"

systemctl restart "$SERVICE"
sleep 2

# --- 4) kiểm tra sức khoẻ, rollback nếu hỏng --------------------------------
# Control plane cần vài giây để nạp store rồi mới phục vụ /health ⇒ phải thử lại, nếu không
# script sẽ báo "hỏng" oan và rollback một bản lành (đã xảy ra thật 16/09).
healthy=0
for i in $(seq 1 10); do
  if curl -s -o /dev/null -w '%{http_code}' -m 5 "$HEALTH_URL" | grep -qE '^2'; then healthy=1; break; fi
  sleep 2
done
if [ "$healthy" = "1" ]; then
  log "health OK ($HEALTH_URL) — deploy xong"
  echo "$TS" > /var/lib/flowvpn-last-deploy 2>/dev/null || true
  exit 0
fi

echo "LỖI: health check KHÔNG 200 sau 20s → tự khôi phục bản cũ" >&2
for base in "${changed[@]}"; do cp -a "$BK/$base" "$LIVE/src/$base"; done
systemctl restart "$SERVICE"
sleep 2
echo "đã rollback từ $BK (service: $(systemctl is-active "$SERVICE"))" >&2
exit 1
