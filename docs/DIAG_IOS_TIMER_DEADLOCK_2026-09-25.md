# Chẩn đoán 25/09/2026 — mọi nhịp của tunnel iOS chết ở +15 s (deadlock `flowLock`)

> Triệu chứng khách báo: *"thông số trong Diagnostics không [đúng/không nhảy]", "mạng không ramp như
> Android"*, *"đổi mạng mà app không tự nối lại"*, *"Connected mà không có mạng"*.
> Kết luận: **một dòng code** làm chết **mọi nhịp định kỳ** của extension từ build 25 tới build 34.
> Sửa ở build 35. Cổng chặn: `scripts/ios-lint-locks.py` + `scripts/ios-log-acceptance.py`.

## A. Triệu chứng đo được (log máy thật, 26 phiên)

Đếm theo TỪNG phiên trong `relay.log` (không đọc bằng mắt):

| Thiết bị / build | Phiên | `bw: sample` (nhịp 1 s) | Nhịp tim watchdog (15 s) |
|---|---|---|---|
| iPad build 24 (09-24 23:05) | 477 s | **36 mẫu, mẫu cuối ở +471 s** | **4** ✅ |
| iPad build 25 (09-24 23:13) | 295 s | 2 mẫu, cuối ở +18 s | 0 ❌ |
| iPad build 26/27/28 | 940 s · 295 s · 1017 s | 2 mẫu, cuối ở +14…+26 s | 0 ❌ |
| iPad build 29/30/31/32/34 | 96…286 s | 2–3 mẫu, cuối ở +12…+28 s | 0 ❌ |
| iPhone build 30/31/32/34 | 99…457 s | 2 mẫu, cuối ở +13…+22 s | 0 ❌ |
| **macOS 1.4.3 build 20** (đối chứng) | 741 s · 728 s | **71 và 68 mẫu, cuối ở +739/+719 s** | **11 và 11** ✅ |

Đối chứng macOS là mấu chốt: **cùng file code provider**, chỉ khác bản build (20 so với 25+).
Vậy đây là **hồi quy trong code iOS**, không phải hành vi của iOS.

Vì sao log vẫn trông "bình thường": cầu `packetFlow↔fd` in nhịp 5 s trên **hàng đợi riêng, không
đụng `flowLock`**, và `WSRelayClient` chạy bằng Swift `Task` (cũng không đụng) ⇒ tunnel vẫn chở gói,
`droppedNoLink=0`, `wsOpen=true` suốt phiên. Người đọc log thấy "vẫn chạy" nên không nghi.

## B. Nguyên nhân gốc

`HysteriaPacketTunnelProvider.swift` — nhịp watchdog (`livenessStep`):

```swift
flowLock.lock()                     // ← ĐANG giữ khoá
...
let verdict = dog.tick(
    ...
    relayFramesSent: currentTransport()?.relayFrameCounts?.sent,   // ← LỖI
    ...)
flowLock.unlock()
```

`currentTransport()` là:

```swift
private func currentTransport() -> HysteriaTransport? {
    flowLock.lock(); defer { flowLock.unlock() }   // lock LẦN NỮA
    return transport
}
```

`flowLock` là `NSLock` (**không tái nhập**) ⇒ **tự khoá chết ngay nhịp watchdog ĐẦU TIÊN (+15 s)**
và **giữ `flowLock` tới hết phiên**. Hệ quả domino, mọi thứ cần khoá này đều **chết lặng**:

