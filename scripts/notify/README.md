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

### Đường SSH khác nhau theo máy (bắt buộc khai báo)

`inbox-poller.sh` nhận cấu hình qua biến môi trường — **mặc định là đường của Windows**:

| Máy | `FPT_JUMP` | `FPT_SSH_IDENTITY` |
|---|---|---|
| **Mac** | `""` (rỗng = nối thẳng, không qua jump) | `$HOME/.ssh/fpt_vpn_node` |
| Windows | để mặc định (`root@103.173.155.50` — node-1) | — |

Thiếu `FPT_SSH_IDENTITY` trên Mac sẽ lỗi `Permission denied (publickey,password)`:
`root@node-2` chỉ nhận khoá `fpt_vpn_node`/`fpt_tunnel` (xem `PROTOCOL.md` §4).

### Cài poller trên Mac (đã cài, 24/09/2026)

Bản chạy **copy vào `~/.local/share/flowvpn-notify/`** chứ không chạy thẳng từ repo: repo nằm
trên volume rời `/Volumes/BIWIN`, volume unmount là launchd không chạy được. **Sửa script xong
phải copy lại:**

```bash
cp scripts/notify/inbox-poller.sh ~/.local/share/flowvpn-notify/inbox-poller.sh
cp scripts/notify/wake-mac.sh     ~/.local/share/flowvpn-notify/   # nếu có thay đổi
launchctl kickstart -k gui/$(id -u)/net.flowtech.notify-poller
```

`~/Library/LaunchAgents/net.flowtech.notify-poller.plist` chạy `--once` mỗi 60s, với
`EnvironmentVariables` đặt `FPT_JUMP=""` và `FPT_SSH_IDENTITY=$HOME/.ssh/fpt_vpn_node`,
`--wake /Users/<user>/.local/share/flowvpn-notify/wake-mac.sh`.

`wake-mac.sh` (bản ngoài repo) fork agent headless ra **chạy nền** rồi thoát ngay — vì poller
gọi lệnh thức một cách *đồng bộ*, agent chạy lâu sẽ chặn cả vòng poll, mà launchd không mở
phiên thứ hai cho cùng một job. Nó cũng tự export `PATH=/opt/homebrew/bin:…` vì launchd chỉ
có PATH tối thiểu, thiếu là `dsh` chết ngay với `env: node: No such file or directory`.

Lệnh thức đúng của `dsh` là **đối số vị trí**, KHÔNG có cờ `-p`:
`dsh --profile headless "<việc>"`.

Dọn tồn đọng lần đầu (không ping Telegram để tránh bão tin):

```bash
FPT_JUMP="" FPT_SSH_IDENTITY="$HOME/.ssh/fpt_vpn_node" \
  bash scripts/notify/inbox-poller.sh --target mac --once --no-ping
```

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

## Trạng thái Mac + đánh thức — lệnh Telegram `/wakeup`

Máy ngủ thì **không tiến trình nào chạy được**, kể cả poller. Việc gửi tới **không hề mất** — nó
nằm bền trên node-2 (26 file tồn 5 ngày đã về đủ nguyên vẹn), nhưng Mac chỉ nhận được khi thức.

### Nhịp tim: bot biết Mac đang thức hay đang ngủ

Mỗi vòng poll (~60s), `inbox-poller.sh` ghi một dòng JSON lên node-2 — **gộp chung vào chính lần
SSH liệt kê file**, nên không thêm chi phí:

```json
{"epoch":1790229772,"ts":"2026-09-24T06:02:52Z","host":"MacBook-Air-2","target":"mac","ac":true,"nosleep":true}
```

`ac` = đang cắm sạc · `nosleep` = có tiến trình chặn ngủ (`caffeinate -s`).

Ghi vào `/var/lib/flowvpn-coord/inbox/mac/.alive.json`. Đổi chỗ bằng `FPT_ALIVE_FILE`.

`/wakeup` đọc nhịp tim rồi trả lời thẳng:

