# Review Teamleader — iOS "chạy một lúc thì tự disconnect và KHÔNG tự nối lại được"

- **Ngày:** 2026-09-26 · **Người làm:** Solution Architect / Teamleader (DSH harness Mac)
- **Tiếp nhận từ:** `docs/handoff/HANDOFF_TEAMLEADER_IOS_2026-09-26.md`
- **Trạng thái:** đã review độc lập + **đã vá phần còn thiếu**; **CHƯA nghiệm thu máy thật** (xem §7)

## 1. Triệu chứng là HAI nửa khác nhau — phải tách mới sửa được

| Nửa | Triệu chứng | Gốc |
|---|---|---|
| **A** | "chạy một lúc thì **tự disconnect**" | `BUG-IOS-JETSAM-001`: iOS giết extension ở trần bộ nhớ per-process |
| **B** | "**không tự connect lại được**" | **Không có on-demand** — đã rà toàn bộ `iOS/`, không có `isOnDemandEnabled`/`onDemandRules`/`NEOnDemandRule` nào |

Handoff cũ chỉ theo nửa A. Nửa B **chưa từng được sửa** — và nghiêm trọng hơn: van an toàn bộ nhớ
(build 49/50) **chủ động** hạ tunnel ở ≥40 MB, nên khi không có on-demand thì van biến "sắp bị iOS
giết" thành **"tự ngắt chắc chắn và không bao giờ lên lại"**.

## 2. Review độc lập 4 nghi phạm của handoff §4 (đọc code, không tin log)

| # | Nghi phạm | Kết luận | Bằng chứng |
|---|---|---|---|
| 1 | `RelayLink.sendQueued` — `URLSessionWebSocketTask.send` tự xếp hàng, không trần | **ĐÃ SỬA trong cây** | `WSRelayClient.swift:236` xin chỗ qua `RampStatus.SendBudget`; trần cứng **512 gói / 512 KB** (`RampStatus.swift:887-889`); đầy ⇒ `.backpressure` **CHỜ** chứ không vứt (dòng 245-255); completion `release` chỗ (dòng 241) |
| 2 | `HysteriaTransport` lỗi ghi fd (`errno=35`) có đưa lại hàng đợi? | **KHÔNG PHẢI LỖI** | `HysteriaTransport.swift:871-873` ghi rõ bất biến: gói `EAGAIN` **bỏ ngay**, không có cấu trúc requeue nào; đếm riêng `toGoEAGAIN` |
| 3 | `pendingLink` / `bufferedLink` / `pendingDropped` | **ĐÃ SỬA trong cây** | `BoundedBuffer` có `maxCount` + TTL 30 s, thả CŨ NHẤT có đếm (`RampStatus.swift:980-1011`); `AsyncStream` dùng `.bufferingNewest(sendBufferLimit)` (dòng 124) |
| 4 | Vòng `readPackets` của `NEPacketTunnelFlow` | **ĐÃ SỬA trong cây** | `HysteriaTransport.swift:1044,1055,1133,1140` — `autoreleasepool` cho **mỗi lô** và **mỗi gói**, cả hai chiều cầu |

**Nguyên nhân gốc thật (khớp chính xác số đo "bộ nhớ leo theo LƯU LƯỢNG, `pendingLink=0`"):**
luồng của Swift concurrency **không có autorelease pool tự động**, mà đường dữ liệu đi qua
`URLSession`/`NEPacketTunnelFlow` (Objective-C) ⇒ object tự động nhả của **mỗi gói/frame** nằm lại
vĩnh viễn. Bản vá trong cây bọc `autoreleasepool` đúng ở cả 4 chỗ (bridge 2 chiều + WS gửi + WS nhận
`WSRelayClient.swift:386`). Đây là dạng rò **tỉ lệ với số gói**, không theo thời gian — đúng
`+35,5 MB cho 54,3 MB nhận từ relay` (≈0,65 B mỗi byte).

## 3. Nửa B — phần CHƯA ai sửa (phát hiện của review này)

`VPNManager.prepareConfiguration` chỉ đặt `manager.isEnabled = true`
(`iOS/PrivateVPN/VPNManager.swift:718`). **Không** đặt `isOnDemandEnabled`, **không** có
`onDemandRules`. `refreshStatus()` khi thấy `.disconnected` chỉ ghi state rồi đứng
(`VPNManager.swift:109-117`) — **không** thử nối lại.

