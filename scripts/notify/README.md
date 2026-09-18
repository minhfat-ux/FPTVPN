# Kênh giao việc giữa các máy (notify)

Có **hai kênh**, đừng trộn:

| Kênh | Dùng cho | Ở đâu |
|---|---|---|
| **Agent bus** (Mac dựng 18/09) | Việc giữa **hai harness** (Mac ↔ Windows): giao việc, ack, trạng thái, có id + presence | `agent-bus.service` trên node-2 (port 7799, qua Caddy `/agent-bus`). Client chính thức: `ops/task.mjs`, `ops/agent-watch.mjs` trong repo **flowgpt** — xem `docs/AGENT-BUS.md` |
| **Inbox + poller** (thư mục này) | Báo cáo/tài liệu dài cho **sản phẩm VPNFlow**: file `.md` bền trên node-2 + ping Telegram + "thức" agent | `/var/lib/flowvpn-coord/inbox/<máy>/` |

## Kênh agent bus (ưu tiên cho việc giữa hai harness)

```bash
node ops/task.mjs ack <id> --note "..." --push      # xác nhận ĐÃ NHẬN  → alert Telegram
node ops/task.mjs progress <id> --note "..." --push # đang làm
node ops/task.mjs done <id> --evidence "commit=…" --push
node ops/agent-watch.mjs --auto                     # watcher: tự nhận việc mới, poll 20s
```

- Token: máy trong VPN tự lấy `curl http://10.77.0.1:7799/token`; ngoài VPN dùng `.env.bus` (gitignore).
- `scripts/notify/agent-bus.mjs` (trong repo này) là client phụ để xem/push tay:
  `node scripts/notify/agent-bus.mjs presence` · `pull --agent win` · `push --to mac --title "…"`.
- **Telegram chỉ để alert cho người**, không phải kênh máy–máy (hai bên dùng chung một bot nên
  `getUpdates` không trả lại tin của nhau; đã gặp `Conflict: terminated by other getUpdates request`).

## Kênh inbox + poller (báo cáo dài của VPNFlow)

```bash
# giao việc / trả lời dài (chạy trên máy gửi)
echo "nội dung" | flowvpn-notify --from windows --to mac --topic "VPNFlow 1.0.5"
flowvpn-notify --ping "tin ngắn, không ghi file"

# nhận việc (Windows: Task Scheduler gọi poller-windows.vbs mỗi 5 phút)
scripts/notify/inbox-poller.sh --target windows --once
```

Poller tải file mới → ghi `.ack` trên node-2 → **gửi Telegram “📥 đã nhận việc …”** (đúng yêu cầu
“nhận rồi phải báo lại”), rồi mới chạy lệnh `--wake` để đánh thức agent.

`flowvpn-notify` trong thư mục này là **bản chạy trên node-2** (`/usr/local/bin/flowvpn-notify`):

```bash
scp scripts/notify/flowvpn-notify root@165.101.114.162:/usr/local/bin/flowvpn-notify
ssh root@165.101.114.162 'chmod 755 /usr/local/bin/flowvpn-notify'
```

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `FPT_JUMP` | `root@103.173.155.50` | máy nhảy (Windows đi qua node-1) |
| `FPT_NODE2` | `root@165.101.114.162` | nơi giữ inbox + bảng việc |
| `FPT_INBOX_STATE` | `~/.flowvpn-inbox` | nơi poller lưu file đã tải + `seen/` |
| `AGENT_BUS_URL` / `AGENT_BUS_TOKEN` | đọc `~/.agent-bus.env` | cấu hình agent bus cho client phụ |
