# Đưa VPNFlow lên App Store (iOS) — runbook

Cập nhật 2026-09-10 · phiên bản chuẩn bị nộp: **iOS 1.2.3 (build 2)**, macOS 1.2.2.

Mục tiêu: bản nộp lên App Store **chỉ dùng In-App Purchase (StoreKit)** — không có
đường dẫn nào ra trang thanh toán web trong bản Release.

---

## 1. Đã làm trong code (không cần làm lại)

| Việc | Chi tiết |
|---|---|
| Paywall mặc định = StoreKit | `PaywallDistribution` (iOS) / `MacPaywallDistribution` (macOS). Release **luôn** trả `.appStore`; chế độ `direct` (mở trang web `/buy`) chỉ còn ở build `DEBUG`. |
| Tuân thủ 3.1.1 / 3.1.3 | Không còn link/CTA ra ngoài để mua gói. Trang web buy vẫn có trong binary nhưng **không thể tới được** ở Release. |
| Khai báo 3.1.2 | `StoreKitPaywallView` có giá, chu kỳ, "tự động gia hạn", link Điều khoản (EULA) + Chính sách riêng tư + nút **Restore Purchases**. |
| Mã hoá | `ITSAppUsesNonExemptEncryption = false` trong Info.plist (iOS + macOS) → không phải trả lời câu hỏi export compliance mỗi lần upload. |
| Force update | `/v1/app-version` + `ForceUpdateView`. Nút Update nay fallback sang App Store search khi server chưa có `store_url`. |
| Tài khoản review | `review@meetflowai.site` — mã OTP **cố định `246810`**, không giới hạn resend, tự động có Premium 1 năm. |
| Support URL | `/support` (VPNFlow) và `/ai/support` (MeetFlow AI) — trang mới trong `control-plane/src/support-page.js`, 5 ngôn ngữ, đã mở public trong middleware token và Caddy. |
| Xoá tài khoản | Đã có sẵn: app **Settings → Delete Account** → `DELETE /v1/account` (Apple 5.1.1(v)). |
| Legal trong app | Paywall + Settings có Terms (EULA của Apple) và Privacy Policy. |

Kiểm tra nhanh trên máy chủ (đã chạy, kết quả OK):

```bash
curl -s -X POST https://api.meetflowai.site/v1/auth/email/start \
  -H 'content-type: application/json' \
  -d '{"email":"review@meetflowai.site","lang":"en"}'
# {"ok":true,"debug_code":"246810"}

curl -s -X POST https://api.meetflowai.site/v1/auth/email/verify \
  -H 'content-type: application/json' \
  -d '{"email":"review@meetflowai.site","code":"246810"}'
# -> access_token + premium: true, hết hạn 2027-09-10
```

Cấu hình liên quan trên VPS (`/etc/systemd/system/flowvpn-cp.service.d/store-urls.conf`):

```
Environment=DEBUG_CODE_EMAILS=minhnb2@me.com,support@meetflowai.site,review@meetflowai.site
Environment=GRANT_SUB_EMAILS=minhnb2@me.com,support@meetflowai.site,review@meetflowai.site
Environment=DEV_LOGIN_CODE=246810
```

> `DEV_LOGIN_CODE` là mã đăng nhập dùng chung cho allowlist trên. Sau khi app được
> duyệt nên **xoá dòng này** (hoặc đổi mã) rồi `systemctl daemon-reload && systemctl restart flowvpn-cp`.
> Không thêm email thật vào `DEBUG_CODE_EMAILS`.

---

## 2. Việc bắt buộc làm trên App Store Connect (chưa xong)

### 2.1 Guideline 5.4 — tài khoản **Organization** (chặn lớn nhất)

Apple chỉ cho phép app VPN bán trên App Store khi tài khoản Developer là **tổ chức**
(Organization), không phải cá nhân. Cần **D-U-N-S number** cho pháp nhân đứng tên app.

- Nếu tài khoản hiện tại là cá nhân → hoặc nâng cấp lên Organization (Apple yêu cầu
  D-U-N-S + giấy tờ pháp lý), hoặc chuyển app sang một tài khoản Organization.
- Cách né hợp lệ duy nhất mà không cần Organization: **TestFlight** (TestFlight
  không bị áp Guideline 5.4) — đúng như thoả thuận trước đó cho VPNFlow iOS.

### 2.2 Sản phẩm IAP phải tồn tại trước khi nộp

