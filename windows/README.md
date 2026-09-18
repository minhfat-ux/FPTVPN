# VPNFlow cho Windows (C# .NET 8 + Avalonia)

Client VPN Windows, port từ bản macOS (`mac/PrivateVPNMac/`) và Android, dùng **chung control-plane** với iOS/Android/macOS (`https://api.meetflowai.site`).

> Trạng thái: **đang phát triển**. Tầng API/crypto/tunnel đã port + có test; UI mới ở mức khung; phần tunnel **chưa được kiểm chứng trên Windows thật** (xem §5).

## 1. Yêu cầu môi trường

| Thành phần | Ghi chú |
|---|---|
| Windows 10/11 x64 | |
| .NET SDK 8.0 | https://dotnet.microsoft.com/download/dotnet/8.0 (chỉ cần khi build hoặc khi publish `--self-contained false`) |
| WireGuard for Windows | **KHÔNG còn bắt buộc** — app tự lo tunnel bằng `wintun.dll` + `wireguard-go.exe` nhúng sẵn (xem §1b). Chỉ cần khi asset bị thiếu và app lùi về chế độ dự phòng. |
| Quyền Administrator | app khai báo `requireAdministrator` trong `app.manifest` — **bắt buộc** để tạo adapter Wintun, đổi route và DNS |

## 1b. Hai chế độ tunnel (tự chọn khi chạy)

App chọn driver theo quy tắc trong `WireGuardDriverSelector` (`PrivateVPNWindows.Core/Tunnel/`):

| Điều kiện | Driver | Người dùng phải cài gì |
|---|---|---|
| Cạnh `PrivateVPNWindows.App.exe` có **đủ** `wintun.dll` + `wireguard-go.exe` | `WintunWireGuardDriver` (userspace) | **Không cần cài gì** |
| Thiếu một trong hai asset | `WireGuardWindowsDriver` (dự phòng) | WireGuard for Windows (`wireguard.exe`) |

Hai binary nhúng nằm ở `windows/assets/` (đóng gói kèm khi publish), nguồn + hash + giấy
phép ở `windows/assets/THIRD_PARTY.md`; tải/dựng lại bằng `windows/assets/fetch-assets.sh`.

`WintunWireGuardDriver` chạy `wireguard-go.exe <tên-adapter>`, nạp cấu hình qua UAPI
named pipe `\\.\pipe\ProtectedPrefix\Administrators\WireGuard\<tên-adapter>`, rồi tự
gán IP/MTU/route (chia `0.0.0.0/0` thành `0.0.0.0/1` + `128.0.0.0/1`) và DNS bằng
netsh/powershell. Khi ngắt: kill tiến trình, xoá route, gỡ adapter.


## 2. Build & chạy

```powershell
git clone <repo-url> privatevpn
cd privatevpn
dotnet build windows\VPNFlow.Windows.sln -c Release
dotnet run --project windows\PrivateVPNWindows.App\PrivateVPNWindows.App.csproj -c Release
```

## 3. Đóng gói

### 3a. Bộ cài 1-click (Inno Setup) — cách phát cho khách

Trên máy Windows có **.NET 8 SDK** + **Inno Setup 6** (`winget install --id JRSoftware.InnoSetup -e`):

```powershell
powershell -ExecutionPolicy Bypass -File windows\installer\build.ps1
# → windows\installer\out\VPNFlow-Setup-<version>.exe   (gửi đúng 1 file này cho khách)
```

Script tự làm: kiểm tra `windows\assets\wintun.dll` + `wireguard-go.exe` → `dotnet publish`
self-contained win-x64 (khách **không cần cài .NET**, **không cần cài WireGuard**) → gọi
`ISCC.exe` đóng gói. Tuỳ chọn: `-Version 1.2.0`, `-FrameworkDependent` (nhẹ hơn, máy khách phải có
.NET 8 Desktop Runtime), `-SkipPublish` (chỉ build lại installer).

Bộ cài: cài vào `%ProgramFiles%\VPNFlow`, tạo shortcut Start Menu (+ desktop tuỳ chọn), chặn cài nếu
thiếu binary tunnel, hỏi có xoá phiên đăng nhập khi gỡ, và tự đóng app đang chạy khi nâng cấp.
App cần quyền admin để dựng tunnel (`app.manifest: requireAdministrator`) nên khi mở app Windows sẽ hỏi UAC — đây là điều bắt buộc với userspace WireGuard/wintun.

### 3b. Chạy trực tiếp bằng publish (khi phát triển)

```powershell
# cần .NET 8 trên máy đích
dotnet publish windows\PrivateVPNWindows.App\PrivateVPNWindows.App.csproj -c Release -r win-x64 --self-contained false -o dist

# không cần .NET trên máy đích
dotnet publish windows\PrivateVPNWindows.App\PrivateVPNWindows.App.csproj -c Release -r win-x64 --self-contained true -o dist-standalone
```

