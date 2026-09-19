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

## 🔒 ĐÓNG BĂNG iOS (19/09/2026, theo yêu cầu chủ dự án)

Chủ dự án xác nhận bản iOS **1.4.0 (build 15)** đang chạy **tốt và ổn định** và yêu cầu **khoá lại, không sửa gì thêm**.

- **Không sửa** `iOS/**` (đặc biệt `iOS/PrivateVPNPacketTunnel/PacketTunnelProvider.swift`, `WSRelayClient.swift`, `RelayUDPListener.swift`), **không** đổi version iOS, **không** build lại IPA trừ khi chủ dự án yêu cầu.
- Bản đóng băng tương ứng: IPA ở `build/ios-1.3.3...` không dùng; bản đang dùng là **`build/ios-adhoc-export/ipa/FlowVPN.ipa`** (1.4.0/15, sha256 `b6bf9a04bf3331655dcefd062c957d22ee81d177d8880636ec4ba492d4150677` — xem bảng phía trên) tại commit `b08649d`.
- Việc **hysteria2 cho iOS** (chuyển NE sang hysteria-only) **tạm dừng** cho tới khi chủ dự án mở khoá. Công việc Apple hiện chỉ làm trên **macOS**.
- Lưu ý kỹ thuật: thư mục `iOS/PrivateVPNPacketTunnel/` được **dùng chung** với target extension macOS, nên sửa file trong đó có thể đổi binary iOS nếu build lại app iOS — vì vậy tuyệt đối không build lại iOS trong lúc khoá.

## 🔒 ĐÓNG BĂNG Android (19/09/2026, theo yêu cầu chủ dự án)

Chủ dự án xác nhận bản Android **1.4.0 (versionCode 20)** đã **sửa xong tốc độ, kết nối tốt** và yêu cầu **khoá lại, không sửa gì thêm**.

- **Không sửa** `android/**` (đặc biệt `HysteriaVpnService.kt`, `Config.kt`), **không** đổi version, **không** build lại APK trừ khi chủ dự án yêu cầu.
- Bản đóng băng = 2 APK ở bảng phía trên (modern `a780a773…56e8`, legacy `e36b4fcb…bc46`), release notes `release/android/RELEASE_NOTES_1.4.0.md`, commit `b08649d`.
- Việc còn treo (không nằm trong bản đóng băng): **bypass WeChat cần test lại**; split-tunnel theo CN cho Android chưa làm.

## 🔒 ĐÓNG BĂNG macOS (19/09/2026, theo yêu cầu chủ dự án)

Chủ dự án xác nhận bản macOS (hysteria2/gVisor) **chạy ổn** và yêu cầu **khoá lại sau khi đóng gói release**.

- Bản đóng băng = build **1.4.0 / build 14** (đang được đóng gói khi ghi dòng này; artifact + sha256 sẽ bổ sung vào mục macOS ở phía trên).
- **Không sửa** `mac/**`, `iOS/PrivateVPNPacketTunnel/HysteriaPacketTunnelProvider.swift`, `HysteriaTransport.swift`, `tools/hysteria-apple/**` (trừ khi chủ dự án yêu cầu). Không build lại bản macOS trừ khi có yêu cầu.
- Việc treo (KHÔNG nằm trong bản khoá, làm sau khi có yêu cầu): bỏ hiện tượng "lượt tải đầu sau Connect chậm rồi mới tăng"; tăng tốc hơn nữa; WeChat split-tunnel; iOS hysteria2 (bản test riêng).

## macOS 1.4.0 (build 14) — ZIP (đóng gói 19/09, chưa upload)

| | |
|---|---|
| File | `/tmp/VPNFlow-mac-1.4.0.zip` (bản bền: `~/.vpnflow-build/mac/VPNFlow-mac-1.4.0.zip`) |
| Kích thước | 21.396.621 bytes (20,40 MiB) |
| sha256 | `262634c62b4d775671771d8264efdca3a1ac135c23cdd0c3037d576f1450ed7b` |
| Version | app `com.privatevpn.mac` **1.4.0/14**, extension `com.privatevpn.mac.packet-tunnel` **1.4.0/14** (universal x86_64 + arm64, yêu cầu macOS 14+) |
| Ký | `Apple Development: minhnb2@me.com` (Team G6XW3RN6LJ); **CHƯA notarize** ⇒ máy khác lần đầu: chuột phải → Open |
| Release notes | `release/mac/RELEASE_NOTES_1.4.0.md` |
| Đích trên node-2 | `/root/flowvpn-mac/VPNFlow-mac.zip` (route `GET /v1/downloads/mac` đọc file này; env override `MAC_APP_ZIP_PATH`) |
| Mốc hiển thị | `latest_mac_version = 1.4.0` — **không có API admin** cho khoá này: set trực tiếp SQLite `app_config` (DB `control-plane/data/app-config.db`) HOẶC env `MAC_APP_VERSION` rồi restart CP |

Nội dung bản này: chuyển transport macOS sang **hysteria2 qua relay Cloudflare (stack gVisor)** thay cho WireGuard-chồng-relay; sửa lỗi "bật VPN mất toàn mạng" (TCP blackhole); **tự gỡ tunnel** khi blackhole 10s hoặc 0 gói 15s (kiểm mỗi 5s). Số đo: VPN 24–52 Mbps (median 27), RAW 66–105 Mbps cùng mạng.

## 🔒 ĐÓNG BĂNG Android + iPad (19/09/2026 tối, "để test vài ngày")

Chủ dự án yêu cầu **khoá 2 bản này để test vài ngày**. Các bản đang cài trên máy = bản đóng băng:

| Nền tảng | Bản đóng băng | Bằng chứng |
|---|---|---|
| **Android** | 1.4.0 / versionCode **20** (APK modern sha256 `dee9f82370c415…589e4ff3`) | `adb shell dumpsys package com.privatevpn.app` → versionName 1.4.0; log `bw: ramp …` chạy thật |
| **iPad/iOS** | 1.4.0 / build **16** (IPA sha256 `20050977c7cbf9…81ac7a74`) | `xcrun devicectl device info apps` → 1.4.0 (16); log `bridge: packetFlow→Go … SYN/SYN-ACK khớp` |

**Quy tắc khi đang khoá:** không sửa `android/**` và `iOS/**` cho 2 nền tảng này, **không build lại APK/IPA**, **không cài đè** lên máy đang test — trừ khi chủ dự án yêu cầu. Các worker đang làm dở đã được **dừng** (Android: bỏ việc kéo số khai lên nấc tĩnh; iOS: sửa bộ nhớ bị nhiễm số tĩnh) — code dở được commit riêng, **chưa phát hành**.

**macOS không nằm trong lệnh khoá này** (đang build lại với khai báo động + các fix trên).

Việc treo khi khoá: 3 fix nhỏ (Android clamp, iOS memory, macOS khai động), multipath, telemetry client (`bw_policy`), node HK.
