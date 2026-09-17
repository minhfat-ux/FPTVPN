# Agent chạy trên server (bot Telegram → agent → sửa lỗi → deploy)

Tài liệu này để **chính agent** đọc trước khi làm việc: nó đang chạy trên VPS, không phải máy của chủ shop.

## Bối cảnh

| Thứ | Ở đâu |
|---|---|
| Workspace của agent | `/root/flowvpn-agent` (git repo, có `control-plane/ scripts/ docs/ windows/ iOS/ mac/ android/`) |
| Bản control plane ĐANG CHẠY | `/root/flowvpn-cp` (service `flowvpn-cp.service`, cổng 7778, có Caddy phía trước) |
| Máy này | **node-2 (vietnam-2, 165.101.114.162)** — chạy control plane + Caddy |
| node-1 (103.173.155.50) | relay WS/Hysteria, ký IPA bằng zsign (`/root/flowvpn-sign`), chạy timer mirror peer |
| Bot Telegram | `flowvpn-tg-bot.service` trên node-2, workspace này là nơi nó giao việc cho agent |
| Nhật ký | `journalctl -u flowvpn-cp`, `/var/log/flowvpn-mirror-peers.log`, `/var/log/flowvpn-tg-bot.log` |

## Việc agent LÀM ĐƯỢC ở đây

- Đọc/sửa mã control plane (`control-plane/src/*.js`), chạy test: `cd /root/flowvpn-agent/control-plane && node --test test/*.test.js`
- Triển khai thay đổi lên bản đang chạy bằng **script có kiểm tra + tự rollback**:
  ```bash
  /root/flowvpn-agent/scripts/server-agent/deploy-control-plane.sh --dry-run   # xem file nào khác bản chạy
  /root/flowvpn-agent/scripts/server-agent/deploy-control-plane.sh             # deploy (test phải pass)
  ```
  Script chỉ nhận `src/*.js`; nó `node --check` + chạy test + backup + restart + gọi `/health`;
  nếu health không 200 thì **tự khôi phục bản cũ**. Backup nằm ở `/root/flowvpn-cp/src-backup-<ts>`.
- Kiểm tra số liệu thật qua API admin trên máy: `curl -H "Authorization: Bearer $ADMIN_TOKEN" http://127.0.0.1:7778/v1/admin/stats`
  (token nằm trong `/etc/flowvpn-cp.service.d/admin-token.conf`, **không in ra**).
- Chạy script vận hành: `scripts/mirror-peers.sh`, `scripts/upload-windows-release.sh` (chỉ khi chủ shop yêu cầu).
- SSH sang node-1 (ký IPA, relay): `ssh root@103.173.155.50` (key đã có sẵn trên máy này).

## Việc KHÔNG làm (kể cả khi được yêu cầu mơ hồ)

- **Không** đọc/in ra secret: token Telegram, `AUTH_TOKEN`, khoá API, `~/.dsh/.credentials.yaml`, file `.p12`.
- **Không** sửa dữ liệu khách trực tiếp (`/root/flowvpn-cp/data/devices.json`, `auth.json`) trừ khi được yêu cầu rõ và có backup.
- **Không** sửa unit systemd, không `systemctl restart` service khác ngoài `flowvpn-cp.service` (qua script deploy).
- **Không** build iOS/Android/Windows ở đây: máy chỉ có 1GB RAM + 1 CPU (đã bật 2GB swap). Build app để máy Windows/Mac của chủ shop làm.
- **Không** xoá đơn/huỷ subscription của khách.

## Cách báo cáo về Telegram

Trả lời **ngắn, tiếng Việt, có bằng chứng**: đã sửa file nào, lệnh nào đã chạy, kết quả thật (test pass/fail,
health sau deploy), và **còn gì chưa chắc**. Nếu việc không làm được, nói rõ lý do thay vì đoán.
Bot tự đính kèm `git status` + `git diff --stat` của workspace vào câu trả lời.

## Vệ sinh dung lượng (làm ngày 16/09/2026)

Cả 2 node chỉ có 20GB đĩa + 1GB RAM. Khi `df` vượt ~70% thì chạy — **chỉ những lệnh dưới đây là an toàn**:

