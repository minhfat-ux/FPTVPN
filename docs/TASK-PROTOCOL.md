# Giao thức giao việc & xác thực giữa hai harness (Mac ↔ Windows)

> Mục đích: **không còn cảnh "đã ping mà không biết bên kia có nhận và có làm hay không"**.
> Mọi việc giao nhau đi qua sổ `ops/tasks/` trong git, có trạng thái và có bằng chứng.

## 1. Vì sao không dùng Telegram làm kênh xác thực

Hai harness gửi tin bằng **cùng một bot**. Telegram **không trả lại** cho `getUpdates` những tin do
chính bot đó gửi ⇒ bên kia không đọc được tin của mình. Đã kiểm chứng: gửi được (`message_id` trả về)
nhưng `read` luôn rỗng.

Nên: **Telegram chỉ để "hú"** cho người thật biết có việc mới. **Kênh xác thực là GIT** — mỗi sự kiện
là một file được push lên `origin/flowgpt`, nên có **commit sha làm bằng chứng**, kiểm tra được, không
phải tin lời nhau.

## 1b. Kênh vận chuyển: connector trên VPS

Ngoài git (nguồn xác thực), tin được **đẩy qua connector trên VPS** để bên kia biết ngay: mỗi sự kiện trong
`ops/task.mjs` tự `POST /push`, và watcher hai bên `GET /pull` mỗi 20s để đánh thức harness. Chi tiết, token
và bằng chứng đo: [`AGENT-BUS.md`](AGENT-BUS.md). **Mọi trao đổi đều alert lên Telegram cho người theo dõi.**

## 2. Sổ giao việc

```
ops/tasks/<id>/<thời-gian>-<ai>-<loại>.json     # mỗi sự kiện 1 file, KHÔNG sửa file cũ
```

- Mỗi bên ghi file **mới** ⇒ không giẫm chân nhau, không xung đột merge.
- `<id>` dạng `T-YYYYMMDD-NN`. Trạng thái hiện tại = gộp các sự kiện theo thời gian.
- Loại sự kiện: `created`, `sent`, `acked`, `progress`, `blocked`, `done`, `verified`.

Trạng thái đi theo đường: `created → sent → acked → (progress) → done → verified`.
`verify --result fail` ⇒ `reopened`, phải ack + done lại.

## 3. Lệnh

```bash
# Bên GIAO (Mac)
node ops/task.mjs new --title "…" --to win --detail docs/X.md --verify "câu lệnh nghiệm thu" --due 2026-09-20
node ops/task.mjs send <id> --push --ping        # ghi "đã giao" + push git + hú Telegram
node ops/task.mjs verify <id> --result pass|fail --note "…" --push

# Bên NHẬN (Windows) — đặt AGENT_NAME=WIN
node ops/task.mjs ack <id> --note "đã nhận, làm trong hôm nay" --push
node ops/task.mjs progress <id> --note "xong 6/22 mục" --push
node ops/task.mjs blocked <id> --reason "thiếu token admin" --push
node ops/task.mjs done <id> --evidence "commit=…, cmd=…, kết quả=…" --push

# Cả hai
node ops/task.mjs list [--all]     # việc đang mở (mặc định) hoặc tất cả
node ops/task.mjs show <id>
node ops/task.mjs sync             # fetch + đọc sổ TỪ GIT (không đụng cây đang làm việc)
```

`--push` tự lo chuyện đẩy git: nếu cây chính bị lệch/dirty thì nó chép `ops/tasks/` sang một worktree
tạm của `origin/flowgpt`, commit rồi push — **không đụng tới cây đang làm việc của bên kia**.

## 4. Luật cứng (script từ chối nếu sai)

| Luật | Vì sao |
|---|---|
| Chỉ **bên nhận** được `ack` / `progress` / `done` / `blocked` | Không thể tự nhận việc thay nhau |
| Chỉ **bên giao** được `verify` | Người làm không tự nghiệm thu bài của mình |
| `verify --result pass` chỉ chạy **sau `done`** | Không "công nhận xong" khi chưa ai báo xong |
| `done` **bắt buộc** có `--evidence` | Bằng chứng: commit sha / câu lệnh đã chạy / file kết quả |
| `verify fail` mở lại việc | Việc chỉ khép khi bên giao đã kiểm chứng thật |
| Sai `AGENT_NAME` thì bị chặn | Tránh việc Mac tự ack hộ Windows |

## 5. Quy trình chuẩn cho một việc

