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
5. **Build/Archive**: lỗi Swift → build local cùng scheme để tái hiện:
   ```bash
   ./ci_scripts/ci_post_clone.sh
   xcodebuild -project PrivateVPN.xcodeproj -scheme PrivateVPN \
     -destination 'generic/platform=iOS' -configuration Release build
   ```

## Phương án thay thế (nếu không muốn CI tự sinh project)

Bỏ `*.xcodeproj/` khỏi `.gitignore` và **commit** `PrivateVPN.xcodeproj` (kèm `xcshareddata/xcschemes`).
Khi đó CI không cần xcodegen, nhưng **dễ lệch** với `project.yml`; nếu chọn hướng này phải kỷ luật:
mỗi lần đổi project đều chạy `xcodegen generate` rồi commit cả hai.
