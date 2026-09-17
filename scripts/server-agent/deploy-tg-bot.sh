#!/usr/bin/env bash
# deploy-tg-bot.sh — cập nhật bot Telegram TỪ WORKSPACE lên bản đang chạy, có backup + rollback.
#
# Vì sao cần: bot thật chạy ở /root/flowvpn-tgbot (service flowvpn-tg-bot.service), KHÔNG
# chạy trực tiếp từ workspace. Muốn thêm lệnh mới (ví dụ /chat) phải copy bot.mjs +
# tg-commands.js sang đó rồi restart. Script này làm việc đó một cách an toàn:
#   1) node --check cả 2 file
#   2) backup bản đang chạy vào /root/flowvpn-tgbot/backup-<ts>/
#   3) copy sang, chạy `--simulate` để chắc bot mới nạp được module
#   4) restart service + kiểm tra active; hỏng thì tự khôi phục backup
#
# CẢNH BÁO: nếu chạy script này TỪ TRONG tiến trình do chính bot sinh ra (ví dụ agent /task),
# thì bước restart sẽ giết luôn script giữa chừng. Hãy chạy từ SSH:
#   ssh root@<node-2> /root/flowvpn-agent/scripts/server-agent/deploy-tg-bot.sh
#
# Dùng:  scripts/server-agent/deploy-tg-bot.sh [--dry-run] [--no-restart]
#   --dry-run     chỉ liệt kê file nào khác bản chạy
#   --no-restart  copy file nhưng không restart (kích hoạt ở lần restart sau)
set -euo pipefail

WS_BOT="${WS_BOT:-/root/flowvpn-agent/scripts/tg-bot}"
WS_CMDS="${WS_CMDS:-/root/flowvpn-agent/control-plane/src/tg-commands.js}"
LIVE="${LIVE:-/root/flowvpn-tgbot}"
SERVICE="${SERVICE:-flowvpn-tg-bot.service}"
DRY_RUN=0
STAGE_ONLY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --no-restart) STAGE_ONLY=1 ;;
    *) echo "tham số lạ: $1" >&2; exit 2 ;;
  esac
  shift
done

log() { printf '  %s\n' "$*"; }
[ -f "$WS_BOT/bot.mjs" ] || { echo "LỖI: không thấy $WS_BOT/bot.mjs" >&2; exit 1; }
[ -f "$WS_CMDS" ] || { echo "LỖI: không thấy $WS_CMDS" >&2; exit 1; }
[ -d "$LIVE" ] || { echo "LỖI: không thấy $LIVE" >&2; exit 1; }

# --- 1) kiểm tra cú pháp ------------------------------------------------------
node --check "$WS_BOT/bot.mjs"
node --check "$WS_CMDS"
log "node --check OK"

if [ "$DRY_RUN" = "1" ]; then
  if cmp -s "$WS_BOT/bot.mjs" "$LIVE/bot.mjs"; then log "bot.mjs: không đổi"; else log "bot.mjs: SẼ cập nhật"; fi
  if cmp -s "$WS_CMDS" "$LIVE/tg-commands.js"; then log "tg-commands.js: không đổi"; else log "tg-commands.js: SẼ cập nhật"; fi
  log "--dry-run: không làm gì"
  exit 0
fi

# --- 2) backup + copy ---------------------------------------------------------
TS="$(date -u +%Y%m%d-%H%M%S)"
BK="$LIVE/backup-$TS"
mkdir -p "$BK"
for f in bot.mjs tg-commands.js; do
  [ -f "$LIVE/$f" ] && cp -a "$LIVE/$f" "$BK/$f"
done
log "backup: $BK"

install -m 600 "$WS_BOT/bot.mjs" "$LIVE/bot.mjs"
install -m 600 "$WS_CMDS" "$LIVE/tg-commands.js"
log "đã copy bot.mjs + tg-commands.js"

rollback() {
  for f in bot.mjs tg-commands.js; do
    [ -f "$BK/$f" ] && cp -a "$BK/$f" "$LIVE/$f"
  done
}

# --- 3) thử nạp module + simulate (không cần token) --------------------------
if ! ( cd "$LIVE" && node bot.mjs --simulate "/chat" ) >/tmp/deploy-tgbot-sim.log 2>&1; then
  echo "LỖI: bot mới không chạy được --simulate /chat → rollback" >&2
  tail -20 /tmp/deploy-tgbot-sim.log >&2
  rollback
  exit 1
fi
log "simulate /chat OK"

if [ "$STAGE_ONLY" = "1" ]; then
  log "--no-restart: đã stage file, CHƯA restart bot (kích hoạt ở lần restart sau)"
  exit 0
fi

# --- 4) restart + kiểm tra, rollback nếu hỏng --------------------------------
systemctl restart "$SERVICE"
sleep 3
state="$(systemctl is-active "$SERVICE" 2>/dev/null || true)"
if [ "$state" != "active" ]; then
  echo "LỖI: $SERVICE không active ($state) → rollback" >&2
  rollback
  systemctl restart "$SERVICE"; sleep 2
  exit 1
fi
if journalctl -u "$SERVICE" -n 30 --no-pager 2>/dev/null | grep -qiE "SyntaxError|ERR_MODULE_NOT_FOUND|Cannot find module|is not a function"; then
  echo "LỖI: log bot có lỗi nạp module → rollback" >&2
  rollback
  systemctl restart "$SERVICE"; sleep 2
  exit 1
fi
log "bot active ($state) — deploy xong; thử /help và /chat trên Telegram"
