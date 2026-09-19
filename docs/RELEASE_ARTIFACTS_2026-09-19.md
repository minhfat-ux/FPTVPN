# Bản dựng sẵn để phát hành — 19/09/2026

Bảng này là nguồn số liệu để publisher đặt file + set mốc phiên bản. **Chưa upload gì.**
Quy trình chung: xem `docs/RELEASE_RUNBOOK.md`.

## iOS 1.4.0 (build 15) — IPA ad-hoc

| | |
|---|---|
| File (máy build Mac) | `build/ios-adhoc-export/ipa/FlowVPN.ipa` |
| Kích thước | 5.049.845 bytes |
| sha256 | `b6bf9a04bf3331655dcefd062c957d22ee81d177d8880636ec4ba492d4150677` |
| Version trong IPA | app `1.4.0/15`, extension `com.privatevpn.app.packet-tunnel` `1.4.0/15` (kiểm bằng `plutil` bên trong IPA) |
| Ký | Ad Hoc, Team `G6XW3RN6LJ`, profile hết hạn 2027-07-19, **6 UDID**, `get-task-allow=false` (khách không cần Developer Mode) |
| Release notes | `release/ios/RELEASE_NOTES_1.4.0.md` |
| Đích trên node-2 | `/root/flowvpn-ipa/VPNFlow-latest.ipa` (route `GET /v1/downloads/ios` đọc file này) |
| Mốc phiên bản | `latest_version=1.4.0`, `ipa_build=15` (phải khớp `CFBundleVersion` của manifest OTA) |

Nội dung bản này: sửa lỗi tunnel "Connected mà không chở gói" không tự dựng lại (vòng kiểm tra sống/chết mỗi 10s),
sửa "Connect lại phải force-quit app" (cô lập phiên + listener UDP không tái dùng fd), và backpressure đường WS.
**Lưu ý**: iOS vẫn dùng transport WireGuard-chồng-relay; hysteria2 cho Apple là bước sau.

## Android 1.4.0 (versionCode 20) — 2 APK

| Biến thể | File (máy build Mac) | Kích thước | sha256 | minSdk |
|---|---|---|---|---|
| modern | `~/.vpnflow-build/app/outputs/apk/modern/release/app-modern-release.apk` | 96.519.741 B | `a780a773806c8ddf4e0b55945db52df0780a982b95cec864a4b1a9da23f956e8` | 26 |
| legacy | `~/.vpnflow-build/app/outputs/apk/legacy/release/app-legacy-release.apk` | 96.536.114 B | `e36b4fcba4f9b104ec0235d5e5ac569eb46d2538144e13634dc27455a352bc46` | 24 |

| | |
|---|---|
| Version | `1.4.0` / versionCode `20` (cả 2 biến thể), đã ký cùng một cert |
| Release notes | `release/android/RELEASE_NOTES_1.4.0.md` |
| Đích trên node-2 | `app-modern-release.apk` → `/root/flowvpn-apk/VPNFlow-latest.apk`; `app-legacy-release.apk` → `/root/flowvpn-apk/VPNFlow-android7.apk` |
| Mốc phiên bản | `PATCH /v1/admin/android-version {"latest_version":"1.4.0"}` — **không** đặt `minimum_version` |

Nội dung bản này (ưu tiên tốc độ): sửa lỗi khai sai băng thông cho Brutal CC trên Wi-Fi **unmetered**
(trước đây khai mức mobile 8/12 Mbps ⇒ trần bị kéo xuống ~12 Mbps; nay khai đúng theo loại mạng 30/100 Mbps).
Đo trước khi sửa, cùng Wi-Fi cùng URL: RAW ~49,8 Mbps vs VPN ~13,4 Mbps (trung vị 10,1). Chủ dự án đã test
và xác nhận **cải thiện rất tốt**; số đo định lượng sau khi sửa đang chờ bổ sung.

## Việc chưa xong (đừng ghi vào release notes là đã có)

- **Bypass WeChat**: bản Windows đã có rule `domain_suffix` cho WeChat/Tencent + `.cn` đi thẳng, nhưng
  **cần test lại trên máy thật** trước khi coi là xong; Android/iOS/Mac chưa có split-tunnel (đang điều tra).
- **Apple hysteria2**: macOS extension đã hysteria-only nhưng TCP còn blackhole (cần rebuild framework với
  stack gVisor); iOS chưa chuyển. Bản iOS 1.4.0 ở trên **không** dùng hysteria2.
