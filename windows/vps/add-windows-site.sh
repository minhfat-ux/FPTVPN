#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════
#  FPT HARNESS (WINDOWS) — thêm site DSH Windows lên VPS
#
#  Chạy TRÊN VPS (root):  bash add-windows-site.sh [domain] [tunnel_port]
#    domain        mặc định dhs-win.meetflowai.site (cần DNS A record -> IP VPS)
#    tunnel_port   mặc định 13081  (port SSH reverse tunnel từ Windows)
#
#  Kiến trúc:  https://<domain>  ->  Caddy  ->  nginx gate 127.0.0.1:3082
#              ->  tunnel port 127.0.0.1:<tunnel_port>  ->  Windows DSH 127.0.0.1:3080
#  Idempotent: chạy lại an toàn, có backup .bak-windows.
# ═══════════════════════════════════════════════════════════════════════
set -euo pipefail

DOMAIN="${1:-dhs-win.meetflowai.site}"
TPORT="${2:-13081}"
GPORT="3082"          # nginx gate riêng cho Windows (3081 đã dùng cho Mac)
SRC="$(cd "$(dirname "$0")" && pwd)"

[ "$(id -u)" = "0" ] || { echo "Chạy bằng root: sudo bash $0 $DOMAIN $TPORT"; exit 1; }

echo "==> [1/4] nginx gate $GPORT -> 127.0.0.1:$TPORT (auth dùng chung 9090)"
GATE="/etc/nginx/sites-available/dhs-gate-windows"
cp "$SRC/nginx-dhs-gate" "$GATE"
# đổi listen 3081 -> $GPORT và proxy_pass 13080 -> $TPORT
sed -i "s/listen 127.0.0.1:3081;/listen 127.0.0.1:$GPORT;/" "$GATE"
sed -i "s|proxy_pass http://127.0.0.1:13080;|proxy_pass http://127.0.0.1:$TPORT;|g" "$GATE"
sed -i "s|proxy_pass http://127.0.0.1:3080;|proxy_pass http://127.0.0.1:$TPORT;|g" "$GATE"
ln -sf "$GATE" /etc/nginx/sites-enabled/dhs-gate-windows
nginx -t >/dev/null && systemctl reload nginx && echo "    nginx gate $GPORT active"

echo "==> [2/4] Caddy site $DOMAIN -> 127.0.0.1:$GPORT"
CADDY="/etc/caddy/Caddyfile"
if grep -q "^$DOMAIN {" "$CADDY" 2>/dev/null; then
    echo "    $DOMAIN đã có trong Caddyfile (bỏ qua)"
else
    cp "$CADDY" "$CADDY.bak-windows" 2>/dev/null || true
    cat >> "$CADDY" <<EOF

$DOMAIN {
	# DSH Windows (FPT Harness) — mirror site chính, auth gate riêng.
	@json path /api/*
	encode @json gzip
	reverse_proxy 127.0.0.1:$GPORT
}
EOF
    caddy validate --config "$CADDY" >/dev/null 2>&1 || { echo "LỖI Caddyfile — khôi phục backup"; cp "$CADDY.bak-windows" "$CADDY"; exit 1; }
    systemctl reload caddy 2>/dev/null || systemctl restart caddy
    echo "    caddy site $DOMAIN active"
fi

echo "==> [3/4] Firewall (22/80/443 đã mở ở lần cài đầu — không đụng)"
echo "    (port $TPORT KHÔNG mở public — chỉ 127.0.0.1)"

echo "==> [4/4] Verify"
sleep 3
echo "    https://$DOMAIN -> HTTP $(curl -s -o /dev/null -w '%{http_code}' -m 15 https://$DOMAIN/ 2>/dev/null || echo '?')"
echo
echo "NEXT: trỏ DNS $DOMAIN -> IP VPS, và chạy tunnel từ Windows:"
echo "    ssh -N -i ~/.ssh/dsh_tunnel -R 127.0.0.1:$TPORT:127.0.0.1:3080 root@<VPS_IP>"
echo "    (install-fpt-harness.ps1 trên Windows đã cài Task Scheduler tự chạy tunnel này)"
