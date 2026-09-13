#!/usr/bin/env bash
#
# Bật gửi mail qua Resend trên VPS (DKIM sẽ ký bằng meetflowai.site).
#
# Usage:
#   scripts/set-resend-key.sh            # hỏi key (không lộ ra màn hình/terminal history)
#   scripts/set-resend-key.sh --clear    # quay lại SMTP
#
# Sau khi chạy, kiểm tra: scripts/check-email-auth.sh  → DKIM check phải là "pass".
#
set -euo pipefail

VPS="${VPS:-root@103.173.155.50}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/fpt_tunnel}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

scp -q -i "$SSH_KEY" -o StrictHostKeyChecking=no \
  "$ROOT/scripts/set-resend-key.py" "$VPS:/root/flowvpn-cp/scripts/set-resend-key.py"

run_remote() {
  ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$VPS" \
    "cd /root/flowvpn-cp && python3 scripts/set-resend-key.py $1"
}

if [ "${1:-}" = "--clear" ]; then
  run_remote --clear
  exit 0
fi

printf 'Dán Resend API key (re_...), nội dung sẽ không hiện ra: '
read -rs KEY
printf '\n'
run_remote "" <<<"$KEY"
