# iOS: bấm Connect là quay tít, không lên — tìm ra nguyên nhân gốc và sửa (20/10/2026)

**Trạng thái:** ĐÃ SỬA, đã kiểm trên iPhone thật (build 85). Chờ chủ dự án chốt phát hành.
**Phiên bản liên quan:** iOS 1.4.7 build 81 → 84 (hỏng), build 85 (đã sửa).
**Từ khoá:** Connect quay vô hạn, nuốt cú bấm, `state.isTransitioning`, `ConnectTrace`.

## 1. Triệu chứng khách báo

> "vẫn chỉ quay tít mà không connect được"

Bấm Connect: nút quay, banner "đang chuẩn bị quyền VPN" hiện, **không** báo lỗi, **không** lên Connected.
Không có cách nào thoát ngoài force-quit app.

## 2. Bằng chứng thu được (máy thật, iPhone `33987D6F`)

### 2a. Phía extension: KHÔNG hề có phiên nào
`relay.log` trong container của extension dừng ở `build=81`. Sau khi cài build 82/83, **không có dòng
`build: version=` nào** ⇒ `startVPNTunnel()` không bao giờ được gọi. (Đây là lý do ban đầu nghi oan
việc link `Multitunnel.xcframework` ở build 82 — **nghi oan**, xem §3.)

### 2b. Phía app: log im lặng tuyệt đối
`Documents/app.log` có `NE status=1` (disconnected) lúc mở app, rồi **không thêm dòng nào** sau cú bấm.
Đường `connect()` có bốn chỗ `await`/lời gọi không ghi log ⇒ không phân biệt được chỗ nào treo.

### 2c. Gắn dấu vết từng bước (build 84) — chỉ đúng chỗ treo
Thêm `ConnectTrace` (`.privatevpn`/`AppDiagnostics.swift`): mỗi bước một mốc vào `app.log`, cộng một
đồng hồ canh chạy trong `Task.detached` (ngoài MainActor) để vẫn ghi được **kể cả khi main thread bị
chặn**. Kết quả đo trên iPhone:

```
13:35:29.362  connect⏱  · loadAllFromPreferences OK — 1 profile, khớp=true
13:35:30.887  connect⏱  · bỏ qua: state đã .connecting (chống bấm đôi)
13:35:39.627  connect⏱ TREO 8.7s ở bước: vào connect() [tag=build-84]
13:35:43.917  connect⏱ TREO 13.0s ở bước: vào connect()
13:35:47.978  connect⏱ TREO 17.1s ở bước: vào connect()
```

Đọc ra ba điều, đủ để chốt nguyên nhân:
1. Đồng hồ canh **vẫn ghi được** ⇒ **main thread KHÔNG bị chặn** (loại bỏ giả thuyết
   `CLLocationManager` treo).
2. Mốc đứng ở `vào connect()` ⇒ hàm `return` **trước** dòng `mark` đầu tiên.
3. Dòng `bỏ qua: state đã .connecting` chứng minh `state` **đã** là `.connecting` khi vào chốt —
   trong khi 1.5 s trước đó `refreshStatus()` vừa đặt `.disconnected`.

## 3. Nguyên nhân gốc

Commit `26c0f37` ("nút Connect quay NGAY khi bấm") thêm dòng này **phía TRÊN** chốt chống bấm đôi:

```swift
if state == .disconnected || state == .failed { state = .connecting }   // (A)
...
if state.isTransitioning {
    if state == .connecting { return }                                  // (B) — nuốt cú bấm
```

`(A)` đặt `.connecting`; `(B)` là câu lệnh **kế tiếp** nên nhìn thấy đúng trạng thái vừa đặt và
`return`. Kết quả: **mọi cú bấm đầu tiên đều bị nuốt**, `state` kẹt `.connecting` vĩnh viễn, nút
quay mãi, các cú bấm sau bị `(B)` chặn tiếp ⇒ không có log, không có lỗi, không có tunnel.

Vì sao build 80 chạy được mà 81 trở đi hỏng: `26c0f37` vào cây nguồn **sau** build 80 nhưng **trước**
build 81. `relay.log` khớp: phiên `startVPNTunnel()` thành công cuối cùng là **build 80** (11:43:22);
từ build 81 (11:43:44) trở đi không còn phiên nào.

