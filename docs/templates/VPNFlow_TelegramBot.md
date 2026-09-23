# Telegram Bot (token KHÔNG để trong repo)

Token + chat id được lưu ở `~/.vpnflow-telegram` (quyền 600) và nạp vào systemd drop-in của control-plane.

```
TELEGRAM_BOT_TOKEN=<xem ~/.vpnflow-telegram>
TELEGRAM_CHAT_ID=<xem ~/.vpnflow-telegram>
ALERT_EMAIL=minhnb2@me.com
```

## Bot 2 chiều (`/root/flowvpn-tgbot`, service `flowvpn-tg-bot`)

Mã: `scripts/tg-bot/bot.mjs` (vòng lặp) + `control-plane/src/tg-commands.js` (logic thuần, có test).
Cập nhật: copy 2 file vào `/root/flowvpn-agent/...` rồi chạy
`bash /root/flowvpn-agent/scripts/server-agent/deploy-tg-bot.sh` (tự `node --check`, backup, restart, rollback nếu hỏng).
Env ở `/etc/flowvpn-tg-bot.env`. Gõ `/help` trong Telegram để xem danh sách đầy đủ.

### Giao việc cho một máy — `/vibecode` (mới 22/09/2026)

```
/vibecode mac <việc>      # giao cho máy Mac (macOS + iOS)
/vibecode win <việc>      # giao cho máy Windows
/vibecode server <việc>   # giao cho agent trên server
/mac <việc> · /win <việc> # viết tắt
```

- Là lệnh **đổi trạng thái** nên phải bấm **Xác nhận**; prompt hiện rõ *giao cho máy nào + việc gì*
  (gõ nhầm tên máy là việc đi sai chỗ). Nút mang `okvibe` — nội dung việc lưu ở `pendingTasks`
  vì `callback_data` của Telegram chỉ 64 byte.
- **Vì sao không chạy agent tại server như `/task`**: mã nguồn, thiết bị và dữ liệu nằm trên máy đích
  (Mac giữ iPhone/Xcode, Windows giữ control-plane). Việc đi vào đúng hệ giao việc của máy đó:
  1. **agent-bus** — kênh liên máy, mỗi lần push **tự alert Telegram** cho bên nhận;
  2. **sổ `ops/tasks`** (repo nhánh `flowgpt`) — nguồn sự thật, watcher của máy đích thức theo sổ.
- Bot **nói thật đường nào chạy được**; cả hai đều hỏng thì trả lời *"KHÔNG giao được bằng đường nào"*.
- Đường **sổ** chỉ bật khi máy chạy bot có bản sao repo sổ (`LEDGER_DIR` trong env). Server hiện
  **chưa có** (không có quyền GitHub) ⇒ đang dùng đường **bus**; đặt `LEDGER_DIR` là tự dùng thêm.
- Thử không gửi thật: `node /root/flowvpn-tgbot/bot.mjs --simulate "/vibecode mac việc" --confirm`
  (chế độ `--simulate` **không** đẩy việc thật, tránh một lệnh thử cũng làm phiền máy khác).
