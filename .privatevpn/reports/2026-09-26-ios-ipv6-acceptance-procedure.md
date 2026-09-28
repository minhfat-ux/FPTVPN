# iOS IPv6 (P2) — TRẠNG THÁI: **CHƯA NGHIỆM THU** + cái bẫy của phép đo

- **Ngày:** 26/09/2026 · **Máy:** iPhone 14 Pro Max · **Bản:** 1.4.6/57 (binary 13:55:56)
- **Chủ dự án nhắc:** *"anh vẫn chưa nghiệm thu vụ IPv6 trên iPhone đâu nhé"* — **đúng**.

## 1. Đã có gì / còn thiếu gì

| | Trạng thái |
|---|---|
| **Cơ chế chạy** (P2 chặn + trả ICMPv6 unreachable) | ✅ **CÓ bằng chứng**: phiên 5G `bridge: IPv6 BỊ CHẶN #600`; phiên mới `#1..#5` rồi `#200` trong **33 giây**; đếm `IPv6-chặn` 329–521; dòng cấu hình `IPv6 utun=2001::ffff:ffff:ffff:fff1/126 included=[::/0] excluded=2023 (link-local=1 cloudflare=7 tq=2015)` |
| **Không rò ra ngoài** (đo từ máy khách) | ❌ **CHƯA ĐO** — đây mới là nghiệm thu |
| **Không hại ứng dụng** | ⚠️ Wi-Fi: YouTube chạy tốt ✅ · 5G: **không kết luận được** vì tunnel chỉ ~60–100 kbps (bài toán thông lượng riêng) |

## 2. ⚠️ CÁI BẪY: website đo IPv6 nằm trên Cloudflare ⇒ **tự động đi thẳng, KHÔNG qua tunnel**

Dải IPv6 Cloudflare bị **loại trừ có chủ ý** khỏi tunnel (để chính relay kết nối được Cloudflare):

```
2400:cb00::/32  2606:4700::/32  2803:f800::/32  2405:b500::/32
2405:8100::/32  2a06:98c0::/29  2c0f:f248::/32
```

Kiểm AAAA của các trang hay dùng:

| Trang | AAAA | Kết luận |
|---|---|---|
| **`myip.com.vn`** | `2606:4700:3033::6815:e6c` | **⊂ `2606:4700::/32` Cloudflare ⇒ ĐI THẲNG** ⇒ **báo "rò" GIẢ** |
| **`ifconfig.co`** | `2606:4700:3037::ac43:a86a` | **⊂ Cloudflare ⇒ báo "rò" GIẢ** |
| `api64.ipify.org` | `2607:f2d8:4010:51::5` | ✅ KHÔNG thuộc dải loại trừ — **dùng được** |
| `ipv6-test.com` | `2001:41d0:701:1100::29c8` | ✅ KHÔNG thuộc — **dùng được** |
| `test-ipv6.com` | *(không có AAAA)* | v4-only — không dùng để đo IPv6 |
| `ipinfo.io` | *(không có AAAA)* | v4-only |

⇒ **Báo cáo "iPhone rò IPv6, myip.com.vn hiện IPv6" khả năng cao là HỆ QUẢ CỦA PHÉP ĐO SAI**, không phải tunnel rò:
`myip.com.vn` nằm trên Cloudflare, mà Cloudflare **được miễn trừ** khỏi tunnel ⇒ IPv6 tới nó đi thẳng ra mạng thật.

**Hệ quả kiến trúc (phải ghi nhận):** miễn trừ dải Cloudflare nghĩa là **mọi website host trên Cloudflare đều đi IPv6 THẲNG, không qua tunnel** — đó là một **mặt rò thật**, không chỉ là lỗi phép đo. Cùng loại: dải IPv6 Trung Quốc (`tq=2015`) cũng đi thẳng (A7 bypass có chủ ý).

## 3. Quy trình nghiệm thu (chủ dự án chạy trên iPhone)

**Điều kiện:** iPhone **trên 5G**, **VPN BẬT**, đã nối được (log có `IPv6 BỊ CHẶN #N` tăng).

| # | Việc | ĐẠT khi |
|---|---|---|
| 1 | Mở `https://api64.ipify.org` | **KHÔNG** hiện địa chỉ IPv6 (không ra được, hoặc chỉ hiện IPv4) |
| 2 | Mở `https://ipv6-test.com/` | Báo **không có IPv6** / IPv6 fail |
| 3 | Đối chiếu IPv4 hiện ra | Phải là **`165.101.114.162`** (node-2) — chứng minh đang đi qua tunnel |
| 4 | Log cùng lúc | `IPv6 BỊ CHẶN #N` **tăng** và `IPv6-chặn` **tăng** |
| 5 | (đối chứng) Mở `https://myip.com.vn` | **SẼ hiện IPv6** — và đó là **ĐÚNG thiết kế** (Cloudflare miễn trừ), **KHÔNG tính là lỗi** |

**KHÔNG ĐẠT** nếu mục 1 hoặc 2 ra IPv6 (tức rò ra ngoài dải Cloudflare/TQ).

## 4. Việc còn lại

