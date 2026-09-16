# Android tốn CPU — điều tra & TODO (2026-09-17)

> Trạng thái: **CHƯA SỬA GÌ**. Tài liệu này là kết quả điều tra tĩnh (đọc code) + đề xuất, chờ chủ dự
> án duyệt mới làm. Chưa đo được trên máy thật vì (a) chưa có điện thoại kết nối, (b) JDK trên Mac
> hỏng nên chưa build lại APK (`/Library/Java/JavaVirtualMachines/temurin-17.jdk` — `libjvm.dylib` 0 byte).

## 1. Đường dữ liệu thực tế của app (đã xác minh)

- App chạy **Hysteria mode**: `Config.HYSTERIA_MODE = true` (`android/.../Config.kt:123`) → `VPNManager`
  khởi động `HysteriaVpnService` (`VPNManager.kt:122,322,350`). Nhánh WireGuard (`GoBackend`,
  `WGRelay`) **không chạy** — chỉ còn cho chế độ legacy.
- Nhân native: `android/app/libs/hysteria.aar` → `jni/*/libgojni.so` (~20MB/ABI). Chuỗi trong `.so` cho thấy:
  `apernet/hysteria/core/v2/...`, `github.com/apernet/sing-tun`, `gVisor`, `quic-go`,
  `obfs.salamanderObfuscator`, `internal/congestion/brutal.BrutalSender`.
- Nghĩa là mỗi gói đi qua: app → TUN (`establish()`, MTU **1500**) → **sing-tun/gVisor (TCP/IP trong
  user space)** → **QUIC (quic-go) + obfs salamander** → socket UDP/TCP đã `protect()` → node.
  Đường dự phòng đẩy qua cầu WebSocket của OkHttp (`WSRelayBridge`) rồi mới ra UDP tới node.
- Đây là kiến trúc **nặng CPU theo thiết kế** (userspace TCP/IP + mã hoá QUIC + obfs, nhân theo số gói).

## 2. Chỗ tốn CPU/battery tìm được (kèm bằng chứng)

| # | Vấn đề | Bằng chứng | Ảnh hưởng | Mức |
|---|---|---|---|---|
| 1 | **MTU TUN = 1500** trong khi đi QUIC và đi qua cầu WS | `HysteriaVpnService.kt:1083` (`HY_MTU = 1500`), `:598 builder.setMtu(HY_MTU)`, `:530/582 Mobile.serve(..., HY_MTU, ...)` | Gói 1500 byte vào QUIC phải phân mảnh; đường WS còn thêm overhead frame ⇒ dễ vượt path MTU ⇒ mất gói/retransmit ⇒ tốn CPU + chậm | Cao |
| 2 | **Vòng probe 15s chạy 24/7**, kể cả khi tắt màn hình: 2 TCP connect + 1 HTTP GET *xuyên tunnel* + 1 DNS query *xuyên tunnel* + 4 dòng log mỗi lượt | `HysteriaVpnService.kt:788-844`, `PROBE_INTERVAL_MS = 15_000` (`:991`), `probeRelayReachable()`, `probeThroughTunnel()` | ~240 lượt/giờ; mỗi lượt dựng kết nối qua gVisor+QUIC và **đánh thức radio**; sinh lưu lượng thật mỗi 15s | TB |
| 3 | **Ghi log mở/ghi/đóng file cho TỪNG dòng** + `Log.println` luôn bật (cả bản release) | `diag/DiagnosticsLog.kt:80-93` (`f.appendText(line)` mỗi lần gọi); 62 chỗ gọi `DiagnosticsLog.log/warn` | Syscall + IO mỗi sự kiện, kể cả trên đường nóng | TB |
| 4 | **Brutal CC khai báo cứng** up/down | `Config.kt:133-134` (2000/20000 kbps), `:142-143` (800/4000 cho đường WS) | Mạng lossy: Brutal bơm đúng theo số khai ⇒ retransmit + CPU; mạng nhanh: tự bóp tốc độ | TB |
| 5 | Heartbeat API mỗi 30s | `VPNManager.kt:541-546` (`delay(30_000)`) | Đánh thức radio/CPU định kỳ | Thấp |
| 6 | Đường **WS relay**: mỗi datagram = 1 frame WebSocket + cấp phát bộ đệm 2 chiều + 2 chặng user space | `WSRelayBridge.kt:103-143`, `WGRelay.kt:76-117` | Khách ở Trung Quốc (buộc đi đường WS) tốn CPU nhất | TB (chỉ WS) |
| 7 | 31 chỗ `Log.e("VPNFLOW_DEBUG", …)` còn trong bản phát hành | `grep -rc 'Log\.(e|d|w|i)\('` = 31 | logcat luôn ghi; CPU nhỏ, nhưng lộ thông tin hạ tầng | Thấp |
| 8 | **Không có nhận biết màn hình tắt**: không dùng `PowerManager`/`WakeLock`/`WorkManager` (grep = 0 kết quả) | toàn bộ `app/src/main/java` | Probe + heartbeat vẫn chạy khi màn hình tắt ⇒ tốn pin | TB |

