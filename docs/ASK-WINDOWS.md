# Kênh trao đổi giữa hai harness (Mac ↔ Windows)

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