## 4. Cách sửa (build 85)

1. **Xoá `(A)`** — chỉ còn **một** chỗ đặt `.connecting`, nằm **sau** chốt, ngay trước
   `requestWiFiInfoPermissionIfNeeded()` ⇒ vẫn đạt mục đích ban đầu (nút quay trước hộp thoại xin
   quyền) mà không tự chặn mình.
2. **Chốt chống bấm đôi dựa trên cờ THẬT** `connectInFlight`, không suy từ `state`. Cờ được nhả
   bằng `defer` ⇒ mọi đường `return`/`throw` đều nhả; app **không còn đường nào tự khoá vĩnh viễn**.
3. Giữ nguyên `ConnectTrace` (dấu vết + đồng hồ canh) — rẻ, và là thứ duy nhất phân biệt được các
   ca "treo im lặng" sau này.

## 5. Bằng chứng bản sửa (build 85, iPhone thật)

`Documents/app.log`:
```
13:40:35.078 connect⏱  · cấp cấu hình qua control plane https://api.meetflowai.site
13:40:36.919 connect⏱ đăng ký thiết bị xong — chọn exit node
13:40:37.048 connect⏱ đã chọn exit node (node-1) — lưu bộ nhớ cấu hình
13:40:37.097 connect⏱ đã ghi preferences — gọi startVPNTunnel()
13:40:37.097 connect⏱ KẾT THÚC sau 2.06s — startVPNTunnel() đã trả về OK
```

`relay.log` (container extension):
```
13:40:37.195 build: version=1.4.7 build=85 …
13:40:43.333 ws-relay: handshake ok — connected to wss://api.meetflowai.site/relay/vn1hy
13:40:48.593 giám sát: XÁC NHẬN tunnel có mạng thật sau 5.0s — TCP handshake hoàn tất 8 lần
```

Tổng thời gian từ bấm tới `startVPNTunnel()`: **2,06 s**. Phiên dừng lúc 13:40:52 là do chủ dự án bấm
Disconnect (`Disconnect: app gọi stopVPNTunnel() (người dùng bấm)`), không phải tự rớt.

## 6. Hai việc phát sinh từ ca này

1. **Cổng `scripts/ios-typecheck.sh` đã được siết**: trước đây chạy `swiftc -typecheck` **không** kèm
   `-swift-version 6` trong khi `project.yml` khai `SWIFT_VERSION: "6.0"` ⇒ lọt đúng lớp lỗi Swift 6.
   Ca thật: build 84 **PASS cổng typecheck** nhưng **archive FAIL**
   (`instance method 'unlock' is unavailable from asynchronous contexts`).
   Nay cổng chạy chế độ Swift 6. Đã chứng minh hai chiều bằng một tệp mẫu: chế độ 6 báo **4 lỗi**,
   chế độ 5 báo **0**.
2. **Nghi vấn "link `Multitunnel.xcframework` làm extension không khởi động" ở build 82 là SAI.**
   Nguyên nhân thật là bug nuốt cú bấm ở §3. Việc N tunnel chưa chạy được vẫn cần kiểm lại trên một
   bản thử riêng, nhưng **không** phải vì lý do đã ghi trong biên bản trước.

## 7. Việc còn lại (chưa làm, cần chủ dự án chốt)

- Khai báo băng thông: bản 85 đã **bỏ phép nhân ×N** (khai theo đúng số đo MỘT luồng — 3.067 kbps
  trên mạng toà nhà), vì ×N chỉ đúng khi số tunnel THẬT SỰ mở = N. Hệ quả đo được: trần mềm của
  phiên ≈ 2,6 Mbps ⇒ **chưa đủ để xem FPT Play**. Muốn vượt trần "mỗi luồng" của mạng toà nhà phải
  có N tunnel thật (số đo cũ: 1 luồng 4–12 Mbps, 8 luồng 72–81 Mbps).
- N tunnel: dựng lại trên **nhánh/bản thử riêng**, xác nhận có ≥N dòng `handshake ok` và `observed`
  khác 0 trước khi bật mặc định.
