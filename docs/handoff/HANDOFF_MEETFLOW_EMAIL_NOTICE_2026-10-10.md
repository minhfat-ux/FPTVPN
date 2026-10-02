# HANDOFF → harness Windows: bản Android 10/10 có THÔNG BÁO "đăng ký email là bắt buộc"

- **Từ:** harness Mac (main agent) · **Cho:** **harness Windows** (owner `control-plane/**` + kênh Android)
- **Ngày soạn:** 02/10/2026 · **Chủ dự án chốt trong phiên:** *"đặt scheduler, ngày 10/10 sẽ publish 1 bản
  mới, sẽ thêm cái notification thông báo đăng ký email là bắt buộc"*, và **từ 15/10 tài khoản không
  đăng ký email sẽ bị khoá**.
- **Lịch:** build + kiểm xong **trước 09/10** → **10/10 publish** → **15/10 bật luật khoá**.
- **Lưu ý băng:** Android đang đóng băng (`docs/handoff/FREEZE_ANDROID_2026-09-23.md`) — việc này **cần
  chủ dự án mở băng** cho đúng phạm vi "thông báo đăng ký email".

## 1. Vì sao phải làm trong APP (số liệu thật, đọc trên node-2 hôm 02/10)
| Nhóm | Số lượng | Ghi chú |
|---|---|---|
| Tài khoản Firebase (MeetFlow AI) | 143 | 60 có email (57 verified), **83 KHÔNG có email** (ẩn danh) |
| `ai-users.json` (email đã thấy trong app) | 23 | |
| Pro đang cấp / đơn chờ | 4 / 7 | |
| Lead trang `/buy` | 43 email | 33 là email test ⇒ **~5 lead thật chưa có tài khoản** |
| VPNFlow (`auth.json`) | 20 user | **20/20 đã có email** — không thuộc đợt này |

⇒ **Gửi mail không tới được 83 tài khoản ẩn danh** (không có địa chỉ), và app **không có FCM/push**
(đã kiểm: không `firebase-messaging` trong app, CP không lưu device token) và **không có Remote Config**.
Kênh duy nhất chạm được họ là **giao diện trong app**.

## 2. Kênh đã có sẵn (khảo sát code 02/10)
- `FChinaTranslator/android/.../ui/update/UpdateGate.kt` gọi `GET /v1/ai/app-version?platform=android&version_code=N`
  **mỗi lần mở app / quay lại foreground**:
  - `minimum_version_code` > bản đang cài ⇒ **màn hình CHẶN**, có hiện `notes` do server gửi.
  - `latest_version_code` > bản đang cài ⇒ hộp thoại **tắt được**, nhưng **chỉ hiện chuỗi cứng**
    (`update_optional_message`) — **KHÔNG** hiện `notes`.
- `.../data/auth/AuthRepository.kt`: app **chỉ đăng nhập ẩn danh** (`signInAnonymously`) — **chưa có**
  màn hình/luồng đăng ký email trong app.
- `control-plane/src/index.js`: `GET /v1/ai/app-version` trả `aiAndroidVersion()`; `PATCH /v1/admin/ai/app-version`
  nhận `latest_version_code | minimum_version_code | latest_version_name | apk_url | notes`.

## 3. Việc phải làm
### 3.1 Control plane (WIN)
1. Thêm field **`notice`** vào payload `/v1/ai/app-version` **và** nhận nó ở `PATCH /v1/admin/ai/app-version`.
   Đề xuất tối thiểu (đủ để app hiện thông báo, không phải sửa app lần nữa khi đổi chữ):
   ```json
   "notice": {
     "id": "email-required-2026-10",
     "action": "register_email",
     "title": { "vi": "…", "en": "…", "zh": "…", "ja": "…", "ko": "…" },
     "body":  { "vi": "…", "en": "…", "zh": "…", "ja": "…", "ko": "…" },
     "button":{ "vi": "Đăng ký email", "en": "Register email", "zh": "绑定邮箱", "ja": "メール登録", "ko": "이메일 등록" }
   }
   ```
   `notice = null` ⇒ app không hiện gì (đường lùi an toàn). App chọn ngôn ngữ theo locale, thiếu thì `en`.
2. (15/10) **Luật khoá**: tài khoản Firebase **không có email** bị chặn — chốt với chủ dự án mức khoá
   (a) chặn dùng tính năng AI nhưng vẫn mở app, hay (b) chặn hẳn. Trả cờ `email_required: true` +
   `locked: true` trong response app đang gọi để app hiện màn hình tương ứng.

### 3.2 App Android (WIN build; cần mở băng)
1. `UpdateGate` (hoặc `AppRoot`): sau khi có `notice` ⇒ hiện **hộp thoại không chặn** với
   `title/body` theo ngôn ngữ + nút CTA; nút phụ "Để sau" (nhớ `notice.id` đã tắt để không hiện lại mỗi lần mở).
2. CTA `action=register_email` ⇒ mở luồng đăng ký email. **App hiện chưa có luồng này** — chọn 1 trong 2:
   - (nhanh) mở web: `https://meetflowai.site/ai/register?uid=<firebase uid>` (WIN dựng trang, ghi email vào Firebase/registry);
   - (đúng hơn) thêm màn hình email + mật khẩu dùng `FirebaseUser.linkWithCredential(EmailAuthProvider.getCredential(...))`
     để nâng chính tài khoản ẩn danh hiện tại lên có email (**không mất dữ liệu/lịch sử của uid đó**).
