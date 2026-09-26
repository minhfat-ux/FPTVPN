# Nghiệm thu sau OTA — iOS 1.4.6 (build 57) trên iPhone: **KHÔNG ĐẠT** (1/4 phiên)

- **Thiết bị:** iPhone 14 Pro Max `iPhone15,3` (`33987D6F-…`) · `devicectl`: available (paired)
- **Bản:** `1.4.6 / 57` · binary `2026-09-26 13:55:56` · đúng sha artifact đã phát (`a4fec707…`)
- **Log:** `/tmp/t57b/relay.log` (423.014 B, 1675 dòng, **4 phiên**) · crash-dir 10 file
- **Cổng:** `scripts/ios-log-acceptance.py` ⇒ **exit 1 — KHÔNG ĐẠT**

## Kết quả từng phiên

| # | Build | Bắt đầu | Dài | Kết quả | Chi tiết |
|---|---|---|---|---|---|
| 1 | `?` (trước mốc build) | 13:27:30 | 1964 s | ✅ | mẫu=187 · nhịp-tim=32 · tự-gỡ=0 · tb≈5 kbps |
| 2 | **57** | **14:00:22** | 1250 s | ❌ | **WATCHDOG CÂM: 0 nhịp tim trong 131 s** + WS link đóng 2 lần · mẫu=85 · nhịp-tim=7 · tb≈3 kbps |
| 3 | 57 | 14:48:41 | 173 s | ✅ | mẫu=16 · nhịp-tim=2 · tb≈58 kbps |
| 4 | 57 | 14:54:09 | 147 s | ✅ | mẫu=14 · nhịp-tim=2 · tb≈63 kbps |

Jetsam/crash: **16 file của extension đều NGOÀI khoảng log** (mới nhất 25/09 21:47) ⇒ không quy cho phiên nào trong 4 phiên này.

## Phiên 2 (❌) — nguyên nhân có tên

```
14:18:53.970 giám sát sống-còn: máy đang xin dữ liệu (64 gói/nhịp) mà chiều về chỉ 3084 byte/nhịp
             (~1 kbps) trong 2 nhịp liên tiếp — node sống nhưng KHÔNG chở ⇒ TỰ DỰNG LẠI transport
14:19:02.528 giám sát sống-còn: transport vừa thay (tự phục hồi sống-còn) — bật lại watchdog với mốc mới
14:19:02.528 giám sát sống-còn: bật SUỐT phiên — nhịp 15s ...
        ↓  KHÔNG còn dòng `giám sát sống-còn: nhịp` nào nữa
14:21:13.014 stopTunnel: reason=1        ← chủ dự án tự tắt
```

**Hai bất thường trong phiên 2:**

1. **Watchdog KHÔNG BAO GIỜ đánh nhịp lại sau khi tự dựng lại transport.** Nó tự khai "bật lại watchdog với mốc mới" lúc 14:19:02, nhưng suốt **131 s** còn lại (đến 14:21:13) **0 nhịp tim**. Trong khi đó `ws-relay: heartbeat` và `bridge:` vẫn in bình thường ⇒ **không phải khoá toàn cục** (bw sample vẫn chạy tới 14:21:03) — chỉ **nhịp sống-còn chết**. Hệ quả: hết khả năng tự phục hồi cho phần còn lại của phiên.
2. **Bão RST:** `TCP sức khoẻ: SYN vào 118 → RST về 77` (14:19:09), `SYN 133 → RST 77`, `SYN 141 → RST 100` — **~70% kết nối bị RST**. Kèm `checksum sai 120`. Đây chính là "test IP chạy không ra ngay". Đối chiếu phiên 4 (hiện tại): `SYN 117 → SYN-ACK 117, RST 1`, `checksum sai 8` ⇒ sạch.

## Phiên hiện tại (14:54:09+) — khoẻ

```
14:54:22.219 giám sát: XÁC NHẬN tunnel có mạng thật sau 5.0s — TCP handshake hoàn tất 5 lần
14:56:16.018 TCP sức khoẻ: SYN vào 106, SYN-ACK về 106, RST về 1
            net=cell|if:pdp_ip0   (đang ở dữ liệu di động, đúng như chủ dự án nói)
            IPv6-chặn 305  (8% số gói vào là IPv6 bị TỪ CHỐI chủ động — P2 chạy)
```

## "Bị bóp"? — KHÔNG phải van bộ nhớ

- `reason=memory`: **0 lần** trên iOS (đối chiếu macOS cùng ngày: có, `ctx=memory`). ⇒ **van bộ nhớ KHÔNG ghì trên iOS**.
- Lý do đổi số khai chỉ có: `ramp` 45 · `rawline` 24 · `clamp` 11.
- `bw: sample ... observed=28..124 declared=12000 ... realLoad=0` + `bw: KHÔNG hạ số khai — mẫu chưa đủ TẢI THẬT ... mẫu có tải 0/12` ⇒ `observed` thấp là vì **ít tải thật**, không phải bị hạ trần.

**Ma sát thật đo được ở phiên hiện tại:** `bỏ 383/3785 gói` (10% bị bỏ ở chiều `packetFlow→Go`) và `IPv6-chặn 305` (8% gói là IPv6 phải lùi về IPv4). Hai thứ này cộng lại đủ để "không ra ngay", nhưng **không** phải nghẽn/bóp.

## Kết luận & hệ quả

- **§2c + điều kiện ngoại lệ: CHƯA ĐẠT.** Điều kiện chủ dự án đặt ra khi phát là *"test 5G ngay sau khi cài OTA; thất bại thì bản phải bị THAY hoặc GỠ"* — phiên 2 của build 57 **thất bại**.
- **Chưa kết luận được tần suất**: 1/3 phiên build 57 lỗi. Cần thêm phiên (đặc biệt **phiên có tự dựng lại transport**) để biết là cá biệt hay hệ thống.
- **Giả thuyết mạnh nhất:** đường `tự phục hồi ⇒ TỰ DỰNG LẠI transport` **không bật lại được nhịp sống-còn** — trùng đúng vùng bất biến AGENTS §7c cảnh báo (build 25→34 từng chết vì khoá lồng ở nhịp watchdog; build 29 từng "tự ngắt rồi không nối lại được" ở đường dựng lại transport).
