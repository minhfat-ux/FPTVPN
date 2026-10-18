# BÀN GIAO — làm tiếp tính năng N-tunnel (iOS) + Settings

**Trạng thái: NỀN XONG, CHƯA NỐI VÀO APP.** Build 68/69 = core production N=1 + sửa treo
"Disconnecting…". Chưa có gì hút băng thông, chưa có công tắc Settings.

## Đã xong (đừng làm lại)

| Hạng mục | Ở đâu |
|---|---|
| Core N-tunnel build riêng | `build/frameworks-multitunnel/Multitunnel{,-macos}.xcframework` (symbol `MultitunnelConnect/Serve/Stop/ConnectSlot`, gVisor 3456) |
| Source core mới | `tools/hysteria-multitunnel/mobile.go` + `build.sh` |
| Core production KHÔNG bị đụng | `tools/hysteria-android/mobile.go` (0 dấu vết) |
| Shim chọn core | `iOS/PrivateVPNPacketTunnel/HysteriaTransport.swift` — `CoreConnect/CoreServe/CoreStop`, chọn bằng `#if canImport(Multitunnel) && !canImport(Hysteria)` |
| Đường build core không cần GitHub | `HYSTERIA_SRC=/tmp/hysteria-apple/hysteria` (goproxy.cn; app/core/extras **cùng tag v2.12.2**; `/tmp` mất khi reboot ⇒ dựng lại theo commit `3389ee1`/`acf1ea1`) |
| Sửa treo "Disconnecting…" | `ea86fa7` — build 69, đã cài 3 máy |

## Việc còn lại — đúng 3 bước

### B1. Mở N transport song song (`HysteriaTransport.swift`)
Kiến trúc hiện tại: **1** `WSRelayClient` (bridge UDP nội bộ) → 1 `sockFd` → 1 `MobileConnect(host:"127.0.0.1", port: localPort)`.
Với N tunnel: tạo **N** bridge (N cổng UDP nội bộ, N kết nối WS tới `…/relay/vn1hy`), gọi
`CoreConnectSlot(i, "127.0.0.1", port_i, password, obfs, fd_i|0, sockTcp, up, down)` cho từng cái,
rồi **MỘT** `CoreServe(tunnelFd…)` duy nhất — vì `multiClient` trong Go đã chia **luồng** cho N client
(không cần N cầu `packetFlow↔fd`).

**BẤT BIẾN:** mọi tunnel phải **cùng exit node** (F3). Nếu trộn `vn1hy` + `vn3hy` thì IP khách đổi giữa
phiên ⇒ hỏng đăng nhập/thanh toán. Muốn N>1 thì lặp cùng một relay/hostname (api + t1 **cùng node** thì được).

### B2. Settings (mặc định TẮT)
- Công tắc "N tunnel" + chọn N (2/4), lưu vào **App Group** `G6XW3RN6LJ.com.privatevpn.shared` để extension đọc.
- Giới hạn theo SSID (bộ nhớ băng thông đã khoá theo `wifi|ssid:…` — dùng cùng khoá).
- Bật/tắt phải áp ở **lần kết nối sau** (đổi N giữa phiên = dựng lại transport).

### B3. Build THỬ link một mình core mới
`project.yml` dòng ~236: `- framework: iOS/Frameworks/Hysteria.xcframework` → `build/frameworks-multitunnel/Multitunnel.xcframework`.
Shim tự chuyển nhánh. **Không link cả hai** (binary phình gấp đôi).
Sau đó: `ios-typecheck.sh` **KHÔNG đủ** (đã có ca PASS mà archive FAIL vì `NSErrorPointer`) ⇒ phải archive thật.

## Nghiệm thu (bắt buộc theo thứ tự)
1. **N=1 phải y hệt build 69** — so `Δ1phút vào/ra`, `bridge: nhịp vào`, `bw: measured`.
2. **N=4**: kỳ vọng `Δ1phút ra` và tốc độ tải **tăng nhiều lần** (mốc HTTPS: 1 luồng ~4–12 Mbps, 8 luồng 72–81 Mbps).
   Nếu **không tăng** ⇒ trần nằm ở tầng relay/WS, phải xử lý phía server trước.
3. `ios-log-acceptance.py --crash-dir` cho phiên dài.

## Lưu ý
- Bản **đang phát** vẫn là **1.4.7/66** (lock ghim 66). Mọi build 67–69 là bản thử, **chưa publish**.
- `tools/hysteria-android/mobile.go` là core **dùng chung với Android** ⇒ khi đổi core thì AAR Android
  phải được **harness Windows** build lại.
- Không deauth/ARP-spoof để giành băng thông của thiết bị khác (giới hạn đã ghi trong
  `docs/RESEARCH_SHARED_NETWORK_BANDWIDTH_2026-10-19.md` §6).
