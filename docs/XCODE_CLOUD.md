# Xcode Cloud — cấu hình & xử lý "Build failed" (iOS/macOS VPNFlow)

## Bối cảnh (vì sao trước đây Xcode Cloud fail liên tục)

1. **Repo KHÔNG commit project Xcode.** `.gitignore` dòng 2 có `*.xcodeproj/` — nguồn sự thật là
   **`project.yml`** (xcodegen). Máy CI sạch clone về **không có** `PrivateVPN.xcodeproj` và **không có scheme**
   ⇒ Xcode Cloud báo *Build failed* ngay ở bước đầu (không có gì để build).
2. **Thiếu `ci_scripts/ci_post_clone.sh`** — hook chính thức của Xcode Cloud để chuẩn bị môi trường sau khi clone.
3. **Máy Xcode Cloud không có Go**, nhưng target `PrivateVPN` có preBuild phase **"Build wireguard-go"**
   chạy `make` và cần `go env GOROOT` (`Vendor/WireGuardKit/Sources/WireGuardKitGo/Makefile`).

## Đã sửa

`ci_scripts/ci_post_clone.sh` (chạy tự động sau khi clone) làm 4 việc:
1. Cài **Go** nếu thiếu (`brew install go`) — bắt buộc cho wireguard-go.
2. Kiểm tra `patch`, `rsync`, `make`, `clang` (Makefile của wireguard-go cần để vá `goruntime-*.diff`).
3. Cài **xcodegen** nếu thiếu và **sinh lại `PrivateVPN.xcodeproj`** từ `project.yml`.
4. **Kiểm tra scheme ở dạng shared** (`xcshareddata/xcschemes/*.xcscheme`) — Xcode Cloud chỉ build scheme shared.

Script in ra `xcodebuild -version`, `go version`, `xcodegen --version` để log CI có breadcrumb khi lỗi.
Nếu thiếu Go hoặc xcodegen hoặc không có shared scheme → script **exit 1 với thông báo rõ** (thay vì fail mơ hồ).

Đã kiểm chứng tại máy dev:
- `./ci_scripts/ci_post_clone.sh` → sinh project + 2 shared scheme (`PrivateVPN`, `PrivateVPNMac`).
- `make -C Vendor/WireGuardKit/Sources/WireGuardKitGo PLATFORM_NAME=iphoneos ARCHS=arm64 …` → **PASS**, tạo `libwg-go.a`
  (Go 1.26.6; `goruntime-*.diff` áp dụng sạch).
- Build + test local đều xanh (chi tiết ở §"Kiểm chứng local" bên dưới).
- **Mô phỏng đúng luồng CI** (2026-09-13): `git clone` repo sang `/tmp` (chỉ lấy file đã commit) →
  `./ci_scripts/ci_post_clone.sh` → build Release `generic/platform=iOS` (**BUILD SUCCEEDED**) →
  `test` trên simulator (**40 test, 0 failure**) ⇒ project sinh đủ từ `project.yml` + `Vendor/**` đã commit,
  không phụ thuộc file nào chỉ có ở máy dev.

## Lỗi biên dịch đã sửa (2026-09-13)

Ngoài 3 nguyên nhân hạ tầng ở trên, khi build lại local còn 2 lỗi **trong code** làm CI fail ở bước compile:

1. `iOS/PrivateVPN/VPNManager.swift` — `logOutDeviceAndRetry` gọi `ControlAPIClient()` thiếu tham số
   `baseURL`/`joinToken` (lỗi có từ commit `47c5fac`). Sửa thành
   `ControlAPIClient(baseURL: store.controlPlaneBaseURL, joinToken: "")` — đồng thời `guard` luôn cả `baseURL`
   để không gọi API khi chưa cấu hình control plane.
2. `iOS/PrivateVPN/Services/ControlAPIClient.swift` — biến `data` không dùng trong `deleteAccount` (warning).

Và 2 lỗi của **test target** (scheme `PrivateVPN` chạy cả action Test nên CI cũng sẽ fail):

3. `project.yml` — app target có `PRODUCT_NAME: FlowVPN` nên **module name mặc định là `FlowVPN`**, trong khi
   6 file test đều `@testable import PrivateVPN` ⇒ *unable to resolve module dependency*. Thêm
   `PRODUCT_MODULE_NAME: PrivateVPN` (module = tên target, `PRODUCT_NAME` vẫn là tên hiển thị `FlowVPN`).
4. `iOS/PrivateVPNTests/TestHelpers.swift` — `InMemoryKeychainBackend` chưa implement `delete(for:)` của protocol
   `KeychainBackend` (protocol được mở rộng khi thêm `KeychainStore.rotatePrivateKey`).

## Kiểm chứng local (chạy trước khi đẩy cho CI)

