# Kênh trao đổi giữa hai harness (Mac ↔ Windows)

<!-- AUTO-TASKS:START (do ops/task.mjs sinh, dung sua tay) -->

## Việc đang chờ (tự sinh từ sổ giao việc — ĐỪNG sửa tay)

Nguồn xác thực là git: `ops/tasks/<id>/`. Giao thức: [`TASK-PROTOCOL.md`](TASK-PROTOCOL.md).

| id | trạng thái | việc | lệnh tiếp theo |
|---|---|---|---|
| `T-20260918-01` | verified | Viết lại 22 mục nhập từ nguồn ngoài (14 chuyên gia VN/ĐNA + 8 kỹ năng  | `-` |
| `T-20260918-02` | sent | Thêm 18 skill/expert GIÁO DỤC vào fBuddy (trẻ em, ngoại ngữ, luyện thi | `AGENT_NAME=WIN node ops/task.mjs ack T-20260918-02 --push` |
| `T-20260918-03` | sent | Tắt chế độ sleep/hibernate trên máy Windows để harness+watcher chạy 24 | `AGENT_NAME=WIN node ops/task.mjs ack T-20260918-03 --push` |
| `bus-6` | sent |  | `AGENT_NAME= node ops/task.mjs ack bus-6 --push` |

<!-- AUTO-TASKS:END -->

## ⚡ ĐỔI KIỂU CHẠY (19/09/2026): bỏ watcher poll, dùng BỘ NGHE ĐẨY (SSE)

**Gốc của "cả đống windows command chạy rồi tắt loạn cả mắt":** watcher cũ poll `origin/flowgpt`
mỗi 20 giây; mỗi vòng nó gọi `git fetch` + `git ls-tree` + `git show` **cho từng file sự kiện**
(21 file ⇒ 23 tiến trình), cộng `status-board` mỗi phút. Trên Windows **mỗi tiến trình con là một
cửa sổ console đen nháy lên rồi tắt** vì Node để `windowsHide` mặc định là `false` ⇒ hơn 60 cửa sổ
mỗi phút.

**Kiểu mới:** máy Windows giữ **một kết nối mở** tới connector (`GET /subscribe`, Server-Sent
Events). Lúc rảnh nó **không spawn gì cả** — chỉ một socket nằm im. Có tin cho `win` thì VPS đẩy
xuống trong cùng một nhịp mạng; bộ nghe RUNG CHUÔNG, chạy đúng một vòng `agent-watch.mjs --once
--auto` (ẩn) rồi lại im.

Chuyển máy — chạy **một lần**, trong thư mục repo (PowerShell):

```powershell
git pull
powershell -ExecutionPolicy Bypass -File ops\agent-listen-install.ps1
```

Script tự làm: xoá Scheduled Task `AgentWatch` + tắt watcher cũ → thử nối kênh đẩy → tạo task
`AgentListen` chạy **ẨN** (wscript + VBS, tự chạy lại mỗi 15 phút nếu chết) → kiểm tra đúng MỘT
tiến trình → in trạng thái connector.

Kiểm tra:

```powershell
node ops\agent-listen.mjs --once --dry-run                 # thấy "đã nối kênh đẩy" là thông
Invoke-RestMethod https://fbuddy.meetflowai.site/agent-bus/health   # subscribers: win = 1
```

Đã vá kèm trong cùng lần này (để không còn cửa sổ nào nháy kể cả khi buộc phải gọi tiến trình con):
`windowsHide: true` cho **mọi** chỗ spawn/exec trong `ops/agent-watch.mjs`, `ops/task.mjs`,
`ops/lib/ledger.mjs`, `ops/lib/telegram.mjs`; và watcher đọc sổ bằng **một** tiến trình
`git cat-file --batch` thay vì một `git show` cho mỗi file.


## 0.0 GIAO VIỆC thì dùng sổ task (không dùng ping)

Ping **không xác thực được** bên kia đã nhận hay chưa (và tin do bot gửi không quay lại `getUpdates`).
Mọi việc giao nhau đi qua `ops/task.mjs` — xem [`TASK-PROTOCOL.md`](TASK-PROTOCOL.md):

```bash
node ops/task.mjs list                 # việc đang mở
node ops/task.mjs sync                 # fetch + đọc sổ từ git
AGENT_NAME=WIN node ops/task.mjs ack T-20260918-01 --push     # Windows xác nhận ĐÃ NHẬN
AGENT_NAME=WIN node ops/task.mjs done T-20260918-01 --evidence "commit=…, cmd=…, kết quả=…" --push
```

Không có `ack` (bằng chứng trong git) thì coi như chưa nhận việc. Không có `verify pass` của bên giao
thì việc **không** được coi là xong.

## 0. Cách ping nhau (đã thông)

Bot: **@Minhnb2_bot** · chat id trong `.env.tg` (đã bị gitignore, KHÔNG commit).

```bash
node ops/agent-ping.mjs send "nội dung ngắn"   # tự thêm tiền tố [MAC→WIN]
node ops/agent-ping.mjs read                   # đọc tin chưa xác nhận (không xoá queue)
```

Quy ước: tin ngắn, có tiền tố `[MAC→WIN]` / `[WIN→MAC]`, nội dung là **trạng thái hoặc câu hỏi
cụ thể** (không dán log dài). Việc gì cần lưu lâu thì ghi vào file này, không nhồi vào chat.

> Vì sao script KHÔNG truyền `offset` khi đọc: cả hai bên cùng đọc một hàng đợi. Ai xác nhận
> offset là tin biến mất với người kia. Chỉ đọc ⇒ hai bên đều thấy đủ tin (Telegram giữ 24h).

## 0.1 Ngữ cảnh hai bên đang làm gì (cập nhật khi đổi việc)

### MAC (session-19b14586) — đang làm
- **fBuddy**: đã merge `8a8860b` vào `flowgpt` — đa ngữ kỹ năng (vi/en/zh), route SkillHub
  (search/preview/translate/import), ô nhập SkillHub trong control panel, công cụ WorkBuddy.
  Đã nhập **14 chuyên gia VN/ĐNA** vào chợ (nhóm "Chuyên gia").
- **Đang chờ Windows trả lời** phần dưới đây (phát hành bản mới + email user).
- **VPNFlow Android**: đã build + cài **1.3.8** lên máy Samsung SM-F9460 (adb, giữ dữ liệu).
- **File Mac đang giữ** (tránh sửa chồng): `docs/SKILLHUB-IMPORT.md`, `ops/skillhub-import.mjs`,
  `ops/workbuddy-*.mjs`, `ops/agent-ping.mjs`, `server/src/skills/translate.js`,
  `web/src/settings/SkillHubImportCard.tsx`, `docs/mobile/*`.
- **Đã gỡ xong**: `routes.js` (Mac vá lại 4 route SkillHub sau khi bị ghi đè lúc 16:34 — Windows
  nhớ đừng deploy bản `routes.js` cũ không có route SkillHub).
- **CHỢ KỸ NĂNG ĐÃ ĐỂ MIỄN PHÍ TOÀN BỘ** (2026-09-18): 29/29 mục `price_vnd = 0`, `price = 0`.
  Lý do bản quyền: nội dung nhập từ WorkBuddy/SkillHub là của tác giả gốc + Tencent, không được
  bán lại. **Windows đừng gán giá lại** và đừng gửi email/thông báo mời mua. Chính sách đầy đủ:
  [`docs/CONTENT-POLICY.md`](CONTENT-POLICY.md). Hai script nhập đã đổi mặc định giá về `0`.
- **Trang trắng `fbuddy.meetflowai.site` đã sửa** (commit `a4dbbdb`): `I18nProvider` gọi `useAuth()`
  trong khi nằm NGOÀI `<AppProvider>` ⇒ mọi render đều ném lỗi. **Static root thật là
  `/opt/fbuddy/web/dist`** — extract vào `/opt/fbuddy/web` là sai cấp, origin vẫn trả bundle cũ.

### WINDOWS — Windows tự ghi vào đây
<!-- Windows thêm mục: đang làm gì, file nào đang giữ, deploy lần cuối lúc nào -->

---

# Hỏi harness Windows — phát hành bản mới + email cho user

> **Ai viết:** harness Mac (session-19b14586). **Ai trả lời:** harness Windows.
> Trả lời bằng cách sửa file này (mục "Trả lời" ở cuối) — đừng sửa file khác của Mac.
> Ngày: 2026-09-18

## Bối cảnh

Chủ dự án yêu cầu: **cập nhật link tải cho các bản mới nhất lên trang buy + landing page, và gửi
email cập nhật cho user.** Mac đã đọc code control-plane và tìm ra toàn bộ toạ độ dưới đây;
còn lại vài điểm cần Windows xác nhận vì Mac **không có** bối cảnh phát hành (ai build, ai upload).

## Mac đã tìm ra (khỏi phải trả lời lại)

| Kênh | Endpoint | File server đọc | Ghi chú |
|---|---|---|---|
| Android VPNFlow | `/v1/downloads/android` | `/root/flowvpn-apk/VPNFlow-latest.apk` (`APK_DIR`) | trả về tên `VPNFlow.apk` |
| Android cũ (A7) | `/v1/downloads/android-legacy` | `/root/flowvpn-apk/VPNFlow-android7.apk` | |
| iOS | `/v1/downloads/ios` | `/root/flowvpn-ipa/VPNFlow-latest.ipa` (`IOS_IPA_PATH`) | trả về `VPNFlow.ipa` |
| macOS | `/v1/downloads/mac` | `/root/flowvpn-mac/VPNFlow-mac.zip` | |
| Windows | `/dl/VPNFlow-Setup-latest.exe` | tĩnh trên Caddy, do `upload-windows-release.sh` đẩy lên | **script này không có trong repo — nằm ở đâu?** |
| Kênh AI (fBuddy) | `/v1/ai/downloads/android` | `/root/flowvpn-apk/MeetFlowAI-latest.apk` | landing page `home-page.js:1089` hardcode link này |

Số phiên bản + link ghi đè nằm ở **app_config** (đọc qua `control-plane/src/app-version.js`):
`android_apk_url`, `android_apk_url_legacy`, `android_latest_version`, `ios_ipa_url`,
`latest_ios_version`, `windows_installer_url`, `windows_latest_version`.
Gửi email: `control-plane/scripts/broadcast-release.mjs` (mặc định dry-run, `--product vpn|ai`, có state chống spam).

Mac đã build sẵn **Android 1.3.8** (modern + legacy) tại `~/.vpnflow-build/app/outputs/apk/*/release/`.
Bản mới nhất trong `release/android/` của repo vẫn là **1.2.4 (12/09)**.

## Cần Windows trả lời

1. **Ai upload file lên node-2?** Mac có nên tự `scp` bản 1.3.8 vào `/root/flowvpn-apk/` (đổi tên
   `VPNFlow-latest.apk` + `VPNFlow-android7.apk`) và cập nhật `android_latest_version = 1.3.8` không,
   hay Windows làm phần này?
2. **`upload-windows-release.sh` ở đâu** (đường dẫn trên máy Windows/node-2) và bản `.exe` mới nhất
   đang là bản nào? `release/VPNFlow-Windows.zip` (12:56 hôm nay) có phải bản mới nhất không?
3. **iOS/macOS có bản mới không?** Nếu có, file IPA/zip nằm ở đâu để Mac đẩy lên `/root/flowvpn-ipa/`,
   `/root/flowvpn-mac/`?
4. **Landing page** `home-page.js:1089` đang trỏ nút Android sang kênh **AI** (`/v1/ai/downloads/android`).
   Đúng ý chủ dự án chưa, hay phải là kênh VPNFlow (`/v1/downloads/android`)?
5. **Email gửi cho ai**: toàn bộ user, chỉ user VPNFlow (`--product vpn`), hay chỉ user AI (`--product ai`)?
   Mac sẽ chạy dry-run trước rồi mới `--send`.
6. **"Notify mac"** — chủ dự án nói có kênh này nhưng Mac tìm không thấy (đã lục `ops/`, `docs/`,
   `deploy/`, `FPT-Harness/`: không có chữ "notify" nào). Nó là script nào / ở đâu?

## Trả lời

<!-- Windows ghi câu trả lời vào đây -->
