#!/usr/bin/env bash
# Scheduler cho đợt "BẮT BUỘC đăng ký email" (MeetFlow AI) — chủ dự án chốt 02/10/2026:
#   · 10/10/2026: publish bản Android mới có thông báo "đăng ký email là bắt buộc".
#   · 15/10/2026: các tài khoản chưa đăng ký email bị khoá.
#
# Chạy mỗi ngày 09:00 bằng LaunchAgent `site.meetflowai.email-notice-schedule`
# (cài bằng scripts/scheduler/install-email-notice-schedule.sh — bản chạy nằm ở Ổ TRONG vì
#  launchd bị TCC chặn đọc /Volumes; xem docs/HARNESS_INSTALL.md §9).
#
# NGUYÊN TẮC AN TOÀN: script này CHỈ đọc (HTTP GET/HEAD) và thông báo. KHÔNG publish, KHÔNG
# sửa production, KHÔNG gọi API có thay đổi dữ liệu. Việc publish vẫn do harness Windows làm
# (kênh Windows+Android — docs/PUBLISHER_PROCESS.md §0 luật 12).
#
#   bash email-notice-2026-10.sh --dry-run            # chỉ in, KHÔNG gửi Telegram
#   bash email-notice-2026-10.sh --date 2026-10-10    # giả lập ngày để thử
set -uo pipefail

API_BASE="${MEETFLOW_API_BASE:-https://meetflowai.site}"
LOG_DIR="$HOME/.local/share/flowvpn-scheduler/logs"
TG_FILE="$HOME/.vpnflow-telegram"

PUBLISH_DAY="2026-10-10"
LOCK_DAY="2026-10-15"
EXPECTED_MIN_VERSION_CODE="${EXPECTED_MIN_VERSION_CODE:-}"

DRY=0
TODAY=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1; shift ;;
    --date) TODAY="${2:?--date cần YYYY-MM-DD}"; shift 2 ;;
    -h|--help) sed -n '2,18p' "$0"; exit 0 ;;
    *) echo "tham số lạ: $1" >&2; exit 2 ;;
  esac
done
[ -n "$TODAY" ] || TODAY="$(date +%Y-%m-%d)"

mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/$TODAY.log"
line() { printf '%s %s\n' "$(date '+%F %T')" "$*" | tee -a "$LOG"; }

notify() {
  local preview="${1//$'\n'/ }"
  line "TELEGRAM: ${preview:0:200}"
  [ "$DRY" = "1" ] && return 0

  # Đường CHÍNH: gửi qua node-2 (`flowvpn-notify --ping`) — đo 02/10/2026: api.telegram.org
  # bị chặn từ mạng của Mac (http=000), còn kênh qua server thì ok=True.
  if printf '%s' "$1" | ssh -i "$HOME/.ssh/fpt_vpn_node" -o BatchMode=yes -o StrictHostKeyChecking=no \
       -o ConnectTimeout=12 root@165.101.114.162 'flowvpn-notify --ping "$(cat)"' >/dev/null 2>&1; then
    line "  Telegram đã gửi (qua node-2)"
    return 0
  fi
  line "  gửi qua node-2 LỖI — thử gọi thẳng API Telegram"

  [ -f "$TG_FILE" ] || { line "  (không thấy $TG_FILE — bỏ qua)"; return 0; }
  local tok chat
  # File ~/.vpnflow-telegram đổi định dạng KEY=value (trước là KEY: value) — chấp nhận CẢ HAI.
  tok=$(grep -oE 'TELEGRAM_BOT_TOKEN[:=].*' "$TG_FILE" 2>/dev/null | head -1 | sed 's/^[^:=]*[:=][[:space:]]*//' | tr -d '"'"'"'')
  chat=$(grep -oE 'TELEGRAM_CHAT_ID[:=].*' "$TG_FILE" 2>/dev/null | head -1 | sed 's/^[^:=]*[:=][[:space:]]*//' | tr -d '"'"'"'')
  [ -n "$tok" ] && [ -n "$chat" ] || { line "  (thiếu token/chat — bỏ qua)"; return 0; }
  if curl -s -m 20 "https://api.telegram.org/bot$tok/sendMessage" -d "chat_id=$chat" \
       --data-urlencode "text=$1" >/dev/null 2>&1; then line "  Telegram đã gửi (API trực tiếp)"; else line "  Telegram LỖI"; fi
}

json_field() {
  printf '%s' "$1" | sed -n "s/.*\"$2\"[[:space:]]*:[[:space:]]*\"\{0,1\}\([^,\"}]*\)\"\{0,1\}.*/\1/p" | head -1
}

