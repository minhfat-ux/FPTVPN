#!/usr/bin/env bash
# VPNFlow-only SSH — PHƯƠNG ÁN AN TOÀN (thay cho việc lọc theo source IP, vốn đã gây sự cố 26/09).
#
# Vì sao khác: trên Ubuntu 24.04 sshd được **socket-activation** (systemd giữ cổng 22 trong `ssh.socket`),
# nên `ListenAddress` trong sshd_config KHÔNG có tác dụng — phải khai báo ở drop-in của `ssh.socket`.
# Cách này KHÔNG đoán nguồn: node chỉ nghe 22 trên địa chỉ mạng VPN (+ loopback) ⇒ Internet không thể
# bắt tay TCP cổng 22, còn ai đã nối VPNFlow thì `ssh root@<ip-vpn>` vào bình thường.
#
#   vpnflow-ssh-only.sh plan       # in ra địa chỉ sẽ dùng (CHẠY TRƯỚC, không đổi gì)
#   vpnflow-ssh-only.sh apply      # áp dụng + tự kiểm; KHÔNG tự huỷ timer cứu hộ
#   vpnflow-ssh-only.sh rollback   # trả ssh.socket về mặc định
#   vpnflow-ssh-only.sh check      # xem đang nghe ở đâu
set -euo pipefail
DROPIN_DIR=/etc/systemd/system/ssh.socket.d
DROPIN=$DROPIN_DIR/10-vpnflow-only.conf

default_ifaces() { printf '%s\n' "${VPNFLOW_IFACES:-wg0}"; }
want_tailscale() { [ "${VPNFLOW_ALLOW_TAILSCALE:-1}" = "1" ]; }

addresses() {
  {
    echo "127.0.0.1"
    if command -v ip >/dev/null 2>&1; then
      for iface in $(default_ifaces); do
        ip -4 -o addr show dev "$iface" 2>/dev/null | awk '{print $4}' | cut -d/ -f1 || true
      done
      if want_tailscale; then
        ip -4 -o addr show dev tailscale0 2>/dev/null | awk '{print $4}' | cut -d/ -f1 || true
      fi
    fi
  } | grep -v '^$' | sort -u
}

plan() {
  command -v ip >/dev/null 2>&1 || { echo "!! Không có lệnh 'ip' — không xác định được địa chỉ VPN ⇒ DỪNG." >&2; return 1; }
  echo "Giao diện VPN sẽ dùng: $(default_ifaces | tr '\n' ' ')"
  echo "Địa chỉ sshd sẽ nghe:"
  addresses | sed 's/^/  - /'
  local n; n=$(addresses | grep -vc '^127\.0\.0\.1$' || true)
  if [ "${n:-0}" -eq 0 ]; then
    echo "!! Không tìm thấy địa chỉ VPN nào — DỪNG, không áp dụng (sẽ tự khoá mình)." >&2
    return 1
  fi
  echo "Khi áp dụng, đường vào sẽ là: ssh root@$(addresses | grep -v '^127\.' | head -1)"
}

apply() {
  plan
  mkdir -p "$DROPIN_DIR"
  {
    echo "# VPNFlow 2026-09-26 — chỉ cho SSH từ mạng VPNFlow (method an toàn: thu hẹp listener)."
    echo "[Socket]"
    echo "# Xoá hết ListenStream kế thừa rồi khai báo lại đúng các địa chỉ VPN + loopback."
    echo "ListenStream="
    addresses | while read -r addr; do echo "ListenStream=$addr:22"; done
  } > "$DROPIN"
  systemctl daemon-reload
  systemctl restart ssh.socket
  sleep 2
  check
}

rollback() {
  rm -f "$DROPIN"
  systemctl daemon-reload
  systemctl restart ssh.socket
  echo "ROLLBACK: ssh.socket về mặc định"; check
}

check() {
  echo "-- cổng 22 đang nghe --"
  ss -lntp 2>/dev/null | awk 'NR==1 || /:22 /' | sed 's/^/  /'
  if ss -lnt 2>/dev/null | grep -qE '(0\.0\.0\.0|\*|\[::\]):22 '; then
    echo "  => SSH ĐANG mở cho mọi nguồn (Internet thấy được)."
  else
    echo "  => Chỉ nghe trên địa chỉ VPN/loopback: Internet không tới được. ✔"
  fi
  echo "-- cổng 22 có bị chặn thêm bởi nft không --"
  if nft list table inet vpnflow_ssh >/dev/null 2>&1; then echo "  có bảng nft vpnflow_ssh"; else echo "  không có bảng nft vpnflow_ssh"; fi
}

case "${1:-plan}" in
  plan) plan ;;
  apply) apply ;;
  rollback) rollback ;;
  check) check ;;
  *) echo "dùng: plan | apply | rollback | check"; exit 2 ;;
esac
