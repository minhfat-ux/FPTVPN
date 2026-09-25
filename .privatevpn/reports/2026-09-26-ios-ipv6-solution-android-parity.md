# iOS IPv6 trên 5G — NGUYÊN NHÂN + SOLUTION THEO ANDROID

- **Ngày:** 2026-09-26 · **Người làm:** Solution Architect (DSH harness Mac)
- **Trạng thái:** P1 đã chạy trên iPad (build 53, khoẻ) · **P2 là bản sửa đúng, chưa làm**
- **Các bản vá khác (on-demand, jetsam, flowLock…) GIỮ NGUYÊN** — chỉ gỡ phần IPv6.

## 1. NGUYÊN NHÂN bản vá IPv6 hôm nay làm iPad "siêu chậm" / không xem được Netflix

Bằng chứng từ `relay.log` máy thật iPad, ngay sau khi cài bản có `ipv6Settings`:

```text
09-26 02:35:47.585 bridge: packetFlow→Go #1 (AF=30, write=80  errno=2) IPv6 76B
09-26 02:35:47.585 bridge: packetFlow→Go #2 (AF=30, write=100 errno=2) IPv6 96B
09-26 02:45:35.414 bridge: packetFlow→Go #1 (AF=30, write=120 errno=2) IPv6 116B
09-26 02:35:54.746 bridge: Go→packetFlow #1 (AF=30) IPv6 76B
```

Chuỗi nhân–quả:

1. `::/0` khiến **gói IPv6 của khách bị hút vào tunnel** — `AF=30` = `AF_INET6` (đúng ý đồ chặn rò).
2. Cầu `packetFlow↔Go` **vẫn ghi IPv6 vào fd của Go** (`HysteriaTransport.swift:1068` đặt
   `framed[3] = afInet6`, `:1075` `write(...)`) — và **Go TỪ CHỐI: `errno=2` (ENOENT)**.
3. ⇒ IPv6 của khách **bị phá hoàn toàn**, nhưng app vẫn thử IPv6 trước (DNS trả AAAA) ⇒ **treo/timeout**
   ⇒ "bị bóp mạng siêu chậm", Netflix (IPv6-heavy) chết, iPhone 5G không lên được.
4. Bằng chứng định lượng cùng phiên: `bw: sample observed=0 … idleRun=0/3`, `rawWindowBytes` gần như
   đứng, trong khi `sendQueue=0/512` (hàng đợi không phải thủ phạm).

**Bài học:** "loại trừ đúng dải IPv6 của relay" là điều kiện **CẦN**, không phải **ĐỦ**. Kéo `::/0` vào
một tunnel **không có IPv6** là sai, dù loại trừ có chính xác đến đâu.

## 2. SOLUTION CỦA ANDROID (đọc từ code — đây là thứ cần bắt chước)

`android/.../vpn/HysteriaVpnService.kt:745-760`, hàm `establish()`:

```kotlin
builder.setSession("VPNFlow Hysteria")
builder.setMtu(HY_MTU)
builder.addAddress(HY_TUN_IPV4_IP, 30)   // CHỈ IPv4
builder.addRoute("0.0.0.0", 0)           // CHỈ route IPv4 mặc định
for (dns in Config.HY_DNS_SERVERS) builder.addDnsServer(dns)
builder.setMetered(false)
CnAppBypass.applyTo(builder, this)
val tun = builder.establish()
```

Và `HysteriaVpnService.kt:1971`: `const val HY_TUN_IPV6 = ""` (truyền rỗng cho `Mobile.serve`).

**Không có** `addAddress` IPv6, **không** `addRoute("::", 0)`, **không** `allowFamily(AF_INET6)`.

### Vì sao Android KHÔNG rò dù chỉ cấu hình IPv4

