#!/usr/bin/env bash
# mirror-peers.sh — lưới an toàn cho việc cấp peer WireGuard.
#
# Vì sao cần: control plane chỉ đẩy peer vào node mà nó chọn; nếu bước đẩy đó lỗi
# (SSH hỏng, node chưa có key…) thì khách vẫn nhận API 201, app báo "Connected"
# nhưng handshake không bao giờ xong ⇒ mất mạng. Script này quét devices.json và
# bảo đảm MỌI thiết bị đang active đều có peer (đúng allowed-ips) trên node local
# và trên các node remote — chạy theo timer 2 phút.
#
# Chạy trên node chứa control plane (mặc định gọi từ systemd timer).
# Env: DATA_FILE, WG_IFACE, REMOTE_SSH (danh sách cách nhau dấu cách)
set -u

DATA_FILE="${DATA_FILE:-/root/flowvpn-cp/data/devices.json}"
WG_IFACE="${WG_IFACE:-wg0}"
REMOTE_SSH="${REMOTE_SSH:-root@103.173.155.50}"
LOG="${LOG:-/var/log/flowvpn-mirror-peers.log}"

[ -f "$DATA_FILE" ] || { echo "$(date -Is) ERROR: thiếu $DATA_FILE" >> "$LOG"; exit 1; }

rows="$(python3 - "$DATA_FILE" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf-8") as f:
    devices = json.load(f)
for d in devices:
    if d.get("active") is False:
        continue
    key, ip = d.get("publicKey"), d.get("assignedIP")
    if key and ip:
        print(key, ip)
PY
)"

count="$(printf '%s\n' "$rows" | grep -c . || true)"
if [ "$count" -eq 0 ]; then
  echo "$(date -Is) không có device active" >> "$LOG"
  exit 0
fi

# 1) node local: thêm peer còn thiếu
local_before="$(wg show "$WG_IFACE" peers | wc -l)"
while read -r key ip; do
  [ -n "$key" ] || continue
  wg set "$WG_IFACE" peer "$key" allowed-ips "$ip/32" || echo "$(date -Is) WARN local fail $ip" >> "$LOG"
done <<< "$rows"
local_after="$(wg show "$WG_IFACE" peers | wc -l)"

# 2) các node remote: gửi 1 lệnh SSH gộp cho mọi peer (idempotent, set lại vô hại)
remote_report=""
for target in $REMOTE_SSH; do
  before="$(ssh -n -o BatchMode=yes -o ConnectTimeout=8 "$target" "wg show $WG_IFACE peers | wc -l" 2>/dev/null || echo "ERR")"
  cmds="$(while read -r key ip; do
    [ -n "$key" ] || continue
    printf 'wg set %s peer %s allowed-ips %s/32; ' "$WG_IFACE" "$key" "$ip"
  done <<< "$rows")"
  if ssh -n -o BatchMode=yes -o ConnectTimeout=10 "$target" "$cmds" 2>/dev/null; then
    after="$(ssh -n -o BatchMode=yes -o ConnectTimeout=8 "$target" "wg show $WG_IFACE peers | wc -l" 2>/dev/null || echo "ERR")"
    remote_report="$remote_report $target:$before->$after"
  else
    remote_report="$remote_report $target:ERROR"
    echo "$(date -Is) ERROR không đẩy được peer sang $target" >> "$LOG"
  fi
done

echo "$(date -Is) devices=$count local:$local_before->$local_after$remote_report" >> "$LOG"
