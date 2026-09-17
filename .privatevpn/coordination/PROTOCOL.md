# Phối hợp giữa các agent (orchestrator)

> Đọc file này trước khi sửa bất kỳ file nào trong repo. Đây là luật vận hành, không phải gợi ý.

## 1. Vì sao có file này

Cùng một repo đang có nhiều agent sửa song song:

| Máy | Vai trò | Ghi chú |
|---|---|---|
| **Harness Windows** (máy anh Minh) | **Orchestrator** | Người giao việc, review, commit/push, deploy. Có SSH tới node-1/node-2. |
| **Harness Mac** | Contributor | Đẩy code lên `origin/main`, làm bản Mac/iOS. |
| **Agent trên server** (`/root/flowvpn-agent`, branch `master`) | Executor | Chạy việc qua `/task`, sửa file rồi deploy tại chỗ. |

Ngày 17/09/2026 đã xảy ra đúng loại conflict cần chặn: agent trên server đang sửa
`scripts/tg-bot/bot.mjs` thì harness Windows cũng sửa cùng file — hai bên không biết nhau.

## 2. Bảng việc (nguồn sự thật duy nhất)

- Nằm trên **node-2**: `/var/lib/flowvpn-coord/claims/`
- **Mỗi claim là một file JSON riêng** `<owner>-<area>.json` ⇒ hai máy ghi không bao giờ đè lên
  nhau; ghi bằng `temp + rename` nên không đọc phải file dở dang.
- Không dùng git làm nơi lưu: bảng việc phải tức thời và không sinh commit rác.
- Claim hết hạn mặc định sau **90 phút** (đổi bằng `--ttl`). Claim hết hạn **không** chặn người
  khác, nhưng vẫn hiện trong `list --all` để biết ai bỏ dở.

## 3. Luật bắt buộc

0. **Trước khi sửa file** → `check` vùng mình định đụng. Thấy `XUNG DOT` (exit code 1) thì
   **dừng lại**, nhắn orchestrator (Telegram), **không tự sửa**.
1. **Khi đang làm** → giữ `claim` cho vùng đó, ghi rõ `--files` (đường dẫn hoặc thư mục) và
   `--note` ngắn. Việc dài hơn TTL thì `claim` lại để gia hạn.
2. **Xong việc** → `release` (mặc định `done`). Bỏ dở thì `release --status cancelled`.
3. **Một vùng chỉ một người viết.** Không force-push, không sửa file ngoài vùng đã claim.
   Orchestrator là người phân xử và là người duy nhất push `main`.
4. **Báo cáo** theo mẫu `docs/templates/agentic-project/AGENT_HANDOFF.md` kèm bằng chứng lệnh
   đã chạy — như cũ.

## 4. Lệnh theo từng máy

**Trên server (agent `/task`):**

```bash
flowvpn-coord list
flowvpn-coord check scripts/tg-bot/bot.mjs
flowvpn-coord claim --owner server --area tg-bot --files scripts/tg-bot/bot.mjs --note "sua long-poll"
flowvpn-coord release --owner server --area tg-bot
```

**Từ harness Windows:**

```powershell
.\scripts\coord\coord.ps1 list
.\scripts\coord\coord.ps1 check scripts/tg-bot/bot.mjs
.\scripts\coord\coord.ps1 claim -Area tg-bot -Files "scripts/tg-bot/bot.mjs" -Note "sua long-poll"
.\scripts\coord\coord.ps1 release -Area tg-bot
```

**Từ harness Mac:**

```bash
ssh root@165.101.114.162 flowvpn-coord list
ssh root@165.101.114.162 flowvpn-coord check scripts/tg-bot/bot.mjs
ssh root@165.101.114.162 flowvpn-coord claim --owner mac --area ios --files ios/ --note "build IPA"
ssh root@165.101.114.162 flowvpn-coord release --owner mac --area ios
```

Mã nguồn của tool: `scripts/coord/flowvpn-coord.mjs` (bản chạy trên server:
`/usr/local/bin/flowvpn-coord`). Kiểm tra logic: `node scripts/coord/flowvpn-coord.mjs selftest`.

## 5. Vùng (area) — đặt tên theo thư mục, không theo cảm hứng

Ví dụ đang dùng: `tg-bot`, `control-plane`, `windows-app`, `harness-windows`, `ios`, `android`,
`release`, `docs`. Claim theo thư mục khi sửa lan nhiều file (`windows/PrivateVPNWindows.App`),
theo file khi chỉ đụng một chỗ (`scripts/tg-bot/bot.mjs`).

## 6. Đổi vai orchestrator

Muốn đổi thì sửa đúng bảng ở §1 và commit — chỉ orchestrator được sửa file này.
