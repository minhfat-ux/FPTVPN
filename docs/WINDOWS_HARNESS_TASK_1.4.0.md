# TASK cho Windows harness — deploy + test bản Windows 1.4.0 (19/09)

## Bối cảnh
Bản Windows đã sẵn sàng (HEAD repo = 95b851f). Nhiệm vụ: deploy lên máy Windows và test.

## Làm gì (trên DESKTOP-852P1LT, PowerShell Admin)
1. `cd <repo>\windows && git pull`  (4 binary đã commit trong windows\assets)
2. `cd installer && powershell -ExecutionPolicy Bypass -File verify-relay.ps1 -Password <HY_PASSWORD> -Obfs <HY_OBFS>`
   - HY_PASSWORD/HY_OBFS: trong `android\app\src\main\java\com\privatevpn\app\Config.kt` (2 dòng HY_PASSWORD, HY_OBFS).
   - Kỳ vọng: `READY transport=wsrelay` ≤15s + tốc độ ≥2 MB/s.
3. Mở app (build sẵn ở `windows\dist\` hoặc `dotnet publish -r win-x64`), Settings → transport "Hysteria2 + sing-box (relay)" → Connect.
4. `curl.exe -s --max-time 15 https://api.ipify.org` → phải ra 165.101.114.162 hoặc 103.173.155.50 (IP node).
5. Đo RAW vs VPN (≥2 lần mỗi bên, `curl.exe -o NUL -w "%{speed_download}" https://speed.cloudflare.com/__down?bytes=50000000`).
6. Kiểm WeChat đi thẳng: `curl.exe -s -o NUL -w "%{http_code} %{time_total}" https://weixin.qq.com` phải nhanh.
7. Ngắt VPN → xác nhận `route print 0.0.0.0` + ipify về IP nhà (không mất mạng).

## Báo cáo lại
Gửi số: READY mất bao lâu, tốc độ RAW vs VPN (Mbps), IP thoát, WeChat, có mất mạng sau khi ngắt không. Chi tiết tham khảo `docs/WINDOWS_HARNESS_TEST_PLAN.md` và `docs/RELEASE_ARTIFACTS_2026-09-19.md`.

## Lưu ý
- Không cần DSH/SSH cho test này — chạy trực tiếp trên máy, chụp ảnh/báo số là đủ.
- Nếu `verify-relay.ps1` không in READY: kiểm `curl.exe https://api.meetflowai.site/v1/health` có 200 không (mạng ra Cloudflare), và Windows Defender có chặn 2 file .exe không.

## BỔ SUNG (theo yêu cầu chủ dự án): BUILD + PACKAGE trước, rồi mới test
0. Build + đóng gói bản cài trên chính máy Windows (Admin, PowerShell):
   - `cd <repo>\windows\installer`
   - `powershell -ExecutionPolicy Bypass -File build.ps1`  → `dotnet publish` self-contained win-x64 + đóng gói Inno Setup ra `windows\installer\out\VPNFlow-Setup-*.exe` (cần Inno Setup 6 đã cài).
   - Kiểm `out\` có `VPNFlow-Setup-*.exe` và publish có đủ `flowvpnrelay.exe`, `sing-box.exe`, `wintun.dll`, `wireguard-go.exe`.
   - Cài bản `out\VPNFlow-Setup-*.exe` (hoặc chạy thẳng `windows\dist\PrivateVPNWindows.App.exe`) rồi test theo các bước 1–7 ở trên.
   - Báo kết quả BUILD + đường dẫn installer + sha256 của file cài.
