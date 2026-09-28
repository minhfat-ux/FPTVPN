# Vì sao đứt relay trên macOS + nghiệm thu IPv6/4K (26/09/2026)

- **Máy:** MacBook của chủ dự án · app **1.4.7 build 24** · extension pid 57351 → 61605
- **Mạng:** đổi giữa **5G/hotspot (`en0` 172.20.10.2)** và **Wi-Fi (`en0` 10.0.3.120)**
- **Múi giờ:** máy Mac **CST (UTC+8)**; node-2 **+07** ⇒ log hai bên lệch **1 giờ**. Đã quy về **UTC** dưới đây.
- **IP công khai phía khách (server ghi):** `120.234.32.53` (China Mobile, Quảng Châu) và `223.119.20.192`

## 1. Trả lời: vì sao đứt relay?

**Không phải relay chết.** Bằng chứng là log `relay-cf-vn2hy` trên node-2 ghi rõ **ai đóng và lý do**:

| UTC | Sự kiện (server node-2) | Diễn giải |
|---|---|---|
| 06:45:33 | `#227 ĐÓNG sau 435.0s` · **`pong-timeout`** | **SERVER cắt** — hết hạn pong (ping 15 s, trần 20 s) |
| 06:48:41 | `#228 ĐÓNG sau 210.0s` · **`pong-timeout`** | **SERVER cắt** — cùng lý do, lần thứ hai |
| 06:48:43 | `#229 MỞ từ 120.234.32.53` | client nối lại (đường mới) |
| 06:48:48 | `#230 MỞ từ **223.119.20.192**` | **IP KHÁC** ⇒ máy đang đổi mạng |
| 06:49:05 | `#229 ĐÓNG sau 22.6s` · `in=0f/0B out=0f/0B` · `client-close 1001` | phiên **chở 0 byte** rồi tự đóng |
| 06:49:07 | `#231 MỞ từ 120.234.32.53` | nối lại |
| 06:50:22 | `#231 ĐÓNG sau 75.1s` · `client-close 1001` | **CLIENT tự đóng** — khớp `stopTunnel: reason 1` lúc 06:50:21.955 |
| 06:50:40 | `#232 MỞ từ 120.234.32.53` | phiên mới (pid 61605) |
| 06:51:35 | `#230 ĐÓNG sau 166.8s` · `client-close 1006` | socket mồ côi — tiến trình cũ (57351) đã bị thay |

**Kết luận:** hai cú đứt mà chủ dự án thấy là do **máy đổi mạng** (server nhìn thấy **HAI IP khác nhau** trong cùng cửa sổ). Đường cũ im lặng ⇒ không còn pong ⇒ server dọn bằng `pong-timeout`; client cũng tự thấy `link down` và nối lại trong **1–2 s**. Các lần đóng sau đó là **client tự đóng (1001)**, không phải server.

⇒ **Không phải lỗi relay-cf-vn2hy.** Đây là hành vi đúng của cơ chế ping/pong (server ping 15 s, cắt nếu 20 s không pong) + client tự nối lại.

## 2. Con số hệ thống (6 giờ) — đây mới là phần đáng lo

| Lý do đóng | Số lần | Tỉ lệ | Ai đóng |
|---|---|---|---|
| `client-close 1001` (going away) | 76 | 61% | client |
| `client-close 1000` (normal) | 24 | 19% | client |
| `client-close 1006` (**abnormal**, không có close frame) | 15 | 12% | mạng/tiến trình chết |
| `pong-timeout` | 9 | 7% | server |

**Tổng 124 lần đóng/6 giờ.** Điểm quan trọng: **24 lần (≈19%) chết IM LẶNG** (`1006` + `pong-timeout`) — không có close frame. Đây đúng là cơ chế của triệu chứng *"Connected mà không có mạng"*: WS còn treo nhưng không chở gì, phải đợi một bên phát hiện.

