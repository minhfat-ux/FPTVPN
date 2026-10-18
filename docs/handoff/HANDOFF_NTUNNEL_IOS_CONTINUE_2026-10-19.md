# BÀN GIAO — N-tunnel (hút băng thông) + Settings · iOS

**Trạng thái: NỀN XONG · CHƯA NỐI VÀO APP.** Bản đang phát là **1.4.7/66**; các build 67–69 là bản thử.

---

## 0. 🔴 ĐỌC TRƯỚC — LỖI NGHIÊM TRỌNG VỪA PHÁT HIỆN (đã sửa, CHƯA build lại)

Trong `HysteriaTransport.swift` nhánh core cũ:

```swift
@inline(__always) private func CoreStop() { CoreStop() }   // ← ĐỆ QUY VÔ HẠN (bug của tôi)
```

Nguyên nhân: khi thêm shim, tôi thay hàng loạt `MobileStop()` → `CoreStop()` bằng chuỗi thay thế,
và nó **đổi luôn phần thân của chính hàm wrapper** ⇒ `CoreStop()` gọi chính nó. Swift **compile
bình thường** (typecheck 0 lỗi) nên lọt qua cổng.

**Hệ quả:** mọi lần ngắt kết nối đều gọi `CoreStop()` ⇒ đệ quy vô hạn ⇒ tràn stack / treo.
**Đây rất có thể là nguyên nhân THẬT của "Disconnecting…" quay mãi ở build 68/69** — không phải
(hoặc không chỉ) `resourceTimer` như chẩn đoán ban đầu.

Đã sửa thành `{ MobileStop() }`. **Việc đầu tiên của phiên mới: build lại và nghiệm thu ngắt kết nối.**
Bài học: **thay thế chuỗi hàng loạt trên tên hàm wrapper rất dễ tự ăn vào thân hàm** — khi thêm shim
phải grep lại `private func Core` để chắc thân hàm vẫn gọi C thật.

---

## 1. Đã xong — ĐỪNG LÀM LẠI

| Hạng mục | Ở đâu / ghi chú |
|---|---|
| Core N-tunnel build riêng | `build/frameworks-multitunnel/Multitunnel{,-macos}.xcframework`; symbol `MultitunnelConnect/Serve/Stop/ConnectSlot`; gVisor 3456 |
| Source core mới | `tools/hysteria-multitunnel/mobile.go` (package `multitunnel`) + `build.sh` |
| Core production **không bị đụng** | `tools/hysteria-android/mobile.go` — 0 dấu vết |
| Shim chọn core | `HysteriaTransport.swift`: `CoreConnect/CoreServe/CoreStop/CoreConnectSlot` + `CoreSupportsMultiTunnel` |
| Đọc N từ Settings | `HysteriaTransport.configuredTunnelCount()` — App Group `G6XW3RN6LJ.com.privatevpn.shared`, key `multiTunnelCount`, kẹp 1…8, core cũ ⇒ luôn 1 |
| Đường build core KHÔNG cần GitHub | `HYSTERIA_SRC=/tmp/hysteria-apple/hysteria` (goproxy.cn; **app/core/extras cùng tag v2.12.2**) |

### 3 bẫy đã gặp khi dựng core (để không mất thời gian)
1. `core/extras` phải **cùng số tag** với `app` (v2.12.2). Chọn `core@v2.5.2` ⇒ lỗi
   `undefined: congestion.InitialPacketSizeIPv4`.
2. `tools/hysteria-multitunnel/build.sh` phải trỏ `patch_gvisor.py`/`prepare_sing_tun.py` sang
   `tools/hysteria-apple/`, và phải `mv $SRC/app/mobile $SRC/app/multitunnel` trước khi bind.
3. Header gomobile đổi tên theo package: `Multitunnel.objc.h` (không phải `Mobile.objc.h`).

---

## 2. Việc còn lại — 3 bước