## 3. Giả thuyết nguyên nhân chính (xếp theo khả năng)

1. **Bản chất đường dữ liệu** (gVisor + QUIC + obfs): CPU tăng theo lưu lượng, 20-50 Mbps thường đã
   chiếm ~1 nhân. Nếu CPU cao **khi đang dùng** ⇒ đây là gốc; mục 1 và 4 làm nặng thêm.
2. **Vòng probe + log** (mục 2, 3, 8) + heartbeat (5): nếu CPU/pin cao **khi treo máy, không dùng** ⇒
   đây là gốc.
3. **Đường WS relay** (mục 6): nếu máy khách bị chặn IP và phải đi qua WS ⇒ gốc là cầu WS.
4. **Rò rỉ transport cũ**: client Go chưa dừng hẳn rồi đã mở client mới ⇒ 2 đường cùng chạy ⇒ CPU gấp
   đôi. Dấu hiệu trong code: `HysteriaVpnService.kt:657` "client still stopping after transport
   teardown -> retry in 800ms". Cần đo trên máy để xác nhận.

## 4. Cách đo để chốt nguyên nhân (làm trước khi sửa)

```bash
adb shell pidof com.privatevpn.app
# Thread nào ăn CPU (Go/QUIC/gVisor nằm cùng process, tên thread sẽ lộ ra)
adb shell top -H -p <pid> -o PID,TID,CPU%,NAME -n 1 | head -30
adb shell dumpsys cpuinfo | grep -i privatevpn
adb shell dumpsys batterystats --charged com.privatevpn.app | head -60
adb logcat -s VPNFLOW_DIAG | grep -c "probe#"   # tần suất probe thực tế
```

Ba kịch bản, mỗi kịch bản 2 phút: (a) VPN tắt, app ở nền; (b) VPN bật, KHÔNG dùng gì; (c) VPN bật +
speedtest. So sánh %CPU và danh sách thread giữa 3 kịch bản.

## 5. Đề xuất (chờ duyệt — xếp theo "được nhiều / ít rủi ro")

- **A. MTU 1500 → 1280-1350** (TUN + đường WS). Rủi ro thấp, sửa 1 dòng; giảm phân mảnh/retransmit.
- **B. Giãn nhịp probe**: 15s → 60s khi tunnel khoẻ (tự quay lại 15s khi có sự cố), bỏ probe khi màn
  hình tắt mà vẫn có lưu lượng; gộp 4 dòng log → 1 dòng/lượt. Rủi ro thấp.
- **C. Log có buffer**: ghi file theo buffer + flush 5s/lần (1 writer thread), logcat chỉ khi build
  debug. Rủi ro thấp.
- **D. Cầu WS**: gộp nhiều datagram vào 1 frame (batch theo 4-8 gói hoặc 5ms), tái dùng bộ đệm.
  Rủi ro TB (đụng đường dự phòng của khách TQ ⇒ phải test kỹ).
- **E. Congestion control**: thử BBR (`up/down = 0`) hoặc hạ số khai; đo lại tốc độ + CPU. Rủi ro TB.
- **F. Heartbeat 30s → 90-120s** (hoặc chỉ gửi khi có hoạt động). Rủi ro thấp.
- **G. (Lớn) So lại Hysteria vs WireGuard-over-TCP** cho thị trường không bị chặn: WG user space rẻ CPU
  hơn nhiều (không có gVisor TCP stack, không QUIC crypto). Chỉ làm nếu cần tối ưu sâu.

## 6. Việc cần làm trước (blocker)

- [ ] Cài JDK 17 trên Mac để build lại APK (JDK hiện tại hỏng).
- [ ] Có 1 máy Android (hoặc log/báo cáo từ khách: máy gì, Android mấy, đang bật VPN hay không, CPU bao
      nhiêu %) để chạy mục 4.

## 7. TODO (thứ tự đề xuất)

1. [ ] Cài JDK 17, build APK debug.
2. [ ] Đo 3 kịch bản mục 4, ghi số liệu vào tài liệu này.
3. [ ] Chốt nguyên nhân chính theo số liệu (mục 3).
4. [ ] Làm A + B + C (rủi ro thấp) → đo lại, so trước/sau.
5. [ ] Nếu chưa đủ: D (nếu khách TQ) / E / F.
6. [ ] Cân nhắc G nếu cần tối ưu sâu.

## 8. Nhật ký đo

| Ngày | Máy / Android | Kịch bản | %CPU (app) | Thread ăn nhiều nhất | Ghi chú |
|---|---|---|---|---|---|
| — | — | — | — | — | chưa đo |