Trong App Store Connect → app VPNFlow → *Monetization → Subscriptions*:

| Product ID | Loại | Giá gợi ý | Ghi chú |
|---|---|---|---|
| `Monthly_Premium` | Auto-renewable, 1 tháng | 70.000đ | Cùng **1 subscription group** |
| `Yearly_Premium` | Auto-renewable, 1 năm | 600.000đ | Bậc cao hơn trong group |

- App **không hard-code** product ID → không cần đổi code khi đặt ID khác, nhưng
  phải **đúng** ID đã đăng ký (kiểm tra ở `SubscriptionStore`).
- Mỗi sản phẩm cần: tên hiển thị, mô tả, ảnh review (1024×1024), giá cho tất cả
  vùng lãnh thổ → nếu thiếu, IAP không hiện trong app và review sẽ từ chối.
- Gói mua ở web (VietQR/MoMo/WeChat/Alipay) **không** liên quan bản App Store: nếu
  khách đã mua ở web, premium do backend cấp (`backendPremium`) — không cần IAP.

### 2.3 Hồ sơ app

- [ ] Screenshots: iPhone 6.9" + 6.5" (bắt buộc), iPad nếu có, Apple Watch không có.
- [ ] App Privacy: khai báo **Email address** (tài khoản), **Device ID**, "Data Used to
      Track You" = **No**; không dùng IDFA → không cần App Tracking Transparency.
- [ ] Age rating: 4+ (VPN, không nội dung nhạy cảm).
- [ ] Category: Utilities (chính) — Business (phụ).
- [ ] Encryption: chọn **"No"** khi được hỏi (đã khai `ITSAppUsesNonExemptEncryption=false`).
- [x] Support URL: `https://meetflowai.site/support` — trang hỗ trợ mới, 5 ngôn ngữ,
      có email liên hệ, FAQ (hoàn tiền, huỷ gói App Store, xoá tài khoản) và link
      privacy/terms. (MeetFlow AI dùng `https://meetflowai.site/ai/support`.)
- [x] Privacy Policy URL: `https://meetflowai.site/FlowVPNPrivacy.html` (VPNFlow),
      `https://meetflowai.site/privacy` (MeetFlow AI); Terms: `https://meetflowai.site/terms`.
- [ ] TestFlight: nên upload lên TestFlight trước để tự kiểm tra bản Release thật.

### 2.4 Review notes (dán nguyên văn vào *App Review Information → Notes*)

```
VPNFlow requires an account. A demo account with an active subscription is
provided for review — no payment needed:

  Email: review@meetflowai.site
  Login code: 246810   (fixed code; the same code is always accepted)

Sign-in flow: tap "Sign in", enter the email above, then enter the code 246810
on the verification screen. The account is already Premium.

Notes:
- The app uses a Network Extension (WireGuard packet tunnel) to provide VPN
  functionality; the VPN profile is created inside the app, no external profile
  is needed.
- Subscriptions are sold with In-App Purchase (StoreKit) only. The app does not
  link out to any external payment page in this build.
- "Restore Purchases" is available on the subscription screen.
- Purchases made on our website are for our Android/desktop builds and are not
  referenced in this app.
```

### 2.5 Signing / capabilities

- [ ] App ID `com.privatevpn.app` có: **Network Extensions**, **In-App Purchase**,
      và (tuỳ chọn) **Associated Domains** — nếu App ID chưa bật Associated Domains thì
      bỏ `applinks:meetflowai.site` khỏi `iOS/PrivateVPN/PrivateVPN.entitlements`
      trước khi export, nếu không `-exportArchive` sẽ lỗi provision.
- [ ] Provisioning profile **App Store** cho cả `PrivateVPN` và `PrivateVPNPacketTunnel`.
- [ ] Extension phải cùng version với app (đã đồng bộ 1.2.3 / 2 qua `project.yml`).

---

## 3. Build & export IPA

