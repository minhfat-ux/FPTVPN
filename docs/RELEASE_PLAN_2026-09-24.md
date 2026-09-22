# KẾ HOẠCH PHÁT HÀNH — 24/09/2026 (trọng tâm: **Android**)

> Ghi ngày 21/09/2026 theo yêu cầu chủ dự án: *"làm bản vá cho iOS và macOS trước, bản Android em
> note vào plan release trong 3 ngày nữa"*. Mốc: **24/09/2026**. Phạm vi dưới đây là ĐỀ XUẤT, chờ
> chủ dự án chốt.

## 1. Vì sao Android chưa làm cùng iOS/macOS (bối cảnh, không phải phỏng đoán)
Ngày 21/09 đã vá 2 nhóm việc:
- **iOS + macOS**: `ControlAPIClient.fetchAppVersion()` nay gửi `?platform=ios|macos` (trước đây
  không gửi nên app macOS nhận payload iOS — xem `control-plane/src/app-version.js`), và thêm
  **nhắc mềm "có bản mới"** (trước đây chỉ có cổng chặn cứng `isForcedUpdate`, nên khách ở build cũ
  **không bao giờ** được thông báo dù server đã tăng `ios_ipa_build`/`latest_mac_version`).
- **Windows 1.4.1** (đã phát hành): watchdog đường relay + tự dựng lại (3 lần) + bỏ trần khai báo
  băng thông; kèm 2 vá sau đó (lệnh dọn adapter dùng cmdlet không tồn tại, `CloseApplications=force`).

Android **đã có sẵn** hai thứ tương ứng nên KHÔNG cần làm gấp:
- **Băng thông động**: `android/.../BandwidthMemory.kt` + `BandwidthPolicy` (đo → nhớ theo loại mạng
  → ramp) — commit `e6b36e0` (19/09).
- **Tự dựng lại khi ĐỔI MẠNG**: `HysteriaVpnService` nhận callback từ `diag/NetworkMonitor.kt`
  (`rebuildRequested`, `REBUILD_SETTLE_MS`).

## 2. Việc ĐỀ XUẤT cho bản Android 24/09

### 2.1 Watchdog "tunnel đứng" (parity với iOS/macOS/Windows)
Hiện Android chỉ rebuild khi **đổi mạng**; chưa có cơ chế phát hiện *tunnel còn sống nhưng không
chở gói* (khách báo "connected mà không có mạng"). **SỬA LẠI 21/09/2026 — iOS/macOS cũng CHƯA CÓ:**
`probeTraffic` / `rebuildFromLiveness` / `maxLivenessRebuilds` nằm ở
`iOS/PrivateVPNPacketTunnel/PacketTunnelProvider.swift` nhưng file đó **không thuộc target nào**
(`project.yml:124-137` liệt kê tường minh source của extension và không có nó; comment `:121-123` ghi
rõ), extension thật là `HysteriaPacketTunnelProvider` và chỉ có supervisor **15 giây đầu phiên** rồi
**tự gỡ** tunnel chứ không dựng lại. Windows 1.4.1 mới thực sự có. Phân tích đầy đủ + việc cần làm:
[`MAC_IOS_PARITY_1.4.1.md`](MAC_IOS_PARITY_1.4.1.md).
- Dấu hiệu đã có sẵn để dùng: `diag/DiagnosticsLog.kt` → `relayLastRxAt` (mốc nhận gói cuối).
- Thiết kế đề xuất (theo đúng bài học Windows: **tránh báo oan**): chỉ kết luận khi **đồng thời**
  (a) không có byte/gói mới trong ≥ 60 s, **VÀ** (b) phép thử chủ động qua chính tunnel thất bại
  ≥ 3 lần liên tiếp; có trần số lần rebuild mỗi phiên và mã chẩn đoán khi bỏ cuộc.

### 2.2 Split-tunnel cho WeChat/Tencent (mục còn treo từ 19/09)
`docs/RELEASE_ARTIFACTS_2026-09-19.md` §4 ghi rõ: *"Android/iOS/Mac chưa có split-tunnel (đang điều
tra)"*. Android có `VpnService.Builder` nên làm được bằng `addDisallowedApplication` cho danh sách
app TQ (`https://meetflowai.site/dl/routes/cn-apps.txt`, 67 app) — **không cần** hạ tầng mới.
Lưu ý bắt buộc: chạy nền, không chặn đường connect (bài học Windows 1.0.4 "connecting mãi").

### 2.3 Đồng bộ số hiệu & kênh phát hành
- `android/app/build.gradle.kts` hiện `versionCode = 20`, `versionName = "1.4.0"` ⇒ dự kiến **21 / 1.4.1**
  (chốt lại theo đợt: nếu gộp cùng đợt iOS/macOS thì giữ 1.4.1).
- APK trên shop hiện là 1.4.0: `/root/flowvpn-apk/VPNFlow-latest.apk` (modern) +
  `VPNFlow-android7.apk` (legacy) — **phải cập nhật cả hai**, kèm backup trước khi ghi đè.

## 3. Điều kiện tiên quyết
- Máy có Android SDK để build (hiện là máy Mac — Android build từ trước tới nay do Mac làm).
- Máy test thật (Samsung SM-F9460 đã dùng cho 1.4.0) + APK cài giữ dữ liệu.
- Không đổi `minimum_version` của Android (đang 1.2.6) trừ khi chủ dự án yêu cầu ép cập nhật.

## 4. Bằng chứng phải có khi phát hành (runbook §7)
1. `sha256` của **cả 2 APK** (modern + legacy) + size khớp nguồn.
2. `GET /v1/app-version?platform=android` trả `latest_version` mới; `android_latest_version` trong
   app_config đã PATCH; `versionCode` mới (nếu có API/khoá tương ứng).
3. Tải thử qua `https://meetflowai.site/v1/downloads/android` và `…/android-legacy` → 200 + size khớp.
4. Test trên máy thật: bật VPN → **WeChat còn kết nối** (mục split-tunnel), tốc độ RAW vs VPN (≥2 lần
   mỗi bên), và ngắt VPN → máy không mất mạng.
5. Email thông báo cho user (script `scripts/send-update-announcement-*.sh`, gửi formal vi/en/zh).

## 5. Việc Windows có thể hỗ trợ sẵn
- `RelayHealthWatchdog` (C#) đã có sẵn logic 2 tín hiệu — có thể chuyển thẳng sang Kotlin.
- Danh sách app TQ `cn-apps.txt` đã host sẵn trên CDN (không cần sinh lại).
