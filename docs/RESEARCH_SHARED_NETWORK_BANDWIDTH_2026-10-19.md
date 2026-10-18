# NGHIÊN CỨU — hút băng thông tối đa trên MẠNG CHUNG TÒA NHÀ (19/10/2026)

> **Bối cảnh:** mạng của máy Mac là **mạng chung của tòa nhà** (`192.168.100.0/24`, gateway `.1`).
> Chủ dự án cần: kéo **băng thông cao nhất về cho thiết bị/mạng của mình**, và sau đó muốn một
> **phương án riêng theo SSID nhà mình**.
>
> **Trạng thái:** tài liệu nghiên cứu — **chưa sửa code**. Mọi kết luận dưới đây đều kèm phép đo.

---

## 1. KẾT LUẬN NGẮN GỌN (đọc mục này là đủ)

1. **Wi-Fi KHÔNG phải nút thắt.** Link 5 GHz, 80 MHz, 802.11ax, MCS 11, **−37 dBm**, PHY 1200 Mbps.
2. **Băng thông của tòa nhà KHÔNG bị cạn.** Một kết nối chỉ được ~4–12 Mbps, nhưng **8 kết nối song
   song đạt 72–81 Mbps** — đo lặp **3 lần**, ổn định.
3. ⇒ Giới hạn nằm ở **TỪNG KẾT NỐI**, không phải tổng. Đây là đòn bẩy duy nhất còn lại.
4. **Tăng "số khai" (declaration) của app KHÔNG vượt được trần này.** App chỉ mở **một** tunnel
   (một QUIC/WebSocket) ⇒ trần thực tế ~10–12 Mbps, khai bao nhiêu cũng vậy.
5. Muốn hút nhiều hơn ⇒ **app phải mở NHIỀU tunnel song song và chia luồng theo 5-tuple**.
   Đây là thay đổi kiến trúc, **không** phải chỉnh tham số.

---

## 2. PHÉP ĐO & KẾT QUẢ

### 2.1 Wi-Fi (loại trừ nút thắt tầng 2)

```
system_profiler SPAirPortDataType
  PHY Mode: 802.11ax · Channel: 161 (5GHz, 80MHz) · MCS Index: 11
  Signal / Noise: -37 dBm / -93 dBm · Transmit Rate: 1200 Mbps
```

⇒ Tín hiệu rất mạnh, nhiễu rất thấp, dải 80 MHz. Không còn gì để tối ưu ở tầng Wi-Fi.

### 2.2 Số luồng song song quyết định tốc độ (đo tới relay của mình)

`GET https://api.meetflowai.site/v1/downloads/ios`, N luồng chạy **đồng thời**, cộng tốc độ:

| N | Lần 1 | Lần 2 | Lần 3 |
|---|---|---|---|
| 1 | **4,2 Mbps** | 10,9 Mbps | — |
| 2 | 8,7 Mbps | — | — |
| 4 | 17,4 Mbps | 25,6 Mbps | 29,3 Mbps |
| **8** | **71,8 Mbps** | **72,3 Mbps** | **81,2 Mbps** |

Đo lại trên Cloudflare (đường khác, để chắc không phải chuyện riêng của relay mình):
1 luồng **12,5 Mbps** · 6 luồng **106 Mbps** (≈ **8,5×**).

⇒ **Hiện tượng lặp lại trên hai hạ tầng độc lập.** Không phải may rủi.

### 2.3 Chất lượng đường lên (giải thích vì sao MỘT luồng lại tệ)

```
ping 8.8.8.8         : 44–50 ms · **20% mất gói**
ping 192.168.100.1   : 3,6 ms · 0% mất gói     (LAN hoàn hảo)
RTT tới relay-server : 138–142 ms
```

⇒ Đường lên bị **tắc và mất gói**. Một luồng TCP/QUIC trên đường 140 ms + 20% mất gói sẽ **không
bung được cửa sổ** ⇒ kẹt 4–12 Mbps. Nhiều luồng ⇒ mỗi luồng có cửa sổ riêng ⇒ cộng lại.

