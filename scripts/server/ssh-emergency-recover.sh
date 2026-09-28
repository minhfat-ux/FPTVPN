#!/bin/bash
# CỨU ĐƯỜNG SSH node-2 khi bị brute-force / rule INPUT chặn nhầm.
# Chạy TRÊN node-2 (qua console/VNC nhà cung cấp, hoặc SSH từ node-1 nếu vào được).
# Nguyên tắc: DEAD-MAN SWITCH đặt TRƯỚC, WHITELIST trước mọi DROP, không bao giờ stop dịch vụ.
set -u
[ "$(id -u)" = "0" ] || { echo "phải chạy bằng root"; exit 1; }

echo "== 0. dead-man switch: 5 phút nữa tự mở sạch INPUT nếu ta tự khoá mình =="
nohup sh -c 'sleep 300; iptables -F INPUT; iptables -P INPUT ACCEPT; logger -t ssh-recover "DEADMAN: đã xả INPUT"' >/dev/null 2>&1 &
echo "   deadman-scheduled (pid $!)"

echo "== 1. whitelist lên ĐẦU chuỗi (node-1, node-2, tailscale, loopback) =="
for ip in 103.173.155.50 165.101.114.162 100.76.147.111 127.0.0.1; do
  iptables -I INPUT 1 -s "$ip" -j ACCEPT
done
iptables -I INPUT 1 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

echo "== 2. bỏ rule rate-limit 'recent' cũ (chặn nhầm chính mình) =="
for name in sshbf sshrate; do
  for hc in 6 12 20 30; do
    while iptables -D INPUT -p tcp --dport 22 -m conntrack --ctstate NEW -m recent --name "$name" --update --seconds 60 --hitcount "$hc" -j DROP 2>/dev/null; do :; done
  done
  while iptables -D INPUT -p tcp --dport 22 -m conntrack --ctstate NEW -m recent --name "$name" --set 2>/dev/null; do :; done
done

echo "== 3. chặn các dải ĐANG brute-force (đo 26/09) =="
for net in 109.160.32.0/24 176.53.159.0/24 77.239.124.0/24 103.10.227.0/24 \
           45.148.10.0/24 193.47.62.0/24 92.118.39.50 62.60.130.253 76.90.193.3 49.254.38.138; do
  iptables -C INPUT -s "$net" -j DROP 2>/dev/null || iptables -I INPUT 3 -s "$net" -j DROP
done

echo "== 4. giảm tải sshd (MaxStartups hay bị ngập vì flood ⇒ không gửi banner) =="
mkdir -p /etc/ssh/sshd_config.d
cat > /etc/ssh/sshd_config.d/99-flowvpn-hardening.conf <<'CONF'
# VPNFlow 26/09/2026 — chống brute-force, giữ key-only cho quản trị
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
PermitRootLogin prohibit-password
MaxStartups 10:30:60
LoginGraceTime 15
MaxAuthTries 3
CONF
sshd -t && systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null

echo "== 5. lưu bền =="
mkdir -p /etc/iptables; iptables-save > /etc/iptables/rules.v4 && echo "   đã lưu /etc/iptables/rules.v4"

echo "== 6. kiểm chứng =="
iptables -L INPUT -n --line-numbers | head -14
for r in vn1hy vn2hy vn1wg vn2wg; do curl -s -o /dev/null -w "$r=%{http_code} " "https://api.meetflowai.site/relay/$r"; done; echo
echo "== 7. XOÁ dead-man switch khi mọi thứ OK: pkill -f 'DEADMAN' hoặc để nó tự nổ =="
