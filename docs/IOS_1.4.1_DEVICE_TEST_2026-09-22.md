# iOS 1.4.1 — bằng chứng build + test thiết bị (22/09/2026)

> Trạng thái: **CHƯA ĐỦ §2c ⇒ KHÔNG phát hành, KHÔNG gửi email iOS.**
> Mục 1, 2, 7 (một phần) đã có bằng chứng máy; mục 3–6 cần **người thật cầm iPhone**.
> Luật: `docs/PUBLISHER_PROCESS.md` §2c (bảng 7 mục) + §5 (ai gửi email).

## 1. Build (Mac harness, nhánh `mac/ios-1.4.1-device-test`)

| Hạng mục | Giá trị |
|---|---|
| Nhánh / commit code iOS | `mac/ios-1.4.1-device-test` @ `0ec9d89` (merge `mac/parity-1.4.1` watchdog + main About-version UI, rồi bump 1.4.1/17) |
| Framework | `iOS/Frameworks/Hysteria.xcframework` (85 MB, `gomobile bind -target=ios`, module `Hysteria`, có `MobileConnect/MobileServe/MobileStop`) |
| Version trong artifact | `CFBundleShortVersionString=1.4.1`, `CFBundleVersion=17` — **cả app + extension** (đọc từ trong bundle) |
| Ký | `Apple Distribution: Minh Nguyen (G6XW3RN6LJ)`; app CDHash `dd9cbf51…ad1695`; profile Ad Hoc `VPNFlow AdHoc App` + `VPNFlow AdHoc Tunnel` (chứa UDID máy test) |
| IPA | `/tmp/VPNFlow-1.4.1-17-test.ipa` · 8.749.644 B · sha256 `05804652434b5c968558ac9d6223b48938205e76e8f9233053b5358d13019429` |
| Cổng chặn version (pre) | `python3 scripts/check-publish-version.py --platform ios --file <ipa> --version 1.4.1 --build 17` → 4 mục artifact **ĐẠT** (version/build + extension cùng số); 2 mục mốc/route **KHÔNG KIỂM ĐƯỢC** do Python thiếu CA trên máy này (exit 2) |

Lệnh build (sandbox này chặn ghi `~/Library`; đã đi vòng bằng `CFFIXED_USER_HOME` + tắt
manifest sandbox của SwiftPM):

```bash
cd .worktrees/parity
xcodegen generate
eval "$(bash scripts/dev-hysteria-build-env.sh)"
export GOCACHE=/tmp/dsh-gocache GOTMPDIR=/tmp/dsh-gotmp
CFFIXED_USER_HOME=/tmp/fakehome HOME=/tmp/fakehome SWIFTPM_DISABLE_SANDBOX=1 \
  xcodebuild -project PrivateVPN.xcodeproj -scheme PrivateVPN -configuration Release \
  -destination 'generic/platform=iOS' -derivedDataPath /tmp/dd-ios \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY="" \
  OTHER_SWIFT_FLAGS="-disable-sandbox" \
  HYST_PASSWORD="$HYST_PASSWORD" HYST_OBFS="$HYST_OBFS" build
# -> ** BUILD SUCCEEDED **
```

## 2. Cài trên iPhone THẬT (bằng chứng máy)

| Hạng mục | Giá trị |
|---|---|
| Thiết bị | **iPhone 14 Pro Max** (`iPhone15,3`) — máy THẬT, không phải Simulator |
| iOS | **26.7** (build `23H24`), Developer Mode: enabled |
| UDID | `00008120-00010D102E40C01E` |
| Cài đặt | `xcrun devicectl device install app` → `App installed: com.privatevpn.app` |
| Version đã cài (đọc từ máy) | `VPNFlow · com.privatevpn.app · Version 1.4.1 · Bundle Version 17` |
| Chạy được | `xcrun devicectl device process launch com.privatevpn.app` → `Launched application` |

## 3. Bảng §2c — mục nào đã có, mục nào còn thiếu

| # | Mục §2c | Trạng thái | Bằng chứng / việc còn lại |
|---|---|---|---|
| 1 | Thiết bị thật + model/iOS version | ✅ | iPhone 14 Pro Max · iOS 26.7 (§2 trên) |
| 2 | Đúng sha256 định phát | ⚠️ một phần | Đã cài đúng bundle 1.4.1/17 với sha256 IPA trên; còn phải chốt đây là bản **định phát** (hiện chưa publish) |
| 3 | Luồng cơ bản ≥10 phút + IP thoát | ❌ | **Người thật**: đăng nhập → kết nối → kiểm IP thoát → duyệt web/app ≥10 phút; chụp ảnh + log |
| 4 | Đổi Wi-Fi ↔ 4G giữa phiên | ❌ | **Người thật**: ghi hành vi (tự phục hồi hay phải bấm Connect lại) |
| 5 | Ngắt VPN ⇒ máy không mất mạng | ❌ | **Người thật**: ngắt rồi `curl`/duyệt web, chụp ảnh |
| 6 | Watchdog 0 báo oan + tự dựng lại | ❌ | **Người thật**: chạy ≥10 phút, chủ động chặn/kill relay, ghi mốc thời gian tự dựng lại |
| 7 | UI Settings → About hiện version | ⚠️ một phần | Code About đã có trong build (SettingsView.swift, `AppVersionService`) + app chạy được; còn **ảnh chụp màn hình** About đối chiếu mốc server |

**Kết luận:** Điều kiện §2c **chưa đủ** ⇒ dừng: chưa publish iOS 1.4.1, chưa gửi email iOS.
Việc còn lại là của con người với điện thoại; IPA đã sẵn sàng để test ngay.

## 4. Phần (b) — email Windows 1.4.2 (publisher)

- Script mới: `scripts/send-update-announcement-1.4.2.sh` (dry / `--test` / `--send`), có cổng chặn §5:
  chỉ gửi khi mốc `latest_version` trên server đúng `1.4.2`.
- Đã xác minh bản phát: `VPNFlow-Setup-1.4.2.exe` 52.794.169 B · sha256 `60ea6f31…86c6` · `/buy` trỏ
  `?v=60ea6f31` · mốc `latest_version=1.4.2`.
- **Đã gửi THỬ tới `ALERT_EMAIL`**: OK (chưa gửi khách).
- Gửi thật (chờ chủ dự án xác nhận): `bash scripts/send-update-announcement-1.4.2.sh --send`
