#!/usr/bin/env bash
# Remote installer for fBuddy on node-2 (fcnvps2 / 165.101.114.162).
#
# Idempotent: safe to run on every deploy. Follows the VPS house rules —
# back up Caddy before editing, `caddy validate` before reload, verify with curl.
#
# Usage (on the server, after the release tarball has been extracted to /opt/fbuddy):
#   bash /opt/fbuddy/deploy/remote-setup.sh
set -euo pipefail

APP_DIR=/opt/fbuddy
ENV_DIR=/etc/fbuddy
ENV_FILE=$ENV_DIR/fbuddy.env
DATA_DIR=/var/lib/fbuddy
PORT=7790
DOMAIN=fbuddy.meetflowai.site
SERVICE=fbuddy
CADDYFILE=/etc/caddy/Caddyfile
STAMP=$(date +%Y%m%d-%H%M%S)

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

# ----------------------------------------------------------------- 1. layout
log "1/6 Thư mục"
install -d -m 755 "$APP_DIR" "$DATA_DIR"
install -d -m 700 "$ENV_DIR"
touch "$DATA_DIR/.keep"

if [ ! -f "$ENV_FILE" ]; then
  log "Tạo $ENV_FILE lần đầu (secret sinh tự động, không in ra màn hình)"
  SECRET=$(openssl rand -base64 48 | tr -d '\n')
  cat > "$ENV_FILE" <<EOF
FBUDDY_SECRET=$SECRET
FBUDDY_PUBLIC_URL=https://$DOMAIN
FBUDDY_HOST=127.0.0.1
FBUDDY_PORT=$PORT
FBUDDY_DATA_DIR=$DATA_DIR
FBUDDY_APP_NAME=fBuddy
FBUDDY_TRUST_PROXY=true
EOF
  chmod 600 "$ENV_FILE"
else
  log "$ENV_FILE đã có — giữ nguyên secret hiện tại"
  chmod 600 "$ENV_FILE"
fi

# ------------------------------------------------------------- 2. systemd
log "2/6 systemd unit"
install -m 644 "$APP_DIR/deploy/$SERVICE.service" "/etc/systemd/system/$SERVICE.service"
systemctl daemon-reload
systemctl enable "$SERVICE" >/dev/null

# ---------------------------------------------------------------- 3. caddy
log "3/6 Caddy"
if grep -qE "^[[:space:]]*$DOMAIN([[:space:],{]|$)" "$CADDYFILE"; then
  log "$DOMAIN đã có trong Caddyfile — bỏ qua"
else
  cp -a "$CADDYFILE" "$CADDYFILE.bak-fbuddy-$STAMP"
  log "Backup: $CADDYFILE.bak-fbuddy-$STAMP"
  cat >> "$CADDYFILE" <<EOF

# fBuddy — AI chatbox web (chat, sửa ảnh, PPT, Excel, phân tích dữ liệu).
# Node phục vụ ở $PORT (systemd $SERVICE). Thiếu block này là edge trả 404/525.
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
    cp -a "$CADDYFILE.bak-fbuddy-$STAMP" "$CADDYFILE"
    caddy validate --config "$CADDYFILE"
    exit 1
  fi
fi

# --------------------------------------------------------------- 4. restart
log "4/6 Khởi động $SERVICE"
systemctl restart "$SERVICE"
sleep 2
systemctl is-active --quiet "$SERVICE" || {
  journalctl -u "$SERVICE" -n 60 --no-pager
  exit 1
}

# --------------------------------------------------------------- 5. verify
log "5/6 Kiểm tra"
for i in 1 2 3 4 5; do
  if curl -fsS "http://127.0.0.1:$PORT/api/health" >/tmp/fbuddy-health.json 2>/dev/null; then
    break
  fi
  log "Chờ service lên (lần $i)…"
  sleep 2
done
cat /tmp/fbuddy-health.json
echo

# ------------------------------------------------------------- 6. summary
log "6/6 Xong"
cat <<EOF
- App:     $APP_DIR
- Dữ liệu: $DATA_DIR (SQLite + tệp + artifact)
- Env:     $ENV_FILE (600)
- Log:     journalctl -u $SERVICE -f
- Nội bộ:  curl -s http://127.0.0.1:$PORT/api/health
- Công khai: https://$DOMAIN  (cần bản ghi DNS A $DOMAIN -> IP node-2, proxied)
EOF
