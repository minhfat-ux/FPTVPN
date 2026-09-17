#!/usr/bin/env bash
# Creates the Cloudflare DNS record for fbuddy.meetflowai.site (proxied A → node-2).
#
# The Cloudflare token already lives on node-2 in the flowvpn control-plane
# drop-in; this script reads it there and never prints it.
#
#   bash deploy/dns-cloudflare.sh            # create/update the record (dry run first)
#   bash deploy/dns-cloudflare.sh --apply    # actually write it
#
# VPS house rule: back up nothing here (DNS is reversible), but always show the
# current state before changing it.
set -euo pipefail

ZONE_NAME="meetflowai.site"
RECORD_NAME="fbuddy"
TARGET_IP="165.101.114.162"
APPLY="false"
[ "${1:-}" = "--apply" ] && APPLY="true"

DROPIN="/etc/systemd/system/flowvpn-cp.service.d/alerts.conf"
TOKEN=$(grep -hoP 'CLOUDFLARE_API_TOKEN=\K.*' "$DROPIN" 2>/dev/null | tr -d '"' | tr -d "'" | head -1 || true)

if [ -z "${TOKEN:-}" ]; then
  echo "Không đọc được CLOUDFLARE_API_TOKEN từ $DROPIN" >&2
  echo "Cách khác: thêm bản ghi thủ công trên Cloudflare Dashboard:" >&2
  echo "  Type A | Name $RECORD_NAME | IPv4 $TARGET_IP | Proxy: Proxied" >&2
  exit 1
fi

api() {
  local method="$1" path="$2" data="${3:-}"
  if [ -n "$data" ]; then
    curl -sS -X "$method" "https://api.cloudflare.com/client/v4$path" \
      -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data "$data"
  else
    curl -sS -X "$method" "https://api.cloudflare.com/client/v4$path" \
      -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json"
  fi
}

ZONE_ID=$(api GET "/zones?name=$ZONE_NAME" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["result"][0]["id"] if d.get("result") else "")')
[ -n "$ZONE_ID" ] || { echo "Không tìm thấy zone $ZONE_NAME" >&2; exit 1; }
echo "zone $ZONE_NAME = $ZONE_ID"

EXISTING=$(api GET "/zones/$ZONE_ID/dns_records?name=$RECORD_NAME.$ZONE_NAME")
echo "bản ghi hiện tại: $(echo "$EXISTING" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(json.dumps([{"id":r["id"],"type":r["type"],"content":r["content"],"proxied":r["proxied"]} for r in d.get("result",[])]))')"

RECORD_ID=$(echo "$EXISTING" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["result"][0]["id"] if d.get("result") else "")')
PAYLOAD="{\"type\":\"A\",\"name\":\"$RECORD_NAME\",\"content\":\"$TARGET_IP\",\"proxied\":true,\"ttl\":1,\"comment\":\"fBuddy web app\"}"

if [ "$APPLY" != "true" ]; then
  echo
  echo "DRY RUN — sẽ ghi: $PAYLOAD"
  [ -n "$RECORD_ID" ] && echo "Sẽ CẬP NHẬT bản ghi $RECORD_ID" || echo "Sẽ TẠO bản ghi mới"
  echo "Chạy lại với --apply để thực hiện."
  exit 0
fi

if [ -n "$RECORD_ID" ]; then
  api PUT "/zones/$ZONE_ID/dns_records/$RECORD_ID" "$PAYLOAD" >/dev/null
  echo "Đã cập nhật $RECORD_NAME.$ZONE_NAME -> $TARGET_IP (proxied)"
else
  api POST "/zones/$ZONE_ID/dns_records" "$PAYLOAD" >/dev/null
  echo "Đã tạo $RECORD_NAME.$ZONE_NAME -> $TARGET_IP (proxied)"
fi

echo "Đợi DNS + cert (Caddy tự xin cert sau khi bản ghi trỏ đúng):"
for i in 1 2 3 4 5 6; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "https://$RECORD_NAME.$ZONE_NAME/api/health" || echo 000)
  echo "  lần $i: HTTP $code"
  [ "$code" = "200" ] && break
  sleep 10
done
