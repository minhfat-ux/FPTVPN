# iOS Ad Hoc UDID Progress

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

## CÒN LẠI (cần chủ shop)

- Ký lại IPA + export provisioning profile chứa UDID mới trên máy Mac (server chưa tự ký được).
- Cài thử trên iPhone thật rồi bấm Trust certificate.
