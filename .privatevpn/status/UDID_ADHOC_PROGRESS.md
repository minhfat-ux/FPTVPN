# iOS Ad Hoc UDID Progress

> Tài liệu đầy đủ (luồng, cấu trúc plist, bẫy đã gặp, cách kiểm tra): **`docs/IOS_ADHOC_OTA.md`**.

Updated: 2026-09-14

## DONE

- Existing OTA UDID flow confirmed in `control-plane/src/ios-devices.js` and `control-plane/src/index.js`:
  - `/install/ios/register.mobileconfig`
  - `/install/ios/udid`
  - `/install/ios/status`
  - admin device list/add/mark-built endpoints
- Added account mapping fields to persisted iOS device records:
  - `userId`
  - `email`
- Callback metadata also preserves `IMEI` and `ICCID` when Apple sends them.
- Generated profile requests `UDID`, `VERSION`, `PRODUCT`, `SERIAL`, `IMEI`, and `ICCID`.
- Buy page now provides the Ad Hoc OTA install page when no direct IPA/store link is configured:
  `/install/ios`.
- When a direct IPA link is configured, the existing IPA button remains compatible; the Ad Hoc
  install flow remains available as the fallback path.
- iOS install guidance continues to require Safari and now follows the Ad Hoc OTA path before
  signed IPA installation.
- Added `IosDeviceStore.mapAccount()`.
- Added authenticated admin API:
  - `POST /v1/admin/ios/devices/:udid/account`
  - alias `/admin/ios/devices/:udid/account`
  - accepts `userId` or `email`; validates account exists through `AuthStore`.
- Added admin page tab `iOS UDID`:
  - list UDID, model/iOS, account email/user ID, registration/build state
  - Map action prompts for account email and calls the admin API
- Tests:
  - focused UDID/admin tests: 12 pass / 0 fail
  - full control-plane suite: 174 pass / 0 fail

## DONE (2026-09-15, đã deploy production)

- Trang buy: khối "Cài trên iPhone / iPad (Ad Hoc)" 4 bước × 5 ngôn ngữ (Safari → đăng ký thiết bị → shop ký → Trust).
- Callback `.mobileconfig` mang `?token=` → tự map UDID vào đúng account (`lookupEnrollmentToken`, không tiêu thụ token).
- Admin: tab iOS UDID (list + Map) + panel App Store Connect (nạp .p8, trạng thái, đăng ký từng máy/hàng loạt).
- Tự đăng ký UDID lên Apple qua App Store Connect API (JWT ES256) khi đã có khoá; lỗi ghi vào appleError.
- Email "bản cài đã sẵn sàng" (vi/en/zh) tự gửi sau khi ký lại IPA; chỉ đánh dấu đã báo khi mail gửi được.
- Test: 191 pass / 0 fail. E2E local với khoá giả: Apple trả lời thật (401) ⇒ code chạy hết đường.
- Bằng chứng: `evidence/2026-09-15-ios-adhoc-ota-buy-and-account-mapping.log`,
  `evidence/2026-09-15-ios-adhoc-asc-api-and-ready-email.log`.

## KHOÁ APPLE — ĐÃ NẠP (2026-09-15)

- Key ID `8GW3662G64`, Team `G6XW3RN6LJ`; khoá lưu ở `/root/flowvpn-cp/data/apple-asc.json` (0600),
  KHÔNG nằm trong repo.
- Verify: Apple kết nối OK, tài khoản có 4 thiết bị; 2 UDID trong hệ thống đã có sẵn trên Apple
  ⇒ đánh dấu `appleAlreadyRegistered`.
- Khách đăng ký máy mới ⇒ UDID tự được đẩy lên Apple.

## ĐÃ CHẠY THẬT TRÊN MÁY THẬT (2026-09-15)

iPhone15,3 (build 23H24) của chủ shop: UDID về server → tự đối chiếu Apple (đã có) → IPA ký kèm UDID
→ cài app thành công. Chi tiết + 5 lỗi đã sửa: `evidence/2026-09-15-ios-adhoc-asc-api-and-ready-email.log` §7.

Lưu ý cần nhớ:
- iOS **luôn hiện "Invalid Profile"** sau khi gửi UDID (bản chất cơ chế) — popup đã nói rõ với khách.
- Trang cài dùng **mã phiên (sid)** để nhận ra máy, và **luôn có nút Tải & cài**.
- iOS 26 gửi body dạng **CMS/PKCS#7**; `VERSION` là số build.

## CÒN LẠI

- Ký lại IPA trên máy Mac khi có UDID MỚI (server chưa tự ký được) — quy trình: thêm UDID (server tự làm)
  → export profile → ký → upload → bấm "đã ký lại" (khách tự nhận email).
- 3 UDID hiện có trong hệ thống chưa map account (map trong tab iOS UDID khi cần).
