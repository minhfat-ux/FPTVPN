#!/usr/bin/env bash
# wol-mac.sh — gửi gói Magic Packet Wake-on-LAN để đánh thức máy Mac đang ngủ.
#
#   wol-mac.sh <mac[,mac...]> [<đích>] [<cổng>]
#
#   <mac>   địa chỉ MAC của máy cần đánh thức. Nên truyền CẢ MAC phần cứng LẪN MAC đang dùng:
#           macOS "Private Wi-Fi Address" làm MAC đổi theo từng mạng, mà chip mạng có thể chỉ
#           lắng nghe một trong hai — gửi cả hai thì chắc ăn.
#   <đích>  mặc định 255.255.255.255. Gọi TỪ VPS thì phải là IP công cộng của router nhà, và
#           router phải forward cổng UDP này vào địa chỉ broadcast của LAN.
#   <cổng>  mặc định 9.
#
# Gói tin (chuẩn Wake-on-LAN): 6 byte 0xFF + địa chỉ MAC lặp 16 lần = 102 byte.
set -euo pipefail

MACS="${1:?can <mac[,mac...]> [<dich>] [<cong>]}"
HOST="${2:-255.255.255.255}"
PORT="${3:-9}"

python3 - "$MACS" "$HOST" "$PORT" <<'PY'
import re
import socket
import sys

macs = [m.strip() for m in sys.argv[1].split(",") if m.strip()]
host = sys.argv[2]
port = int(sys.argv[3])
if not macs:
    sys.exit("loi: khong co dia chi MAC nao")

sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
sock.settimeout(5)

rc = 0
for mac in macs:
    hexmac = re.sub(r"[^0-9a-fA-F]", "", mac)
    if len(hexmac) != 12:
        print(f"loi: MAC khong hop le: {mac} (can 12 chu so hex)", file=sys.stderr)
        rc = 2
        continue
    payload = b"\xff" * 6 + bytes.fromhex(hexmac) * 16
    try:
        sock.sendto(payload, (host, port))
        print(f"==> da gui magic packet toi {host}:{port} cho {mac} ({len(payload)} byte)")
    except OSError as err:
        print(f"loi: khong gui duoc toi {host}:{port}: {err}", file=sys.stderr)
        rc = 1
sys.exit(rc)
PY
