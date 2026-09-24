# VPNFlow iOS — chiến lược phát hành & trạng thái nộp App Store

> Cập nhật: 13/09/2026. Nguồn: kiểm toán chỉ-đọc trên `main` (commit `434a7bb`) + tự kiểm lại
> trực tiếp các điểm chặn. Mọi khẳng định dưới đây đều có `file:dòng` hoặc lệnh đã chạy.

## 1. Quyết định đang áp dụng (chủ dự án, 13/09/2026)

- **iOS phát cho người dùng qua Diawi** (bản `direct` — KHÔNG bật `PAYWALL_APPSTORE`), nên **giữ
  nguyên luồng mua qua web**: paywall iOS mở `https://meetflowai.site/buy` y như Android.
- **Việc nộp App Store tạm hoãn** cho tới khi xử lý xong các mục ở §3. Bản App Store
  (`PAYWALL_APPSTORE`, không có link mua ngoài) vẫn được giữ trong code để dùng sau.
  → **Không còn đúng từ 14/09/2026**: xem ghi chú dưới.
- Vì vậy các việc "làm sạch cho bản App Store" (ẩn link mua ngoài, đồng bộ StoreKit ↔ backend)
  **chưa làm** — không phải bỏ quên.

> **Cập nhật 14/09/2026 — chủ dự án bỏ toàn bộ store billing.** Sản phẩm chỉ bán qua trang web
> `https://meetflowai.site/buy`. StoreKit (iOS **và macOS**) và Google Play Billing (Android)
> **đã bị xoá khỏi code**: paywall cả ba nền tảng giờ chỉ là WebView của trang web, quyền Premium
> lấy từ `subscription_status.is_active` của backend. Hệ quả chủ dự án đã chấp nhận: app **không
> còn nộp được App Store / Mac App Store** (3.1.1 đòi IAP cho hàng số), nên khái niệm "bản review
> `PAYWALL_APPSTORE`" không còn tồn tại — `scripts/archive-appstore.sh <ios|mac> appstore` giờ
> **thoát với lỗi** thay vì lặng lẽ ra bản web. Vì vậy §3 #1 và #4 dưới đây **MOOT**.
> (macOS đã được xử lý cùng đợt này — xem §3 #12.)

Hệ quả cần biết khi phát qua Diawi:

| Điểm | Trạng thái |
|---|---|
| Mua gói | Qua web (`/buy`) → chủ shop xác nhận → Premium mở theo email đăng nhập |
| Cập nhật phiên bản | `/v1/app-version` trả `minimum_version`/`latest_version` (đang `1.2.3` / min `0.0.0` = không ép). Nút *Cập nhật* mở `store_url`, rỗng thì iOS tự fallback về App Store (`ForceUpdateView.swift:11-14`) |
| Muốn ép cập nhật bản Diawi | `PATCH /v1/admin/app-version` với `minimum_version` = bản mới, và đặt `store_url` = link Diawi của bản đó (link Diawi đổi mỗi lần upload) |
| Bản Release | Bypass dev `FORCE_PREMIUM` **đã bị loại khỏi bản Release** (13/09/2026) — xem §4 |

## 2. Đã xác minh tốt (không cần làm lại)

- Bundle id `com.privatevpn.app` + extension `com.privatevpn.app.packet-tunnel`, version `1.2.3 (2)`
  khớp giữa `project.yml`, `Info.plist` và chữ ký IPA đã export.
- Entitlements có thật **trong chữ ký**: Network Extension `packet-tunnel-provider` (app + appex),
  `applinks:meetflowai.site`.
  → **ĐÍNH CHÍNH 23/09/2026:** dòng cũ ghi thêm "keychain sharing `G6XW3RN6LJ.com.privatevpn.shared`".
  Bản iOS từ **1.4.3/20 KHÔNG còn** nhóm keychain dùng chung (profile Ad Hoc không cấp ⇒ `-34018`
  ⇒ khách kẹt màn đăng nhập). Nhóm này **chỉ còn ở 2 target macOS**; xem
  `IOS_INSTALL_TROUBLESHOOTING.md` §0a.
- `ITSAppUsesNonExemptEncryption = false` (iOS + macOS).
- Bản App Store **không còn** chuỗi `meetflowai.site/buy` trong binary đã export (0 hit).
  → **MOOT từ 14/09/2026**: không còn bản App Store nào để export; mọi bản iOS giờ đều chứa
  trang web `/buy` (paywall là WebView của chính trang đó).
- Xoá tài khoản trong app là **hard delete** thật ở server (user/session/subscription/enrollment token).
- Disclosure 3.1.2 (giá, chu kỳ, tự gia hạn, Restore Purchases, link EULA/privacy) đầy đủ.
  → **MOOT từ 14/09/2026**: disclosure này nằm trong `StoreKitPaywallView`, đã bị xoá cùng StoreKit.
- Tài khoản review `review@meetflowai.site`: đang active Premium tới 12/09/2027, **0 thiết bị đã gắn**
  (không vướng giới hạn 3 thiết bị); VPS có `NODE_ENV=production`, mã đăng nhập review, allowlist
  `DEBUG_CODE_EMAILS`/`GRANT_SUB_EMAILS`.
- App Review không cần số điện thoại/email Việt Nam: chỉ email + mã 6 số, không CAPTCHA, mã hiện
  ngay trong app cho email allowlist.

## 3. Việc CHẶN khi muốn nộp App Store (theo thứ tự)

> ⚠️ **Cập nhật 14/09/2026**: cả danh sách này chỉ còn nghĩa nếu chủ dự án đổi quyết định cho app
> quay lại App Store — hiện app **không nộp được** (chỉ bán qua web, 3.1.1 đòi IAP). Đừng làm các
> mục dưới đây như việc tồn đọng. Riêng #1 và #4 đã **MOOT** vĩnh viễn (StoreKit đã bị xoá).

| # | Việc | Ai làm | Ghi chú |
|---|---|---|---|
| 1 | Đồng bộ StoreKit ↔ backend: verify giao dịch rồi cấp gói | Dev | **MOOT từ 14/09/2026** — chủ dự án bỏ hết store billing, iOS chỉ bán qua web nên không còn giao dịch StoreKit nào để verify. (Ghi chú cũ: **Blocker chức năng**: hiện server không biết giao dịch StoreKit nên khách mua thật bị `403 Active subscription required`) |
| 2 | Thêm `PrivacyInfo.xcprivacy` (+ khai `UserDefaults` required-reason, dữ liệu thu thập) | Dev | Repo và IPA hiện **không có** file này |
| 3 | Hồ sơ App Store Connect: ảnh chụp (iPhone 6.9"/6.5" + iPad vì `TARGETED_DEVICE_FAMILY: 1,2`), keywords, subtitle, description iOS, age rating, category, **App Privacy answers** | Chủ dự án | `evidence/screenshots/` đang rỗng 0 ảnh; `docs/APP_STORE_METADATA.md` chỉ là bản macOS |
| 4 | IAP trên ASC: `Monthly_Premium`, `Yearly_Premium` ở trạng thái *Ready to Submit*, giá khớp web | Chủ dự án | **MOOT từ 14/09/2026** — StoreKit đã bị xoá khỏi iOS, app không còn nộp App Store; đừng tạo lại sản phẩm IAP trên ASC. (Ghi chú cũ: Thiếu ⇒ paywall rỗng, dễ bị từ chối 2.1) |
| 5 | Archive → Validate → Upload → TestFlight → E2E trên đúng build đó | Chủ dự án + dev | IPA mới nhất export 10/09, cũ hơn code 13/09; bump build number trước khi upload |
| 6 | Tài khoản Developer: **Organization (5.4)** cho app VPN | Chủ dự án | Không sửa bằng code |
| 7 | Trang Terms riêng cho VPNFlow | Dev | `/terms` hiện là **"MeetFlow AI Terms of Use"** (sai thương hiệu) |
| 8 | Trang `/support` (Support URL bắt buộc) đang render link ra `/buy` | Dev | Rủi ro 3.1.1 cho bản App Store; bản Diawi thì đây lại là điều mong muốn |
| 9 | Chốt 1 tên: binary ghi **FlowVPN**, docs/ASC ghi **VPNFlow** | Chủ dự án + dev | Rủi ro 2.3.1 |
| 10 | Copy quảng cáo hứa "free 1-month trial" trong khi trial server là 1 ngày | Chủ dự án | Sửa copy hoặc cấu hình intro offer cho khớp |
| 11 | Vùng phân phối (Trung Quốc/Ấn Độ/Nga cần giấy phép VPN) | Chủ dự án | `docs/UPGRADE_RELEASE_CHECKLIST.md:44` chưa tick |
| 12 | macOS: version 1.2.2 lệch iOS, thiếu `Mac_monthly`/`Mac_yearly`, profile NE chưa có, và `VPNManagerMac.swift:430-435` **nhét cả private key** vào `providerConfiguration` (iOS đã strip) | Dev | Chỉ cần khi nộp kèm macOS. → **`Mac_monthly`/`Mac_yearly` MOOT từ 14/09/2026** (macOS đã bỏ StoreKit, chỉ bán qua web). Phần còn lại (version, profile NE, private key) vẫn đúng, nhưng **macOS hiện KHÔNG build được**: target `PrivateVPNMacPacketTunnel` trong `project.yml` thiếu source `WGRelayClient.swift`/`WSRelayClient.swift` → `cannot find type 'WGRelayClient' in scope` |
| 13 | Sau khi app được duyệt: rotate `AUTH_TOKEN`, đổi/xoá mã review, `LEGACY_MODE=0` | Chủ dự án | `docs/SECURITY_INCIDENT_ADMIN_TOKEN.md` |

### Cảnh báo secret (không copy giá trị vào đâu khác)

- `docs/APP_STORE_SUBMISSION_IOS.md` đang ghi **mã đăng nhập review thật** trong repo **public**:
  ai biết mã + email allowlist là đăng nhập được và **tự động được cấp Premium 365 ngày**. Nên đổi
  thành `<REVIEW_CODE>`, mã thật chỉ để trong App Store Connect review notes rồi rotate sau khi duyệt.
- `AUTH_TOKEN` admin cũ vẫn nằm trong **git history** của repo public — vẫn chờ rotate.
- `secrets/` (không tracked) chứa token admin, mật khẩu root, mật khẩu keystore dạng plaintext.

## 4. Đã sửa ngày 13/09/2026

| File | Sửa gì |
|---|---|
| `iOS/PrivateVPN/SettingsView.swift:298-310` | `FORCE_PREMIUM` / `flowvpn.forcePremium` bọc trong `#if DEBUG` |
| `mac/PrivateVPNMac/SettingsViewMac.swift:300-312` | như trên cho macOS |

Trước đây cờ này chạy **cả bản Release**, tức bản phát cho người dùng có đường mở khoá Premium
không qua mua — Apple xếp vào lỗi 2.3.1 (hidden feature) nếu phát hiện. Nay bản Release chỉ còn
`backendPremium` hoặc StoreKit. Bản Debug của chủ dự án vẫn dùng được như cũ.
→ **Cập nhật 14/09/2026**: iOS không còn StoreKit, nên bản Release **chỉ còn `backendPremium`** —
đúng hơn nữa. Bypass `FORCE_PREMIUM` vẫn được giữ nguyên trong `#if DEBUG`.
Kiểm tra: `xcrun swiftc -parse` cả hai file → exit 0 (chỉ kiểm cú pháp; build/archive thật vẫn phải
chạy trên máy có chứng chỉ).