```bash
./ci_scripts/ci_post_clone.sh                      # sinh project + scheme

# 1) App Release cho thiết bị thật (giống bước Archive của CI)
xcodebuild -project PrivateVPN.xcodeproj -scheme PrivateVPN -configuration Release \
  -destination 'generic/platform=iOS' -derivedDataPath /tmp/dd-ios \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY="" build
# → ** BUILD SUCCEEDED **

# 2) Unit test trên simulator (trước đó phải tạo máy ảo nếu chưa có)
xcrun simctl create "CI-iPhone17-iOS26.5" com.apple.CoreSimulator.SimDeviceType.iPhone-17 \
  com.apple.CoreSimulator.SimRuntime.iOS-26-5
xcodebuild -project PrivateVPN.xcodeproj -scheme PrivateVPN -configuration Debug \
  -destination 'platform=iOS Simulator,name=CI-iPhone17-iOS26.5' \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY="" test
# → Executed 40 tests, with 0 failures — ** TEST SUCCEEDED **

# 3) macOS (dùng chung ControlAPIClient/WireGuardConfig)
xcodebuild -project PrivateVPN.xcodeproj -scheme PrivateVPNMac -configuration Debug \
  -destination 'generic/platform=macOS' CODE_SIGNING_ALLOWED=NO build
# → ** BUILD SUCCEEDED **
```

## Cấu hình cần có trên Xcode Cloud

- **Workflow scheme:** `PrivateVPN` (sau khi post-clone sinh project, Xcode Cloud sẽ thấy scheme này).
- **Signing:** `project.yml` đặt `CODE_SIGN_STYLE: Automatic`, `DEVELOPMENT_TEAM: G6XW3RN6LJ`
  ⇒ Xcode Cloud tự quản lý certificate/profile. Yêu cầu: App ID + bundle id đã tồn tại trong App Store Connect
  (`com.privatevpn.app`, extension `...PacketTunnel`).
- **Environment:** không cần secret nào trong CI (không có file `.env`/config bí mật cho target iOS).
- **Start condition:** branch `main` (hoặc branch anh chọn) — lưu ý `PrivateVPN.xcodeproj` không nằm trong git nên
  **mọi thay đổi project phải sửa `project.yml`**, sửa trực tiếp trong Xcode sẽ mất khi CI regenerate.

## Khi vẫn fail — đọc log theo thứ tự

1. **Bước `ci_post_clone`**: có dòng `[ci_post_clone] go: …`, `xcodegen: …`, và danh sách shared schemes không?
   Nếu exit 1 → thiếu tool (đọc thông báo FATAL).
2. **Resolve packages**: `WireGuardKit` là package local (`Vendor/WireGuardKit`) — không cần network.
3. **PreBuild "Build wireguard-go"**: nếu lỗi ở đây → kiểm tra `go version` trong log và output của `patch`/`rsync`.
4. **Signing**: lỗi provisioning → kiểm tra App ID/entitlement (VPN entitlement: `Network Extensions`,
   `com.apple.developer.networking.networkextension`) đã bật cho cả app và PacketTunnel.
5. **Build/Archive**: lỗi Swift → build local cùng scheme để tái hiện (`Build` cho app, `test` cho test target —
   cả hai dùng đúng lệnh ở §"Kiểm chứng local"). Lưu ý action **Test** của workflow cũng biên dịch
   `iOS/PrivateVPNTests`, nên lỗi ở test target cũng làm CI đỏ dù app build được.

## Cấu hình workflow trên Xcode Cloud

- **Scheme:** `PrivateVPN` (iOS). Nếu muốn build luôn macOS thì thêm scheme `PrivateVPNMac` trong workflow khác.
- **Actions:** bật **Build** + **Test** (máy ảo iPhone mới nhất có sẵn trên image) + **Archive** cho release.
  Test xanh local = 40 test, 0 failure.
- **Start condition:** branch `main`.
- Nếu Archive báo lỗi signing: kiểm tra App ID `com.privatevpn.app` + `com.privatevpn.app.packet-tunnel` đã có
  trong App Store Connect, và **xoá** dòng `CODE_SIGN_IDENTITY: "iPhone Developer"` trong `project.yml`
  (identity cũ) rồi để Xcode Cloud tự quản lý signing.

## Phương án thay thế (nếu không muốn CI tự sinh project)

Bỏ `*.xcodeproj/` khỏi `.gitignore` và **commit** `PrivateVPN.xcodeproj` (kèm `xcshareddata/xcschemes`).
Khi đó CI không cần xcodegen, nhưng **dễ lệch** với `project.yml`; nếu chọn hướng này phải kỷ luật:
mỗi lần đổi project đều chạy `xcodegen generate` rồi commit cả hai.
