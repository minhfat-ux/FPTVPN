#!/bin/bash
# B0 — Kiểm tra + DỪNG harness Mac trước khi copy.
#
# Vì sao cần riêng bước này: `02-copy.sh` chỉ in ra lời nhắc "đã dừng DSH chưa?" chứ không
# kiểm được. Máy này có 7 LaunchAgent + 2 dòng crontab + session DSH đang ghi vào
# /Volumes/BIWIN; copy trong lúc chúng chạy ⇒ dữ liệu lệch mà không ai biết.
#
# Dùng:
#   ./00-harness-preflight.sh                 # CHỈ ĐỌC: báo cáo (mặc định)
#   ./00-harness-preflight.sh --stop          # dừng harness (LAUNCHD_MODE=harness mặc định)
#   ./00-harness-preflight.sh --resume        # bật lại sau khi xong
#   LAUNCHD_MODE=all ./00-harness-preflight.sh --stop   # dừng cả job không đụng BIWIN
set -uo pipefail

SRC="${SRC:-/Volumes/BIWIN}"
UID_NUM="$(id -u)"
ACTION="check"
[ "${1:-}" = "--stop" ] && ACTION="stop"
[ "${1:-}" = "--resume" ] && ACTION="resume"
LAUNCHD_MODE="${LAUNCHD_MODE:-harness}"   # harness = chỉ job có thể đụng BIWIN | all = tất cả

# Job harness. `touches=yes` = có thể mở file trong $SRC ⇒ PHẢI dừng trước khi copy.
JOBS=(
  "site.meetflowai.mac-selfdefense|yes|đọc/ghi vault trong SourcesCode/_quarantine"
  "site.meetflowai.mac-selfdefense-watchdog|yes|watchdog của daemon trên"
  "com.dsh.tunnel|no|tunnel SSH, không đụng BIWIN"
  "net.flowtech.notify-poller|no|poller node-2, không đụng BIWIN"
  "net.flowtech.keepawake|no|giữ máy không ngủ"
  "site.meetflowai.harness-patches|no|vá DSH trong ~/.local"
  "ai.hermes.gateway|no|hermes gateway"
)
# Dòng crontab chạm BIWIN (khớp theo chuỗi con)
CRON_PATTERNS=("/Volumes/BIWIN")
CRON_BACKUP="$HOME/.migrate-crontab.bak"

hr() { printf '%s\n' "------------------------------------------------------------"; }
log() { printf '  %s\n' "$*"; }

need_stop() { [ "$1" = "yes" ] || [ "$LAUNCHD_MODE" = "all" ]; }

# PID này có nằm trong cây tiến trình của chính script không? (để không tự báo chính mình)
is_self_tree() {
  local p="$1" i=0
  while [ -n "$p" ] && [ "$p" != "0" ] && [ "$p" != "1" ] && [ "$i" -lt 20 ]; do
    [ "$p" = "$$" ] && return 0
    p="$(ps -o ppid= -p "$p" 2>/dev/null | tr -d ' ')"
    i=$((i + 1))
  done
  return 1
}

echo "== B0 preflight ============================================"
log "SRC = $SRC   (action=$ACTION, launchd_mode=$LAUNCHD_MODE)"
hr

# ---------------------------------------------------------------- 1) công cụ
echo "1) Công cụ"
RSYNC="${RSYNC:-/opt/homebrew/bin/rsync}"
if [ -x "$RSYNC" ] && "$RSYNC" --version 2>/dev/null | grep -q 'version 3'; then
  log "OK  GNU rsync: $("$RSYNC" --version | head -1)"
else
  log "THIẾU GNU rsync (macOS chỉ có openrsync 2.6.9, không có -X/-A)."
  log "Cài:  brew install rsync"
  log "Rồi:  RSYNC=/opt/homebrew/bin/rsync $0"
  [ "$ACTION" = "check" ] || exit 1
fi

# ---------------------------------------------------------------- 2) ai đang "sống" trong SRC
# Tách 2 loại, vì mức nguy hiểm khác hẳn nhau:
#   CWD  = tiến trình có THƯ MỤC LÀM VIỆC trong $SRC (shell/IDE/agent đang đứng trong repo)
#          ⇒ copy lúc này là chắc chắn lệch. PHẢI đóng.
#   FILE = chỉ đang mở file (kể cả `du`, `find`, `awk` của chính việc khảo sát) ⇒ phần lớn vô hại.
echo
echo "2) Tiến trình đang dùng $SRC"
SCAN="$(lsof -n -F pcfn 2>/dev/null | awk -v p="$SRC" '
  /^p/ { pid = substr($0, 2) }
  /^c/ { cmd = substr($0, 2) }
  /^f/ { fd  = substr($0, 2) }
  /^n/ { if (index(substr($0, 2), p)) print (fd == "cwd" ? "CWD" : "FILE") "|" cmd "|" pid }' | sort -u)"

CWD_HOLDERS="$(printf '%s\n' "$SCAN" | grep '^CWD|' || true)"
FILE_HOLDERS="$(printf '%s\n' "$SCAN" | grep '^FILE|' || true)"

