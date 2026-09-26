# Phòng thủ VPS — agent fBuddy VPS GUARD

> Yêu cầu: *"cần luôn các agent phòng thủ trên các node vps nếu trường hợp bị tấn công, malware,
> hay bất cứ cơ chế lạ được bật lên trên server. Thông báo lên telegram cho anh Minh và các Harness biết."*

## 1. Nó là gì

Một tiến trình **chỉ đọc** chạy trên mỗi node VPS, mỗi 2 phút quét node và gửi cảnh báo:

| Kênh | Đến đâu | Khi nào |
|---|---|---|
| Telegram | anh Minh (chat id trong `/etc/fbuddy/fbuddy.env`) | ngay khi có phát hiện mức **≥ HIGH** (tối đa 1 lần / 6 giờ cho mỗi loại) |
| agent-bus (`/push`) | mọi Harness (Mac/Win/…) | cùng lúc với Telegram, `kind:"alert"`, `from:"vps-guard"` |
| Nhịp tim | anh Minh | 1 lần/ngày: *"GUARD còn sống"* — im lặng không có nghĩa là an toàn |

**Nguyên tắc an toàn:** guard KHÔNG tự chặn IP, KHÔNG tự kill tiến trình, KHÔNG tự sửa cấu hình.
Lý do: một bộ luật sai có thể tự bắn vào chân (ví dụ kill nhầm `node` của fBuddy). Mọi hành động
ngăn chặn đều là lệnh tay của người vận hành, có ghi log.

## 2. Bộ luật đang chạy

| Nhóm | Phát hiện gì | Mức |
|---|---|---|
| Tiến trình | tên/tham số miner (`xmrig`, `kinsing`, `--pool`, `stratum+tcp`), chạy từ `/dev/shm`/`memfd`, `curl\|bash`, reverse shell (`/dev/tcp`, `nc -e`) | CRITICAL |
| Tiến trình | daemon **không mong đợi**: `dockerd`, `squid`, `frp`, `ngrok`, `cloudflared`, `tor`, `openvpn`, `chisel`… | HIGH |
| Cổng nghe | cổng mở **ngoài allowlist** `22,80,443,2019,7790` → có dịch vụ mới được bật lên | HIGH/MED |
| Kết nối ra | kết nối ESTAB tới cổng bất thường (nghi C2 / pool đào coin) | HIGH |
| SSH | brute-force: ≥30 lần sai / IP trong 30 phút log gần nhất | HIGH |
| Tài khoản | tài khoản **UID 0** lạ; đăng nhập root từ IP mới | CRITICAL / MED |
| Toàn vẹn | hash `/etc/passwd`, `sshd_config`, `sudoers`, `crontab`, unit fBuddy, `Caddyfile` đổi ngoài deploy | HIGH |
| Persistence | systemd unit/timer, cron, `authorized_keys`, tệp SUID **mới xuất hiện** | HIGH/MED |
| Tệp lạ | webshell (`.php/.jsp/.aspx/.cgi`), tên malware (`kwork`, `kdevtmpfsi`, `kinsing`, `xmrig`), binary trong `/tmp`,`/dev/shm` | CRITICAL/HIGH |

Đổi allowlist cổng bằng biến môi trường `FBUDDY_GUARD_ALLOWED_PORTS` trong unit.

## 3. Cài / cập nhật

```bash
# trên node, sau khi deploy code (ops/vps-guard nằm trong repo nên đi kèm mỗi lần deploy)
sudo bash /opt/fbuddy/ops/vps-guard/install.sh
```

Cài lần đầu sẽ: tạo state ở `/var/lib/fbuddy/guard/`, bật `fbuddy-guard.timer` (mỗi 2 phút) và
**chốt baseline**. Baseline là ảnh chụp hash tệp trọng yếu + persistence + IP root đã biết.

```bash
systemctl list-timers fbuddy-guard.timer      # nhịp chạy
journalctl -u fbuddy-guard -n 50              # log các lượt
tail -f /var/lib/fbuddy/guard/guard.log       # log chi tiết
node /opt/fbuddy/ops/vps-guard/guard.mjs --once        # chạy ngay, in ra
node /opt/fbuddy/ops/vps-guard/guard.mjs --json        # cho máy đọc
node /opt/fbuddy/ops/vps-guard/guard.mjs --alert-test  # thử kênh cảnh báo (Telegram + bus)
node /opt/fbuddy/ops/vps-guard/guard.mjs --test        # 26 mục tự kiểm bộ luật (không cần root)
node /opt/fbuddy/ops/vps-guard/guard.mjs --once --simulate-alert   # chạy thật + bơm 1 tin thử qua đúng đường cảnh báo
node /opt/fbuddy/ops/vps-guard/guard.mjs --contain <id>            # in hướng dẫn xử lý cho 1 phát hiện (không tự làm)
```

**Sau mỗi lần deploy hợp lệ** (đổi unit, `Caddyfile`, `sshd_config`…), nếu guard báo "tệp trọng yếu
bị sửa" thì xác nhận đó là thay đổi của mình rồi chốt lại:

```bash
node /opt/fbuddy/ops/vps-guard/guard.mjs --baseline
```

Mã thoát: `0` bình thường · `2` có phát hiện ≥ HIGH (dùng để script khác bắt sự kiện).

## 4. Xử lý sự cố (làm tay, theo thứ tự)

1. **Xác nhận, đừng hoảng.** Đọc bằng chứng trong tin nhắn/`guard.log`. Nhiều cảnh báo là do chính
   anh vừa deploy (unit mới, cổng mới) → chốt lại baseline.
2. **Cách ly mạng nếu đang bị khai thác thật** (giữ SSH):
   ```bash
   ufw status; ufw deny out to any port 3333,4444,5555,7777,14444 proto tcp   # chặn pool/C2 hay gặp
   ```
