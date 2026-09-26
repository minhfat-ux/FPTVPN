# Mac 1.4.7/28 — tunnel rơi khi bật/tắt Tailscale, lần 2 KHÔNG tự nối lại (26/09/2026 ~19:00–19:09 +08)

Máy: MacBook Air (macOS), app `VPNFlow` 1.4.7/28, extension `com.privatevpn.mac.packet-tunnel` `[activated enabled]`.
Mục đích đo: tìm đường vào server khi SSH công khai bị ngập. Tailscale bật lúc ~19:00, tắt lúc ~19:06:45.

## Dòng thời gian (log thật)

| Giờ (+08) | Việc | Bằng chứng |
|---|---|---|
| 18:52:11 | phiên tunnel mới, `vn1hy`, mtu 1300 | `relay.log`: `build: version=1.4.7 build=28 … phiên 1`, `handshake ok` |
| 18:56 | đang chạy tốt | monitor: `default=utun8,en0`, relay `426` |
| **19:00:40** | **tunnel RƠI ngay khi bật Tailscale** | monitor: `relay vn1hy=000 vn2hy=000 … default=en0`, `stop=2` |
| 19:01:41 | app tự nối lại | monitor: `default=utun7,en0`, relay `426` |
| **19:06:47** | **tunnel RƠI lần 2 (lúc tắt Tailscale)** | monitor: `default=en0` |
| 19:06:53–19:07:02 | phiên mới lên, có mạng thật | `relay.log`: `startTunnel phiên 1`, `handshake ok`, `XÁC NHẬN tunnel có mạng thật sau 5.0s — TCP handshake 28 lần` |
| **19:07:1x–19:08:52** | **KHÔNG còn interface/route tunnel, vẫn KHÔNG tự nối lại** | `ifconfig`: mất `utun7`+`utun8`; `netstat -rn`: không còn `0/1`/`128.0/1`; `scutil --nc list` → `VPNFlow (Disconnected)`; egress = `120.234.32.53` (ISP TQ, tức KHÔNG qua VPN) |
| 19:09:00 | chủ động `scutil --nc start "VPNFlow"` | `Connected`, egress `103.173.155.50` (ổ 48 s liên tục) |
| 19:10 | có chở thật | `cầu vào 5704/ra 5683` trong 1 phút; 4 relay `426` |

## Kết luận & việc cần làm

1. **Có defect tiềm ẩn**: khi interface Tailscale bị gỡ, tunnel của VPNFlow rơi và **không tự nối lại** dù tính năng
   auto-reconnect (backoff 2/4/8/16/30/60 s) đã có; `scutil --nc list` báo `Disconnected` nhưng extension vẫn chạy
   (PID còn sống) và app không khởi động lại session ⇒ khách **tưởng còn VPN nhưng thực tế đi thẳng**.
   Khớp với phàn nàn "bản Mac cứ chập chờn".
2. Cần: (a) phát hiện mất interface/route trong phiên và tự dựng lại; (b) app theo dõi `NEVPNStatus` và tự
   `startVPNTunnel` khi `Disconnected` mà ý định người dùng vẫn là "muốn kết nối"; (c) không để app khác
   (Tailscale/WireGuard) toggling làm mất route của mình.
3. Bằng chứng log tươi sau lần nối lại có dòng `cầu vào -1/ra -1 … mở=no` xen giữa lúc `Connected` (cầu chưa gắn)
   — cần soi thêm ở build sau.

## Lần 3 — rơi tiếp lúc 19:18, vẫn KHÔNG tự nối lại (kiểm 19:30)

- Phiên nối lại bằng tay lúc **19:09:00** chạy tới **19:18:17** thì `relay.log` **dừng hẳn**, **không** có dòng `stopTunnel`.
  Trước khi dừng, dòng `tài nguyên` **chẵn lẻ** giữa số thật và `cầu vào -1/ra -1 … mở=no` (cầu đọc ra nil).
- 19:30 kiểm lại: **không còn tiến trình extension**, `scutil --nc status VPNFlow` = `Disconnected`,
  app vẫn chạy (`/Applications/VPNFlow.app/Contents/MacOS/VPNFlow`, PID 98559) và **không tự nối lại**.
- Lúc này **Tailscale đã bật lại** (`utun8` = `100.109.31.16` của Mac) và **đang dùng exit node node-1**
  (`ExitNodeStatus = 100.76.147.111 Online`) ⇒ egress `103.173.155.50` hiện nay là **qua Tailscale**, không phải VPNFlow.
- Hệ quả cho kỳ khách test: máy còn app VPN khác (Tailscale/WireGuard) thì tunnel VPNFlow có thể rơi mà **khách không biết** —
  cần cảnh báo UI + tự dựng lại (đúng `BUG-MACOS-SESSION-DROP-001`).
