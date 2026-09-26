#!/usr/bin/env bash
# Cài agent phòng thủ fBuddy VPS GUARD lên node. Chạy TRÊN node (cần root):
#   sudo bash /opt/fbuddy/ops/vps-guard/install.sh
# Idempotent: chạy lại chỉ cập nhật unit + chốt baseline nếu chưa có.
set -euo pipefail

GUARD_DIR="${FBUDDY_GUARD_HOME:-/opt/fbuddy/ops/vps-guard}"
STATE_DIR="${FBUDDY_GUARD_DIR:-/var/lib/fbuddy/guard}"
UNIT_NAME="fbuddy-guard"

if [[ $EUID -ne 0 ]]; then echo "Cần chạy bằng root (sudo)." >&2; exit 1; fi
if [[ ! -f "$GUARD_DIR/guard.mjs" ]]; then echo "Không thấy $GUARD_DIR/guard.mjs" >&2; exit 1; fi

NODE_BIN="$(command -v node || true)"
[[ -n "$NODE_BIN" ]] || { echo "Không thấy node" >&2; exit 1; }
echo "node: $NODE_BIN ($($NODE_BIN -v))"

mkdir -p "$STATE_DIR"
chmod 750 "$STATE_DIR"
# Quyền đọc tệp bí mật để lấy token Telegram / agent-bus (service chạy root, nhưng để rõ ràng).
chmod 600 /etc/fbuddy/fbuddy.env 2>/dev/null || true

cat > "/etc/systemd/system/${UNIT_NAME}.service" <<UNIT
[Unit]
Description=fBuddy VPS GUARD - agent phong thu (doc lap, chi canh bao)
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
WorkingDirectory=${GUARD_DIR}
Environment=NODE_ENV=production
ExecStart=${NODE_BIN} ${GUARD_DIR}/guard.mjs --once --quiet
Nice=5
IOSchedulingClass=best-effort
IOSchedulingPriority=6
TimeoutStartSec=300
# guard thoát mã 2 khi có phát hiện >= HIGH (để script bắt sự kiện) — systemd vẫn coi là chạy xong
SuccessExitStatus=2
# Giới hạn để guard không bao giờ làm nghẽn node
CPUQuota=40%
MemoryMax=256M
UNIT

cat > "/etc/systemd/system/${UNIT_NAME}.timer" <<UNIT
[Unit]
Description=Chay fBuddy VPS GUARD moi 2 phut

[Timer]
OnBootSec=90
OnUnitActiveSec=2min
AccuracySec=15s
Unit=${UNIT_NAME}.service

[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
systemctl enable --now "${UNIT_NAME}.timer"

if [[ ! -f "$STATE_DIR/baseline.json" ]]; then
  echo "Chốt baseline lần đầu…"
  "$NODE_BIN" "$GUARD_DIR/guard.mjs" --baseline
else
  echo "Đã có baseline: $STATE_DIR/baseline.json (chỉ chốt lại khi cố ý: guard.mjs --baseline)"
fi

echo
echo "--- Kiểm tra ---"
systemctl is-enabled "${UNIT_NAME}.timer" && systemctl is-active "${UNIT_NAME}.timer"
systemctl list-timers "${UNIT_NAME}.timer" --no-pager | head -3
echo
echo "Xong. Lệnh hữu ích:"
echo "  node $GUARD_DIR/guard.mjs --once        # kiểm tra ngay"
echo "  node $GUARD_DIR/guard.mjs --alert-test  # thử kênh cảnh báo"
echo "  journalctl -u ${UNIT_NAME} -n 50        # log các lượt chạy"
echo "  tail -f $STATE_DIR/guard.log            # log chi tiết"
