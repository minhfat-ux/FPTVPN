# Sự cố node-2: relay `/relay/vn2hy` trả 502 → khách "Connected nhưng KHÔNG có VPN"

- **Ngày điều tra:** 2026-09-26 (00:00–01:15 giờ Trung Quốc)
- **Người điều tra:** Solution Architect (DSH harness Mac)
- **Điểm đo:** Quảng Châu, China Mobile (sau GFW) + trong VPS qua Tailscale
- **Trạng thái:** hiện **đã hết** (cả 4 relay active); lỗ hổng giám sát **chưa xử**

## 1. Kết luận

**Có thật.** Backend relay `relay-cf-vn2hy` (cổng **7785**, node-2) đã **không lắng nghe**, nên Caddy
trả **502** cho khách Trung Quốc gọi `wss://api.meetflowai.site/relay/vn2hy`. Client vẫn hiện
"Connected" (vì `NEVPNStatus` chỉ nói tunnel interface đã lên) nhưng **không có đường dữ liệu** —
đúng triệu chứng chủ dự án báo.

## 2. Bằng chứng

### 2.1 Caddy trên node-2 trả 502 (nguyên văn, đã lược header)

```text
msg="dial tcp 127.0.0.1:7785: connect: connection refused"
uri=/relay/vn2hy   status=502
```

- Tổng trong cửa sổ log giữ được: **7 lần**, dồn vào **23:10:58 – 23:12:34 (+07)** ngày 25/09.
- Khách bị ảnh hưởng (theo `User-Agent`):
  - **5 × `PrivateVPNMacPacketTunnel/20`** (app macOS — chính máy đang điều tra, `X-Forwarded-For: 120.234.32.53`)
  - **2 × `okhttp/4.12.0`** (một máy Android)
  - tất cả đều `Cf-Ipcountry: CN`.

### 2.2 Dịch vụ relay khởi động lệch hẳn so với các relay khác

| Unit | Cổng | Khởi động lúc |
|---|---|---|
| `relay-cf-vn1wg` | 7786 | Wed 2026-09-23 14:30:48 +07 |
| `relay-cf-vn2wg` | 7783 | Wed 2026-09-23 14:30:48 +07 |
| `relay-cf-vn1hy` | 7787 | Wed 2026-09-23 14:32:18 +07 |
| **`relay-cf-vn2hy`** | **7785** | **Fri 2026-09-25 23:14:46 +07** ← lệch 2 ngày |

`Restart=always` + `RestartSec=3` **có** trong unit, nhưng `NRestarts=0` ⇒ systemd **không** tự
khởi động lại (nghĩa là unit bị `stop`, hoặc được tạo/`start` bằng tay lúc 23:14:46). Tức **có can
thiệp thủ công**; khoảng thời gian chết trước đó **không xác định được từ log còn giữ**.

### 2.3 KHÔNG có giám sát/cảnh báo cho các relay này

- `OnFailure=` **rỗng** trên mọi unit relay.
- Không timer/cron nào kiểm relay (timer hiện có: `flowvpn-mirror-peers`, `sysstat`,
  `node-self-report`, `fbuddy-*`, `flowvpn-cp-housekeeping`).
- Guard (`flowvpn-guard`) **không** đụng tới relay (grep `relay` = 0).
- ⇒ Relay chết thì **không ai được báo**; phải có người phát hiện bằng cảm giác.

### 2.4 Tình trạng HIỆN TẠI: bình thường

```text
relay-cf-vn1hy active · relay-cf-vn1wg active · relay-cf-vn2hy active · relay-cf-vn2wg active
node-2: uptime 16 ngày · load 0.33 · disk 63% (6,8G trống) · RAM 961MB (337MB available)
conntrack 296/8192 · 0 unit failed · 0 OOM trong 3 ngày
```

Đo lại **3 lần liên tiếp từ Quảng Châu**: `health=200` (~0.28–0.33 s) và `relay=101` cho cả
`vn2hy`/`vn1hy`. Không chập chờn.

Tunnel macOS đang chở dữ liệu **cả hai chiều** (log thật `relay.log`):

```text
ws-relay: heartbeat udpFrames=16757 udpBytes=15379884 framesFromRelay=11804 bytesFromRelay=7300767
          droppedNoLink=0 pendingLink=0 bufferedLink=0 wsOpen=true
bridge: packetFlow→Go 21974 gói/15881630 B · Go→packetFlow 19373 gói/7701684 B
TCP sức khoẻ: SYN vào 98, SYN-ACK về 98, RST về 0
```

