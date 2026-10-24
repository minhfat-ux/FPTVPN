#!/bin/bash
# Gỡ cấu hình gateway Mac cho TV (chạy bằng sudo).
set -e
TV="${TV_IP:-192.168.100.104}"
if [ "$(id -u)" != "0" ]; then echo "phải chạy bằng sudo"; exit 2; fi
pfctl -a tvflow -F all 2>/dev/null || true
if grep -q 'rdr-anchor "tvflow"' /etc/pf.conf; then
  cp /etc/pf.conf "/etc/pf.conf.bak-off-$(date +%Y%m%d%H%M)"
  # xoá 5 dòng đã thêm
  sed -i '' '/# TVFlow gateway cho TV/d; /rdr-anchor "tvflow"/d; /^anchor "tvflow"$/d; /load anchor "tvflow"/d' /etc/pf.conf
fi
sysctl -w net.inet.ip.forwarding=0 >/dev/null || true
pfctl -f /etc/pf.conf 2>/dev/null || true
echo "đã gỡ. Nhớ trả TV về DHCP gateway cũ."
