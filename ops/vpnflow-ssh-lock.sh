#!/usr/bin/env bash
# VPNFlow SSH LOCK v3 — chỉ cho SSH từ MẠNG VPNFlow, có 3 chốt an toàn chống tự khoá mình.
#
# Vì sao v3: bản v1 (đoán nguồn) đã gây sự cố mất SSH ngày 26/09 — xem
# docs/INCIDENT-2026-09-26-ssh-lock.md. Ba chốt của v3:
#   1. NGUỒN PHẢI ĐO, không đoán: `--source <ip>` là bắt buộc (đo bằng bảng đếm `sshprobe`).
#   2. TIMER CỨU HỘ tự mở lại (mặc định 6 giờ) — bật TRƯỚC khi chặn, và chỉ huỷ khi đã vào được
#      từ đường độc lập thứ hai.
#   3. Có LOG nguồn bị chặn (`SSHBLOCK`) để nhìn thấy mình có bị chặn nhầm hay không.
#
#   vpnflow-ssh-lock.sh probe                    # chỉ ĐẾM + ghi log nguồn (không chặn gì)
#   vpnflow-ssh-lock.sh sources                  # đọc log probe ⇒ các nguồn đã thấy
#   vpnflow-ssh-lock.sh apply --source 1.2.3.4   # bật khoá (tự bật timer cứu hộ 6h)
#   vpnflow-ssh-lock.sh status                   # trạng thái + đếm gói theo nguồn
#   vpnflow-ssh-lock.sh survivre <phút>          # chỉ bật timer cứu hộ
#   vpnflow-ssh-lock.sh cancel-rescue            # huỷ timer cứu hộ (sau khi đã kiểm tra kỹ)
#   vpnflow-ssh-lock.sh unblock                  # gỡ chặn, GIỮ sshd chỉ dùng khoá (timer cứu hộ gọi cái này)
#   vpnflow-ssh-lock.sh rollback                 # trả về nguyên trạng (gỡ cả siết sshd)
set -euo pipefail
TABLE=vpnflow_ssh
PROBE=sshprobe
DROPIN=/etc/ssh/sshd_config.d/20-vpnflow-only.conf
SELF=/usr/local/sbin/vpnflow-ssh-lock.sh

# Luôn cho phép: loopback + dải client VPNFlow + Tailscale + IP của 2 node + đội vận hành.
# Danh sách "người nhà" lấy từ bằng chứng thật (docs/INCIDENT-2026-09-26-SSH-BRUTEFORCE.md §IP hợp lệ):
#   103.173.155.50 = node-1 (cũng là đường ra VPNFlow của Mac) · 165.101.114.162 = node-2
#   63.140.14.154  = máy Windows (harness WIN) · 223.118.50.125 = người vận hành
# KHÔNG tự thêm IP lạ: muốn thêm thì truyền --source (sau khi ĐO bằng `probe`/`sources`).
PREFIX_ALLOW="127.0.0.1, 10.77.0.0/24, 10.78.0.0/24, 100.64.0.0/10, 103.173.155.50, 165.101.114.162, 63.140.14.154, 223.118.50.125"
EXTRA="${VPNFLOW_SSH_ALLOW:-}"
RESCUE_MIN="${VPNFLOW_RESCUE_MIN:-360}"

probe() {
  nft delete table inet $PROBE 2>/dev/null || true
  nft add table inet $PROBE
  nft add chain inet $PROBE input "{ type filter hook input priority -20; policy accept; }"
  nft add rule inet $PROBE input tcp dport 22 counter comment "tong-goi-22"
  nft add rule inet $PROBE input tcp dport 22 limit rate 10/minute log prefix "SSHPROBE " level info
  echo "đang ĐẾM (không chặn). Xem nguồn: journalctl -k --since '-10 min' | grep SSHPROBE | grep -oE 'SRC=[0-9.]+' | sort | uniq -c | sort -rn"
}

sources() {
  journalctl -k --since "-30 min" --no-pager 2>/dev/null | grep -oE "SRC=[0-9.]+" | cut -d= -f2 | sort | uniq -c | sort -rn | head -20
}

survivre() {
  local minutes="${1:-$RESCUE_MIN}"
  systemctl stop vpnflow-ssh-rescue.timer >/dev/null 2>&1 || true
  systemd-run --on-active="${minutes}min" --unit=vpnflow-ssh-rescue \
    --description="Tự mở lại SSH nếu bị khoá nhầm" "$SELF" unblock >/dev/null
  echo "timer cứu hộ: ${minutes} phút ($(systemctl is-active vpnflow-ssh-rescue.timer))"
}

cancel_rescue() {
  systemctl stop vpnflow-ssh-rescue.timer >/dev/null 2>&1 || true
  echo "đã huỷ timer cứu hộ — CHỈ làm khi đã vào được từ đường thứ hai"
}