1. Chủ dự án chạy §3 trên 5G → ghi kết quả 5 mục.
2. Nếu mục 1–2 ĐẠT ⇒ **nghiệm thu IPv6 iOS xong** (kèm bằng chứng log `IPv6 BỊ CHẶN` tăng).
3. Nếu rò ⇒ phải thu hẹp dải miễn trừ (chỉ miễn trừ đúng IP relay đang dùng thay vì cả `/32` Cloudflare) — **đây là việc thiết kế, cần chủ dự án chốt** vì thu hẹp sai sẽ làm relay mất đường.
4. Mục "không hại ứng dụng" trên 5G **chưa kết luận được** cho tới khi xử lý xong bài toán thông lượng 5G (~60–100 kbps).

---

# KẾT QUẢ NGHIỆM THU — chủ dự án chạy trên iPhone 5G, VPN BẬT (26/09/2026)

| # | Mục | Ai chạy | Kết quả | |
|---|---|---|---|---|
| 1 | `https://api64.ipify.org` | chủ dự án | **"không ra IPv6, vẫn là IPv4"** | ✅ **ĐẠT** |
| 2 | `https://ipv6-test.com/` | chủ dự án | "không vào được" | ⚪ **MIỄN — lỗi phía website** (xem §A) |
| 3 | IPv4 hiện ra khi bật VPN | chủ dự án | **đúng IP của node** | ✅ **ĐẠT** |
| 4 | Log: `IPv6 BỊ CHẶN #N` tăng | **agent (em)** | **`IPv6 BỊ CHẶN #400` trong 32 giây**, đúng phiên `net=cell\|if:pdp_ip0` (5G) | ✅ **ĐẠT** |
| 5 | Đối chứng: **không** VPN | chủ dự án | **"ra IPv6"** | ✅ **ĐẠT** |

## §A. Mục 2 được miễn — có đối chứng, không phải lỗi của ta

`ipv6-test.com` có **cả A (51.75.78.103) lẫn AAAA**, nên "không vào được" **không** tự động là do chặn IPv6. Đo từ máy Mac (đi qua tunnel VN, egress `103.173.155.50`):

```
https://ipv6-test.com/   -> HTTP 000 · hết 25,0 s (timeout)
https://api64.ipify.org/ -> HTTP 200 · 0,80 s
```
⇒ **Website đó tự nó không truy cập được**, kể cả từ Việt Nam. Không quy cho P2.

## §B. Vì sao mục 1 + 5 là một phép đo HỢP LỆ (đây là phần quan trọng nhất)

- **Mục 5 (không VPN ⇒ RA IPv6)** chứng minh **mạng 5G này THẬT SỰ CÓ IPv6 native**.
- **Mục 1 (VPN BẬT ⇒ KHÔNG ra IPv6)** đo trên **cùng máy, cùng mạng, cùng trang**.
⇒ Hai mục ghép lại thành **đối chứng hai chiều**: có IPv6 khi không VPN, mất IPv6 khi bật VPN
⇒ **IPv6 KHÔNG rò ra ngoài qua tunnel.** Đây mới là thứ trước giờ còn thiếu.

## §C. "Không hại ứng dụng" — ĐẠT luôn trên 5G

Chủ dự án **tải được `api64.ipify.org` trên 5G với VPN bật** (mục 1 trả về IPv4) **trong cùng phiên đã chặn 400 gói IPv6**.
⇒ Việc trả `ICMPv6 unreachable` khiến ứng dụng **lùi về IPv4 ngay**, không treo. Cơ chế P2 đạt đúng mục tiêu thiết kế.

## §D. KẾT LUẬN

> **IPv6 trên iOS: ĐẠT.** Không rò ra ngoài (đối chứng hai chiều), cơ chế chặn có bằng chứng đếm được
> (`IPv6 BỊ CHẶN #400`/32 s), và không hại ứng dụng (trang dual-stack vẫn tải được trên 5G).

**Còn treo, KHÔNG thuộc phạm vi IPv6:**
1. **Thông lượng 5G** ~60–100 kbps (`api` 8,3 KB/s · `t1` 9,5 KB/s · Wi-Fi 3230 KB/s) — bóp theo **IP/đường**,
   đổi tên miền không cứu được (đã chứng minh bằng thí nghiệm `relay=t1`). **Đây là bài toán cổng vào, không phải client.**
2. **Mặt rò thật còn lại:** miễn trừ cả dải IPv6 Cloudflare (`2606:4700::/32` …) ⇒ **mọi website host trên Cloudflare
   đi IPv6 THẲNG, không qua tunnel**; dải IPv6 Trung Quốc (`tq=2015`) cũng vậy theo thiết kế A7.
   Thu hẹp về đúng IP relay cần chủ dự án chốt (thu hẹp sai ⇒ relay mất đường).
3. **SSH thẳng tới node-2:22 từ máy Mac đang hỏng** (`Connection timed out during banner exchange`).
   Đã kiểm relay bằng HTTPS thay thế: cả 4 trả **426**. Đường cứu hộ: `~/.ssh/fpt_tunnel root@100.76.147.111` (node-1 qua Tailscale).