Hệ quả: mọi cơ chế tự nối lại hiện có (`WSRelayClient` backoff, `TransportLadder`, watchdog
`selfRescue`) đều sống **bên trong tiến trình extension**. iOS giết tiến trình đó (hoặc van bộ nhớ
tự dừng) ⇒ **không còn ai nối lại**; khách phải tự mở app bấm Connect. On-demand là cơ chế **duy
nhất** của iOS dựng lại extension mà không cần app chạy.

**macOS cũng thiếu y hệt** (`mac/PrivateVPNMac/VPNManagerMac.swift:746` có `isEnabled = true`,
không có on-demand) — cùng lớp lỗi, chưa sửa trong phiên này.

## 4. Đã vá (phiên này)

| File | Sửa |
|---|---|
| `iOS/PrivateVPN/VPNManager.swift` | `prepareConfiguration`: bật `isOnDemandEnabled = true` + `onDemandRules = [NEOnDemandRuleConnect()]` **trước** `saveToPreferences()` |
| `iOS/PrivateVPN/VPNManager.swift` | `disconnect()`: tắt on-demand (`isOnDemandEnabled = false`, `onDemandRules = []`, save) **rồi mới** `stopVPNTunnel()` — nếu không, khách bấm Disconnect mà iOS dựng lại VPN ngay |

**Cố ý KHÔNG tắt on-demand** ở đường van bộ nhớ / `noTraffic`: đó đúng là ca cần hệ thống tự nối lại.

⚠️ **Cảnh báo tương tác (quan trọng):** nếu nửa A **chưa** được sửa thật, on-demand sẽ biến van
40 MB thành **vòng lặp ~10 phút/lần** (leo 40 MB ⇒ van hạ ⇒ on-demand lên lại). On-demand và bản vá
bộ nhớ **phải đi cùng nhau**; không được phát hành on-demand một mình.

## 5. Tiêu chí nghiệm thu (đo được, không "chắc là chạy")

### AC-1 — KHÔNG tự ngắt (nửa A)
Chạy **Netflix ≥ 20 phút liên tục** trên máy thật, rồi:
- `0` dòng `van an toàn bộ nhớ` trong `relay.log`.
- `0` `JetsamEvent-*.ips` mới chứa `PrivateVPNPacketTunnel`.
- Dòng `tài nguyên:` (nhịp 60 s): `footprint` **< 25 MB và phẳng**; độ dốc **< 0,2 MB/phút** sau phút thứ 3.
- Tỉ lệ rò **≤ 0,1 B bộ nhớ mỗi byte nhận từ relay** (hiện đo được **0,65** ⇒ phải giảm ≥ 6 lần).

### AC-2 — TỰ NỐI LẠI (nửa B, mới)
- **Giết extension** (`xcrun devicectl ... ` hoặc `kill` tiến trình, hoặc để jetsam xảy ra):
  tunnel **tự lên lại ≤ 60 s**, **không** cần mở app / bấm Connect.
- **Khách bấm Disconnect**: VPN **ở lại TẮT ≥ 5 phút** (on-demand không được kéo lên) — đây là
  tiêu chí chống hồi quy của chính bản vá này.
- **Khởi động lại máy**: VPN tự lên.

### AC-3 — Không hồi quy (chạy được ngay, không cần máy thật)
```bash
python3 scripts/ios-lint-locks.py                 # ĐẠT
bash scripts/ios-pure-logic-tests/run.sh          # PASS hết (hiện 499/499)
python3 scripts/ios-log-acceptance.py <dir>/relay.log --crash-dir <dir>/crash   # exit 0
```
- `0` dòng `transport vừa thay (ramp băng thông)`; `0` lần `TỰ DỰNG LẠI` khi tunnel rảnh.

### AC-4 — Cổng build/phát hành (AGENTS.md §7a, KHÔNG được bỏ bước)
```bash
eval "$(bash scripts/dev-hysteria-build-env.sh)"
bash scripts/archive-appstore.sh ios adhoc
bash scripts/ios-adhoc-export.sh --no-upload
bash scripts/ios-verify-ipa.sh build/ios-adhoc-export/ipa/FlowVPN.ipa --version <V> --build <N>
```

