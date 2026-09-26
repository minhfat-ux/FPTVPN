#!/bin/bash
# SỰ CỐ 26/09/2026 — node-2 bị SSH brute-force + rule INPUT chặn nhầm đường quản trị.
# Chạy bằng console/VNC nhà cung cấp (hoặc SSH khi đã vào được). Thứ tự: AN TOÀN -> MỞ ĐƯỜNG -> KIỂM XÂM NHẬP -> ĐÓNG CỬA -> AUTOBAN.
set -u
[ "$(id -u)" = 0 ] || { echo "cần root"; exit 1; }

echo "===== 0. DEAD-MAN: 10 phút nữa tự xả INPUT nếu ta tự khoá mình ====="
nohup sh -c 'sleep 600; iptables -F INPUT; iptables -P INPUT ACCEPT; logger -t flowvpn-recover DEADMAN-FIRED' >/dev/null 2>&1 &
echo "deadman-scheduled"

echo "===== 1. MỞ ĐƯỜNG QUẢN TRỊ (whitelist trước mọi DROP) ====="
iptables -F INPUT; iptables -P INPUT ACCEPT
iptables -A INPUT -i lo -j ACCEPT
iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
for ip in 103.173.155.50 165.101.114.162 100.76.147.111; do iptables -A INPUT -s "$ip" -j ACCEPT; done
iptables -A INPUT -p tcp --dport 22 -j ACCEPT
for n in 109.160.32.0/24 176.53.159.0/24 77.239.124.0/24 103.10.227.0/24 45.148.10.0/24 193.47.62.0/24 92.118.39.50 62.60.130.253 76.90.193.3 49.254.38.138; do
  iptables -A INPUT -s "$n" -j DROP
done
mkdir -p /etc/iptables; iptables-save > /etc/iptables/rules.v4 && echo "đã lưu rules"