# Chỉ siết sshd (khoá-only), KHÔNG đụng firewall — dùng khi không muốn chặn cứng theo nguồn.
harden() {
  mkdir -p /etc/ssh/sshd_config.d
  cat > "$DROPIN" <<'CONF'
# VPNFlow 2026-09-26 — SSH chỉ dùng KHOÁ, không mật khẩu.
PermitRootLogin prohibit-password
PasswordAuthentication no
KbdInteractiveAuthentication no
CONF
  sshd -t && { systemctl reload ssh >/dev/null 2>&1 || systemctl reload sshd >/dev/null 2>&1 || true; }
  echo "HARDEN: $(sshd -T 2>/dev/null | grep -E '^(passwordauthentication|permitrootlogin)' | tr '\n' ' ')"
}

apply() {
  local extra="$EXTRA"
  while [ $# -gt 0 ]; do
    case "$1" in
      --source) extra="$extra, $2"; shift 2 ;;
      --source=*) extra="$extra, ${1#*=}"; shift ;;
      *) shift ;;
    esac
  done
  # Danh sách "người nhà" đã có sẵn trong PREFIX_ALLOW; `--source` chỉ để THÊM nguồn mới đo được.
  if [ -z "${PREFIX_ALLOW//[ ,]/}" ]; then
    echo "!! Không có nguồn nào để cho phép — DỪNG (sẽ tự khoá mình)." >&2
    return 1
  fi
  local allow="$PREFIX_ALLOW"
  [ -n "${extra//[ ,]/}" ] && allow="$allow, $extra"
  survivre "$RESCUE_MIN"
  nft list table inet $TABLE >/dev/null 2>&1 && nft delete table inet $TABLE
  nft -f - <<EOF
table inet $TABLE {
  set allow4 { type ipv4_addr; flags interval; elements = { $allow } }
  chain input {
    type filter hook input priority -10; policy accept;
    tcp dport 22 ip saddr @allow4 counter accept
    tcp dport 22 limit rate 10/minute log prefix "SSHBLOCK " level info
    tcp dport 22 counter drop comment "ssh chi qua VPNFlow"
  }
}
EOF
  mkdir -p /etc/ssh/sshd_config.d
  cat > "$DROPIN" <<'CONF'
# VPNFlow 2026-09-26 — SSH chỉ dùng KHOÁ, không mật khẩu (đi kèm firewall chỉ cho mạng VPNFlow).
PermitRootLogin prohibit-password
PasswordAuthentication no
KbdInteractiveAuthentication no
CONF
  sshd -t && { systemctl reload ssh >/dev/null 2>&1 || systemctl reload sshd >/dev/null 2>&1 || true; }
  echo "APPLIED cho phép: $allow"
  echo "TỪ GIỜ: mở PHIÊN SSH MỚI để kiểm tra. Nếu không vào được, chờ timer cứu hộ ${RESCUE_MIN} phút."
}

status() {
  if nft list table inet $TABLE >/dev/null 2>&1; then
    echo "ĐANG KHOÁ:"; nft list table inet $TABLE | grep -E "dport 22|elements|allow4" | head -6
  else
    echo "CHƯA KHOÁ (SSH mở cho mọi nguồn)"
  fi
  echo "-- gói vào cổng 22 đếm theo nguồn (nếu đang có probe) --"
  nft -j list table inet $PROBE 2>/dev/null | head -1 >/dev/null && sources || true
  echo "-- timer cứu hộ: $(systemctl is-active vpnflow-ssh-rescue.timer 2>/dev/null || echo không có) --"
  echo "-- sshd --"; sshd -T 2>/dev/null | grep -E "^(passwordauthentication|permitrootlogin)" | sed 's/^/  /'
}

# Gỡ CHẶN nhưng GIỮ siết sshd (chỉ dùng khoá) — đây là thứ timer cứu hộ phải gọi:
# xoá drop-in sẽ bật lại PasswordAuthentication như cũ, không cần thiết để lấy lại quyền vào.
unblock() {
  nft delete table inet $TABLE 2>/dev/null || true
  echo "UNBLOCK: đã gỡ bảng nft $TABLE (SSH mở lại), vẫn giữ sshd chỉ dùng khoá"
}

rollback() {
  nft delete table inet $TABLE 2>/dev/null || true
  rm -f "$DROPIN"
  sshd -t && { systemctl reload ssh >/dev/null 2>&1 || systemctl reload sshd >/dev/null 2>&1 || true; }
  echo "ROLLBACK: đã mở lại SSH như trước"
}

case "${1:-status}" in
  probe) probe ;;
  sources) sources ;;
  apply) shift; apply "$@" ;;
  status) status ;;
  survivre) shift; survivre "$@" ;;
  cancel-rescue) cancel_rescue ;;
  harden) harden ;;
  unblock) unblock ;;
  rollback) rollback ;;
  *) echo "dùng: harden | probe | sources | apply --source <ip> | status | survivre <phút> | cancel-rescue | unblock | rollback"; exit 2 ;;
esac