### B1. Mở N transport song song — `HysteriaTransport.swift`
Kiến trúc hiện tại: **1** `WSRelayClient` → 1 cổng UDP nội bộ → 1 `CoreConnect(127.0.0.1, port)`.

Với N: tạo **N** `WSRelayClient` (cùng relay URL), mỗi cái một cổng UDP, rồi
`CoreConnectSlot(i, "127.0.0.1", port_i, password, obfs, 0, false, up, down)` cho từng cái.
Vẫn **MỘT** `CoreServe(tunnelFd…)` — vì `multiClient` trong Go chia **luồng** cho N client
(không cần N cầu `packetFlow↔fd`). Giữ `WSRelayClient` trong một mảng để không bị dealloc,
và **stop hết** trong `stop()`/`discardAttempt()`.

**BẤT BIẾN F3:** mọi tunnel phải **cùng exit node**. Được lặp cùng `vn1hy` (hoặc `api`+`t1` cùng node);
**không** trộn `vn1hy` + `vn3hy` (IP khách đổi giữa phiên ⇒ hỏng đăng nhập/thanh toán).

### B2. Settings (mặc định TẮT)
Công tắc bật + chọn N (2/4) → ghi `multiTunnelCount` vào App Group. Giới hạn theo SSID (bộ nhớ
băng thông đã khoá theo `wifi|ssid:…`). Đổi N **chỉ áp ở lần kết nối sau**.

### B3. Build thử link MỘT MÌNH core mới
`project.yml` (~dòng 236): `iOS/Frameworks/Hysteria.xcframework` → `build/frameworks-multitunnel/Multitunnel.xcframework`.
Shim tự chuyển nhánh. **Không link cả hai** (binary phình gấp đôi).
⚠️ `ios-typecheck.sh` **KHÔNG đủ** (đã có ca PASS mà archive FAIL vì `NSErrorPointer`) ⇒ **phải archive thật**.

---

## 3. Nghiệm thu (theo đúng thứ tự)

1. **Ngắt kết nối** phải xong ngay (hết "Disconnecting…") — kiểm cái này TRƯỚC, nó là lỗi đang chặn.
2. **N=1 phải y hệt 69**: so `Δ1phút vào/ra`, `bridge: nhịp vào`, `bw: measured`.
3. **N=4**: kỳ vọng `Δ1phút ra` và tốc độ tải tăng nhiều lần. Mốc HTTPS đo thật (19/10):
   1 luồng **4–12 Mbps**, 8 luồng **72–81 Mbps** (lặp 3 lần, đúng cả trên Cloudflare lẫn relay mình).
   **Không tăng** ⇒ trần ở tầng relay/WS ⇒ phải xử lý phía server trước.
4. `ios-log-acceptance.py <relay.log> --crash-dir <dir>` cho phiên dài.

---

## 4. Bối cảnh & giới hạn

- Lý do làm tính năng: mạng **chung tòa nhà**, giới hạn theo **TỪNG KẾT NỐI**, không phải băng thông.
  Chi tiết + phép đo: `docs/RESEARCH_SHARED_NETWORK_BANDWIDTH_2026-10-19.md`.
- **Không** deauth/ARP-spoof/DHCP-starvation để giành phần của thiết bị khác (giới hạn ở §6 tài liệu nghiên cứu).
- `tools/hysteria-android/mobile.go` dùng chung với Android ⇒ khi đổi core, AAR Android phải do
  **harness Windows** build lại.
- Trạng thái máy: cả 3 thiết bị (iPhone, iPad, iPad Nanshan) đang **1.4.7/69**. Bản phát hành **1.4.7/66**,
  release-lock ghim 66 — **đừng publish** bản thử.

## 5. Commit liên quan
`3389ee1` (core N-tunnel ban đầu) · `acf1ea1` (tách core riêng) · `8fa3322` + `4c36a3e` (shim + sửa
`NSErrorPointer`) · `ea86fa7` (sửa treo Disconnecting: resourceTimer + queue riêng) · *(commit kế: sửa đệ quy CoreStop)*