echo "===== 2. KIỂM XÂM NHẬP (P0) -> /root/incident-check.txt ====="
{
  echo "== THỜI ĐIỂM: $(date -Is) =="
  echo "== [1] ĐĂNG NHẬP THÀNH CÔNG (Accepted) =="; grep -ah "Accepted" /var/log/auth.log* /var/log/secure* 2>/dev/null | tail -30
  echo "== [2] last (đăng nhập gần đây) =="; last -n 15 2>/dev/null
  echo "== [3] lastb (thất bại) =="; lastb -n 10 2>/dev/null | head -12
  echo "== [4] authorized_keys của MỌI user =="; for h in /root /home/*; do f="$h/.ssh/authorized_keys"; [ -f "$f" ] && { echo "--- $f"; ls -l "$f"; cat "$f"; }; done
  echo "== [5] user có shell/UID>=1000 =="; awk -F: '$3>=1000||$1=="root"{print $1" uid="$3" home="$6" shell="$7}' /etc/passwd
  echo "== [6] user mới trong /etc/passwd (sửa gần đây) =="; ls -l /etc/passwd /etc/shadow /etc/group /etc/sudoers
  echo "== [7] sudoers.d =="; ls -l /etc/sudoers.d/ 2>/dev/null; grep -rh . /etc/sudoers.d/ 2>/dev/null | grep -v '^#'
  echo "== [8] cron =="; crontab -l 2>/dev/null; ls -l /etc/cron.d/ /etc/cron.hourly/ /var/spool/cron/ 2>/dev/null
  echo "== [9] systemd unit tạo/sửa 7 ngày =="; find /etc/systemd/system /lib/systemd/system -name '*.service' -mtime -7 -printf '%TY-%Tm-%Td %TH:%TM %p\n' 2>/dev/null | sort | tail -20
  echo "== [10] cổng đang listen =="; ss -tlnp 2>/dev/null | head -25
  echo "== [11] tiến trình tốn CPU (nghi đào coin) =="; ps -eo pid,user,pcpu,pmem,etime,cmd --sort=-pcpu 2>/dev/null | head -12
  echo "== [12] file mới 2 ngày ở /root /tmp /dev/shm /var/tmp =="; find /root /tmp /dev/shm /var/tmp -newermt '-2 days' -type f -printf '%TY-%Tm-%Td %TH:%TM %s %p\n' 2>/dev/null | sort | head -40
  echo "== [13] kết nối ra ngoài đang mở (nghi beacon/miner) =="; ss -tnp state established 2>/dev/null | head -20
  echo "== [14] shell history của root =="; tail -30 /root/.bash_history 2>/dev/null
} > /root/incident-check.txt 2>&1
echo "ĐÃ GHI /root/incident-check.txt — dán 60 dòng đầu cho harness Mac:"
head -60 /root/incident-check.txt

echo "===== 3. ĐÓNG CỬA BỊ QUÉT (chỉ key, giảm tải sshd) ====="
mkdir -p /etc/ssh/sshd_config.d
cat > /etc/ssh/sshd_config.d/99-flowvpn.conf <<'CONF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
MaxStartups 10:30:60
LoginGraceTime 15
MaxAuthTries 3
CONF
sshd -t && { systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null; } && echo "sshd: CHỈ KEY + giảm tải (console vẫn vào được nếu khoá SSH)"

echo "===== 4. AUTOBAN >20 lần/60 phút (24h; tái phạm 3 lần = vĩnh viễn) ====="
mkdir -p /var/lib/flowvpn-autoban
cat > /usr/local/bin/flowvpn-autoban <<'AB'
#!/bin/bash
# IP lạ đăng nhập thất bại >20 lần trong 60 phút -> ban 24h (lần 3 trở đi: vĩnh viễn)
set -u
WL="103.173.155.50 165.101.114.162 100.76.147.111 127.0.0.1"
CF="173.245.48.0/20 103.21.244.0/22 103.22.200.0/22 103.31.4.0/22 141.101.64.0/18 108.162.192.0/18 190.93.240.0/20 188.114.96.0/20 197.234.240.0/22 198.41.128.0/17 162.158.0.0/15 104.16.0.0/13 104.24.0.0/14 172.64.0.0/13 131.0.72.0/22"
DIR=/var/lib/flowvpn-autoban; STATE=$DIR/banned.json; PERM=$DIR/permanent.json
touch "$STATE" "$PERM"
is_ok() { local ip="$1"; for w in $WL; do [ "$ip" = "$w" ] && return 0; done
  python3 - "$ip" $CF <<'PY' 2>/dev/null && return 0 || return 1
import ipaddress,sys
ip=ipaddress.ip_address(sys.argv[1])
sys.exit(0 if any(ip in ipaddress.ip_network(c,strict=False) for c in sys.argv[2:]) else 1)
PY
}
journalctl -u ssh -u sshd --since "-60min" --no-pager 2>/dev/null \
 | grep -aE "Failed password|Invalid user|Connection closed by authenticating" \
 | grep -oE "from ([0-9]{1,3}\.){3}[0-9]{1,3}" | awk '{print $2}' | sort | uniq -c | awk '$1>20{print $2}' \
 | while read -r ip; do
     is_ok "$ip" && { echo "whitelist, bỏ qua $ip"; continue; }
     n=$(python3 -c "import json,sys;d=json.load(open('$PERM'));print(d.get('$ip',0))" 2>/dev/null || echo 0)
     if [ "${n:-0}" -ge 2 ]; then
       iptables -C INPUT -s "$ip" -j DROP 2>/dev/null || iptables -I INPUT 3 -s "$ip" -j DROP
       python3 - "$ip" "$PERM" <<'PY'
import json,sys
ip,p=sys.argv[1],sys.argv[2]; d=json.load(open(p)) if open(p).read().strip() else {}
d[ip]=d.get(ip,0)+1; json.dump(d,open(p,'w'))
PY
       echo "BAN VĨNH VIỄN $ip (tái phạm)"
     else
       iptables -C INPUT -s "$ip" -j DROP 2>/dev/null || iptables -I INPUT 3 -s "$ip" -j DROP
       python3 - "$ip" "$PERM" <<'PY'
import json,sys
ip,p=sys.argv[1],sys.argv[2]; d=json.load(open(p)) if open(p).read().strip() else {}
d[ip]=d.get(ip,0)+1; json.dump(d,open(p,'w'))
PY
       echo "BAN 24h $ip (>20 lần/60min)"
     fi
     nohup sh -c "sleep 86400; iptables -D INPUT -s $ip -j DROP 2>/dev/null" >/dev/null 2>&1 &
   done
iptables-save > /etc/iptables/rules.v4 2>/dev/null
AB
chmod +x /usr/local/bin/flowvpn-autoban
cat > /etc/systemd/system/flowvpn-autoban.service <<'SVC'
[Unit]
Description=VPNFlow autoban SSH bruteforce (>20 fails/60min)
[Service]
Type=oneshot
ExecStart=/usr/local/bin/flowvpn-autoban
SVC
cat > /etc/systemd/system/flowvpn-autoban.timer <<'TMR'
[Unit]
Description=VPNFlow autoban every 2 minutes
[Timer]
OnBootSec=120
OnUnitActiveSec=120
AccuracySec=5s
[Install]
WantedBy=timers.target
TMR
systemctl daemon-reload && systemctl enable --now flowvpn-autoban.timer && echo "autoban timer: BẬT (2 phút/lần)"
systemctl start flowvpn-autoban.service; echo "--- lần chạy đầu ---"; systemctl status flowvpn-autoban.service --no-pager 2>/dev/null | tail -5

echo "===== 5. KIỂM CHỨNG ====="
iptables -L INPUT -n --line-numbers | head -14
for r in vn1hy vn2hy vn1wg vn2wg; do curl -s -o /dev/null -w "$r=%{http_code} " "https://api.meetflowai.site/relay/$r"; done; echo
echo "XOÁ DEAD-MAN khi mọi thứ OK: pkill -f 'DEADMAN' || để nó tự nổ và xả INPUT"
