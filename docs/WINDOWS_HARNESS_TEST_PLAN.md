# Kế hoạch test bản Windows trên máy harness (DESKTOP-852P1LT)

Mục tiêu: xác nhận bản Windows mới **chạy đúng kiến trúc** (transport hysteria2 qua
relay WebSocket của Cloudflare, TUN + định tuyến + bypass TQ **nằm trong chính
`flowvpnrelay.exe`** — từ 1.4.7 KHÔNG còn `sing-box.exe`) và **đo được tốc độ
thật**, không chỉ "Connected".

## 0. Chuẩn bị (một lần)

1. Kéo code mới nhất trong repo (máy harness đã có SSH/key tới node-1/node-2).
2. Trong `windows/assets/` phải có đủ 3 file nhị phân:
   `wintun.dll`, `wireguard-go.exe`, `flowvpnrelay.exe`.
   Nếu thiếu `flowvpnrelay.exe`: chạy `bash windows/assets/fetch-assets.sh` (cần Go + mạng).
3. Kiểm tra dung lượng/kiểu file:
   `powershell -c "Get-Item windows\assets\*.exe | Select Name,Length"`
   (`flowvpnrelay.exe` ≈ 12 MB).

## 1. Kiểm tra CÔ LẬP trước khi mở app

Chạy `windows/installer/verify-relay.ps1` (script tự sinh cấu hình — có khối `tun` —
rồi chạy `flowvpnrelay.exe`, chờ dòng `TUNREADY`, kiểm adapter + route + bypass TQ +
DNS + egress, rồi dọn sạch). Chế độ `-ConfigOnly` chạy được KHÔNG cần admin. Kỳ vọng:

- `TUNREADY if=flowvpntun mtu=1500 route=yes` xuất hiện trong ≤ 30 giây.
- Adapter `flowvpntun` có địa chỉ `100.100.100.101/30`; route `0.0.0.0/0` (chia
  `0.0.0.0/1` + `128.0.0.0/1`) trỏ vào nó.
- Một IP Trung Quốc (ví dụ `110.242.68.66`) **KHÔNG** đi qua adapter đó (bypass TQ).
- `https://api.meetflowai.site/v1/health` trả 200; `www.youtube.com` phân giải ra IP
  Google thật (KHÔNG phải `69.171.235.22` — chữ ký nhiễm độc của GFW).

Nếu `TUNREADY` không xuất hiện: xem dòng `TUNFAIL` ngay trước đó — nó ghi nguyên lý do
của HĐH (ví dụ `Access is denied.` nghĩa là chưa chạy bằng quyền Administrator).

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

## 2b. Kiểm phần "vượt qua cho WeChat"

Bypass TQ của đường relay **chỉ còn theo DẢI IP** (`tun.route.ipv4Exclude` = `cn.txt` +
`cn6.txt`, ~7.500 dải): mọi đích trong dải TQ đi THẲNG qua adapter vật lý, không vào
tunnel — vì traffic vòng qua node ở Việt Nam là nguyên nhân WeChat lỗi/cực chậm khi bật
VPN. Kiểm nhanh sau khi bật VPN:

```powershell
curl.exe -s -o NUL -w "wechat: %{http_code} %{time_total}s\n" https://weixin.qq.com
curl.exe -s -o NUL -w "google: %{http_code} %{time_total}s\n" https://www.google.com
curl.exe -s https://api.ipify.org      # phải là IP node (traffic còn lại đi qua VPN)
Find-NetRoute -RemoteIPAddress 110.242.68.66   # InterfaceAlias KHÔNG được là flowvpntun
```

Kỳ vọng: `weixin.qq.com` vẫn vào được và **nhanh như khi không bật VPN**; traffic không
thuộc dải TQ vẫn ra IP node.

⚠️ **Mất mát có ý thức so với 1.4.6**: bản 1.4.6 còn có thêm rule theo TÊN MIỀN TQ
(WeChat/Tencent + `.cn`, 57 mục) vì khi đó bộ định tuyến là sing-box. Hysteria TUN
không có engine rule theo tên miền, nên phần đó bị bỏ. Với các dịch vụ TQ lớn (WeChat,
Alipay, Taobao…) DNS trả về IP nằm trong dải TQ nên rule `ip_cidr` vẫn phủ; nhưng nếu
khách báo một tên miền TQ cụ thể bị chậm, đây là chỗ đầu tiên cần xem lại (hướng: chia
DNS theo tên miền bằng NRPT của Windows, hoặc tự viết bộ chia DNS trong flowvpnrelay).

## 3. Bằng chứng cần gửi lại

- Output `verify-relay.ps1` (nguyên văn).
- Bảng RAW vs VPN (MB/s + Mbps, 3 lần mỗi bên).
- Ảnh/log trạng thái app khi đang chạy transport relay.
- Nếu thất bại: stderr của `flowvpnrelay.exe` (app ghi lại vào
  `%APPDATA%\VPNFlow\vpnflow.log`, dòng `flowvpnrelay.exe[stderr]: …`). Tìm hai mốc
  `TUNREADY` / `TUNFAIL` trước tiên.

## 4. Lưu ý an toàn

- Nếu sau khi ngắt VPN mà máy không vào được mạng: `Get-NetAdapter` xem còn adapter
  `vpnflow`/`flowvpntun` nào không; xoá route mặc định trỏ vào nó (`route print 0.0.0.0`),
  và tắt tiến trình `flowvpnrelay.exe` còn sót (`Stop-Process -Name flowvpnrelay`).
  Adapter TUN do `flowvpnrelay.exe` giữ nên nó mất theo tiến trình — không cần gỡ tay.
- Đừng để lại `flowvpnrelay.exe` chạy nền sau khi test xong.

---

## ✅ TASK TO RESUME (sau khi bật lại máy — chủ dự án đã cắm lại ổ)

Khi bật lại: mount BIWIN nếu thiếu → `git pull` (HEAD = `e06b6e5`) → chờ `tailscale status` thấy `desktop-852p1lt online` rồi chạy Windows test theo mục 1–3 ở trên (`verify-relay.ps1` → app → IP node → RAW vs VPN → WeChat → ngắt an toàn).

Trạng thái đã khoá (release, chờ publisher):
- iOS 1.4.0/15 (sha256 b6bf9a04…), Android 1.4.0/20 (2 APK), macOS 1.4.0/14 (zip sha256 262634c6…) — chi tiết `docs/RELEASE_ARTIFACTS_2026-09-19.md`.
- iOS 1.4.0/16 = bản hysteria2 **test cho iPhone** (sha256 158649962d…), chưa cài.
Việc treo: iOS hysteria2 chưa test trên máy thật (KVC fd + tự cứu); macOS lượt tải đầu chậm (ramp-up) + chưa notarize + app Mac chưa có kênh tự nhắc cập nhật; WeChat split-tunnel Android/iOS/Mac chưa làm.
