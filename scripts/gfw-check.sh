#!/usr/bin/env bash
# gfw-check.sh — phát hiện chặn theo TÊN MIỀN (SNI), kiểu GFW Trung Quốc.
#
# Vì sao phải kiểm TLS theo SNI: GFW chặn theo tên miền, KHÔNG theo IP. Đo thật 16/09:
# cùng IP Cloudflare 104.21.83.112, SNI "cloudflare.com" handshake OK nhưng SNI
# "meetflowai.site" fail "TLS alert 40" — trong khi TCP vẫn connect bình thường.
# Nên chỉ ping/TCP là KHÔNG đủ để kết luận host có vào được hay không.
#
# Dùng:
#   scripts/gfw-check.sh                       # kiểm danh sách mặc định
#   scripts/gfw-check.sh api.meetflowai.site   # kiểm host chỉ định
#   scripts/gfw-check.sh --json                # xuất JSON (cho agent/cron đọc)
# Exit code: 1 nếu có host bị BLOCKED (để cron/agent phát hiện).
set -uo pipefail

HOSTS=()
JSON=0
for a in "$@"; do
  case "$a" in
    --json) JSON=1 ;;
    -*) echo "tham số lạ: $a" >&2; exit 2 ;;
    *) HOSTS+=("$a") ;;
  esac
done
[ ${#HOSTS[@]} -eq 0 ] && HOSTS=(api.meetflowai.site t1.meetflowai.site meetflowai.site fcnvpn.tail303be3.ts.net)

resolve() { # in ra IP đầu tiên
  if command -v dig >/dev/null 2>&1; then dig +short +time=4 +tries=1 A "$1" 2>/dev/null | head -1
  else nslookup "$1" 2>/dev/null | awk '/^Address: /{print $2; exit}'; fi
}
tcp_ok() { # $1=ip $2=port
  if command -v nc >/dev/null 2>&1; then nc -z -w4 "$1" "$2" >/dev/null 2>&1
  else (exec 3<>"/dev/tcp/$1/$2") >/dev/null 2>&1 && exec 3<&- ; fi
}
tls_ok() { # $1=ip $2=sni  -> 0 nếu handshake thành công
  echo | openssl s_client -connect "$1:443" -servername "$2" 2>/dev/null | grep -q "Verify return code: 0"
}

BLOCKED=0
ROWS=()
for h in "${HOSTS[@]}"; do
  ip="$(resolve "$h")"
  if [ -z "$ip" ]; then
    verdict="UNKNOWN"; detail="DNS không phân giải được"
  elif ! tcp_ok "$ip" 443; then
    verdict="UNKNOWN"; detail="TCP 443 không kết nối được (mạng chặn/chết)"
  elif tls_ok "$ip" "$h"; then
    verdict="OK"; detail="DNS + TCP + TLS(SNI) đều tốt"
  else
    verdict="BLOCKED"; detail="TCP thông nhưng TLS theo SNI thất bại ⇒ nghi chặn theo TÊN"
    BLOCKED=1
  fi
  ROWS+=("$h|${ip:-–}|$verdict|$detail")
done

if [ "$JSON" = "1" ]; then
  printf '{"checkedAt":"%s","hosts":[' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  first=1
  for r in "${ROWS[@]}"; do
    IFS='|' read -r h ip v d <<<"$r"
    [ $first -eq 0 ] && printf ','
    first=0
    printf '{"host":"%s","ip":"%s","verdict":"%s","detail":"%s"}' "$h" "$ip" "$v" "$d"
  done
  printf ']}\n'
else
  printf '%-34s %-16s %-8s %s\n' "HOST" "IP" "KẾT LUẬN" "GHI CHÚ"
  for r in "${ROWS[@]}"; do
    IFS='|' read -r h ip v d <<<"$r"
    printf '%-34s %-16s %-8s %s\n' "$h" "$ip" "$v" "$d"
  done
  [ "$BLOCKED" = "1" ] && echo "⇒ CÓ host bị chặn: nên chuyển client sang host dự phòng / xoay hostname." \
                       || echo "⇒ Tất cả host đang vào được từ điểm đo này."
fi

exit $BLOCKED
