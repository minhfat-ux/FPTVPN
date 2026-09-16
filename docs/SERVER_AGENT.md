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