1. **Mac**: `new` → `send --push --ping`. Git có commit chứa `created` + `sent`.
2. **Windows**: `sync` → thấy việc → `ack --push`. Git có commit `acked` ⇒ **đây là bằng chứng đã nhận**.
3. **Windows**: làm, thỉnh thoảng `progress --push`; xong thì `done --evidence --push`.
4. **Mac**: `sync` → thấy `done` → chạy đúng câu lệnh ở `--verify` (ví dụ `node ops/verify-rewrite.mjs`)
   → `verify --result pass --push`, hoặc `fail` kèm lý do để mở lại.

Việc **chỉ được coi là xong khi có `verified pass`**. Không có bước này thì nó vẫn nằm trong `list`.

## 6. Việc đang mở

`T-20260918-01` — Viết lại 22 mục nhập từ nguồn ngoài (14 chuyên gia VN/ĐNA + 8 kỹ năng Tencent).
Chi tiết: [`TASK-WINDOWS-REWRITE.md`](TASK-WINDOWS-REWRITE.md) · nghiệm thu:
`node ops/verify-rewrite.mjs` → cần 22/22 PASS (hiện 0/22).

## 7. ĐÁNH THỨC bên kia (để họ biết ngay, không phải chờ ai mở máy)

Ghi sổ vào git là chưa đủ: bên kia chỉ thấy khi họ `git fetch`. Telegram cũng **không** đánh thức
được (hai bên gửi cùng một bot ⇒ `getUpdates` không trả lại tin của nhau). Nên có watcher:

```bash
# mỗi máy chạy một watcher (để lâu dài: xem mục 7.2)
node ops/agent-watch.mjs --auto            # poll 20s; thấy việc của mình thì BOOT harness
```

Watcher làm gì khi thấy việc mới thuộc về mình:
1. `git fetch origin flowgpt` (không đụng cây đang làm việc),
2. thấy sự kiện mới (`sent` / `verify fail` / `blocked` / `done`) **gửi cho mình**,
3. chạy lệnh đánh thức (mặc định `dsh --profile headless "<prompt>"`) — prompt đã gồm: sync → đọc
   `docs/TASK-PROTOCOL.md` → **ack** → làm việc → `done --evidence`,
4. ghi sự kiện **`woken`** vào sổ và push ⇒ bên giao **thấy được bằng chứng "đã đánh thức lúc …"**.

Tùy chọn: `--auto` (đánh thức thật) · không có `--auto` thì chỉ báo · `--dry-run` (không làm gì) ·
`--once` (một vòng) · `--interval <giây>` · `--cooldown <giây>` (chống spam cùng một việc, mặc định 600)
· `--wake-cmd '…{prompt}…'` hoặc `DSH_WAKE_CMD` · `--replay` (xử lý cả sự kiện cũ) · `--no-record` (chỉ để thử).

Đường phụ khi watcher bên kia **chưa chạy** — bên giao đánh thức trực tiếp:

```bash
PEER_WAKE_CMD='ssh <máy-windows> "cd <repo> && node ops/agent-watch.mjs --once --auto"' \
  node ops/task.mjs send <id> --push --ping
```

### 7.1 Tự kiểm tra kênh đánh thức
```bash
AGENT_NAME=WIN node ops/agent-watch.mjs --once --dry-run
# → in ra "ĐÁNH THỨC vì có việc mới được giao → <id>" nghĩa là máy đó ĐÃ thấy việc
```

### 7.2 Gắn vào vòng đời `dsh web` (đang dùng — không cần dịch vụ nền)

Watcher được một **plugin của profile web** khởi động cùng `dsh web` và dừng khi `dsh web` tắt:

```bash
bash ops/install-agent-watch-plugin.sh          # cài/cập nhật (Mac: AGENT_NAME=MAC)
AGENT_NAME=WIN bash ops/install-agent-watch-plugin.sh   # nếu muốn làm tương tự trên Windows
```

Plugin `ops/dsh-plugin-agent-watch/` được copy vào `$DSH_HOME/profiles/node_modules/`, và một dòng
`insert` được thêm vào `$DSH_HOME/profiles/<profile>/cordis.patch.yml`:

```yaml
- insert:
    - id: agent-watch
      name: 'dsh-plugin-agent-watch'
      config: { repo: /Volumes/BIWIN/FlowGPT, agentName: MAC, interval: 20, auto: true }
```

