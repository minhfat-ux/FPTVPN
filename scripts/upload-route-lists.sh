#!/usr/bin/env bash
# upload-route-lists.sh — đẩy danh sách route bypass lên CDN để client tự tải.
#
#   · cn-apps.txt : app Trung Quốc KHÔNG đi VPN (nguồn: control-plane/assets/routes/cn-apps.txt)
#   · cn.txt      : dải IP Trung Quốc đi thẳng (sinh lại từ APNIC, gộp CIDR)
#
# Nhờ vậy thêm app / cập nhật dải IP không cần phát hành bản app mới.
# Dùng: bash scripts/upload-route-lists.sh [--skip-cn-ip]
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

JUMP="${JUMP:-root@103.173.155.50}"
NODE2="${NODE2:-root@165.101.114.162}"
SRC_APPS="control-plane/assets/routes/cn-apps.txt"
SKIP_CN_IP=0
[ "${1:-}" = "--skip-cn-ip" ] && SKIP_CN_IP=1

[ -f "$SRC_APPS" ] || { echo "LỖI: không thấy $SRC_APPS" >&2; exit 2; }

APPS_COUNT="$(grep -vcE '^\s*(#|$)' "$SRC_APPS")"
echo "== cn-apps.txt: $APPS_COUNT app (bỏ comment/dòng trống)"

echo "== 1) đẩy lên node-2 =="
scp -q -o BatchMode=yes -J "$JUMP" "$SRC_APPS" "$NODE2:/tmp/cn-apps.txt"

if [ "$SKIP_CN_IP" = "0" ]; then
  echo "== 2) sinh lại cn.txt từ APNIC (trên node-2) =="
  ssh -o BatchMode=yes -J "$JUMP" "$NODE2" bash -s <<'EOF'
set -e
curl -4 -fsS -m 120 -o /tmp/apnic "https://ftp.apnic.net/stats/apnic/delegated-apnic-latest"
python3 - <<'PY'
import ipaddress
nets = []
for line in open('/tmp/apnic', encoding='utf-8', errors='replace'):
    p = line.split('|')
    if len(p) > 4 and p[0] == 'apnic' and p[1] == 'CN' and p[2] == 'ipv4':
        nets.append(ipaddress.ip_network(f"{p[3]}/{32 - (int(p[4]) - 1).bit_length()}", strict=False))
merged = list(ipaddress.collapse_addresses(sorted(set(nets), key=lambda n: (int(n.network_address), n.prefixlen))))
open('/tmp/cn.txt', 'w').write('\n'.join(str(n) for n in merged) + '\n')
print(f"   {len(nets)} mạng -> {len(merged)} CIDR")
PY
rm -f /tmp/apnic
EOF
fi

echo "== 3) cài vào 2 docroot + quyền =="
ssh -o BatchMode=yes -J "$JUMP" "$NODE2" bash -s <<'EOF'
set -e
for d in /var/www/flowvpn/dl/routes /var/www/dl/routes; do
  mkdir -p "$d"
  install -m 644 -o caddy -g caddy /tmp/cn-apps.txt "$d/cn-apps.txt"
  [ -f /tmp/cn.txt ] && install -m 644 -o caddy -g caddy /tmp/cn.txt "$d/cn.txt" || true
done
rm -f /tmp/cn-apps.txt /tmp/cn.txt
ls -l /var/www/flowvpn/dl/routes/
EOF

echo "== 4) verify qua CDN =="
ssh -o BatchMode=yes -J "$JUMP" "$NODE2" bash -s <<'EOF'
t=$(date +%s)
for f in cn-apps.txt cn.txt; do
  printf '   %-14s HTTP %s  %s byte\n' "$f" \
    "$(curl -4 -s -o /dev/null -w '%{http_code}' -m 60 "https://meetflowai.site/dl/routes/$f?t=$t")" \
    "$(curl -4 -s -m 60 "https://meetflowai.site/dl/routes/$f?t=$t" | wc -c)"
done
curl -4 -s -m 30 "https://meetflowai.site/dl/routes/cn-apps.txt?t=$t" | grep -v '^#' | grep -v '^$' | head -4 | sed 's/^/      /'
EOF