> Ghi chú: khi nghiệm thu AC-1/AC-2 **nên tạm nâng ngưỡng van 40 MB** (hoặc tắt van) để thấy đúng
> đường cong bộ nhớ — van che mất ca rò (đề xuất của handoff §6.4, tôi đồng ý).

## 6. Kiểm chứng đã chạy trong phiên này

```text
python3 scripts/ios-lint-locks.py        -> KẾT LUẬN: ĐẠT — không có lời gọi lấy khoá lồng nhau
bash scripts/ios-pure-logic-tests/run.sh -> KẾT QUẢ: 499/499 PASS, 0 FAIL
swiftc -typecheck (app target: iOS/PrivateVPN/** + RampStatus.swift, shim WireGuardKit)
                                         -> 0 error, 4 warning (có sẵn từ trước)
```
`-typecheck` **bắt buộc** theo §7b (`-parse` không đủ — build 33 đã PASS `-parse` mà archive vẫn FAIL).
App target import `WireGuardKit` (framework vendored) nên phải dựng **module shim** mô phỏng đúng
API đang dùng (`PrivateKey/PublicKey/PreSharedKey/IPAddressRange/DNSServer/Endpoint/
InterfaceConfiguration/PeerConfiguration/TunnelConfiguration`) tại `/tmp/wgstub`.

## 7. Quyết định của chủ dự án (26/09/2026) + việc còn lại

Chủ dự án đã chốt 3 điểm:

| # | Câu hỏi | Chốt | Đã làm |
|---|---|---|---|
| 1 | Thoát app có ngắt VPN không? | **CÓ — tắt app = thoát VPN** | Thêm `VPNManager.shutdownForTermination()`: tắt on-demand **đồng bộ** (chờ `saveToPreferences` ≤2 s) rồi mới `stopVPNTunnel()`. `PrivateVPNApp` gọi hàm này thay cho `disconnect()` |
| 2 | Vá on-demand cho macOS? | **KHÔNG** — macOS không bị triệu chứng này (hoặc chưa thấy) | Không đụng `mac/` |
| 3 | Thu hẹp on-demand rule? | **KHÔNG** — để mọi loại mạng | Giữ `NEOnDemandRuleConnect()` không điều kiện |

**Vì sao phải là bản ĐỒNG BỘ (không phải `Task {}`):** `disconnect()` chạy trong `Task { @MainActor }`
— mà `applicationWillTerminate` trả về là hệ thống giết tiến trình ngay ⇒ Task đó **không bao giờ
chạy**, on-demand còn nguyên ⇒ iOS dựng lại VPN. Bản mới dùng `Task.detached` (KHÔNG thừa hưởng main
actor — nếu dùng `Task {}` thì main actor đang bị `wait()` chặn ⇒ **tự khoá chết**, cùng lớp lỗi
`flowLock` ở §7c) + `nonisolated(unsafe)` để chuyển `NETunnelProviderManager` qua ranh giới actor.

### Việc còn lại

1. **CHƯA nghiệm thu máy thật.** AC-1/AC-2 cần iPhone/iPad thật + log — bắt buộc theo §7d; không có
   nó thì **chưa được coi là xong**.
2. **Giới hạn của iOS (phải biết, không sửa được từ app):** swipe-kill từ app switcher **không** gọi
   `applicationWillTerminate` đáng tin cậy. Khi callback không được gọi thì app **không có cách nào**
   tắt on-demand ⇒ hệ thống có thể dựng lại VPN ở lần đổi mạng kế tiếp. Nghĩa là "tắt app = thoát VPN"
   đúng khi callback được gọi (kể cả khi hệ thống kết thúc app), nhưng **không bảo đảm 100%** với
   swipe-kill. Muốn bảo đảm tuyệt đối thì phải **bỏ on-demand** — đổi lại là mất luôn khả năng tự nối
   lại sau khi extension bị giết (quay lại đúng BUG-IOS-JETSAM-001). Đây là đánh đổi, cần chủ dự án
   biết; nghiệm thu AC-2 (bấm Disconnect ⇒ ở lại tắt) chính là để đo phần này.
3. **Nhánh/commit**: cây đang ở `main` **ahead 43 / behind 71**, các file tunnel iOS **còn sửa dở chưa
   commit** của phiên dev. Bản vá này nằm chung cây đó — người commit cần tách đúng pathspec.
