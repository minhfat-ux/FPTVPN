#!/usr/bin/env bash
# build-arm64.sh — dựng bộ cài gateway cho router arm64 (Xiaomi AX3000T RD03v2 / aarch64_cortex-a53).
#
#   export HYST_PASSWORD='...' HYST_OBFS='...'      # bắt buộc: lấy từ tunnel hiện tại, KHÔNG commit
#   bash tools/router-gateway/build-arm64.sh        # -> tools/router-gateway/dist/
#
# Tạo ra dist/:
#   flowvpnrelay-linux-arm64   binary relay hysteria2 (transport wsrelay) cho linux/arm64
#   node2.json / node3.json    config relay (điền từ template + env)
#   sing-box-router.json       (copy từ repo) ; sing-box-router-slim.json
#   setup.sh
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
DIST="$HERE/dist"
NODE2_URL="${NODE2_URL:-wss://api.meetflowai.site/relay/vn2hy}"
NODE3_URL="${NODE3_URL:-wss://api.meetflowai.site/relay/vn3hy}"
SERVER="${HYST_SERVER:-103.173.155.50:8443}"
SNI="${HYST_SNI:-103.173.155.50}"

: "${HYST_PASSWORD:?thieu HYST_PASSWORD (lay tu tunnel hien tai, khong commit)}"
: "${HYST_OBFS:?thieu HYST_OBFS}"

mkdir -p "$DIST"

echo "== 1/3 build relay linux/arm64"
TARGETS="linux/arm64" OUT_DIR="$(dirname "$DIST")/relay-dist" bash "$ROOT/tools/hysteria-relay/build.sh"
SRC="$(ls -t "$(dirname "$DIST")"/relay-dist/flowvpnrelay-linux-arm64 2>/dev/null | head -1 || true)"
[ -n "$SRC" ] || { echo "KHONG thay binary arm64 trong relay-dist/"; exit 1; }
cp "$SRC" "$DIST/flowvpnrelay-linux-arm64"
ls -l "$DIST/flowvpnrelay-linux-arm64"

echo "== 2/3 sinh config relay (khong chua secret trong repo)"
for n in 2 3; do
    eval "url=\$NODE${n}_URL"
    cat > "$DIST/node${n}.json" <<JSON
{
  "server": "$SERVER",
  "password": "$HYST_PASSWORD",
  "obfs": "$HYST_OBFS",
  "sni": "$SNI",
  "insecure": true,
  "upKbps": 50000,
  "downKbps": 200000,
  "transport": { "type": "wsrelay", "url": "$url", "links": 8 },
  "socks5": { "listen": "127.0.0.1:$([ "$n" = "2" ] && echo 1081 || echo 1083)" }
}
JSON
    chmod 600 "$DIST/node${n}.json"
done

echo "== 3/3 copy sing-box config + setup.sh"
cp "$HERE/sing-box-router.json" "$HERE/sing-box-router-slim.json" "$HERE/setup.sh" "$DIST/"
chmod +x "$DIST/setup.sh"

echo
echo "XONG. Chuyen dist/ sang router roi chay:"
echo "  scp -r $DIST/* root@192.168.50.1:/tmp/gw/"
echo "  ssh root@192.168.50.1 'cd /tmp/gw && sh setup.sh full'    # hoac 'slim'"
echo "GHI CHU: node2.json/node3.json co mat khau tunnel — dung commit, dung gui qua kenh cong khai."
