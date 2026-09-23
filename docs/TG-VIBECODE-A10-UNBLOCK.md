# T-20260922-19 — bên giao WIN gỡ vướng A10 (nhãn "Đang truyền" + "Đỉnh phiên ↓")

> Sổ: `T-20260922-19` (`win → mac`) · trạng thái lúc viết: **`blocked`** (MAC báo 02:56:42Z 23/09/2026)
> Bối cảnh: [`TG-VIBECODE-DIAGNOSTICS-SPEED.md`](TG-VIBECODE-DIAGNOSTICS-SPEED.md) · giao thức: [`TASK-PROTOCOL.md`](TASK-PROTOCOL.md)
> Người viết: **WIN** (bên giao) — phiên được watcher đánh thức vì `blocked`, 23/09/2026.

## 0. Tóm tắt

- MAC báo **code đã xong** nhưng **vướng 2 thứ**: (b) ≥20 dòng `bw: sample observed=` từ bản MỚI và
  (c) ảnh thẻ Diagnostics. Cả hai đều do **không ai bấm Connect trên iPhone hộ** và **không ghi được
  bản macOS mới vào `/Applications`**.
- WIN đã **soát độc lập phần code** (không phải tin lời): **đúng đặc tả** — xem §1.
- WIN **không** nghiệm thu pass: sổ đang `blocked`, và theo luật `ops/task.mjs` thì `verify pass`
  chỉ hợp lệ **sau `done`**.
- Việc gỡ vướng nằm ở §3 (3 đường, rẻ trước). **Đường (1) cần người 60 giây** — đó là thứ WIN đã
  nhắn trực tiếp cho chủ dự án qua Telegram trong phiên này.

## 1. WIN đã soát gì (đọc code trên `origin/mac/hotel-test`, không chạy được Swift)

Máy WIN **không có** `swiftc`/`xcrun`/`bash` ⇒ không chạy được Release build, 144 test, cũng không
với tới thiết bị. Nên phần dưới đây là **soát tĩnh** (đọc diff/commit) — nói rõ để không ai nhầm với
nghiệm thu thật.

| Yêu cầu trong sổ | Bằng chứng WIN đọc được | Kết quả |
|---|---|---|
| Đổi nhãn `diagDown/diagUp` cho đúng nghĩa | `078e043` sửa `iOS/PrivateVPN/Theme.swift`: vi `"Tốc độ tải xuống ↓"→"Đang truyền ↓"`, `"Tốc độ tải lên ↑"→"Đang truyền ↑"` | ✅ |
| Thêm dòng "Đỉnh phiên ↓" | `Theme.swift`: `case diagPeakDown` + `ContentView.swift` thêm `diagRow(.diagPeakDown, formatRate(report?.peakDownKbps))` | ✅ |
| Đủ **5 ngôn ngữ** | vi `Đang truyền ↓/↑` + `Đỉnh phiên ↓` · en `Transferring ↓/↑` + `Session peak ↓` · zh `正在传输 ↓/↑` + `会话峰值 ↓` · ja `転送中 ↓/↑` + `セッション最大 ↓` · ko `전송 중 ↓/↑` + `세션 최고 ↓` | ✅ |
| Số lấy từ `BandwidthControl.peakDownKbps`, **không thêm phép đo/pin** | Chuỗi nối: `HysteriaBandwidthControl.swift` (`peakDownKbps: peakDownKbps > 0 ? peakDownKbps : nil`) → `RampStatus.Display.peakDownKbps` (mặc định `nil`, `guard serving` ⇒ xoá như mọi số khác) → `HysteriaPacketTunnelProvider.swift` (`report["peakDownKbps"]`) → `ControlAPIClient.TunnelStatusReport.peakDownKbps` → `ContentView` | ✅ |
| Không phá call site cũ | `peakDownKbps: Int? = nil` có giá trị mặc định; `RampStatus.swift` là file dùng chung cả 2 target (xem `project.yml`) | ✅ |
| 144/144 test + Release build | **WIN không kiểm được** (không có toolchain). Lời MAC, chưa có log dán kèm | ⚠ chưa xác minh |

Tổng diff: `iOS/PrivateVPN/ContentView.swift`, `Services/ControlAPIClient.swift`, `Theme.swift`,
`PrivateVPNPacketTunnel/{HysteriaBandwidthControl,HysteriaPacketTunnelProvider,RampStatus}.swift`,
`scripts/ios-pure-logic-tests/main.swift` — 7 file, +43/−11.

**Chi tiết quan trọng nhất trong soát tĩnh:** nguồn số của "Đỉnh phiên ↓" **không phải số mới**.
`HysteriaPacketTunnelProvider.swift:651-654` đã in `best=\(bandwidth.peakDownKbps)` trong dòng
`bw: net=… measured=… best=…` từ trước A10, và chính MAC đã đo được `best=5,431 kbps` trên macOS.
Cái mới của `078e043` **chỉ là dòng hiển thị** — nên rủi ro "số sai" ở đây thấp hơn nhiều so với
một phép đo mới.

## 2. Còn thiếu đúng gì để nghiệm thu (theo `--verify` của sổ)

1. **(b)** ≥20 dòng `bw: sample observed=` **của bản mới** (1.4.1/16 macOS hoặc /19 iOS):
   `bw: sample observed=<observed> down=<live> up=<live> declared=…/… atMax=…` (10 s/lần,
   `HysteriaPacketTunnelProvider.swift:632-639`).
