#!/usr/bin/env bash
# release-audit-alert.sh — nhận JSON kết quả `scripts/audit-releases.py` qua stdin (dùng làm
# `--alert-cmd`) và húc người thật biết CÓ KÊNH LỆCH: in ra + gửi Telegram qua `flowvpn-notify`.
#
# Vì sao có lớp này: audit chạy định kỳ (health-watch, luật 8 PUBLISHER_PROCESS) nên khi lệch phải
# báo NGAY cho người theo dõi, không im lặng ghi log. Mọi lỗi bị nuốt để không làm chết vòng audit.
#
# Cấu hình:
#   VPNFLOW_ALERT_SSH   đích SSH có `flowvpn-notify` (mặc định root@165.101.114.162 — node-2).
#                       Đặt rỗng để chỉ in ra màn hình (dùng khi thử).
#   VPNFLOW_ALERT_SSH_KEY  khoá SSH (mặc định ~/.ssh/fpt_vpn_node — khoá mặc định của Mac hay bị từ chối).
# Ví dụ:
#   python3 scripts/audit-releases.py --interval 21600 --log ~/.vpnflow-release-audit.jsonl \
#       --alert-cmd 'scripts/release-audit-alert.sh'
set -uo pipefail

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
cat > "$TMP"

BASE="${AUDIT_BASE:-?}"
HOST="$(hostname -s 2>/dev/null || echo mac)"

DETAIL="$(python3 - "$TMP" <<'PY'
import json, sys

try:
    rows = json.load(open(sys.argv[1], encoding="utf-8"))
except Exception:
    print("(không đọc được JSON kết quả)")
    raise SystemExit(0)

bad = [r for r in rows if r.get("verdict") == "LỆCH"]
if not bad:
    print("(không có kênh LỆCH)")
else:
    for r in bad:
        print("- {}: {}".format(r.get("label", r.get("platform")), r.get("note", "")))
PY
)"

MSG="🚨 AUDIT KÊNH PHÁT HÀNH LỆCH (${HOST}, ${BASE})
${DETAIL}
Xem docs/PUBLISHER_PROCESS.md §6/§7 — cập nhật link + set mốc + thông báo khách."

echo "$MSG"

SSH_TARGET="${VPNFLOW_ALERT_SSH-root@165.101.114.162}"
SSH_KEY="${VPNFLOW_ALERT_SSH_KEY:-$HOME/.ssh/fpt_vpn_node}"
if command -v flowvpn-notify >/dev/null 2>&1; then
  flowvpn-notify --ping "$MSG" || echo "⚠ flowvpn-notify lỗi (bỏ qua)" >&2
elif [ -n "$SSH_TARGET" ]; then
  SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=8)
  [ -f "$SSH_KEY" ] && SSH_OPTS+=(-i "$SSH_KEY")
  printf '%s' "$MSG" | ssh "${SSH_OPTS[@]}" "$SSH_TARGET" 'flowvpn-notify --ping "$(cat)"' \
    || echo "⚠ gửi Telegram qua ${SSH_TARGET} lỗi (bỏ qua)" >&2
else
  echo "⚠ VPNFLOW_ALERT_SSH rỗng — chỉ in ra màn hình, KHÔNG gửi Telegram" >&2
fi
exit 0
