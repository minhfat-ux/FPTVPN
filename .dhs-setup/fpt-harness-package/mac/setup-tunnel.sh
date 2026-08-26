#!/bin/bash
# FPT Harness — Mac-side tunnel installer (self-healing, no autossh needed).
# Installs a SINGLE launchd job (com.dsh.tunnel) with a single-instance-locked wrapper.
# Removes the legacy com.fpt.tunnel job (root cause of the 2026-08-24 bad-gateway fight).
# Usage: bash setup-tunnel.sh <VPS_IP> [SSH_USER=root] [SSH_PORT=22]
set -euo pipefail

VPS="${1:?Usage: bash setup-tunnel.sh <VPS_IP> [SSH_USER=root] [SSH_PORT=22]}"
SSH_USER="${2:-root}"
SSH_PORT="${3:-22}"
KEY="$HOME/.ssh/dsh_tunnel"
WRAPPER="$HOME/dsh-tunnel.sh"
PLIST="$HOME/Library/LaunchAgents/com.dsh.tunnel.plist"
LEGACY_PLIST="$HOME/Library/LaunchAgents/com.fpt.tunnel.plist"

echo "==> [1/5] SSH key riêng cho tunnel"
if [ ! -f "$KEY" ]; then
  ssh-keygen -t ed25519 -f "$KEY" -N '' -C 'dsh-tunnel' -q
  echo "    Key tạo xong: $KEY.pub"
else
  echo "    Key đã có: $KEY"
fi

echo "==> [2/5] Cài pubkey lên VPS $SSH_USER@$VPS (nhập password SSH khi được hỏi)"
PUB=$(cat "$KEY.pub")
ssh -p "$SSH_PORT" "$SSH_USER@$VPS" "mkdir -p ~/.ssh && chmod 700 ~/.ssh && grep -qF '$PUB' ~/.ssh/authorized_keys 2>/dev/null || echo '$PUB' >> ~/.ssh/authorized_keys; chmod 600 ~/.ssh/authorized_keys"

echo "==> [3/5] Gỡ job CŨ com.fpt.tunnel (tránh 2 wrapper đánh nhau)"
launchctl bootout "gui/$(id -u)" com.fpt.tunnel 2>/dev/null || true
[ -f "$LEGACY_PLIST" ] && mv "$LEGACY_PLIST" "$LEGACY_PLIST.disabled" && echo "    $LEGACY_PLIST -> .disabled"

echo "==> [4/5] Wrapper self-healing + single-instance lock: $WRAPPER"
cat > "$WRAPPER" <<WRAPEOF
#!/bin/bash
# FPT Harness tunnel — self-healing (fast version).
# 1) Single-instance guard (pidfile lock) — prevents two wrappers fighting over :13080.
# 2) Wait for network (max ~10s after a network switch)
# 3) Clear stale 13080 on the VPS once, then connect; retry fast
VPS=$VPS
KEY=$KEY
LOCK=/tmp/dsh-tunnel.lock

# single-instance guard: a second wrapper exits immediately instead of fighting
if ! mkdir "\$LOCK" 2>/dev/null; then
  echo "\$(date '+%F %T') another tunnel wrapper running, exiting" >> /tmp/dsh-tunnel.out.log
  exit 0
fi
trap 'rmdir "\$LOCK" 2>/dev/null' EXIT

# 1) wait for network up (max ~10s)
for i in \$(seq 1 5); do
  ping -c 1 -W 1 "\$VPS" >/dev/null 2>&1 && break
  sleep 2
done

# 2) clear stale listener ONCE (not per attempt — was killing our own healthy tunnel)
ssh -i "\$KEY" -o IdentitiesOnly=yes -o ConnectTimeout=5 -o StrictHostKeyChecking=accept-new \\
  root@\$VPS 'fuser -k 13080/tcp 2>/dev/null; true' 2>/dev/null

# 3) connect; retry up to 8 times. Mỗi lần retry đều dọn port cũ trên VPS —
#    sshd vừa chết giữ port -> ssh mới báo "remote port forwarding failed".
#    Single-instance lock đảm bảo chỉ 1 wrapper chạy nên fuser mỗi retry an toàn.
for attempt in \$(seq 1 8); do
  ssh -i "\$KEY" -o IdentitiesOnly=yes -o ConnectTimeout=5 -o StrictHostKeyChecking=accept-new \\
    root@\$VPS 'fuser -k 13080/tcp 2>/dev/null; sleep 1; true' 2>/dev/null

  ssh -i "\$KEY" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new \\
    -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -o ExitOnForwardFailure=yes \\
    -o ConnectTimeout=8 -C -N -R 127.0.0.1:13080:127.0.0.1:3080 root@\$VPS && exit 0
  sleep 2
done
exit 1
WRAPEOF
chmod +x "$WRAPPER"
echo "    Wrapper đã tạo (lock single-instance + chờ mạng + dọn port 1 lần + retry 8 lần)"

echo "==> [5/5] LaunchAgent duy nhất com.dsh.tunnel"
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>com.dsh.tunnel</string>
	<key>ProgramArguments</key>
	<array>
		<string>/bin/bash</string>
		<string>${WRAPPER}</string>
	</array>
	<key>ThrottleInterval</key>
	<integer>5</integer>
	<key>RunAtLoad</key>
	<true/>
	<key>KeepAlive</key>
	<true/>
	<key>StandardOutPath</key>
	<string>/tmp/dsh-tunnel.out.log</string>
	<key>StandardErrorPath</key>
	<string>/tmp/dsh-tunnel.err.log</string>
</dict>
</plist>
PLISTEOF
launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "    Daemon đã nạp (tự phục hồi, chạy lại khi reboot)."

echo
echo "==> Xong! Kiểm tra:"
echo "    launchctl list | grep dsh   (chỉ 1 job tunnel)"
echo "    ssh -p $SSH_PORT $SSH_USER@$VPS 'ss -tlnp | grep 13080'"
