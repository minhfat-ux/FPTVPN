# Branch `production` — nơi build artifact nộp store

_Cập nhật 2026-09-13._

`production` là branch **"an toàn để nộp store"**, dùng để build **mọi** artifact nộp store:

| Nền tảng | Lệnh | Ghi chú |
|---|---|---|
| Google Play (Android) | `./gradlew :app:bundleRelease` | AAB, `SELL_ON_WEB = false`: không có UI mua gói, **không** link ra trang bán |
| App Store (iOS) | `./scripts/archive-appstore.sh ios appstore` | IPA, chỉ In-App Purchase |
| App Store (macOS) | `./scripts/archive-appstore.sh mac appstore` | IPA, chỉ In-App Purchase |

## Vì sao an toàn để nộp

- **Không có đường dẫn thanh toán ngoài app**: `PaywallScreen`/`MainScreen` ẩn toàn bộ UI mua gói
  (`Config.SELL_ON_WEB = false`), và `project.yml` bật sẵn `PAYWALL_APPSTORE` cho cả iOS + macOS
  nên bản archive chỉ dựng `StoreKitPaywallView` (Guideline 3.1.1 / 3.1.3).
- **Không còn Play Billing**: đã bỏ dependency + `BillingClient`, manifest không khai
  `com.android.vending.BILLING`. Quyền lợi đọc từ backend theo tài khoản đăng nhập.
- **Foreground service được GIỮ** (`FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_SPECIAL_USE`) cùng
  hysteria — cần cho VPN ổn định khi chuyển Wi-Fi/4G. Khi nộp Play phải khai báo loại
  foreground service và giải trình trong Play Console.

## Quan hệ với các branch khác

| Branch | Dùng cho | Paywall |
|---|---|---|
| `main` | Dev + server production (control-plane deploy từ đây) | mở trang web bán hàng |
| `web` | Kênh tự bán: APK sideload + trang web | mở trang web bán hàng |
| `store` | Google Play | ẩn UI mua gói |
| **`production`** | **Nộp store cho mọi nền tảng** | ẩn UI mua gói **+** chỉ IAP |

`production` lấy từ `store` (Android Play-safe + FGS) và thêm cờ `PAYWALL_APPSTORE` cho iOS/macOS.
Khi `store` có bản Android mới, cập nhật `production` bằng cách merge `store` vào `production`
(không đụng `project.yml`, nên không conflict).