3. Chữ gợi ý (VI): *"Từ 15/10/2026, tài khoản chưa đăng ký email sẽ bị khoá. Vui lòng đăng ký email
   trước ngày 15/10 để giữ tài khoản và dữ liệu."* (ZH/EN/JA/KO nhờ WIN dịch theo mẫu 5 ngôn ngữ của app.)

### 3.3 Publish 10/10
1. Đẩy APK mới lên `/v1/ai/downloads/android` (đúng kênh, `record release` như các bản trước).
2. `PATCH /v1/admin/ai/app-version` với `latest_version_code` = versionCode mới, `latest_version_name`,
   `notes`, `notice`.
3. ⚠️ **KHÔNG** đặt `minimum_version_code` cao hơn bản đang phát nếu APK mới chưa thật sự nằm trên
   endpoint: người dùng bị chặn ở màn hình cập nhật mà tải lại đúng bản cũ ⇒ **kẹt không vào được app**.
4. Báo lại Mac (bus) để nghiệm thu.

## 4. Nghiệm thu (Mac kiểm, có bằng chứng)
1. `curl -s https://meetflowai.site/v1/ai/app-version?platform=android` ⇒ có `notice` đủ 5 ngôn ngữ + `latest_version_code` mới.
2. APK trên endpoint: `apksigner verify` ĐẠT, `versionCode`/`versionName` khớp, sha256 ghi vào `release/` ledger.
3. Máy thật (tài khoản ẩn danh): mở app ⇒ thấy hộp thoại; bấm CTA ⇒ luồng đăng ký chạy; sau khi đăng ký,
   email xuất hiện trong Firebase (`emailVerified` theo luồng), **uid giữ nguyên** (nếu dùng `linkWithCredential`).
4. 15/10: tài khoản ẩn danh bị khoá đúng mức đã chốt; tài khoản đã có email vẫn dùng bình thường.

## 5. Scheduler phía Mac (đã cài, không cần WIN làm gì)
- LaunchAgent `site.meetflowai.email-notice-schedule`, chạy **09:00 mỗi ngày**, script
  `scripts/scheduler/email-notice-2026-10.sh` (bản chạy ở `~/.local/share/flowvpn-scheduler/`).
- Mốc: **06–09/10** nhắc chuẩn bị (chỉ khi còn việc) · **10/10** ngày publish (preflight + nhắc WIN) ·
  **11–14/10** đếm ngược · **15/10** ngày khoá. Script **chỉ đọc + Telegram**, KHÔNG tự publish.
- Kiểm chứng đã chạy thật: `launchctl kickstart` ⇒ `runs = 1, last exit code = 0`; nhánh chuẩn bị đã
  gửi Telegram thật qua node-2 (`flowvpn-notify --ping`, vì `api.telegram.org` bị chặn từ mạng Mac).

---

## 6. CHỐT CỦA CHỦ DỰ ÁN (02/10/2026) — hai điểm đã quyết

1. **MỞ BĂNG ANDROID** cho đúng phạm vi việc này: thêm thông báo "đăng ký email là bắt buộc"
   (control-plane field `notice` + hộp thoại trong app). Không mở cho việc khác.
2. **MỨC KHOÁ từ 15/10 = "mở app, khoá Pro"**: tài khoản chưa đăng ký email **vẫn mở được app**,
   nhưng **mọi tính năng Pro bị khoá** (coi như chưa có entitlement Pro). KHÔNG chặn hẳn app.
   ⇒ Control plane: khi user chưa có email ⇒ trả `email_required: true` + **không** cấp quyền Pro
   (entitlement coi như hết hạn), app hiện thông báo + nút đăng ký. Sau khi đăng ký email, quyền Pro
   trở lại đúng theo entitlement đã mua.

## 7. BỔ SUNG: chính sách cho **VPNFlow** (chủ dự án chốt cùng phiên)

> *"Các user của VPNFlow là bắt buộc đăng ký và mua gói Pro."*

- **Bắt buộc đăng ký** (tài khoản email) **và** có **gói Pro còn hiệu lực** mới được dùng.
  Không còn đường dùng chỉ bằng thiết bị/UDID mà không có tài khoản.
- Trạng thái thật hôm nay (node-2, 02/10): `auth.json` **20 user — 20/20 đã có email**;
  14 thiết bị (gắn hết vào user có email); **10 thiết bị iOS đăng ký bằng UDID** (không có email).
- Việc cần làm (WIN, control-plane):
  1. Thiết bị/UDID **không** gắn tài khoản có email ⇒ chặn cấp quyền (không phát credential/peer) và
     trả lý do rõ để app hiện "cần đăng ký + mua Pro".
  2. Tunnel chỉ mở khi subscription còn hiệu lực **và** user có email đã đăng ký.
  3. Thông báo cho nhóm này: **email được** (20/20 user có email, và lead mua hàng có email).
     Riêng **10 UDID iOS không có email** ⇒ không mail được, phải nhắc qua app/web lúc mở
     (màn hình "cần đăng ký") — app iOS/macOS đang **đóng băng**, nên phần này cần chủ dự án
     mở băng riêng nếu muốn làm trước 15/10.
- Mốc áp dụng: **15/10/2026** (cùng hạn với MeetFlow AI), trừ khi chủ dự án đổi.