File chạy: `dist\PrivateVPNWindows.App.exe`

`wintun.dll` và `wireguard-go.exe` được `PrivateVPNWindows.App.csproj` tự copy ra cạnh
file exe khi build/publish. Kiểm tra nhanh sau publish: `dir dist\wintun.dll dist\wireguard-go.exe`.

## 4. Test

```powershell
dotnet test windows\PrivateVPNWindows.Core.Tests\PrivateVPNWindows.Core.Tests.csproj -c Release
```

### Bản release Windows mới nhất

- Commit: `866ec9e` (`feat(windows): icon/logo dung thuong hieu + giao dien theo ban iOS`)
- Test Release: **53/53 pass**
- Installer self-contained x64: `windows/installer/out/VPNFlow-Setup-1.0.0.exe`
- SHA-256: `0f06c4b5729d153b7c240054d26d6bd8ec1a0a61ea1dd999735e8ee7842928b4`
- Nội dung gói: .NET runtime, `wintun.dll`, `wireguard-go.exe`, logo/icon FlowTech

Đây là bản build để test trên Windows thật. Tunnel Wintun/userspace, UAC, route,
DNS và adapter `vpnflow` vẫn cần được kiểm tra thực tế trên máy đích.

## 5. Những phần CHƯA kiểm chứng trên Windows

- **Chưa chạy thử tunnel trên Windows thật** — toàn bộ `Tunnel/*` mới build + review tĩnh trên macOS. Các điểm cần xác nhận trên máy Windows thật:
  - `wireguard-go.exe` (bản cross-compile) tạo được adapter Wintun và mở UAPI pipe đúng tên `\\.\pipe\ProtectedPrefix\Administrators\WireGuard\vpnflow`.
  - `netsh`/`powershell` chấp nhận đúng tham số trong `WireGuardWindowsCommands` (đặc biệt `netsh interface ipv4 add route ... nexthop=0.0.0.0`, `set dnsservers`, và `Remove-NetAdapter` để gỡ adapter Wintun).
  - Tên adapter Windows trùng đúng `vpnflow` (không bị thêm hậu tố " 2").
- **UI còn ở mức khung** — một số màn hình chưa nối hết vào ViewModel (bấm Connect chưa chạy đủ luồng).
- **Hysteria** — cần `hysteria.exe` (bản Windows) cạnh file exe hoặc trong `PATH`; chưa đóng gói kèm.
- **Kiểm toán endpoint chưa xong** — client còn gọi `/v1/account` (server trả 404), cần sửa trước khi đăng nhập/premium chạy đúng.

### Kiểm tra nhanh trên Windows (khi có máy)

```powershell
# 1) Chạy app bằng quyền Administrator (bắt buộc), bấm Connect.
# 2) Xác nhận tiến trình + adapter:
Get-Process wireguard-go
Get-NetAdapter -Name vpnflow
# 3) Xác nhận route chia đôi + DNS:
netsh interface ipv4 show route | Select-String "0.0.0.0/1|128.0.0.0/1"
netsh interface ipv4 show dnsservers name=vpnflow
# 4) Xác nhận pipe UAPI tồn tại:
[System.IO.Directory]::GetFiles("\\.\pipe\") | Select-String WireGuard
# 5) Ngắt kết nối: Get-Process wireguard-go phải rỗng, Get-NetAdapter -Name vpnflow phải lỗi (đã gỡ).
```

## 6. Kiến trúc

| Đường dẫn | Nội dung |
|---|---|
| `PrivateVPNWindows.Core/Api` | `ControlApiClient` + model (port từ `iOS/PrivateVPN/Services/ControlAPIClient.swift`) |
| `PrivateVPNWindows.Core/Auth` | phiên (`%APPDATA%\VPNFlow\session.json`) + định danh thiết bị |
| `PrivateVPNWindows.Core/Crypto` | sinh cặp khoá WireGuard (X25519, C# thuần) |
| `PrivateVPNWindows.Core/Tunnel` | dựng/parse `.conf`, chọn driver, driver Wintun userspace + driver `wireguard.exe` dự phòng, UAPI, lệnh netsh, WS relay, WG relay, Hysteria, chọn transport |
| `PrivateVPNWindows.App` | UI Avalonia + `ViewModels` |
| `windows/assets` | `wintun.dll` + `wireguard-go.exe` nhúng + `THIRD_PARTY.md` (hash/giấy phép) + `fetch-assets.sh` |

## 7. Ghi chú khi port

- Đăng ký thiết bị gửi `platform: "windows"`; giới hạn 3 thiết bị/người dùng.
- Gặp `403 device_limit_reached` ⇒ hiện danh sách thiết bị cũ rồi đăng ký lại kèm `replace_device_id`.
- Ngoài Windows, driver tunnel phải **fail mềm** ("cần chạy trên Windows") để còn smoke-test UI trên macOS.