```bash
cd /Volumes/BIWIN/SourcesCode/PrivateVPN

# 1) Sinh lại project nếu có sửa project.yml
xcodegen generate --spec project.yml --project .

# 2) Archive (Release, thiết bị thật)
rm -rf build/ios-export && mkdir -p build/ios-export
xcodebuild -project PrivateVPN.xcodeproj -scheme PrivateVPN \
  -configuration Release -destination 'generic/platform=iOS' \
  -archivePath build/ios-export/PrivateVPN.xcarchive archive \
  -allowProvisioningUpdates

# 3) Export IPA để upload
cat > build/ios-export/ExportOptions.plist <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store</string>
  <key>teamID</key><string>G6XW3RN6LJ</string>
  <key>uploadSymbols</key><true/>
  <key>compileBitcode</key><false/>
  <key>destination</key><string>export</string>
</dict></plist>
PLIST

xcodebuild -exportArchive \
  -archivePath build/ios-export/PrivateVPN.xcarchive \
  -exportOptionsPlist build/ios-export/ExportOptions.plist \
  -exportPath build/ios-export/ipa \
  -allowProvisioningUpdates
```

Upload: **Xcode → Window → Organizer → Distribute App**, hoặc

```bash
xcrun altool --upload-app -f build/ios-export/ipa/PrivateVPN.ipa \
  -t ios --apiKey <KEY_ID> --apiIssuer <ISSUER_ID>   # cần API key App Store Connect
```

macOS (nếu nộp luôn): đổi scheme `PrivateVPNMac`, `-destination 'generic/platform=macOS'`,
`method` = `app-store`.

---

## 4. Kiểm tra trước khi bấm Submit

- [ ] Build Release trên máy thật: mở màn Subscription → thấy **gói IAP + giá**, có
      Restore Purchases, có link EULA/Privacy. **Không** thấy trang web thanh toán.
- [ ] Đăng nhập bằng `review@meetflowai.site` + `246810` → Premium hiện đúng.
- [ ] Kết nối VPN thành công trên thiết bị thật (không chỉ simulator).
- [ ] Không có chữ nào nhắc "chuyển khoản", "VietQR", "MoMo", "WeChat Pay", "Alipay"
      trong màn hình mua gói.
- [ ] Bản TestFlight không kèm ghi chú nội bộ.
- [ ] `CFBundleShortVersionString` mới hơn bản đã upload trước đó (Apple không cho trùng).

---

## 5. Sau khi app được duyệt

1. Lấy link App Store (`https://apps.apple.com/app/id<APP_ID>`), cập nhật lại backend:

```bash
curl -s -X PATCH https://api.meetflowai.site/v1/admin/app-version \
  -H "Authorization: Bearer 5111853ec2b1bd54942562e0500746ab4292fd13a95fb1ce" \
  -H 'content-type: application/json' \
  -d '{"store_url":"https://apps.apple.com/app/id<APP_ID>",
       "latest_version":"1.2.3","minimum_version":"1.2.3"}'
```

   `minimum_version` = buộc update: chỉ nâng khi bản cũ thật sự hỏng/không tương thích.
   Đặt `minimum_version: "0.0.0"` để tắt cổng chặn.

2. Xoá `DEV_LOGIN_CODE` trên VPS (giữ tài khoản review nhưng mã đổi theo email).
3. Bật lại gói giá phù hợp, theo dõi doanh thu IAP trong App Store Connect.
4. Nhớ: khách mua qua **web** (VietQR/MoMo/WeChat/Alipay) vẫn dùng được bản iOS
   nếu họ cài bản `direct` (TestFlight/sideload) — hai kênh song song, không xung đột.

---

## 6. Câu hỏi/rủi ro thường gặp khi review

| Rủi ro | Cách xử lý |
|---|---|
| **5.4 VPN app cần Organization** | Nâng cấp/chuyển tài khoản sang Organization, hoặc phát qua TestFlight. |
| 2.1 "Không đăng nhập được" | Review notes có sẵn email + mã cố định `246810`; mã luôn là 246810 kể cả khi bấm gửi lại. |
| 3.1.1 "Có đường dẫn mua ngoài" | Bản Release chỉ còn StoreKit (xem mục 1). Trả lời kèm ảnh chụp màn hình paywall. |
| 3.1.2 thiếu disclosure | Đã có: giá, chu kỳ, tự động gia hạn, link EULA + privacy, Restore. |
| 4.2 "App quá đơn giản" | Nhấn: WireGuard tunnel, nhiều exit node, tự chọn node nhanh nhất, quản lý thiết bị, đăng nhập email OTP. |
| 5.1.1 thiếu privacy policy | `https://meetflowai.site/privacy` (đã có, đặt trong App Store Connect + trong app). |
| IAP không hiện khi test | Sản phẩm chưa "Ready to Submit"/chưa có ảnh review, hoặc thiếu `Paid Applications Agreement` + thông tin thuế/ngân hàng. |
