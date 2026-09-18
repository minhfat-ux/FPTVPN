# Kế hoạch test bản Windows trên máy harness (DESKTOP-852P1LT)

Mục tiêu: xác nhận bản Windows mới **chạy đúng kiến trúc** (transport hysteria2 qua
relay WebSocket của Cloudflare + sing-box lo TUN/định tuyến) và **đo được tốc độ
thật**, không chỉ "Connected".

## 0. Chuẩn bị (một lần)

1. Kéo code mới nhất trong repo (máy harness đã có SSH/key tới node-1/node-2).
2. Trong `windows/assets/` phải có đủ 4 file nhị phân:
   `wintun.dll`, `wireguard-go.exe`, `flowvpnrelay.exe`, `sing-box.exe`.
   Nếu thiếu 2 file sau: chạy `bash windows/assets/fetch-assets.sh` (cần Go + mạng).
3. Kiểm tra dung lượng/kiểu file:
   `powershell -c "Get-Item windows\assets\*.exe | Select Name,Length"`
   (`sing-box.exe` ≈ 82 MB, `flowvpnrelay.exe` ≈ 10 MB).

## 1. Kiểm tra CÔ LẬP trước khi mở app

Chạy `windows/installer/verify-relay.ps1` (script này tự dựng 2 cấu hình, chạy
`flowvpnrelay.exe` + `sing-box.exe`, chờ dòng `READY`, đo băng thông qua SOCKS5 rồi
dọn sạch tiến trình). Kỳ vọng:

- `READY transport=wsrelay …` xuất hiện trong ≤ 15 giây.
- Tốc độ đo được ≥ 2 MB/s (≥ 16 Mbps) khi đường mạng tốt (Mac đo cùng đường:
  2,6–3,7 MB/s).

Nếu `READY` không xuất hiện: xem log tạm mà script in ra; kiểm tra Windows Firewall
có chặn `flowvpnrelay.exe` không, và `curl.exe --socks5-hostname 127.0.0.1:<cổng>
https://api.meetflowai.site/v1/health` có trả 200 không.

## 2. Đo A/B bằng app (nghiệm thu)

Trước khi đo, xác nhận **mạng thật** (đừng để VPN/Tailscale exit node đang bật —
bài học 19/09: số "raw" đo nhầm qua node):

```powershell
curl.exe -s https://api.ipify.org      # phải ra IP nhà, KHÔNG phải 103.173.155.50
```

1. RAW: `curl.exe -o NUL -w "%{speed_download} %{http_code}\n" "https://speed.cloudflare.com/__down?bytes=50000000"` (lặp 3 lần).
2. Bật VPN trong app (chọn transport mới; app phải log rõ đang chạy đường nào).
3. Xác nhận có traffic thật: `curl.exe -s https://api.ipify.org` → phải ra IP node
   (165.101.114.162 hoặc 103.173.155.50).
4. VPN: chạy lại đúng lệnh ở (1), 3 lần, cùng URL.
5. Ghi lại: `%{speed_download}` từng lần, `%{http_code}`, thời điểm, và log của app
   (đường transport nào đang chạy, có tự rơi về WireGuard không).

**Tiêu chí đạt**: VPN ≥ 20 Mbps (≥ 2,5 MB/s) trên đường ≥ 100 Mbps; và không có lần
nào tunnel "Connected" mà `api.ipify.org` không trả về IP node (dấu hiệu blackhole).

## 2b. Kiểm phần "vượt qua cho WeChat" (đã có trong cấu hình sinh ra)

Cấu hình sing-box mà app sinh ra nay có rule: **WeChat/Tencent + mọi tên miền `.cn` đi
THẲNG** (không qua VPN) — vì đó là nguyên nhân WeChat lỗi/cực chậm khi bật VPN (traffic
bị vòng qua node ở Việt Nam). Kiểm nhanh sau khi bật VPN:

```powershell
curl.exe -s -o NUL -w "wechat: %{http_code} %{time_total}s\n" https://weixin.qq.com
curl.exe -s -o NUL -w "google: %{http_code} %{time_total}s\n" https://www.google.com
curl.exe -s https://api.ipify.org      # phải là IP node (traffic còn lại đi qua VPN)
```

Kỳ vọng: `weixin.qq.com` vẫn vào được và **nhanh như khi không bật VPN**; traffic không
thuộc danh sách đi thẳng vẫn ra IP node.

Phần còn lại (chưa làm): split-tunnel đầy đủ theo `geoip:cn`/`geosite:cn` bằng
**rule-set** của sing-box (danh sách tên miền hiện tại mới là điểm khởi đầu cho WeChat).

## 3. Bằng chứng cần gửi lại

- Output `verify-relay.ps1` (nguyên văn).
- Bảng RAW vs VPN (MB/s + Mbps, 3 lần mỗi bên).
- Ảnh/log trạng thái app khi đang chạy transport mới.
- Nếu thất bại: log của `flowvpnrelay.exe` (stderr) và `sing-box.exe` (file log mà
  app cấu hình) — chúng nằm trong thư mục dữ liệu của app (`%LOCALAPPDATA%\VPNFlow`).

## 4. Lưu ý an toàn

- Nếu sau khi ngắt VPN mà máy không vào được mạng: `Get-NetAdapter` xem còn interface
  `VPNFlow*`/`wintun` nào không; xoá route mặc định trỏ vào nó (`route print 0.0.0.0`),
  và tắt tiến trình `sing-box.exe` còn sót (`Stop-Process -Name sing-box`).
- Đừng để lại `sing-box.exe`/`flowvpnrelay.exe` chạy nền sau khi test xong.
