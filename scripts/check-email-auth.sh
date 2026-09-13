#!/usr/bin/env bash
#
# Kiểm tra xác thực email (SPF / DKIM / DMARC) của meetflowai.site.
#
# Gửi 1 thư test từ control plane tới dịch vụ kiểm tra của Port25 rồi đọc báo cáo
# trả về. Chạy SAU MỖI lần đổi DNS hoặc đổi nhà cung cấp gửi mail — đây là cách
# duy nhất biết chắc Gmail có còn coi mail là spam hay không.
#
# Usage: scripts/check-email-auth.sh
#
set -euo pipefail

VPS="${VPS:-root@103.173.155.50}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/fpt_tunnel}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

scp -q -i "$SSH_KEY" -o StrictHostKeyChecking=no \
  "$ROOT/scripts/email-auth-report.py" "$VPS:/tmp/email-auth-report.py"

ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$VPS" \
  'mkdir -p /root/flowvpn-cp/scripts && cp /tmp/email-auth-report.py /root/flowvpn-cp/scripts/ && cd /root/flowvpn-cp && python3 scripts/email-auth-report.py'