2. **(c)** ảnh thẻ Diagnostics có 2 dòng mới.
   → Ghi chú WIN bổ sung sau khi đọc `mac/PrivateVPNMac/ContentViewMac.swift:461-478`: thẻ
   Diagnostics của **app macOS chỉ có `State` / `Location` / `Message`** — **không có dòng tốc độ
   nào**, nên **ảnh chụp trên macOS không thể** chứng minh (c). (c) bắt buộc phải là iPhone/iPad,
   hoặc phải port A10 sang macOS trước (việc riêng, xem §4).

## 3. Ba đường gỡ vướng (rẻ trước, chắc trước)

### (1) NGƯỜI làm 60 giây trên iPhone — đường chắc ăn nhất, được cả (b) và (c)

1. Mở **VPNFlow 1.4.1 (build 19)** trên iPhone → bấm **Connect** → chờ "Connected".
2. Chuyển sang **Safari**, tải 1 file lớn qua tunnel (vd `https://proof.ovh.net/files/100Mb.dat`)
   → **để Safari ở tiền cảnh ~60 giây** (đừng mở VPNFlow lúc này).
3. Quay lại **VPNFlow** → thẻ **Diagnostics** → chụp ảnh màn hình.
   Đọc đúng cách: `Đang truyền ↓` sẽ **thấp hoặc `—`** (đồng hồ bị động, đúng như thiết kế — mở app
   là app tải bị iOS treo), còn **`Đỉnh phiên ↓` phải giữ mức Mbps đã đạt**. Ảnh này mới là bằng chứng.
4. Để nguyên điện thoại (đừng tắt tunnel) để MAC đọc lại `relay.log` qua `xcrun devicectl` — có log
   là MAC lấy được (b) `grep "bw: sample observed="` mà không cần ai chạm máy.

### (2) macOS: không cần ghi vào `/Applications`, chỉ cần **buộc hệ thống nạp appex MỚI**

Vì sao bản cũ vẫn chạy: bản 1.4.1/16 có **cùng bundle id** với bản 1.4.0/14
(`com.privatevpn.mac.packet-tunnel`), nên macOS tự chọn 1 trong 2 bản đã đăng ký — và nó chọn bản
trong `/Applications`. Bản mới **không cần nằm trong `/Applications`**; chỉ cần là bản **được đăng ký**.

```bash
# a) xem hệ thống đang đăng ký appex nào (đường dẫn nằm ngay trên dòng chữ)
pluginkit -m -v -p com.apple.networkextension.packet-tunnel | grep -i privatevpn
# b) bỏ đăng ký bản CŨ (không xoá file), thêm bản MỚI (chạy được từ DerivedData/Archives)
pluginkit -r /Applications/VPNFlow.app/Contents/PlugIns/PrivateVPNMacPacketTunnel.appex
pluginkit -a "<đường-dẫn-bản-mới>/VPNFlow.app/Contents/PlugIns/PrivateVPNMacPacketTunnel.appex"
# c) mở app mới 1 lần (để LaunchServices đăng ký app), rồi bật tunnel KHÔNG cần UI:
scutil --nc start "VPNFlow"     # MAC đã làm được đúng lệnh này ở lượt trước
```

**Đây là GIẢ THUYẾT của WIN, chưa đo trên macOS** (WIN không có macOS). Kiểm chứng bằng đúng 1 lệnh
(a): nếu sau (b) `pluginkit` trỏ vào đường dẫn bản mới thì chạy tiếp `measure-tunnel.sh` + grep
`bw: sample observed=` là có (b) **không cần người**. Nếu `pluginkit` vẫn trỏ bản cũ thì bỏ đường này,
quay về (1).

### (3) XCUITest trên máy thật — đường bền cho mọi lần nghiệm thu sau

"Không có UI automation" không hẳn đúng: `xcodebuild test -destination 'platform=iOS,id=<UDID>'` chạy
được **UI test trên iPhone thật**, bấm được `Connect`, và **chụp ảnh được** (`XCTAttachment`, xuất từ
`.xcresult`). Đây là cách bỏ hẳn yêu cầu "người bấm" cho các lần sau, kể cả khi chủ dự án không có mặt.
Việc này **ngoài phạm vi** T-20260922-19 — nếu MAC thấy đáng làm thì mở task riêng.

## 4. Phát hiện thêm (cần chủ dự án trả lời 1 câu)

App macOS **không có** dòng tốc độ nào trong Diagnostics (`mac/PrivateVPNMac/ContentViewMac.swift:461-478`:
chỉ `State`/`Location`/`Message`) và trong `mac/` **không có** chuỗi `Mbps`/`kbps` nào. Vậy câu hỏi
còn treo từ `TG-VIBECODE-DIAGNOSTICS-SPEED.md` §6 nay có thêm dữ kiện:

> **Chủ dự án đọc "tốc độ download" đó ở iPhone hay ở app Mac?**

- Nếu ở **iPhone** ⇒ `078e043` đúng chỗ, chỉ còn (1) để nghiệm thu.
- Nếu ở **app Mac** ⇒ phải **port A10 sang macOS** trước (việc riêng, vùng của MAC), vì hiện macOS
  không hiển thị tốc độ nào cả.

## 5. WIN đã làm gì trong phiên này

- Soát tĩnh `078e043` + xác nhận chuỗi `peakDownKbps` (§1) và giới hạn của nó.
- Ghi tài liệu này (nguồn cho phiên sau và cho MAC).
- Nhắn **chủ dự án** qua Telegram: đúng quy trình (1) ở trên + câu hỏi §4.
- Đẩy tin sang **connector** cho MAC kèm đường (2)/(3).
- **Không** ghi `verify pass`: sổ đang `blocked` (luật: `verify pass` chỉ sau `done`), và tiêu chí
  (b)+(c) của chính sổ này chưa có.