Nền tảng Android **CHẶN theo family mặc định**: family nào VPN không cấu hình thì bị **chặn**
(app nhận lỗi NGAY, không phải đi thẳng ra ngoài). Xem commit AOSP
[**"Block address families by default in VpnService"**](https://gitlab.e.foundation/e/os/android_frameworks_base/-/commit/d7e71641f6ae7e372795c22fe293d63373a898d2).

⇒ Hành vi Android = **không rò** (bị chặn) **và không treo** (lỗi tức thì ⇒ app lùi IPv4 ngay).

## 3. Khoảng trống của iOS so với Android

| | Android | iOS (NetworkExtension) |
|---|---|---|
| Không cấu hình IPv6 | **CHẶN** family đó ⇒ app fail nhanh, không rò | **ĐI THẲNG ra giao diện vật lý** ⇒ **RÒ IPv6** |
| Cấu hình `::/0` vào tunnel IPv4-only | (không làm) | Gói vào tunnel rồi **bị bỏ/ENOENT** ⇒ app **treo** ⇒ bóp mạng |

Vì vậy **copy nguyên code Android (chỉ IPv4) là ĐÚNG và AN TOÀN**, nhưng trên iOS nó để lại **rò IPv6**
— khác hành vi Android. Muốn *hành vi* giống Android thì phải tự làm phần "chặn" mà iOS không có.

## 4. SOLUTION (2 tầng)

### P1 — ĐÃ LÀM, đang chạy (build 53) — "đúng code Android"
- `networkSettings` **chỉ áp IPv4**, KHÔNG `ipv6Settings` (y hệt Android).
- Giữ nguyên mọi bản vá khác: on-demand reconnect, cảnh báo `IPv6=OFF` trong log, jetsam/flowLock của dev.
- Bằng chứng sau khi cài: **hết** dòng `AF=30 … errno=2`; phiên mới
  `XÁC NHẬN tunnel có mạng thật sau 5.0s — TCP handshake hoàn tất 11 lần`,
  `tài nguyên: footprint=13.7MB … hàng đợi relay chờ 0 gói/0 B`.

### P2 — BẢN SỬA ĐÚNG để hết rò mà KHÔNG treo (chưa làm)
Bắt chước **hành vi** Android: bịt rò, nhưng để app **fail tức thì** thay vì treo.

1. Giữ `ipv6Settings` với `includedRoutes = [::/0]` + `excludedRoutes` = dải Cloudflare + `cn6.txt` +
   link-local (phần này đã chứng minh đúng bằng DNS sống: mọi AAAA của relay ⊂ `2606:4700::/32`).
2. **Sửa cầu `HysteriaTransport`**: khi gói là IPv6 (`(packet[0] >> 4) == 6`) thì **KHÔNG ghi vào Go**
   (Go trả `ENOENT` như log trên) mà:
   - đếm riêng (`toGoIPv6Blocked`) + ghi log,
   - **sinh ICMPv6 "Destination Unreachable" (type 1) trả về `packetFlow`** cho chính gói đó.
   ⇒ app nhận lỗi **ngay** ⇒ Happy Eyeballs lùi IPv4 tức thì — **đúng hành vi "block" của Android**.
3. Không đụng NDP/RA (`fe80::/10` đã loại trừ) để không phá hàng xóm IPv6 của mạng.

**Vì sao cách này khác lần vừa hỏng:** lần vừa rồi IPv6 vào tunnel rồi **biến mất im lặng** (app chờ).
P2 trả lỗi **chủ động** — đó chính là điều Android làm ở tầng nền tảng.

### P3 — Bổ trợ, rẻ, không rủi ro phía client
Server DNS **không trả bản ghi AAAA** ⇒ app chỉ dùng IPv4 ⇒ gần như không còn động cơ thử IPv6.
Làm được ở tầng control-plane/DNS, không cần phát hành app.

## 5. TIÊU CHÍ NGHIỆM THU cho P2

- **AC-1 (hết rò):** iPhone **5G**: `curl -6 ifconfig.co` **không** trả IP nhà mạng (trả IP exit node
  hoặc lỗi ngay).
- **AC-2 (không treo — quan trọng nhất):** trên cùng phiên 5G/Wi-Fi có IPv6, duyệt web + **Netflix ≥10
  phút** bình thường; `bw: sample observed` **có tăng** khi tải; **không** có `AF=30 … errno=2`.
- **AC-3 (log phải chứng minh):** log có dòng `IPv6=ON included=[::/0] excluded=N` **và** bộ đếm
  `toGoIPv6Blocked` tăng khi máy thử IPv6 — chứ không phải im lặng.
- **AC-4:** `ios-typecheck.sh` 0 lỗi · `ios-lint-locks.py` ĐẠT · `ios-pure-logic-tests` PASS hết ·
  `check-relay-ipv6-exclusion.py` ĐẠT.

## 6. Trạng thái triển khai hiện tại

| Máy | Bản | Ghi chú |
|---|---|---|
| iPad (A16) | **1.4.6 build 53** (binary 02:50:29) | Bản P1 (IPv4-only). Phiên mới khoẻ, hết lỗi IPv6 |
| iPhone 14 Pro Max | build 52 (bản LỖI) | Máy đang `unavailable` (khoá/không kết nối) nên **chưa cài đè được** |

⚠️ iPhone cần được cắm/kết nối lại để cài bản 53. Trước đó, **tắt VPN trên iPhone** nếu đang bật bản 52.
