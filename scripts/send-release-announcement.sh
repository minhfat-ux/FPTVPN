#!/usr/bin/env bash
# Gửi email thông báo phát hành (iOS + Android) cho toàn bộ user — 3 ngôn ngữ Việt/Anh/Trung.
#
#   scripts/send-release-announcement.sh 1.4.0 --test   # chỉ gửi thử tới ALERT_EMAIL
#   scripts/send-release-announcement.sh 1.4.0          # gửi thật cho toàn bộ user
#
# Chạy từ Mac: payload python được đẩy sang node-2 qua node-1 (node-2 không mở SSH trực tiếp).
# Không in secret. Nội dung chỉ nêu tính năng ĐÃ xong (xem docs/RELEASE_ARTIFACTS_*.md).
set -euo pipefail
VERSION="${1:-1.4.0}"; TEST="${2:-}"
JUMP="root@103.173.155.50"; NODE2="root@165.101.114.162"
DIR="$(cd "$(dirname "$0")" && pwd)"
PAYLOAD="$DIR/send-release-announcement.py"
[ -f "$PAYLOAD" ] || { echo "thiếu $PAYLOAD"; exit 1; }
B64="$(base64 < "$PAYLOAD" | tr -d '\n')"
for i in 1 2 3; do
  OUT=$(ssh -i "$HOME/.ssh/fpt_tunnel" -o ConnectTimeout=10 -o BatchMode=yes "$JUMP" \
        "ssh -o ConnectTimeout=10 -o BatchMode=yes $NODE2 'echo $B64 | base64 -d > /tmp/ann.py && python3 /tmp/ann.py $VERSION $TEST'" 2>&1 | tail -6)
  if [ -n "$OUT" ]; then echo "$OUT"; exit 0; fi
  echo "lần $i: ssh timeout, thử lại"; sleep 5
done
echo "THẤT BẠI: không gửi được (SSH bị chặn?)"; exit 1