3. **Chặn IP đang brute-force** (thay `<IP>`):
   ```bash
   ufw deny from <IP> to any        # hoặc: nft add rule inet filter input ip saddr <IP> drop
   ```
4. **Dừng dịch vụ lạ**: `systemctl stop <unit> && systemctl disable <unit>` rồi soi
   `/etc/systemd/system/<unit>`, `journalctl -u <unit>`.
5. **Nghi malware**: giữ nguyên hiện trường (đừng xoá vội), lấy mẫu:
   ```bash
   ls -la /proc/<PID>/exe; cp /proc/<PID>/exe /root/quarantine-<PID>    # tệp đã bị xoá vẫn đọc được
   ```
   rồi mới kill. Kiểm tra `crontab -l`, `/etc/cron.*`, `~/.ssh/authorized_keys`, `systemctl list-units`.
6. **Nếu nghi ngờ sâu**: đổi toàn bộ khoá SSH, xoay token Telegram/bus trong `/etc/fbuddy/fbuddy.env`,
   và dựng node mới từ repo (dữ liệu ở `/var/lib/fbuddy` — backup trước khi dựng lại).
7. **Báo lại cho Harness**: mọi việc anh làm tay nên ghi 1 dòng vào `docs/INCIDENT-*.md` để phiên
   agent khác đọc được (guard chỉ báo, không ghi thay anh).

## 5. Vì sao chưa cài fail2ban/clamav

Node hiện không có 2 gói đó; guard phủ đúng phần cần nhất (brute-force SSH + malware đang chạy +
cổng/persistence lạ) mà **không thêm dịch vụ nền nào**. Khi cần, có thể bổ sung:
`apt-get install -y fail2ban` (tự chặn brute-force) — nhưng phải cấu hình `ignoreip` cho IP của anh
trước, nếu không sẽ tự khoá mình. Đây là việc của người vận hành, guard sẽ nhắc khi thấy brute-force.

## 6. Kiểm thử

```bash
node ops/vps-guard/test.mjs     # 15/15 bộ luật với dữ liệu mẫu (chạy được cả trên Mac)
```

## 7. Chống ồn bằng baseline (quan trọng)

Node fBuddy còn chạy cả hệ VPN (hysteria, sing-box, caddy, agent-bus…), nên nếu báo mọi thứ "mới" thì
mỗi 2 phút sẽ có hàng trăm tin rác. Cách xử lý:

- **Baseline** (`/var/lib/fbuddy/guard/baseline.json`) là ảnh chụp lúc cài: hash tệp trọng yếu, danh sách
  listener, tên tiến trình, chữ ký tiến trình, persistence (systemd/cron/authorized_keys/SUID), IP root đã biết.
- Chỉ báo cái **MỚI so với baseline**. Daemon đã biết (ví dụ `hysteria`) mở cổng UDP tạm mỗi phiên →
  ghi nhận mức LOW, gộp 1 dòng trong log, **không** đánh động.
- **Malware rõ ràng thì baseline cũng không tha**: miner (`xmrig`, `kinsing`…), `stratum+tcp`, memfd,
  reverse shell, webshell, tên tệp malware → luôn CRITICAL/HIGH.
- Cổng nằm trong danh sách "gần như luôn là backdoor" (1080, 3128, 4444, 5555, 5900, 9001, 31337…) → báo HIGH
  **kể cả khi đã có trong baseline**.
- Sau khi deploy hợp lệ (đổi unit/Caddyfile/sshd_config), báo "tệp trọng yếu bị sửa" là đúng — xác nhận rồi
  `--baseline` để chốt lại.

## 8. Trạng thái node-2 (fcnvps2) — 26/09/2026

- `fbuddy-guard.timer`: enabled + active, chạy mỗi 2 phút · state `/var/lib/fbuddy/guard/`.
- Baseline: 6 tệp trọng yếu · 354 listener · 150 chữ ký tiến trình · 72 mục persistence · 3 IP root.
- Lượt kiểm tra sạch: **0 phát hiện ≥HIGH**, exit 0 (chỉ còn mức LOW ghi nhận).
- **Có tấn công thật đang diễn ra**: brute-force SSH từ nhiều IP
  (24h: 6318 lần `Failed password`; top: 49.254.38.138 ×61, 176.53.159.198 ×50, 103.10.227.74 ×47,
  176.53.159.197 ×25, 62.60.130.253 ×20, 45.148.10.141 ×20, 193.47.62.69 ×20). Thử chủ yếu user `root`.
  Chưa có đăng nhập nào thành công bằng mật khẩu (chỉ publickey từ IP của anh).
- **Lỗ hổng cần anh quyết định** (guard chỉ báo, không tự sửa):
  `/etc/ssh/sshd_config` đang `PermitRootLogin yes` + `PasswordAuthentication yes`, và node **không có
  fail2ban**. Ba lựa chọn: (1) cài fail2ban + `ignoreip` cho IP của anh, (2) chuyển sang chỉ dùng khoá
  (`PermitRootLogin prohibit-password`, `PasswordAuthentication no`), (3) chặn tay các IP đang tấn công.
- `flowvpn-guard.service` trên node là guard **chăm sóc khách hàng** (gửi hướng dẫn cài), KHÔNG phải bảo mật —
  không liên quan tới `fbuddy-guard`, không giẫm chân nhau.
- `/tmp/up-server.py` (pid 3648387, từ 18/09): helper nhận APK từ Windows, chỉ nghe `127.0.0.1:8099`, ghi vào
  `/root/apk-upload`. Đã có trong baseline nên chỉ ghi nhận LOW; **nên chuyển vào `/opt/fbuddy/ops/` và chạy
  bằng systemd** thay vì để trong `/tmp`.