Đặc điểm: mỗi lần khởi động nó **dừng watcher cũ rồi chạy cái mới** (khớp theo tên script
`agent-watch.mjs`, vì watcher chạy tay có thể có cmdline đường dẫn tương đối), dọn tiến trình bằng
`ctx.effect` khi profile tắt, và **nuốt mọi lỗi** để không bao giờ làm hỏng việc boot harness.
Tắt tạm: đặt `enabled: false` trong config. Kiểm tra composition:
`dsh --profile web --dump-config | grep -A4 agent-watch`.

#### Windows chỉ có PowerShell 5.1 (không có `pwsh` 7)

Dùng file `.cmd` có sẵn — không cần `pwsh`:

```bat
ops\agent-watch.cmd            :: chạy liên tục (để Task Scheduler gọi)
ops\agent-watch.cmd --once     :: chạy một vòng rồi thoát
```

Chạy nền khi đăng nhập:

```bat
schtasks /Create /TN AgentWatch /SC ONLOGON /TR "\"%CD%\ops\agent-watch.cmd\"" /F
schtasks /Run /TN AgentWatch
```

Kịch bản `.ps1` vẫn dùng được bằng Windows PowerShell: `powershell -ExecutionPolicy Bypass -File ops\agent-watch-install.ps1`.

**HAI LỖI THẬT ĐÃ GẶP — đừng lặp lại:**

1. **Đặt biến sai kiểu** → `set AGENT_NAME=WIN && node …` cho giá trị `"WIN "` (dấu cách trước `&&`).
   Hậu quả: tên file sự kiện thành `…-win -woken.json` và lọc presence sai. Luôn dùng dạng có ngoặc kép:
   `set "AGENT_NAME=WIN"`. Code cũng đã `.trim()` tên agent để phòng.
2. **Chạy nhiều watcher cùng lúc** → mỗi cái spawn một phiên riêng: đã thấy **7 sự kiện `woken` trong 1 phút**.
   Watcher nay tự ghi pidfile `ops/tasks/.watch-<agent>.pid` và **từ chối chạy chồng** (dùng `--force` nếu thật sự cần).

### 7.2b Cài như dịch vụ nền (nếu không muốn phụ thuộc `dsh web`)
- **macOS (launchd)** — `~/Library/LaunchAgents/site.meetflowai.agentwatch.plist` với
  `ProgramArguments`: `node`, `<repo>/ops/agent-watch.mjs`, `--auto`; `EnvironmentVariables`:
  `AGENT_NAME=MAC`, `PATH` gồm đường dẫn `dsh`; `RunAtLoad=true`, `KeepAlive=true`. Nạp:
  `launchctl load -w ~/Library/LaunchAgents/site.meetflowai.agentwatch.plist`
- **Windows — một lệnh, tự cài** (khuyến nghị):
  ```powershell
  pwsh -File ops\agent-watch-install.ps1
  ```
  Script tự: kiểm tra `node`/`dsh`, chạy thử để in ra dòng `ĐÁNH THỨC …`, tạo Scheduled Task
  `AgentWatch` chạy khi đăng nhập (ONLOGON), chạy ngay, rồi xác nhận tiến trình đang sống.
  Chỉ muốn chạy thử: `pwsh -File ops\agent-watch-install.ps1 -NoAutostart`.
- Chạy tay (không cài dịch vụ): `set AGENT_NAME=WIN && node ops\agent-watch.mjs --auto`

### 7.3 Vì sao PHẢI có watcher ở phía Windows (đo thật, không phỏng đoán)

Không thể gọi VÀO máy Windows từ bên ngoài:

| Đường | Kết quả thực đo |
|---|---|
| Telegram | hai bên gửi cùng một bot ⇒ `getUpdates` không trả lại tin của nhau (đã thử: gửi được, đọc rỗng) |
| Tailscale | máy Windows **không** nằm trong tailnet (chỉ có Mac `100.109.31.16` và các node) |
| VPNFlow | máy Windows là **client** `windows-57m1tfei` = `10.77.0.57`; từ server VPN: ping mất 100% gói, **không cổng nào mở** (22/3389/5985/445/3080/7790 đều đóng) ⇒ VPN một chiều client→server |

Kết luận: chỉ tiến trình **chạy trên chính máy Windows** mới nhận được việc. Nếu watcher không chạy,
`node ops/task.mjs list` cảnh báo thẳng: `⚠ giao N phút, CHƯA thấy đánh thức/ack` — không còn im lặng
giả tạo.
