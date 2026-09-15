# VPNFlow cho Windows (C# .NET 8 + Avalonia)

Client VPN Windows, port từ bản macOS (`mac/PrivateVPNMac/`) và Android, dùng **chung control-plane** với iOS/Android/macOS (`https://api.meetflowai.site`).

> Trạng thái: **đang phát triển**. Tầng API/crypto/tunnel đã port + có test; UI mới ở mức khung; phần tunnel **chưa được kiểm chứng trên Windows thật** (xem §5).

## 1. Yêu cầu môi trường

| Thành phần | Ghi chú |
|---|---|
| Windows 10/11 x64 | |
| .NET SDK 8.0 | https://dotnet.microsoft.com/download/dotnet/8.0 (chỉ cần khi build hoặc khi publish `--self-contained false`) |
| WireGuard for Windows | https://www.wireguard.com/install/ — **bắt buộc** để kết nối: app gọi `wireguard.exe` để cài tunnel service |
| Quyền Administrator | app khai báo `requireAdministrator` trong `app.manifest` |

## 2. Build & chạy

```powershell
git clone <repo-url> privatevpn
cd privatevpn
dotnet build windows\VPNFlow.Windows.sln -c Release
dotnet run --project windows\PrivateVPNWindows.App\PrivateVPNWindows.App.csproj -c Release
```

## 3. Đóng gói

```powershell
# cần .NET 8 trên máy đích
dotnet publish windows\PrivateVPNWindows.App\PrivateVPNWindows.App.csproj -c Release -r win-x64 --self-contained false -o dist

# không cần .NET trên máy đích
dotnet publish windows\PrivateVPNWindows.App\PrivateVPNWindows.App.csproj -c Release -r win-x64 --self-contained true -o dist-standalone
```

File chạy: `dist\PrivateVPNWindows.App.exe`

## 4. Test

```powershell
dotnet test windows\PrivateVPNWindows.Core.Tests\PrivateVPNWindows.Core.Tests.csproj -c Release
```

## 5. Những phần CHƯA kiểm chứng trên Windows

- **Chưa chạy thử tunnel trên Windows thật** — `Tunnel/*` mới build + review tĩnh trên macOS.
- **UI còn ở mức khung** — một số màn hình chưa nối hết vào ViewModel (bấm Connect chưa chạy đủ luồng).
- **Hysteria** — cần `hysteria.exe` (bản Windows) cạnh file exe hoặc trong `PATH`; chưa đóng gói kèm.
- **Kiểm toán endpoint chưa xong** — client còn gọi `/v1/account` (server trả 404), cần sửa trước khi đăng nhập/premium chạy đúng.

## 6. Kiến trúc

| Đường dẫn | Nội dung |
|---|---|
| `PrivateVPNWindows.Core/Api` | `ControlApiClient` + model (port từ `iOS/PrivateVPN/Services/ControlAPIClient.swift`) |
| `PrivateVPNWindows.Core/Auth` | phiên (`%APPDATA%\VPNFlow\session.json`) + định danh thiết bị |
| `PrivateVPNWindows.Core/Crypto` | sinh cặp khoá WireGuard (X25519, C# thuần) |
| `PrivateVPNWindows.Core/Tunnel` | dựng `.conf`, driver `wireguard.exe`, WS relay, WG relay, Hysteria, chọn transport |
| `PrivateVPNWindows.App` | UI Avalonia + `ViewModels` |

## 7. Ghi chú khi port

- Đăng ký thiết bị gửi `platform: "windows"`; giới hạn 3 thiết bị/người dùng.
- Gặp `403 device_limit_reached` ⇒ hiện danh sách thiết bị cũ rồi đăng ký lại kèm `replace_device_id`.
- Ngoài Windows, driver tunnel phải **fail mềm** ("cần chạy trên Windows") để còn smoke-test UI trên macOS.