| Thành phần | Cần `flowLock` ở đâu | Hệ quả |
|---|---|---|
| Nhịp lấy mẫu 1 s (`bandwidthStep` → `bandwidthBytes` → `bridgeCounters`) | có | thẻ Diagnostics đứng im, **không ramp**, không đo lại đường thật |
| Nhịp hiển thị 1 s (`refreshDisplayRates`) | có | số ↓/↑ live đứng im |
| Nhịp watchdog (nhịp tim, relay-stall, SYN-blackhole) | có | **watchdog câm** ⇒ không tự phục hồi |
| Đồng hồ canh watchdog (`startWatchdogGuard`) | có | không ai phát hiện "watchdog ngừng chạy" |
| Giám sát lưu lượng | có | không kết luận được gì |
| **Cầu `packetFlow↔fd`** | **không** | **vẫn chở gói, vẫn in nhịp 5 s ⇒ log trông bình thường** |
| `WSRelayClient` (Swift Task) | không | link vẫn tự mở lại |

Vì bộ dò đổi mạng nằm trong `bandwidthStep`, nó cũng chết theo ⇒ ca Wi-Fi↔5G không dựng lại transport.

## C. Vì sao đúng build 25

Dòng `relayFramesSent: currentTransport()…` được thêm 24/09/2026 (nhịp relay-stall, "android parity":
so `udpFrames` giữa hai nhịp). Phiên build 24 (23:05) còn sạch, phiên build 25 (23:13) đã chết ⇒
mốc hồi quy khớp đúng lần thêm dòng này. (Không `git bisect` được: các build 22–34 chưa commit.)

## D. Bản vá (build 35)

```swift
// Đọc thẳng `transport` là ĐÚNG vì ta ĐANG giữ `flowLock` bảo vệ nó.
relayFramesSent: transport?.relayFrameCounts?.sent,
```

Kèm 1 dòng cảnh báo ở `idleWindowStartLocked()` — tên nói `Locked` nhưng hàm **TỰ lấy `flowLock`**
(bẫy cùng loại, chưa sập nhưng sẽ sập nếu ai gọi trong vùng khoá).

## E. Cổng chặn đã dựng (chứng minh hai chiều)

| Cổng | Bắt gì | Chứng minh |
|---|---|---|
| `python3 scripts/ios-lint-locks.py` | gọi hàm có `flowLock.lock()` trong lúc đang giữ khoá | bản sửa ⇒ **ĐẠT** (59 vùng khoá, 40 hàm lấy khoá, 0 lời gọi lồng); cố ý đặt lại lỗi cũ ⇒ **KHÔNG ĐẠT**, chỉ đúng dòng |
| `python3 scripts/ios-log-acceptance.py <relay.log>` | phiên có nhịp lấy mẫu/nhịp tim chết | build 24 ⇒ **ĐẠT** (36 mẫu, 4 nhịp); build 25→34 ⇒ **KHÔNG ĐẠT** (12/13 phiên, in rõ "NHỊP LẤY MẪU CHẾT … mẫu cuối ở +15s rồi im 173s") |
| `bash scripts/ios-pure-logic-tests/run.sh` | logic thuần | 389/389 PASS |
| `bash scripts/ios-verify-ipa.sh … --version 1.4.5 --build 35` | IPA rỗng credential / sai profile | **ĐẠT** (credential 21+12, 9 UDID, `get-task-allow=false`) |

## F. Tiêu chí nghiệm thu build 35 (đọc bằng `relay.log`)

1. `bw: sample` **chạy tới hết phiên** (không còn "2 dòng rồi im") — đây là dấu hiệu quyết định.
2. Có `giám sát sống-còn: nhịp N — …` đều ~60 s.
3. Đổi mạng Wi-Fi→5G (và ngược lại): ≤ ~7 s có `bw: net đổi giữa phiên …` **và**
   `bw: đổi mạng ⇒ dựng lại transport … kết quả: ok declared up=8000 down=12000`, **đúng 1 lần**,
   **không** có `giám sát: QUYẾT ĐỊNH TỰ GỠ tunnel`.
4. Phiên mở lại sau khi link đứt cũng phải sinh đánh giá: `bw: ws-relay mở lại sau khi đứt …`.
5. Thẻ Diagnostics: số ↓/↑ nhảy theo tải thật (không đứng im).