if [ -n "$CWD_HOLDERS" ]; then
  log "NGUY HIỂM — có tiến trình đang ĐỨNG trong $SRC:"
  printf '%s\n' "$CWD_HOLDERS" | awk -F'|' '{printf "      %-24s pid %s\n", $2, $3}'
  log "Phải thoát/đóng các tiến trình này TRƯỚC khi copy."
  log "LƯU Ý: chạy script này TỪ NGOÀI ổ (ví dụ cd ~) — nếu không, chính shell/agent đang"
  log "       chạy lệnh cũng nằm trong danh sách và không bao giờ sạch được."
else
  log "OK  không tiến trình nào có thư mục làm việc trong $SRC"
fi

n_file=$(printf '%s\n' "$FILE_HOLDERS" | grep -c '^FILE|' || true)
if [ "${n_file:-0}" -gt 0 ]; then
  # KHÔNG dùng backtick trong chuỗi nháy kép: bash sẽ THỰC THI chúng (đã mắc đúng lỗi này —
  # chuỗi chú thích chứa du/find làm script chạy thật hai lệnh đó).
  log "chỉ đang mở file (thường vô hại, kể cả du/find): ${n_file} tiến trình"
  printf '%s\n' "$FILE_HOLDERS" | awk -F'|' '{print $2}' | sort | uniq -c | sort -rn | head -8 \
    | awk '{printf "      %-4s %s\n", $1, $2}'
fi

# ---------------------------------------------------------------- 3) LaunchAgent
echo
echo "3) LaunchAgent harness"
for row in "${JOBS[@]}"; do
  IFS='|' read -r label touches note <<< "$row"
  running=no
  launchctl print "gui/$UID_NUM/$label" >/dev/null 2>&1 && running=yes
  printf '  %-46s running=%-3s touches_biwin=%-3s  %s\n' "$label" "$running" "$touches" "$note"
done

# ---------------------------------------------------------------- 4) crontab
echo
echo "4) crontab chạm BIWIN"
CRON_HITS="$(crontab -l 2>/dev/null | grep -F -f <(printf '%s\n' "${CRON_PATTERNS[@]}") || true)"
if [ -z "$CRON_HITS" ]; then
  log "OK  không dòng crontab nào chạm $SRC"
else
  printf '%s\n' "$CRON_HITS" | sed 's/^/      /'
fi

# ---------------------------------------------------------------- 5) tham chiếu sống
echo
echo "5) Tham chiếu đường dẫn $SRC (script migrate KHÔNG tự sửa — xem README §5)"
for f in "$HOME/.local/share/mac-selfdefense/lib/quarantine.mjs" \
         "$HOME/.config/mac-selfdefense/config.json"; do
  [ -f "$f" ] || continue
  n=$(grep -c "$SRC" "$f" 2>/dev/null || echo 0)
  [ "$n" != "0" ] && printf '  %-58s %s tham chiếu\n' "${f/#$HOME/~}" "$n"
done
log "Giữ nguyên tên volume BIWIN ở bước cutover thì mọi tham chiếu này vẫn đúng."

# ---------------------------------------------------------------- HÀNH ĐỘNG
hr
case "$ACTION" in
  stop)
    echo "DỪNG harness"
    for row in "${JOBS[@]}"; do
      IFS='|' read -r label touches note <<< "$row"
      need_stop "$touches" || { log "bỏ qua (không đụng BIWIN): $label"; continue; }
      if launchctl print "gui/$UID_NUM/$label" >/dev/null 2>&1; then
        launchctl bootout "gui/$UID_NUM/$label" 2>/dev/null \
          && log "đã dừng: $label" || log "KHÔNG dừng được: $label"
      else
        log "vốn không chạy: $label"
      fi
    done
    if [ -n "$CRON_HITS" ]; then
      crontab -l > "$CRON_BACKUP" 2>/dev/null && log "đã sao lưu crontab → $CRON_BACKUP"
      crontab -l 2>/dev/null | grep -vF -f <(printf '%s\n' "${CRON_PATTERNS[@]}") | crontab -
      log "đã bỏ các dòng crontab chạm BIWIN (khôi phục bằng --resume)"
    fi
    echo
    log "Kiểm tra lại: $0        (phải sạch mục 2 và 4)"
    ;;
  resume)
    echo "BẬT LẠI harness"
    for row in "${JOBS[@]}"; do
      IFS='|' read -r label touches note <<< "$row"
      need_stop "$touches" || continue
      plist="$HOME/Library/LaunchAgents/$label.plist"
      [ -f "$plist" ] || { log "không thấy plist: $label"; continue; }
      launchctl bootout "gui/$UID_NUM/$label" 2>/dev/null || true
      sleep 1
      launchctl bootstrap "gui/$UID_NUM" "$plist" 2>/dev/null \
        && log "đã bật: $label" \
        || { launchctl kickstart -k "gui/$UID_NUM/$label" 2>/dev/null && log "đã bật (kickstart): $label" || log "LỖI bật: $label"; }
    done
    if [ -f "$CRON_BACKUP" ]; then
      crontab "$CRON_BACKUP" && log "đã khôi phục crontab từ $CRON_BACKUP"
    fi
    ;;
  *)
    echo "Chế độ CHỈ ĐỌC. Muốn dừng harness trước khi copy:  $0 --stop"
    echo "Sau khi cutover xong, bật lại:                    $0 --resume"
    ;;
esac
