# BÀN GIAO — Windows harness port **N-tunnel (hút băng thông)** sang Android

- **Từ:** harness Mac · **Đến:** dev Android trên **Windows harness**
- **Ngày:** 20/10/2026 · **Nguồn tham chiếu (iOS đã chạy thật):** commit `167ba9d`

## 0. Vì sao
Mạng dùng chung (tòa nhà) giới hạn **theo TỪNG KẾT NỐI**. Đo thật 19/10 (cùng mạng, 3 lần lặp):
1 luồng **4–12 Mbps**, 4 luồng 17–29, **8 luồng 72–81 Mbps**. App hiện mở **một** tunnel ⇒ trần ~12 Mbps.
Chi tiết + phép đo: `docs/RESEARCH_SHARED_NETWORK_BANDWIDTH_2026-10-19.md`.

## 1. Phần ĐÃ có sẵn trong repo (dùng lại, đừng viết lại)
- **Core Go N-tunnel:** `tools/hysteria-multitunnel/mobile.go`
  - `multiClient` bọc N `client.Client`, chia **LUỒNG** theo vòng tròn (atomic).
  - `ConnectSlot(slot, …)` = `Connect()` rồi chuyển client vào `slots[slot]`.
  - `Serve()`: **gộp CẢ tunnel chính (`active`) LẪN `slots`** rồi mới bọc `multiClient`.
    ⚠️ Bản đầu chỉ lấy `slots` ⇒ với N=4 mất tunnel chính. Đừng lặp lại lỗi này.
  - Interface hysteria **v2.12.2**: `TCP(addr)`, `UDP()` **(KHÔNG tham số)**, `Close()`.
- **Build script:** `tools/hysteria-multitunnel/build.sh` (đặt package `multitunnel` để symbol
  `Multitunnel*`, không trùng `Mobile*`). Với Android thì đổi lại tên package/module cho khớp AAR,
  hoặc dùng thẳng `tools/hysteria-android/mobile.go` + thêm `multiClient/ConnectSlot`.

## 2. Việc Android phải làm
1. **Core (AAR)**: đưa `multiClient` + `ConnectSlot` vào core Android; `Serve`/`serve(fd,…)` phải gộp
   **active + slots** như trên. Build AAR trên Windows harness rồi cập nhật `android/app/libs/hysteria.aar`.
2. **Service** (`HysteriaVpnService`): mở **N** WS relay bridge (N cổng UDP nội bộ, **cùng exit node**),
   gọi `ConnectSlot(i, …)` N lần, rồi **một** `serve(tunFd, …)` — **không** mở N tun.
3. **Settings Android**: công tắc + chọn N, **mặc định TẮT**; truyền N vào service qua cấu hình nội bộ
   (đừng dùng chung khoá với iOS).
4. **Số khai**: hiện Android khai theo `Config.HY_UP_KBPS/HY_DOWN_KBPS` + ramp. Khi N>1 phải khai theo
   **năng lực tổng** (một-luồng × N) giống iOS, nếu không Brutal bị khoá ở mức một luồng.

## 3. Ba bẫy iOS đã gặp (Android sẽ gặp y hệt)
1. `UserDefaults.integer(forKey:)` trả **0** khi thiếu key ⇒ `?? fallback` không chạy. Bên Android tương
   đương: `SharedPreferences.getInt(key, 0)` — **phải phân biệt "chưa đặt" với "đặt = 0"**.
2. **Go `Serve` bỏ quên tunnel chính** — lỗi thật, đã sửa; chép đúng bản đã sửa.
3. Biến static cấu hình: Swift 6 cần `nonisolated(unsafe)`; Kotlin thì dùng `@Volatile`/Atomic.

## 4. Bất biến
- **F3:** mọi tunnel phải **cùng exit node** (khác node ⇒ IP khách đổi giữa phiên ⇒ hỏng đăng nhập/thanh toán).
- Chia **theo luồng**, **không** chia theo gói (chia gói làm đảo thứ tự ⇒ TCP bên trong sụp).
- `Serve` chỉ đọc **một** tun fd; N tunnel nằm trong `multiClient`.

## 5. Nghiệm thu
1. N=1 phải **y hệt** bản đang phát.
2. N=4: log phải có 4 kết nối WS; `Δ1phút ra` / tốc độ tải tăng theo bậc (mốc: 1 luồng 4–12 Mbps,
   8 luồng 72–81 Mbps). Không tăng ⇒ trần ở relay/WS, xử lý phía server.
3. Ghi rõ trong báo cáo: đã build AAR từ commit nào.
