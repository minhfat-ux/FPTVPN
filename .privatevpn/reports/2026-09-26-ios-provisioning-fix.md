# Fix chặn export ad-hoc iOS (capability + UDID) — 26/09/2026

- **Triệu chứng:** `bash scripts/archive-appstore.sh ios adhoc` → `** ARCHIVE SUCCEEDED **` nhưng
  `** EXPORT FAILED **` với 2 nhóm lỗi cho **cả** `com.privatevpn.app` và `…packet-tunnel`:
  ```text
  error: exportArchive Cloud signing permission error
  error: exportArchive Provisioning profile "iOS Team Ad Hoc Provisioning Profile: …"
         doesn't include the Access Wi-Fi Information capability.
  error: exportArchive … doesn't include the com.apple.developer.networking.wifi-info entitlement.
  error: exportArchive … doesn't include the currently selected devices "VPNFlow 9B001C" …,
         "VPNFlow D2401C" …, and "VPNFlow BB801E" …
  ```
- **Ảnh hưởng:** không tạo được IPA ad-hoc ⇒ không phát hành cho khách. Bản test vẫn làm được bằng
  ký `development` (nhưng KHÔNG dùng để phát hành).

## Nguyên nhân (2 cái, độc lập)

1. **App ID thiếu capability.** `GET /v1/bundleIds/{id}/bundleIdCapabilities` trả **rỗng** cho cả
   hai App ID. Profile ad-hoc cũ vì thế không có `com.apple.developer.networking.wifi-info` mà
   entitlement của app/extension **bắt buộc** có (A7 dùng SSID để nhớ băng thông theo mạng).
2. **Xcode bị logout Apple ID** ⇒ `xcodebuild` báo `error: exportArchive No Accounts`, không tự
   đăng ký/thoả thuận lại profile được.

## Cách xử (đã làm, có thể lặp lại)

### Bước 1 — bật capability qua App Store Connect API (không cần Xcode)
```bash
# POST /v1/bundleIdCapabilities cho từng App ID, capabilityType ∈
#   ACCESS_WIFI_INFORMATION, NETWORK_EXTENSIONS, ASSOCIATED_DOMAINS
# bundle: com.privatevpn.app = 95M724A7WB · com.privatevpn.app.packet-tunnel = D24BZP3X7H
# JWT: ES256, chữ ký RAW r||s (Apple KHÔNG nhận DER của openssl) — xem scripts/ios-resign-ipa.sh
```
Kết quả: 6/6 lần POST trả 200/201 ⇒ **đã bật** cho cả 2 App ID.

### Bước 2 — đăng nhập lại Apple ID trong Xcode
Xcode → Settings → Accounts → sign in lại. Kiểm chứng bằng:
```bash
defaults read com.apple.dt.Xcode DVTDeveloperAccountManagerAppleIDLists
#   RỖNG  ⇒ chưa đăng nhập ("No Accounts" khi export)
#   có identifier ⇒ đã đăng nhập
```

### Bước 3 — export lại
```bash
xcodebuild -exportArchive -archivePath build/ios-adhoc-export/PrivateVPN.xcarchive \
  -exportOptionsPlist <ExportOptions ad-hoc> -exportPath <out> -allowProvisioningUpdates
# ⇒ ** EXPORT SUCCEEDED **
```

## Bằng chứng ĐẠT (IPA sau khi sửa)

```text
FlowVPN.app            : iOS Team Ad Hoc Provisioning Profile: com.privatevpn.app
                         wifi-info=True | UDID=10 | get-task-allow=False
…PacketTunnel.appex    : iOS Team Ad Hoc Provisioning Profile: com.privatevpn.app.packet-tunnel
                         wifi-info=True | UDID=10 | get-task-allow=False
UDID máy chủ dự án     : 00008120-00010D102E40C01E (iPhone) · 00008120-0008299A26D80032 (iPad): CÓ
version                : 1.4.6 / build 53
credential             : HysteriaPassword CO · HysteriaObfs CO
cài đặt                : devicectl install -> "App installed" trên CẢ iPhone và iPad
```

## Ghi chú kỹ thuật quan trọng (đừng mắc lại)

1. **`GET /v1/devices?filter[platform]=IOS` CHẬP CHỜN** — lúc trả 9 máy, lúc trả **0**. Dùng
   `GET /v1/devices?limit=200` rồi lọc `platform == "IOS"` tại chỗ.
2. **`GET /v1/devices` trả rỗng KHÔNG có nghĩa là chưa đăng ký**: `POST /v1/devices` cùng UDID trả
   **409 "already exists on this team"**. Đừng kết luận từ danh sách rỗng.
3. **`scripts/ios-resign-ipa.sh` có lỗi chọn cert**: nó lấy
   `GET /v1/certificates?filter[certificateType]=DISTRIBUTION&limit=1` — tài khoản có **2** cert
   Distribution (`H4DSJC5XU5` hết hạn 2027-09-15 và `KCX28GM58P` hết hạn 2027-07-19) nhưng
   **keychain chỉ có khoá riêng của `KCX28GM58P`** (serial `4875BFF3…`). Chọn sai ⇒ profile chứa
   cert không có khoá ⇒ cài lên máy báo
   `0xe8008015 (A valid provisioning profile for this executable was not found.)`.
   **Phải chọn cert khớp serial với cert trong keychain** (`security find-certificate -c "Apple
   Distribution" -p | openssl x509 -noout -serial`).
4. `DVTDeveloperAccountManagerAppleIDLists` là cách **kiểm chứng** tài khoản Xcode bằng CLI — nhanh
   hơn đoán.