### 2.4 Điều đã bị BÁC BỎ bằng số

- **"Băng thông tòa nhà đã cạn"** — SAI. Tổng 8 luồng đạt 72–81 Mbps.
- **"Router giới hạn theo tenant ở mức thấp"** — khó đúng, vì trần quan sát được đã 72–81 Mbps.
- **"Wi-Fi yếu"** — SAI. −37 dBm / 1200 Mbps PHY.
- **"Khai báo cao hơn sẽ nhanh hơn"** — SAI. Trần do **số kết nối**, không do con số khai.

---

## 3. GIẢ THUYẾT CÒN LẠI (chưa phân biệt được — cần đo thêm)

| Mã | Giả thuyết | Cách phân biệt |
|---|---|---|
| **H1** | Router tòa nhà **shape theo từng kết nối** (per-flow policing) | Đo tới **gateway tòa nhà** (một máy khác trong LAN) với 1 vs 8 luồng. Nếu trong LAN 1 luồng đã nhanh ⇒ H1 nằm ở gateway ra ngoài |
| **H2** | **Sụp cửa sổ** do mất gói + RTT cao (không phải shaping) | Đo khi mất gói thấp (giờ vắng): nếu 1 luồng tự lên cao ⇒ H2 |
| **H3** | ISP/QoS theo tenant | Nếu tổng 8 luồng bị chặn ở một mức cố định ⇒ H3. Hiện 72–81 Mbps nên **khó xảy ra** |

**Phân biệt H1 vs H2 quan trọng** vì:
- H1 ⇒ nhiều kết nối là cách duy nhất (đúng như phương án §4).
- H2 ⇒ có thể cải thiện cả một luồng bằng CC/MTU/socket buffer (rẻ hơn nhiều).

---

## 4. PHƯƠNG ÁN CHO APP (theo thứ tự lợi ích/công sức)

### P1 — NHIỀU TUNNEL SONG SONG, CHIA THEO LUỒNG (**đòn bẩy chính, ~6–17×**)

Hiện tại: `1 sockFd → 1 Connect() → 1 WebSocket → 1 QUIC`. Muốn N tunnel:

1. Gọi `Connect()` **N lần** với **N sockFd** (mỗi cái một relay/hostname/port khác nhau) —
   ứng viên sẵn có: `api.meetflowai.site` và `t1.meetflowai.site` × các cổng relay.
2. **Phân loại gói theo 5-tuple** ở `forwardToGo`: hash (src, dst, proto, sport, dport) → chọn tunnel.
   **Bắt buộc** phải theo luồng, **KHÔNG** chia theo gói: chia theo gói làm đảo thứ tự, TCP bên trong
   sẽ sụp.
3. Chiều về: gộp gói từ **cả N** tunnel vào **một** đường `flow.writePackets` (đã gom lô ≤32 ở build 60).
4. Điều kiện: mọi tunnel phải **cùng exit node** (bất biến F3) — nếu không, khách đi ra nhiều IP và
   các site thấy IP đổi liên tục ⇒ hỏng phiên đăng nhập/thanh toán.

**Rủi ro:** đây là **đường nhạy nhất của iOS** (AGENTS §7c). Đã từng mất mạng 6 phút khi đụng cầu.
Cần: giữ nguyên bất biến `flowLock`, không dựng lại cầu, có cổng nghiệm thu `ios-log-acceptance.py`.

### P2 — Ép IPv4 cho cả destination Cloudflare (rủi ro thấp)

Hiện 7 dải IPv6 Cloudflare bị **loại trừ khỏi tunnel** (bắt buộc, để WS relay không bị hút vào tunnel).
Hệ quả: site nào nằm trên Cloudflare thì đi IPv6 **thẳng** ra mạng — mà đường IPv6 đó đo được **chậm
hơn** IPv4. Chủ dự án đã quan sát đúng: Android (IPv4 qua VPN) nhanh hơn iPad (IPv6 thẳng).