Thời gian sống các phiên rất loang: `0.1 s · 5.7 s · 6.1 s · 22.6 s · 33 s · 75 s · 120 s · 136 s · 166 s · 195 s · 210 s · 304 s · 335 s · 435 s · 453 s · 480 s · 771 s · 855 s · **2934 s (49 phút)**`.
⇒ Có phiên sống 49 phút rồi chết `1006`, và có phiên **chở 0 byte trong 22.6 s**. Chưa có mẫu nào cho thấy trần cứng theo đồng hồ (đúng thiết kế: `wsrelay.js` cố ý **không** có timer 10 phút, chỉ dựa ping/pong thật).

## 3. Nghiệm thu macOS — số đo thật

### 3a. YouTube 4K — ✅ **ĐO ĐƯỢC, xác nhận**
| Lần | Tốc độ |
|---|---|
| 1 | **3.41 MB/s = 27.3 Mbps** |
| 2 | **2.83 MB/s = 22.7 Mbps** |

YouTube 4K cần ~15–25 Mbps ⇒ **khớp**. ⚠️ Lưu ý: số này thuộc **mạng Wi-Fi mới**, không phải hotspot. Trong lúc còn ở hotspot, em đo được **539 KB/s (~4.3 Mbps)** — chênh **~5–6 lần**. Khi báo cáo "4K" phải ghi rõ là **trên Wi-Fi**.

### 3b. IPv6 — ✅ **P2 CHẠY trên macOS**, nhưng "không rò" chưa chứng minh được trên mạng này
| Bằng chứng | Kết quả |
|---|---|
| Route IPv6 mặc định | `default → 2001::ffff:ffff:ffff:fff0 **utun7**` ⇒ **mọi IPv6 bị hút vào tunnel** |
| `curl -6 https://api64.ipify.org` | **không ra được** |
| `ipv6-reject` (log extension) | **15 lần / 3 phút** (`ipv6-reject #100 len=132 code=4`) ⇒ gói IPv6 **vào tunnel và bị TỪ CHỐI chủ động** (ICMPv6 unreachable), không rơi im lặng |
| IPv6 toàn cầu trên giao diện vật lý | **KHÔNG có** (`en0` = `10.0.3.120`, không `inet6` toàn cầu) |

**Nói thẳng:** mạng này **không có IPv6 native**, nên "không rò IPv6" là **đương nhiên đúng** và **không chứng minh được gì mạnh**. Thứ chứng minh được là: **P2 hoạt động** — gói IPv6 của ứng dụng bị hút vào tunnel rồi bị trả `ICMPv6 unreachable` (nên app lùi IPv4 ngay), thay vì rơi im lặng như lỗi `errno=2` trước đây.

⇒ Bài kiểm "rò IPv6" **thật** vẫn phải làm ở nơi **có IPv6 native** — tức **iPhone trên 5G** (đúng nơi chủ dự án từng thấy IPv6 hiện ra).

## 4. Việc còn lại
1. **iPhone trên 5G**: nghiệm thu §2c + IPv6 native (nơi duy nhất chứng minh được "không rò").
2. **19% phiên chết im lặng** (§2) — ứng viên số một cho lỗi *"chạy một lúc thì tự disconnect"*. Cần: client phát hiện "không pong / không gói về" **nhanh hơn** và nối lại, thay vì để WS treo.
3. **`relay.log` trên macOS không ai đọc được**: `primary=/private/var/root/…`, `mirror=-`, `probes[user:/Users/… exists=true **write=false**]`. Extension chạy root nên **không ghi được** container của user ⇒ chỉ tồn tại ở `/var/root` (không đọc được kể cả bằng công cụ). Đề nghị: ghi vào `/Library/Logs/VPNFlow/relay.log` (root ghi được, `644`/`755`).
4. `myip.com.vn` trả về **địa chỉ ví dụ** (`2001:db8::1`, `203.0.113.42`, `192.168.1.1`) trong phiên này ⇒ **không dùng làm bằng chứng** được. Dùng `https://api64.ipify.org` hoặc `https://ifconfig.co/json`.