```
🟢 Mac ĐANG THỨC — nhịp tim cách 17s, đang cắm sạc, đã khoá không ngủ. Việc sẽ được nhận trong ~60s.
🔴 Mac ĐANG NGỦ — nhịp tim cuối cách 10 phút, đang dùng pin, chưa khoá ngủ. Việc vẫn nằm nguyên trên node-2…
❔ Chưa từng nhận nhịp tim từ Mac — poller có thể chưa chạy lần nào.
```

Ngưỡng "còn thức" là `MAC_ALIVE_STALE_MS` = 180s (3 vòng poll), dùng chung giữa
`describeMacAlive()` và `isMacAlive()` để bot không bao giờ nói ngược với thực tế.

### Vì sao KHÔNG hứa "đánh thức được" trên mọi mạng

Gói Magic Packet phải do **router của mạng đó** forward vào LAN. Trên **mạng công ty** thì không
có quyền vào router ⇒ **không có cách nào đánh thức Mac từ VPS**, và `/wakeup` sẽ nói thẳng như
vậy thay vì báo "đã gửi" rồi im lặng.

Đổi lại, ở bàn làm việc có dock thì **không cần đánh thức**: hội đủ 4 điều kiện *closed-display
mode* của macOS (nguồn AC + màn hình ngoài + bàn phím ngoài + chuột ngoài), cộng với LaunchAgent
`net.flowtech.keepawake` (`caffeinate -s`) chặn idle sleep ⇒ Mac không ngủ kể cả khi gập nắp.

Nếu Mac nằm trong **mạng anh kiểm soát được**, ba điều kiện sau làm `/wakeup` có tác dụng thật:

| # | Điều kiện | Cách làm |
|---|---|---|
| 1 | Mac **cắm sạc** | macOS chỉ bật WoL ở nguồn AC (`pmset womp` = 1 ở AC, **0 ở pin**). Muốn cả khi dùng pin: `sudo pmset -b womp 1` |
| 2 | Router forward **UDP 9** vào broadcast LAN | Port Forwarding: `UDP 9 → 10.193.43.255` (hoặc IP LAN của Mac) |
| 3 | node-2 có `WOL_MAC` + `WOL_HOST` | thêm vào `/etc/flowvpn-tg-bot.env` rồi restart `flowvpn-tg-bot` |

**Phải gửi CẢ HAI MAC**: macOS "Private Wi-Fi Address" làm MAC đổi theo mạng — phần cứng là
`9c:58:84:06:ba:d4`, đang dùng hiện tại là `9a:1d:04:7d:70:56`. Chip mạng có thể chỉ lắng nghe
một trong hai ⇒ truyền cả hai, cách nhau dấu phẩy.

```bash
# /etc/flowvpn-tg-bot.env  (node-2)
WOL_MAC=9c:58:84:06:ba:d4,9a:1d:04:7d:70:56
WOL_HOST=63.140.14.154
WOL_PORT=9
WOL_BIN=/usr/local/bin/wol-mac.sh
WOL_ALIVE_FILE=/var/lib/flowvpn-coord/inbox/mac/.alive.json
```

Cài công cụ gửi lên node-2:

```bash
scp scripts/notify/wol-mac.sh root@165.101.114.162:/usr/local/bin/wol-mac.sh
ssh root@165.101.114.162 'chmod 755 /usr/local/bin/wol-mac.sh'
```

### Kênh phụ: SSH options phải đủ chặt để poller không bị kẹt

`SSH_COMMON` có `ConnectTimeout=10` **và** `ServerAliveInterval=15` + `ServerAliveCountMax=3`:
`ConnectTimeout` chỉ giới hạn lúc bắt tay, một SSH treo giữa chừng sẽ giữ poller kẹt vô hạn (mà
launchd không mở phiên thứ hai cho cùng job) ⇒ kênh notify tắc hẳn.

`SSH_OPTS = -n + SSH_COMMON` cho các lệnh ssh **bên trong vòng `while read`**, vì ssh mặc định
đọc stdin và sẽ nuốt mất phần còn lại của danh sách file ⇒ mỗi lượt chỉ xử lý được **đúng 1 file**.
`scp` không có cờ `-n` nên dùng `SCP_OPTS` riêng.
