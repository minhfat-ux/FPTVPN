# Hai bản vá 26/09/2026 — đường cứu hộ Tailscale + timer watchdog

**File sửa:** `iOS/PrivateVPNPacketTunnel/HysteriaPacketTunnelProvider.swift` (+53 / −9)
⚠️ File này được **compile cho CẢ iOS lẫn macOS** (xác nhận trong `project.yml`: target
`PrivateVPNMacPacketTunnel` liệt kê `iOS/PrivateVPNPacketTunnel/HysteriaPacketTunnelProvider.swift`)
⇒ **một chỗ sửa, hai nền tảng**.

## Vá A — loại trừ `100.64.0.0/10` khỏi tunnel (đường QUẢN TRỊ/CỨU HỘ)

**Triệu chứng thật:** agent mất SSH vào cả hai node; `route -n get <đích>` cho **cả ba** đích:
```
165.101.114.162  → utun7     (node-2)
103.173.155.50   → utun7     (node-1)
100.76.147.111   → utun7     ← Tailscale, ĐƯỜNG CỨU HỘ §7e.2, cũng bị hút
```
Code **không hề có** loại trừ `100.64.0.0/10` ⇒ gói tới nút Tailscale đi vào tunnel, mà đầu bên kia
không có đường tới `100.76.147.111` ⇒ đen ⇒ `Connection timed out during banner exchange`.

**Sửa:** thêm `NEIPv4Route(destinationAddress: "100.64.0.0", subnetMask: "255.192.0.0")` vào danh sách
`excluded` sẵn có (cạnh 4 dải RFC1918 + link-local).
**An toàn với khách:** RFC 6598 **không phải** không gian địa chỉ công cộng — không dịch vụ Internet nào
nằm trong dải này ⇒ loại trừ không mở đường cho traffic thật đi vòng qua tunnel.

## Vá B — timer watchdog phải `resume()` TRƯỚC khi công bố

**Bằng chứng thật (build 57, phiên 14:00:22):** sau `TỰ DỰNG LẠI transport` (14:18:53), log tự khai
*"transport vừa thay — bật lại watchdog với mốc mới"* + *"bật SUỐT phiên"* (14:19:02), rồi
**0 dòng `giám sát sống-còn: nhịp` trong 131 s**; **lưới an toàn `startWatchdogGuard()` cũng không một dòng**
(`watchdog NGỪNG chạy`) ⇒ cổng `ios-log-acceptance.py` chấm phiên đó **KHÔNG ĐẠT**.

**Lỗ hổng trong code:** cả ba timer của hệ watchdog đều **công bố trước, `resume()` sau**:
```
livenessTimer:   tạo(2974) → công bố(2982) → … → resume(3017)   ← 43 dòng sau
relayReachabilityTimer: công bố(3025) → resume(3028)
watchdogGuardTimer:     công bố(3087) → resume(3088)
```
`DispatchSourceTimer` mới tạo ở trạng thái **TREO**. `startLivenessWatchdog()` có **4 đường gọi**
(ramp · đổi mạng · rollback · tự phục hồi) **và tự gọi lại chính nó** trong `livenessStep` (nhánh "phiên đổi").
Hai lượt chồng nhau ⇒ lượt sau `cancel()` đúng timer **chưa kịp chạy** của lượt trước ⇒ timer đó
**không bao giờ chạy**, mà nó đã nằm trong `livenessTimer` ⇒ **không ai bật lại nữa** ⇒ watchdog câm tới hết phiên.

**Sửa:** `resume()` đứng **ngay sau `setEventHandler`**, trước `cancel()`/công bố — cho cả ba timer.
Nhịp đầu cách 15 s nên mọi trạng thái đã gán xong từ lâu; đổi thứ tự này không đổi hành vi bình thường.

## Vá C — cho lưới an toàn TỰ KHAI NHỊP (để lần sau chẩn đoán được)

Trước đây lưới an toàn chỉ ghi log **khi phát hiện watchdog câm** ⇒ nếu chính nó cũng chết thì log
**im lặng hoàn toàn**, không phân biệt được "watchdog câm" với "cả hai đều câm" — đúng thế bí của ca 26/09.
Nay nó ghi 1 dòng mỗi 4 vòng (60 s):
```
giám sát sống-còn: lưới an toàn nhịp N — watchdog KHOẺ (nhịp cuối cách Xs), phiên S
```
Tốn 1 dòng/phút, cùng mức với dòng `tài nguyên:` sẵn có. **Lần sau**: thiếu dòng này ⇒ hàng đợi lưới an toàn
chết; có dòng này mà thiếu `nhịp` ⇒ chỉ watchdog chết.

## Cổng đã chạy (26/09/2026)

| Cổng | Kết quả |
|---|---|
| `bash scripts/ios-typecheck.sh` | ✅ extension **0 lỗi** · app **0 lỗi** · macOS **0 lỗi** |
| `bash scripts/ios-pure-logic-tests/run.sh` | ✅ **657/657 PASS**, 0 FAIL |
| `python3 scripts/ios-lint-locks.py` | ✅ **ĐẠT** — không có khoá lồng nhau |

## Nói thẳng: chưa chứng minh được gì

1. **Nguyên nhân CHÍNH XÁC của 131 s câm CHƯA được chứng minh.** Vá B bịt một lỗ hổng **có thật**
   (công bố-trước-resume) và là nghi phạm khớp nhất (timer treo giải thích được **cả hai** cùng câm,
   còn khoá chết thì `bw: sample` cũng phải chết — mà nó vẫn chạy tới 14:21:03). Nhưng **chưa tái hiện được**.
2. **Chưa build, chưa cài máy thật.** Ổ đĩa đã đủ (12 GiB > ngưỡng 10); cần build + nghiệm thu lại.
3. **Vá A chưa kiểm chứng sống**: lúc sửa, Mac đang **TẮT VPN** nên không tái hiện được `100.76.147.111 → utun7`.
   Kiểm chứng sẽ là: bật VPN → `route -n get 100.76.147.111` phải **KHÔNG** còn trỏ `utun7`, và SSH đi được.