Cách làm: thu hẹp dải loại trừ xuống **đúng đường cần cho relay** (ví dụ chỉ IP/port của relay), phần
Cloudflare còn lại đưa vào tunnel. **Đánh đổi:** Cloudflare đổi IP mỗi phiên ⇒ phải giải IP lúc mở
phiên, không hardcode.

### P3 — Cấu hình theo SSID (đúng ý "phương án riêng cho SSID nhà mình")

Bộ nhớ băng thông của app **đã khoá theo SSID** (`wifi|ssid:KT-617-5G`). Nên có thể:
- SSID nhà mình ⇒ bật **N tunnel** (N lớn), trần cao.
- Mạng di động / Wi-Fi lạ ⇒ 1 tunnel, tham số thận trọng.
Đây là chỗ tự nhiên để đặt "profile theo mạng" mà không phải thêm cơ chế mới.

### P4 — Việc rẻ, nên thử trước khi làm P1

- **Cắm dây mạng**: loại trừ hoàn toàn tranh chấp airtime giờ cao điểm (5 phút để thử).
- **Đo giờ vắng vs giờ cao điểm**: nếu 1 luồng giờ vắng tự lên cao ⇒ H2 ⇒ chỉ cần chỉnh CC/socket.
- **Tăng socket buffer / thử MTU 1400 thay 1300** trong tunnel.

---

## 5. VIỆC CẦN ĐO TRƯỚC KHI VIẾT CODE

1. **N sweep TRONG tunnel** (không phải HTTPS trực tiếp): N = 1/2/4/8, đo `bridge: nhịp vào` +
   byte của relay. Phải chứng minh trần 10–12 Mbps nằm ở **tầng tunnel**, không phải ở path.
2. **LAN-only test**: 1 vs 8 luồng tới một máy khác trong `192.168.100.0/24` ⇒ phân biệt H1/H2.
3. **Giờ vắng vs cao điểm** (đêm vs 20–22 h) ⇒ tách tranh chấp khỏi shaping.
4. **Thử P4 trước**: dây mạng + MTU + socket buffer. Nếu P4 đã đủ thì **không cần P1** (đỡ rủi ro lớn).

---

## 6. GIỚI HẠN — điều KHÔNG làm

- **Không** deauth Wi-Fi, **không** ARP spoofing, **không** giả mạo QoS/mark để chèn ép hàng xóm.
  Đó là phá hoạt động của người khác trong tòa nhà, không phải tối ưu, và có thể vi phạm quy định
  tòa nhà + pháp lý.
- Cách "hút riêng" hợp lệ **duy nhất** là **dùng nhiều kết nối của chính mình** (P1) và **tối ưu
  đường của mình** (P2/P4).
- Lưu ý trung thực: mở N kết nối song song là hợp lệ về kỹ thuật, nhưng nó **chiếm phần lớn hơn**
  của đường lên dùng chung. Nếu tòa nhà có quy định fair-use thì nên biết mình đang vượt qua mức
  "một người dùng bình thường".

---

## 7. TRẠNG THÁI HIỆN TẠI CỦA APP (để tham chiếu khi làm P1)

- iOS đang phát hành **1.4.7/66** (đã publish, sha256 `374b399a…`).
- Trần thực tế đo được qua tunnel: **~10–12 Mbps** (một kết nối).
- Tunnel: `1 sockFd → Connect(host, port, password, obfsPass, sockFd, sockTcp, upKbps, downKbps)`
  (`tools/hysteria-android/mobile.go:155`) — **không có API đổi băng thông lúc chạy**, nên thay đổi
  giữa phiên phải `Stop()` + `Connect()` (không an toàn trên iOS, xem §7c).
- Chiều về đã gom lô ≤32 gói/lần `flow.writePackets` từ build 60 ⇒ hạ tầng để gộp N tunnel **đã có**.