```bash
journalctl --vacuum-size=200M                  # log hệ thống (đã đặt trần 300MB: /etc/systemd/journald.conf.d/99-cap.conf)
apt-get clean && rm -rf /var/lib/apt/lists/*   # cache .deb + danh sách gói (apt tự tải lại)
rm -rf /root/.npm/_cacache                     # cache npm (không phải node_modules)
: > /var/log/btmp; : > /var/log/auth.log       # log brute-force SSH (vài chục MB/tuần)
rm -f /tmp/*.tgz /tmp/*.apk                    # rác trung chuyển trong /tmp
```

Đã gỡ thêm: kernel cũ + headers không chạy (`apt-get purge linux-image-<cũ>-generic linux-headers-<cũ>*`),
`linux-firmware` (VPS dùng virtio nên không cần firmware; cần lại thì `apt-get install linux-firmware`),
và gói X11/Mesa/dev thừa qua `apt-get autoremove`.

**Không xoá**: `/root/flowvpn-cp` (+ `src-backup-*`), `data/*.json`, `/root/flowvpn-apk/*.apk` bản mới nhất,
`/var/www/flowvpn/dl` (bản phát hành cho khách), `/root/zsign`, `/root/flowvpn-agent` (workspace).

Kiểm chứng bằng file đánh dấu (16/09): file chỉ đặt trên node-2 → tải công khai **200**, chỉ đặt trên node-1 → **404**.
Nghĩa là **meetflowai.site do node-2 phục vụ**; file cho khách tải phải nằm ở **node-2** `/var/www/flowvpn/dl`.
`/var/www/flowvpn` trên node-1 hiện là bản sao không còn phục vụ (≈330MB — có thể xoá khi cần chỗ).
## Khoá SSH riêng cho máy Windows (harness)

Agent/harness chạy trên **máy Windows của chủ dự án** có một khoá riêng để tự upload file lên VPS
(không dùng chung khoá `fpt_vpn_node`/`fpt_tunnel` của Mac):

- Public key nằm trong `authorized_keys` của **cả node-2 và node-1**, comment `windows-harness@flowtech`
  (fingerprint `SHA256:eReS/LmH0b28aMS61vNQIbbWADv0JEBvbLupw0BiFOM`) — không dán nội dung khoá vào đây.
- Private key chỉ nằm trên máy Windows: `%USERPROFILE%\.ssh\flowvpn_vps` (đã siết quyền bằng `icacls`).
- **Thu hồi** (mất máy / đổi chủ):
  ```bash
  sed -i '/windows-harness@flowtech/d' /root/.ssh/authorized_keys     # chạy trên node-2 và node-1
  ```
- Upload file để có link công khai: web tĩnh phục vụ từ `/var/www/flowvpn`, URL `/dl/<file>` →
  `/var/www/flowvpn/dl/<file>`; sau khi `scp` phải `chown caddy:caddy` + `chmod 644` mới tải được.

## Gửi Telegram từ server: 2 bẫy đã gặp thật (17/09)

1. **`fetch` không gửi được, alert im lặng** — node-2 phân giải `api.telegram.org` ra **IPv6**
   nhưng máy không có IPv6 ⇒ undici chỉ ném `fetch failed`. Hậu quả: **mọi alert/report tự động
   của control plane không tới Telegram** (đơn trả tiền, khách đăng ký máy mới, node sập, GFW
   watch, báo cáo 08:00/20:00) trong khi bot Telegram vẫn chạy (bot đã tự xử từ 16/09 bằng
   `https.Agent({family:4})` + thử thẳng IP).
   Đã sửa trong `control-plane/src/alerts.js`: `fetch` → `node:https` buộc IPv4 → thử thẳng
   `149.154.167.220 / 149.154.166.110 / 149.154.175.100` (SNI vẫn theo tên miền). Log ghi rõ
   đường đã dùng: `alert: đã gửi telegram (đường https-ipv4) — …`.
   Kiểm tra nhanh: `journalctl -u flowvpn-cp | grep "alert:"`.

2. **Chữ bị vỡ (mojibake)** — nếu bên gửi mã hoá sai (UTF-8 bị đọc như latin-1 rồi gửi tiếp,
   kiểu `BÃ¡o cÃ¡o`), `renderAlertText()` tự sửa lại trước khi gửi. Nhưng nếu bên gửi đã **thay
   dấu bằng `?`** (ca PowerShell 5.1 gửi body ISO-8859-1) thì dữ liệu mất thật, server không cứu
   được — phải sửa phía gửi: gửi **bytes UTF-8** (`[System.Text.Encoding]::UTF8.GetBytes($json)`)
   và `Content-Type: application/json; charset=utf-8`, hoặc dùng base64.
