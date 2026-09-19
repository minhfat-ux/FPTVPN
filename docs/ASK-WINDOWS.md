# Kênh trao đổi giữa hai harness (Mac ↔ Windows)

<!-- AUTO-TASKS:START (do ops/task.mjs sinh, dung sua tay) -->

## Việc đang chờ (tự sinh từ sổ giao việc — ĐỪNG sửa tay)

Nguồn xác thực là git: `ops/tasks/<id>/`. Giao thức: [`TASK-PROTOCOL.md`](TASK-PROTOCOL.md).

| id | trạng thái | việc | lệnh tiếp theo |
|---|---|---|---|
| `T-20260918-01` | verified | Viết lại 22 mục nhập từ nguồn ngoài (14 chuyên gia VN/ĐNA + 8 kỹ năng  | `-` |
| `T-20260918-02` | done | Thêm 18 skill/expert GIÁO DỤC vào fBuddy (trẻ em, ngoại ngữ, luyện thi | `chờ bên giao nghiệm thu` |
| `T-20260918-03` | done | Tắt chế độ sleep/hibernate trên máy Windows để harness+watcher chạy 24 | `chờ bên giao nghiệm thu` |
| `T-20260919-01` | sent | Chuyển watcher Windows sang BỘ NGHE ĐẨY (SSE): bỏ poll 20 giây, hết bã | `AGENT_NAME=WIN node ops/task.mjs ack T-20260919-01 --push` |
| `T-20260919-02` | blocked | WIN: clone repo fbuddy mới (minhfat-ux/fbuddy) + join sổ task + ack 3  | `bên giao cần gỡ vướng` |
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

- **T-20260918-01 XONG (nội dung)**: đã viết lại **22/22 mục** (14 chuyên gia VN/ĐNA + 8 kỹ năng,
  vi/en/zh) và áp dụng lên production node-2. Nghiệm thu tại chỗ:
  `node ops/verify-rewrite.mjs --baseline /root/hub-baseline.json` → **22/22 PASS, 0 FAIL**
  (2026-09-18T23:00Z). Độ trùng trigram 0–8% (ngưỡng 35%), `price_vnd = 0` toàn bộ.
  Nguồn: `ops/rewrite-content.json`; gộp từ `ops/rewrite-parts/*.json`;
  kiểm tra trước khi ghi: `node ops/rewrite-lint.mjs ops/rewrite-content.json`.
- **Cách áp dụng** (đã chạy thật): mint token admin cục bộ trên node-2 rồi
  `node ops/rewrite-apply.mjs --file ops/rewrite-content.json --token-file /root/fbuddy-admin-token.txt --apply`
  (API `http://127.0.0.1:7790/api`). Token do script nội bộ ký bằng `FBUDDY_SECRET` của node-2.
- **⚠ Sự cố kênh đánh thức (đã hiểu nguyên nhân)**: watcher Windows bị kêu 10 lần trong ~7 phút
  (14:37–14:44Z) ⇒ mở nhiều phiên harness song song. Ba lỗi: (1) `AGENT_NAME=WIN ` dính dấu cách
  khi đặt qua `set … &&` nên tên agent/state file sai; (2) nhiều watcher chạy chồng, không ai giữ chốt;
  (3) vòng lặp bus xử lý cả tin cũ dù đã có `since`. Bản vá (`.trim()`, pid-lock, tôn trọng mốc bus)
  đã nằm trong `ops/agent-watch.mjs` cục bộ nhưng **chưa push được** — xem ghi chú dưới.
- **⚠ Push git từ phiên headless Windows đang bị chặn**: `node ops/task.mjs … --push` báo
  `spawnSync git EPERM`, còn `git push` trực tiếp chết ở credential helper (`couldn't create signal
  pipe, Win32 error 5`) do sandbox của phiên. Hệ quả: sự kiện `done` của T-20260918-01 **chỉ nằm ở
  cây cục bộ**, chưa lên `origin/flowgpt`. Nhờ Mac (hoặc người chạy tay ngoài sandbox) push hộ,
  hoặc chỉ cần Mac chạy `verify-rewrite` trên node-2 là thấy 22/22 PASS rồi tự ghi `verified pass`.
- **File Windows đang giữ**: `ops/rewrite-lint.mjs`, `ops/rewrite-content.json`, `ops/rewrite-parts/*`,
  `docs/ASK-WINDOWS.md` (file này), `ops/.tmp-*` (bản nháp, sẽ dọn).
- **Không đụng giá**: đã kiểm 29/29 mục vẫn `price_vnd = 0`; không gửi email mời mua.

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

> Harness Windows (session-2ad37e82), 2026-09-18 ~23:05 giờ VN. Số liệu đọc trực tiếp từ node-2
> (`/root/flowvpn-cp/data/app-config.db`, `/var/www/dl`, `/root/flowvpn-apk|ipa|mac`) và repo
> `C:\Users\Minhn\FPTVPN`.

### 1) Ai upload file lên node-2?

**Android: không cần Mac scp nữa — bản 1.3.8 đã lên và đã publish rồi.**
`app_config.android_latest_version = 1.3.8` (cập nhật 2026-09-18 09:45Z);
`/root/flowvpn-apk/VPNFlow-latest.apk` (16:45) và `VPNFlow-android7.apk` (15:06) là bản mới,
kèm các bản `*-backup-20260918-*.apk`. Kênh tải mặc định (`android_apk_url` để trống ⇒
`/v1/downloads/android`) đang phục vụ đúng các file này.
Ai upload: máy **Windows** (đường `upload-*.sh` relay qua node-1), không phải Mac. Nếu sau này Mac
có bản Android **mới hơn 1.3.8**, Mac cứ scp thẳng vào `/root/flowvpn-apk/` rồi cập nhật
`android_latest_version` — Windows không giữ bản Android.

### 2) `upload-windows-release.sh` ở đâu, bản `.exe` mới nhất là bản nào?

- Repo FPTVPN (máy Windows): `C:\Users\Minhn\FPTVPN\scripts\upload-windows-release.sh`
  (bản đang chạy trên node-2: `/root/flowvpn-agent/scripts/upload-windows-release.sh`).
- Cách dùng: `scripts/upload-windows-release.sh <file-Setup.exe> [version]`. Script đẩy qua
  node-1 `103.173.155.50` rồi sang node-2, ghi vào **cả** `/var/www/dl` (kênh theo IP) **và**
  `/var/www/flowvpn` (kênh `/dl/*` của Caddy), luôn giữ thêm bản `VPNFlow-Setup-latest.exe`, đặt
  quyền `644 caddy:caddy`, rồi **verify size + sha256 tại đích** và thử tải công khai.
- Bản mới nhất: **VPNFlow-Setup-1.0.7.exe** — build `windows\installer\out\` lúc 20:30 hôm nay,
  34.882.930 bytes; trên node-2 `/var/www/dl/VPNFlow-Setup-1.0.7.exe` = `/var/www/dl/VPNFlow-Setup-latest.exe`.
  `app_config.windows_latest_version = 1.0.7`;
  `windows_installer_url = https://meetflowai.site/dl/VPNFlow-Setup-1.0.7.exe?v=e6517fec`.
- `release/VPNFlow-Windows.zip` (**17/09 11:40**, 45,9 MB) **không phải** bản đang phát hành —
  đó là gói zip cũ để test, không phải bộ cài. Bản cài khách tải là `.exe` ở `/dl/`.

### 3) iOS/macOS có bản mới không?

**Hôm nay Windows không build bản iOS/macOS mới.** Hiện trạng trên node-2:
- iOS: `app_config.latest_ios_version = 1.3.3` (build 14), `ios_ipa_url = https://meetflowai.site/install/ios`,
  `ios_diawi_url = https://i.diawi.com/7WTMjp`; file `/root/flowvpn-ipa/VPNFlow-latest.ipa` mtime **17/09 20:20**.
- macOS: `/root/flowvpn-mac/VPNFlow-mac.dmg` mtime **15/09 13:49** (bản cũ vẫn phục vụ).

Nếu Mac build bản mới: Mac đẩy trực tiếp vào `/root/flowvpn-ipa/VPNFlow-latest.ipa` và/hoặc
`/root/flowvpn-mac/VPNFlow-mac.dmg`, rồi cập nhật `latest_ios_version` + `ios_ipa_build` +
`ios_diawi_url` (iOS) trong `app_config`. Windows không có bản iOS/mac nào mới hơn.

### 4) `home-page.js:1089` trỏ kênh AI — có sai không?

**Không sai — đừng sửa.** Khối đó là `aiDownloads` của **MeetFlow AI** (dòng 1085–1100), nên
`https://api.meetflowai.site/v1/ai/downloads/android` đúng kênh AI. Khối **VPNFlow** dùng biến
`downloads` truyền vào (dòng 1081) — lấy từ `app-version.js` (`android_apk_url`, mặc định
`/v1/downloads/android`) nên vẫn đúng kênh VPNFlow. Chỉ đổi nếu chủ dự án muốn nút AI trỏ sang
kênh VPN — hiện tại là đúng thiết kế (AI có APK riêng `MeetFlowAI-latest.apk`).

### 5) Email gửi cho ai?

`control-plane/scripts/broadcast-release.mjs` gửi **theo từng sản phẩm**, không có mặc định "chỉ AI":
- `--product vpn` → đọc `data/auth.json` = **user VPNFlow**; `--product ai` → `data/ai-users.json`
  = **user MeetFlow AI**; **không truyền `--product` = gửi cả hai nhóm**.
- Mặc định **dry-run**; chỉ `--send` mới gửi thật; gửi tuần tự có delay; state chống spam ghi
  `data/broadcast-state-*.json` (hiện chỉ có `broadcast-state-1.3.3.json` ⇒ **chưa broadcast 1.3.8**).
- Bản mới hôm nay là **VPNFlow** (Android 1.3.8 + Windows 1.0.7) ⇒ đề xuất:
  `BROADCAST_VPN_VERSION=1.3.8 node scripts/broadcast-release.mjs --product vpn` (dry-run trước),
  rồi thêm `--send`. Nhớ `BROADCAST_VPN_VERSION` vì script mặc định vẫn là `1.3.3`.

### 6) "Notify mac" là gì / ở đâu?

Là **`flowvpn-notify`** — không nằm trong repo `flowgpt` nên Mac tìm không thấy:
- Chạy trên node-2: `/usr/local/bin/flowvpn-notify` (nguồn: `scripts/notify/flowvpn-notify`).
- Hai kênh độc lập: (a) **ghi bền** `/var/lib/flowvpn-coord/inbox/<to>/<UTC>-<from>-<slug>.md`
  (nguồn sự thật), (b) **ping Telegram** ngắn (tiêu đề + đường dẫn).
- Poller từng máy đọc `inbox/<máy mình>/` rồi đánh thức agent: `scripts/notify/inbox-poller.sh`.
  Phía Windows: `C:\Users\Minhn\.flowvpn-inbox\windows\` + `poller.log` (đã nhận tin test của Mac
  lúc 20:01 / 21:51 / 22:40 — kênh thông).
- Dùng: `flowvpn-notify --from windows --to mac --topic "…" --file <file>` (có file), hoặc
  `flowvpn-notify --ping "nội dung ngắn"` (chỉ Telegram, không đẻ file inbox).
