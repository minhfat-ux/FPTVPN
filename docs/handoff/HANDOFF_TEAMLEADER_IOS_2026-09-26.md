# Handoff Teamleader — iOS (26/09/2026)

## 1. Vì sao có buổi review này
iPad **vẫn tự ngắt** sau loạt bản vá 25–26/09. Người dùng đánh giá phần fix **chưa đạt**. Tài liệu này gom **bằng chứng thật** để review, không phải bản biện minh.

## 2. Đã sửa được, CÓ bằng chứng (không phải suy đoán)
| Vấn đề | Bản vá | Bằng chứng đo được |
|---|---|---|
| Deadlock `flowLock` (`NSLock` không tái nhập) trong `livenessStep` → **mọi nhịp** (lấy mẫu 1 s, nhịp tim, đồng hồ canh, diagnostics) chết ở +15 s từ build 25→34 | build 35, commit `8a32543`-series | 26 phiên máy thật: build 24 = 36 mẫu/477 s + 4 nhịp tim (ĐẠT) vs build 25→34 = **2 mẫu rồi im, 0 nhịp tim** (KHÔNG ĐẠT); sau vá: 64–89 mẫu + 5–15 nhịp tim/phiên |
| Crash `CheckedContinuation.resume` (URLSession gọi handler 2 lần khi link bị huỷ) → extension chết giữa phiên | build 43 (`ResumeOnce`) | crash log `PrivateVPNPacketTunnel-2026-09-25-103810.ips` (`EXC_BREAKPOINT` tại `CheckedContinuation.resume(throwing:)`); sau vá: **40 phút theo dõi, 0 crash mới** |
| App tự `stopVPNTunnel()` khi extension báo `noTraffic` → khách thấy "tự ngắt" | build 40 | `app.log` trước: có `Disconnect`; sau: chỉ còn dòng `Connect` |
| `NWPathMonitor` trả interface tunnel (`utun20`) bị nhận nhầm là "ĐỔI MẠNG THẬT" → dựng lại transport → mất gói → tự gỡ tunnel | build 44 (`isTunnelInterface`) | log thật 19:08:27: `net đổi giữa phiên wifi|ssid:ICONLABHOTEL -> other|if:utun20` |
| Không truy được **ai** dừng tunnel | build 45 (`stopTunnel` ghi đồng bộ + app log `NE status=`) | trước: nhiều phiên kết thúc mà log **không có** dòng `stopTunnel` |

## 3. CHƯA sửa được — đây là phần review cần soi
**`BUG-IOS-JETSAM-001` (high, còn open): iOS giết extension ở trần bộ nhớ per-process.**
- Bằng chứng: `JetsamEvent-2026-09-25-190942.ips` — `reason=per-process-limit`, `rpages=3202` ≈ **51 MB**.
- Đo được (nhịp 60 s trong `relay.log`, dòng `tài nguyên:`):
  - iPad **Netflix**: `footprint` **37,9 → 44,5 MB trong ~8 phút** (~**1 MB/phút**), `resident` tới **110 MB**, phiên chết ở 44,5 MB.
  - iPad/iPhone tải nhẹ: **13–14 MB phẳng** suốt 12 phút.
  ⇒ **Rò tỉ lệ với LƯU LƯỢNG**, không theo thời gian.
- **Đã thử và THẤT BẠI**: khối `dọn tài nguyên` (`URLCache.removeAllCachedResponses` + xoá cửa sổ đo) chạy **8 lần, mỗi lần giảm 0 MB** ⇒ đã bỏ ở build 49. **Ghi nhận thẳng: đây là lần thử sai của tôi.**
- Hiện chỉ có **van giảm đau** (build 49/50): footprint ≥ 40 MB **hoặc** leo ≥ 6 MB/5 phút ⇒ `cancelTunnelWithError` hạ tunnel **sạch** để iOS trả mạng (app nối lại ~5 s) thay vì bị giết đột ngột. **Van không phải bản sửa.**

## 4. Nghi phạm chưa loại trừ (cần review độc lập)
1. `iOS/PrivateVPNPacketTunnel/WSRelayClient.swift` → `RelayLink.sendQueued(_:onComplete:)`: `URLSessionWebSocketTask.send` **tự xếp hàng**; máy bơm nhanh hơn đường truyền (Netflix) ⇒ hàng đợi phình không trần.
2. `HysteriaTransport.swift`: nhánh ghi vào fd lỗi (`errno=35`) — gói lỗi có bị **đưa lại hàng đợi không trần**?
3. Bộ đệm khi link đứt: `pendingLink` / `bufferedLink` / `pendingDropped`.
4. Vòng `readPackets` của `NEPacketTunnelFlow`.

## 5. Bằng chứng để review (đường dẫn thật)
- Log máy thật: `/tmp/nf_mon.log`, `/tmp/res_mon.log` (nhịp tài nguyên), `.privatevpn/tmp/ios35-wedge-2026-09-25/ipad-build35-wedge.log` (ca đông cứng 43 phút).
- Bug list: `.privatevpn/status/bugs.json` → `BUG-IOS-JETSAM-001`, `BUG-IOS-ONEWAY-001`, `BUG-IOS-LOGLEAK-001`.
- Cổng tự động: `scripts/ios-lint-locks.py` (bắt khoá lồng nhau — đã chứng minh 2 chiều), `scripts/ios-log-acceptance.py --crash-dir` (bắt ca một-chiều + jetsam/crash), `scripts/ios-pure-logic-tests/run.sh` (453/453).
- Git: nhánh `mac/ios-1.4.5-crash-continuation` (remote `9c23315`); `origin/main` **không** bị đụng.
- Kênh đang phát: iOS **1.4.6 build 50** (sha256 `73b0c145…`, ledger dòng 25).

## 6. Đề xuất cho Teamleader
1. Review độc lập 4 nghi phạm ở §4 (đọc code, không tin log của tôi).
2. Nếu xác nhận hàng đợi gửi không trần: sửa theo hướng **trần cứng + backpressure/drop có đếm**, kèm test thuần logic.
3. Tiêu chí nghiệm thu bắt buộc: Netflix ≥20 phút ⇒ `footprint` **phẳng < 25 MB**, không có dòng `van an toàn bộ nhớ`, không có `JetsamEvent` mới.
4. Cân nhắc: van 40 MB hiện tại có thể **che** mất ca rò trong nghiệm thu ⇒ khi test bản sửa nên **tạm nâng ngưỡng van** để thấy đúng đường cong bộ nhớ.
