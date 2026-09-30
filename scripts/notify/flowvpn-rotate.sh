#!/bin/bash
# flowvpn-rotate — xoay 1 secret cho VPNFlow bằng MỘT lệnh: cập nhật Ở MAC (nếu file có khoá đó)
# rồi ĐẨY SANG SERVER, KHÔNG BAO GIỜ in giá trị ra (read -s; giá trị đi qua stdin SSH, không vào argv).
#
#   bash scripts/notify/flowvpn-rotate.sh TELEGRAM_BOT_TOKEN
#   bash scripts/notify/flowvpn-rotate.sh RESEND_API_KEY
#   bash scripts/notify/flowvpn-rotate.sh SEPAY_API_KEY
#
# TELEGRAM_BOT_TOKEN: ghi ~/.vpnflow-telegram (Mac) + 2 file trên server + restart CP & bot + tự getMe.
# Khoá chỉ có ở server (RESEND/SEPAY): chỉ đẩy sang server.
# Nguồn sự thật quy trình: docs/handoff/CHOT_SO_2026-09-30.md §7b.
set -euo pipefail
KEY="${1:-}"
[ -n "$KEY" ] || { echo "dùng: bash scripts/notify/flowvpn-rotate.sh <TEN_BIEN>  (vd: TELEGRAM_BOT_TOKEN | RESEND_API_KEY | SEPAY_API_KEY)"; exit 2; }
SSHK="$HOME/.ssh/fpt_vpn_node"; SRV=root@165.101.114.162; TG="$HOME/.vpnflow-telegram"
SSH=(ssh -o BatchMode=yes -o ConnectTimeout=10 -i "$SSHK" "$SRV")
DIR=/etc/systemd/system/flowvpn-cp.service.d

MAC_HAS=0; grep -qE "(^|[^A-Z_])${KEY}=" "$TG" 2>/dev/null && MAC_HAS=1
SRV_HAS=0; "${SSH[@]}" "grep -qE '(^|[^A-Z_])${KEY}=' $DIR/*.conf" 2>/dev/null && SRV_HAS=1
if [ "$MAC_HAS" = 0 ] && [ "$SRV_HAS" = 0 ]; then
  echo "LỖI: không nơi nào có $KEY (Mac=$TG · server=$DIR/*.conf)"; exit 1
fi

read -rsp "Dán giá trị MỚI cho $KEY (sẽ không hiện ra): " VAL; echo
[ -n "$VAL" ] || { echo "LỖI: giá trị rỗng"; exit 1; }

if [ "$MAC_HAS" = 1 ]; then
  cp -a "$TG" "$TG.bak-rotate-$(date +%Y%m%d-%H%M%S)"
  printf '%s' "$VAL" | python3 - "$TG" "$KEY" <<'PY'
import sys,io,re
p,key=sys.argv[1],sys.argv[2]; val=sys.stdin.read().strip()
s=io.open(p,encoding="utf-8").read()
assert re.search(r"("+re.escape(key)+r"=)",s), "khong thay key trong file"
io.open(p,"w",encoding="utf-8").write(
    re.sub(r"("+re.escape(key)+r"=)(\"?)[^\"\s]*(\"?)", lambda m:m.group(1)+m.group(2)+val+m.group(3), s, count=1))
PY
  echo "  ✔ Mac   : đã cập nhật $KEY trong ~/.vpnflow-telegram (có backup .bak-rotate-*)"
fi

if [ "$SRV_HAS" = 1 ]; then
  printf '%s' "$VAL" | "${SSH[@]}" "flowvpn-set-secret $KEY"
fi

if [ "$KEY" = "TELEGRAM_BOT_TOKEN" ]; then
  echo "  --- kiểm chứng từ Mac ---"
  node "$(cd "$(dirname "$0")/../.." && pwd)/.privatevpn/tmp/tg-me.mjs" 2>/dev/null | head -2 || echo "  (không chạy được tg-me.mjs — bỏ qua)"
fi
echo "  xong."
