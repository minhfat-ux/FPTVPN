#!/usr/bin/env bash
# Remote installer cho flowdesk (backend riêng của bản Windows) trên node-2.
#
# Idempotent — chạy lại mỗi lần deploy đều an toàn. Theo đúng luật nhà của VPS:
# backup Caddy trước khi sửa, `caddy validate` trước khi reload, kiểm bằng curl.
#
# KHÁC với fBuddy: script này KHÔNG tự sinh env file, vì env chứa key Soniox +
# OpenRouter của riêng bản Windows và token admin dùng chung với fBuddy. Thiếu env
# thì nó chỉ in hướng dẫn rồi thoát — KHÔNG khởi động service nửa vời.
#
# Usage (trên server, sau khi release đã giải nén vào /opt/fbuddy):
#   bash /opt/fbuddy/deploy/flowdesk-remote-setup.sh
set -euo pipefail

APP_DIR=/opt/fbuddy
DESK_DIR=$APP_DIR/desk
ENV_DIR=/etc/flowdesk
ENV_FILE=$ENV_DIR/flowdesk.env
DATA_DIR=/var/lib/flowdesk
PORT=7791
DOMAIN=desk.meetflowai.site
SERVICE=flowdesk
CADDYFILE=/etc/caddy/Caddyfile
STAMP=$(date +%Y%m%d-%H%M%S)

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

# ----------------------------------------------------------------- 1. layout
log "1/6 Thư mục + dependency"
install -d -m 755 "$DATA_DIR"
install -d -m 700 "$ENV_DIR"
if [ ! -d "$DESK_DIR/node_modules/ws" ]; then
  log "Cài dependency của desk (ws) — không cần build native"
  npm install --omit=dev --no-audit --no-fund --prefix "$DESK_DIR" >/dev/null
fi

# --------------------------------------------------------------- 2. systemd
log "2/6 systemd unit"
install -m 644 "$DESK_DIR/../deploy/$SERVICE.service" "/etc/systemd/system/$SERVICE.service"
systemctl daemon-reload

# ------------------------------------------------------------------ 3. caddy
log "3/6 Caddy ($DOMAIN → 127.0.0.1:$PORT)"
if grep -qE "^[[:space:]]*$DOMAIN([[:space:],{]|$)" "$CADDYFILE"; then
  log "$DOMAIN đã có trong Caddyfile — bỏ qua"
else
  cp -a "$CADDYFILE" "$CADDYFILE.bak-flowdesk-$STAMP"
  log "Backup: $CADDYFILE.bak-flowdesk-$STAMP"
  cat >> "$CADDYFILE" <<EOF

# flowdesk — backend riêng cho app Windows (MeetFlow AI Overlay).
# KHÔNG dùng chung với api.meetflowai.site (bản Mac) hay fbuddy.meetflowai.site.
$DOMAIN {
	encode zstd gzip
	reverse_proxy 127.0.0.1:$PORT
}
EOF
  if caddy validate --config "$CADDYFILE" >/dev/null 2>&1; then
    systemctl reload caddy
    log "Caddy đã reload"
  else
    log "Caddyfile KHÔNG hợp lệ — khôi phục bản backup"
    cp -a "$CADDYFILE.bak-flowdesk-$STAMP" "$CADDYFILE"
    caddy validate --config "$CADDYFILE"
    exit 1
  fi
fi

# ----------------------------------------------------- 4. env (bắt buộc có)
log "4/6 Env file"
if [ ! -f "$ENV_FILE" ]; then
  cat <<EOF

CHƯA có $ENV_FILE ⇒ KHÔNG khởi động $SERVICE (cố ý).

Tạo file rồi chạy lại script này:

  install -m 600 /opt/fbuddy/deploy/flowdesk.env.example $ENV_FILE
  # rồi sửa các giá trị CHANGE_ME:
  #   DESK_SECRET            = openssl rand -base64 48
  #   DESK_ADMIN_TOKEN       = chuỗi ngẫu nhiên >= 16 ký tự (PHẢI trùng
  #                            FBUDDY_DESK_ADMIN_TOKEN trong /etc/fbuddy/fbuddy.env)
  #   DESK_SONIOX_API_KEY    = key Soniox RIÊNG cho bản Windows
  #   DESK_OPENROUTER_API_KEY= key OpenRouter RIÊNG cho bản Windows

Sau đó thêm vào /etc/fbuddy/fbuddy.env (để fBuddy phát mã khi đơn thành 'paid'):

  FBUDDY_DESK_URL=http://127.0.0.1:$PORT
  FBUDDY_DESK_ADMIN_TOKEN=<đúng DESK_ADMIN_TOKEN ở trên>

rồi: systemctl restart fbuddy
EOF
  exit 0
fi
chmod 600 "$ENV_FILE"

# --------------------------------------------------------------- 5. restart
log "5/6 Khởi động $SERVICE"
systemctl enable "$SERVICE" >/dev/null
systemctl restart "$SERVICE"
sleep 2
if ! systemctl is-active --quiet "$SERVICE"; then
  journalctl -u "$SERVICE" -n 60 --no-pager
  exit 1
fi

for i in 1 2 3 4 5; do
  if curl -fsS "http://127.0.0.1:$PORT/v1/desktop/health" >/tmp/flowdesk-health.json 2>/dev/null; then
    break
  fi
  log "Chờ service lên (lần $i)…"
  sleep 2
done
cat /tmp/flowdesk-health.json 2>/dev/null || true
echo

# ------------------------------------------------------------- 6. summary
log "6/6 Xong"
cat <<EOF
- Code:    $DESK_DIR (nằm trong checkout /opt/fbuddy — deploy qua deploy.ps1)
- Dữ liệu: $DATA_DIR (desk.db: mã kích hoạt, thiết bị, mức dùng)
- Đọc DB:  /var/lib/fbuddy/fbuddy.db (CHỈ ĐỌC — nguồn quyết định quyền)
- Env:     $ENV_FILE (600)
- Log:     journalctl -u $SERVICE -f
- Nội bộ:  curl -s http://127.0.0.1:$PORT/v1/desktop/health
- Công khai: https://$DOMAIN/v1/desktop/health (cần bản ghi DNS A $DOMAIN -> IP node-2)
EOF