preflight() {
  local body code
  body=$(curl -s -m 25 "$API_BASE/v1/ai/app-version?platform=android" 2>/dev/null)
  code=$(curl -s -o /dev/null -w '%{http_code}' -m 25 "$API_BASE/v1/ai/app-version?platform=android" 2>/dev/null)
  line "preflight /v1/ai/app-version -> HTTP $code"
  [ "$code" = "200" ] && [ -n "$body" ] || { echo "KHÔNG ĐỌC ĐƯỢC app-version (HTTP $code)"; return 1; }
  local latest minimum name notes notice
  latest=$(json_field "$body" latest_version_code)
  minimum=$(json_field "$body" minimum_version_code)
  name=$(json_field "$body" latest_version_name)
  notes=$(json_field "$body" notes)
  notice=$(json_field "$body" notice)
  line "  latest=$latest minimum=$minimum name=$name notes=${notes:0:60}"
  local report="app-version: latest=$latest min=$minimum name=$name"
  if [ -z "$notice" ]; then
    report="$report
❌ CHƯA có field notice trong /v1/ai/app-version ⇒ app không hiện được thông báo đăng ký email (việc của WIN — xem handoff)."
  else
    report="$report
✅ field notice đã có trên server."
  fi
  if [ -n "$EXPECTED_MIN_VERSION_CODE" ] && [ -n "$latest" ] && [ "$latest" -lt "$EXPECTED_MIN_VERSION_CODE" ] 2>/dev/null; then
    report="$report
❌ latest_version_code=$latest < mức cần $EXPECTED_MIN_VERSION_CODE ⇒ CHƯA publish bản có thông báo."
  fi
  local dl
  dl=$(curl -s -o /dev/null -w '%{http_code} %{size_download}' -m 25 -r 0-0 "$API_BASE/v1/ai/downloads/android" 2>/dev/null)
  line "  APK endpoint (range 0-0): $dl"
  printf '%s\n' "$report"
}

case "$TODAY" in
  "$PUBLISH_DAY")
    line "=== NGÀY PUBLISH ($PUBLISH_DAY) ==="
    report=$(preflight) || report="❌ Không đọc được app-version — kiểm tra control plane trước khi publish."
    line "$report"
    notify "📣 HÔM NAY (10/10) là ngày PUBLISH bản Android MeetFlow AI có thông báo 'đăng ký email BẮT BUỘC'.

Việc của harness Windows: (1) đẩy APK mới lên /v1/ai/downloads/android, (2) PATCH /v1/admin/ai/app-version {latest_version_code, notice}, (3) báo lại Mac để nghiệm thu.
Chi tiết: docs/handoff/HANDOFF_MEETFLOW_EMAIL_NOTICE_2026-10-10.md

Preflight:
$report"
    ;;
  "$LOCK_DAY")
    line "=== NGÀY KHOÁ ($LOCK_DAY) ==="
    report=$(preflight) || report="(không đọc được app-version)"
    notify "🔒 HÔM NAY (15/10) là ngày KHOÁ tài khoản chưa đăng ký email.

Mức đã chốt: MỞ APP nhưng KHOÁ PRO (MeetFlow AI) — không chặn hẳn app; VPNFlow: bắt buộc đăng ký + gói Pro còn hiệu lực.
Cần xác nhận: luật đã bật ở control-plane, số tài khoản ẩn danh còn lại, và 10 thiết bị iOS theo UDID chưa có email.
Trạng thái server:
$report"
    ;;
  2026-10-0[6-9])
    line "=== GIAI ĐOẠN CHUẨN BỊ (tới $PUBLISH_DAY) ==="
    report=$(preflight) || report="(không đọc được app-version)"
    if printf '%s' "$report" | grep -q "❌"; then
      notify "⏳ Chuẩn bị publish 10/10 — còn việc chưa xong:

$report"
    else
      line "  (đã sẵn sàng — không nhắc)"
    fi
    ;;
  2026-10-1[1-4])
    line "=== ĐẾM NGƯỢC TỚI HẠN KHOÁ ($LOCK_DAY) ==="
    notify "⏰ Còn vài ngày tới hạn 15/10 — tài khoản MeetFlow AI chưa đăng ký email sẽ bị khoá.
Kiểm tra: thông báo trong app đã tới người dùng chưa, luật khoá ở control-plane đã sẵn sàng chưa."
    ;;
  *)
    line "không có mốc nào cho $TODAY (publish=$PUBLISH_DAY, lock=$LOCK_DAY) — không làm gì"
    ;;
esac
exit 0