## 3. ĐÍNH CHÍNH một quan sát của chính tôi (không muốn thổi phồng)

Trong lúc điều tra tôi từng nghi các phiên relay `ĐÓNG sau 11.8s | in=0f/0B out=0f/0B` là sự cố
đang diễn ra. **Phần lớn đó là do chính tôi**: probe WS của tôi dùng `curl --max-time 12` — mở
WebSocket, nhận `101`, không gửi frame nào rồi bị cắt ở ~12 s. Đúng hình dạng đó.

⇒ **Sự cố thật là cửa sổ 502 ở §2.1**, không phải các phiên 0 byte kia. Báo cáo này giữ nguyên
phần đúng và rút lại phần suy đoán.

## 4. Vì sao khách thấy "Connected" dù không có mạng

"Connected" của app lấy từ `NEVPNStatus` — chỉ nói **tunnel interface đã lên**, KHÔNG nói đường dữ
liệu thông. Khi relay trả 502 lúc mở WS, client không có đường nào để chở gói.

Đã có sẵn cơ chế chống trong client nhưng **chậm**: `RelayFailoverWatch` cần **2 cửa sổ 15 s** (≈30 s)
không có frame mới kết luận và đổi đường. Nếu relay 502 **ngay lúc kết nối** thì khách phải chịu
~30 s "Connected mà không có gì" trước khi nó tự đổi.

## 5. Việc cần làm

| # | Việc | Vì sao |
|---|---|---|
| 1 | Thêm `OnFailure=` + timer health-probe mỗi 60 s cho **cả 4** `/relay/*` (bắt buộc trả `101` trong ≤5 s), cảnh báo Telegram khi đổi trạng thái | Đây là lỗ hổng đã để sự cố xảy ra âm thầm |
| 2 | Xác nhận 4 unit relay đều `enabled` (sống qua reboot) | `relay-cf-vn2hy` khởi động lệch 2 ngày ⇒ nghi không `enabled`/bị stop tay |
| 3 | Client: coi **HTTP 5xx / không mở được WS** là hỏng NGAY, đổi relay trong ≤2 s thay vì chờ ~30 s | Giảm cửa sổ "Connected mà không có mạng" |
| 4 | Điều tra riêng **iPhone trên 5G** (xem §6) | Triệu chứng của chủ dự án có thể còn một gốc khác |

## 6. Điều tra thêm — iPhone 5G "connected nhưng không VPN"

Đây là **nghi phạm thứ hai, độc lập với node-2**, và khớp với chi tiết "chỉ trên 5G":

- Mã nguồn ghi rõ IPv6 **đã bị bỏ có chủ đích** 22/09
  (`HysteriaPacketTunnelProvider.swift:2251-2254`): bản `18f8c82` từng đặt `ipv6Settings.includedRoutes = [::/0]`
  và gây **"mất mạng khi connect"** vì relay `api.meetflowai.site` có bản ghi **AAAA** ⇒ iOS ưu tiên IPv6
  ⇒ gói bị hút vào tunnel mà server không có IPv6 ⇒ đen.
- `PacketTunnelProvider.startHysteriaSession` chỉ áp `ipv4Settings` (`includedRoutes = 0.0.0.0/0`) và
  **không** đặt `includeAllNetworks`. Đã rà toàn bộ `iOS/`: **không có `includeAllNetworks`**.
- Hệ quả khả dĩ: trên mạng **5G có IPv6** (rất phổ biến ở TQ), lưu lượng IPv6 **không đi vào tunnel**
  ⇒ "Connected nhưng không có VPN", và một phần kết nối treo ⇒ "mất mạng".
- Trên Wi-Fi (thường không IPv6 hoặc khác) thì không thấy ⇒ khớp việc anh chỉ gặp trên 5G.

**Cần bằng chứng để chốt:** log `relay.log` từ chính iPhone lúc đang ở 5G. Nếu trong đó
`packetFlow→Go` tăng nhưng `Go→packetFlow` đứng yên, hoặc có nhiều gói bị bỏ vì `subnet`/không route,
thì đúng là rò IPv6. Không có log thì **không kết luận** — tránh lặp lại lỗi đoán rồi sửa sai như
lần `::/0` hồi 22/09.
