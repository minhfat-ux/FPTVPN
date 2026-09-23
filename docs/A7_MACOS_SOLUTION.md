# A7 cho **macOS** — giải pháp đề xuất (chưa sửa code)

- **Trạng thái:** PROPOSED — chờ chủ dự án chốt (§7). Chưa có dòng code nào bị đổi.
- **Ngày:** 2026-09-22 · **Người soạn:** Senior dev (DSH harness Mac)
- **Liên quan:** `docs/A7_A9_CLIENT_IOS_MACOS.md` (A7 iOS đã bật), `docs/DEV_PLAN_IOS_MACOS_TOC_DO.md`
  §Giai đoạn 2, `docs/YEU_CAU_TOC_DO_ON_DINH.md` §2d (A7), `BUG-ANDROID-CPU-001` (không liên quan).
- **Nguồn sự thật đã đọc:** code trong repo (không suy đoán từ chat).

## 0. Kết luận ngắn

1. **Cơ chế đúng cho macOS = `NEIPv4Settings.excludedRoutes`** (native của NetworkExtension), y như
   iOS. **Không** cần sing-box/`geosite:cn` (extension là hysteria-only, đã kiểm), **không** cần
   privileged helper.
2. **Code đã sẵn gần hết**: target extension macOS (`project.yml:323-388`) **compile cùng**
   `HysteriaPacketTunnelProvider.swift` (dòng 337) và `ChinaRouteBypass.swift` (dòng 348), kèm bản
   bundle dự phòng `cn.txt`/`cn6.txt` (dòng 357). Thứ chặn duy nhất là các khối `#if os(iOS)`.
3. **Nút thắt duy nhất là một lần đo cũ, và lần đo đó KHÔNG tách được nguyên nhân.** Vì vậy đề xuất
   làm **3 bước**, bước 1 chỉ có 4 dải LAN — đủ để tái hiện hoặc bác bỏ nút thắt cũ trong điều kiện
   sạch, trước khi đụng tới 5.494 dải IP TQ.

## 1. Hiện trạng — kiểm bằng code

| Nền tảng | Cơ chế thật (không phải mô tả trong yêu cầu) | Trạng thái |
|---|---|---|
| **Windows** | `ChinaBypass.cs` tải `cn.txt` rồi `WintunWireGuardDriver` chạy `netsh interface ipv4 add route <cidr> <iface> nexthop=<gw> store=active` (`ChinaBypass.cs:162-182`) ⇒ route **qua interface VẬT LÝ**, không vào tunnel. Thứ tự bắt buộc: thêm **route loại trừ endpoint TRƯỚC** khi gắn route chia default, nếu không gói tới server bị hút vào tunnel (`WintunWireGuardDriver.cs:439-441`). IPv6 chặn bằng **hai nửa default route** (`:505`) | đã phát hành (1.0.5); hiện đang làm P1–P3 cho đường relay — claim `windows-app` đang **hiệu lực** |
| **Android** | Yêu cầu nói *"đã làm trong 1.4.3-dev (`CnAppBypass.kt`)"* (`YEU_CAU_TOC_DO_ON_DINH.md:84`). **Kiểm lại: KHÔNG có.** `git grep` toàn bộ ref (kể cả `origin/win/ps51-bom-fix`, các nhánh `origin/mac/*`) → không có `CnAppBypass`, không có `addDisallowedApplication`, không có `cn-apps` trong `android/` | **chưa có trong repo này** — xem §7 câu 3 |
| **iOS** | `#if os(iOS)`: `ipv4.excludedRoutes` = 4 dải LAN/link-local **+ `cn.txt` (5.494 dải)**; `includedRoutes = [default]` (`HysteriaPacketTunnelProvider.swift:863-877`). A7 IPv6 **đã revert** (`479a6d7`) | đang chạy |
| **macOS** | cùng file, nhưng khối đó bị `#if os(iOS)` loại ⇒ **không có cả 4 dải LAN** ⇒ khi VPN bật, LAN (`192.168.x`, máy in/NAS) **đi vào tunnel** | **chưa có A7, và đang có lỗi LAN** |

## 2. Nút thắt "excludedRoutes làm lệch route trên macOS" — cần đo lại, không phủ nhận

Chú thích trong code (`HysteriaPacketTunnelProvider.swift:857-862`) ghi lần đo 19/09:

> thêm `NEIPv4Route("100.100.100.100", "255.255.255.252")` vào **includedRoutes** … *"có lần NE còn
> không cài route nào ⇒ máy đi thẳng ra en0 (rò rỉ: ping 17ms, tải 7,59 MB/s trong khi route
> 100.100.100.x TRỐNG)"*

rồi (`:866-867`) suy ra **macOS không nên đặt `excludedRoutes`**. Ba lý do phải đo lại:

1. **Trộn biến:** thí nghiệm đó đổi **`includedRoutes`** (thêm dải), không phải chỉ `excludedRoutes`;
   kết luận ở `:866-867` gán kết quả cho `excludedRoutes` là **chưa tách bạch**.
2. **Không có artifact:** `grep` trong `evidence/`, `.privatevpn/reports/`, `.privatevpn/memory/`
   **không** tìm thấy file nào ghi lần đo đó (không `netstat -rn`, không log). Không đối chiếu được.
3. **Trái thực tế phổ biến:** `excludedRoutes` là API Apple hỗ trợ cho **cả** iOS và macOS; các bản
   WireGuard-macOS dùng chính nó để chia LAN/split-tunnel. Nếu nó hỏng trên máy này thì phải chỉ rõ
   hỏng ở điều kiện nào.

⇒ Kết luận: **chưa đủ cơ sở để nói macOS không dùng được `excludedRoutes`.** Phải đo lại từng biến một.

## 3. Giải pháp đề xuất — 3 bước, mỗi bước đo được và rút lui được

### Bước 1 — chỉ 4 dải LAN (rủi ro thấp nhất, làm được ngay)

- **Sửa:** bỏ `#if os(iOS)` **chỉ cho khối 4 dải LAN/link-local**; `cn.txt` vẫn iOS-only ở bước này.
- **Vì sao bước này trước:** chỉ 4 route (không thể là "5.494 route quá nhiều"), **sửa luôn lỗi LAN
  đang có trên Mac**, và nếu vẫn lệch route thì ta **tái hiện nút thắt cũ trong điều kiện sạch** ⇒
  biết chắc nguyên nhân nằm ở `excludedRoutes` chứ không ở `includedRoutes`/danh sách lớn.
- **Đo trước/sau:** `netstat -rn -f inet` (diff), ping máy trong LAN, truy cập NAS/máy in, `curl` ra Internet.
- **Đạt:** LAN vào được, default route vẫn qua `utun`, Internet bình thường, không rò rỉ ra `en0`.
- **Không đạt:** giữ nguyên trạng thái cũ (macOS không excludedRoutes) + ghi lại `netstat -rn` làm
  **bằng chứng thật** cho nút thắt (thay cho lần đo không có artifact).

### Bước 2 — thêm `cn.txt` (5.494 dải), sau cờ, sau `completeStart`

- **Sửa:** mở `#if os(iOS)` cho `startChinaBypass()` + `applyChinaRoutes()` (code đã có sẵn, chỉ đang
  bị chặn theo nền tảng). Giữ đúng nguyên tắc đã chốt: nạp bản nhớ/bundle trước, tải bản mới ở **luồng
  nền**, **chỉ `applySettings` lại khi số dải đổi** (bài học Windows 1.0.4 "connecting mãi").
- **Đo:** thời gian `setTunnelNetworkSettings` (log `china: A7 nạp N dải …`), tổng thời gian connect
  (p50 qua ≥10 lần), số route TQ thực có trong `netstat -rn`, độ ổn định sau connect 10 phút.
- **Ngưỡng rút lui (đề xuất, chờ chốt):** connect chậm thêm **> 3 s** so với khi tắt A7, **hoặc** bảng
  route thiếu dải ⇒ tắt cờ, quay về bước 1.
- **Nếu 5.494 dải là quá nặng:** gộp prefix (aggregate) trước khi nạp — thuần logic, đã có chỗ trong
  `ChinaRouteBypass.parse`, kèm test; hoặc chia 2 đợt (nửa đầu lúc connect, phần còn lại ở luồng nền).

### Bước 3 — bịt IPv6 **đúng cách** (không lặp lại lỗi bus #175)

- Đúng "hướng đúng" mà chính `A7_A9_CLIENT_IOS_MACOS.md` §5.2 đã ghi: **resolve A/AAAA của endpoint**
  (relay + node) → thêm `/32` và `/128` của endpoint vào `excludedRoutes` **TRƯỚC**, rồi mới đặt
  `ipv6Settings.includedRoutes = [::/0]` + `excludedRoutes = cn6.txt`.
- **Tuyệt đối không** đặt `::/0` khi chưa loại trừ AAAA của relay — đó chính là nguyên nhân "iPhone mất
  mạng khi connect" ở `18f8c82`, đã revert `479a6d7`.
- `ChinaRouteBypass.parseIPv6/cachedIPv6/excludedRoutesV6` + bundle `cn6.txt` **đã có sẵn** (thuần
  logic, đã có test) — chỉ chưa nối vào provider.

### Phương án dự phòng (chỉ nếu bước 1/2 thất bại thật)

Mô phỏng Windows: thêm route TQ qua **interface vật lý** bằng tiến trình có đặc quyền (privileged
helper / `SMJobBless`, hoặc `route add` cần root). **Chi phí cao hơn hẳn:** thêm helper, phải notarize,
phải tự dọn route khi ngắt (Windows phải làm việc này — `_chinaBypassRoutes`), và route có thể đè lên
NE. Vì vậy chỉ dùng khi `excludedRoutes` chứng minh là không dùng được.

## 4. Khác biệt nền tảng phải nhớ (macOS ≠ Windows)

- macOS **không có** `addDisallowedApplication` (Android) và **không có** Wintun/`netsh`.
  `excludedRoutes` là chỗ duy nhất khai báo "đi thẳng".
- Route do NetworkExtension cài lại **mỗi lần** `setTunnelNetworkSettings` ⇒ **không cần dọn tay** khi
  ngắt (khác Windows phải xoá route).
- `protect()` **không có** trên macOS (`DEV_PLAN` giai đoạn 2 mục 1) — không thuộc A7 nhưng cùng đợt,
  đừng copy nguyên code iOS.
- **DNS:** hiện áp `NEDNSSettings(servers: …)` cho toàn máy; A7 chia theo **IP** nên DNS vẫn đi qua
  tunnel. Hệ quả đã ghi nhận từ trước: **`geosite:cn` không xử lý được** (miền TQ trỏ IP ngoài TQ) —
  chỉ `geoip:cn`. Không kỳ vọng sai.

## 5. Nghiệm thu (dùng đúng tiêu chí A7 §2d, không tự đặt tiêu chí mới)

| Tiêu chí | Cách đo trên Mac |
|---|---|
| WeChat/Alipay/Meituan/Didi/Taobao **đăng nhập + giữ kết nối** khi VPN bật | thao tác thật trên app |
| **Byte tunnel KHÔNG tăng** khi chỉ dùng app TQ | đọc bộ đếm rx/tx của `packetFlow`/`TunnelBridge` + log `DiagnosticsLog` trước–sau |
| LAN vẫn dùng được | ping/`smb` tới `192.168.x`, máy in/NAS |
| Không mất mạng khi connect | `netstat -rn` có default qua `utun`; không có lưu lượng lọt `en0` |

## 6. Rủi ro

1. **5.494 route**: `setTunnelNetworkSettings` có thể tốn thời gian và gây khựng vài giây mỗi lần áp
   lại ⇒ bắt buộc đo trước khi phát hành; có sẵn 2 cách giảm (aggregate / chia đợt).
2. Nếu NE trên macOS **không** tôn trọng `excludedRoutes` như lần đo cũ ⇒ phải sang phương án dự phòng
   có helper (đắt hơn nhiều).
3. **Rò IPv6** vẫn còn sau bước 1–2 (đi thẳng, không qua tunnel) — đúng như iOS hiện tại; chỉ bước 3
   mới bịt. Không được nói "đã kín" khi chưa làm bước 3.
4. macOS dùng chung source với iOS ⇒ mọi thay đổi phải giữ iOS nguyên trạng; kiểm bằng
   `scripts/ios-pure-logic-tests/run.sh` (hiện **94/94 PASS**) + `swiftc -parse` provider cho **cả hai** nền tảng.

## 7. Việc cần chủ dự án chốt

1. **Cho phép làm bước 1 (chỉ 4 dải LAN) trên Mac thật** để tái hiện/bác bỏ nút thắt cũ? Đây là bước
   duy nhất cần "được phép" vì nó là thí nghiệm trên máy đang dùng.
2. **Ngưỡng rút lui của bước 2**: connect chậm thêm bao nhiêu thì bỏ A7 trên Mac (đề xuất > 3 s)?
3. **Android**: `CnAppBypass.kt` ("đã làm trong 1.4.3-dev") **không có trong repo này** ở bất kỳ ref nào.
   Nó nằm ở repo/máy khác, hay ghi nhầm trong `YEU_CAU_TOC_DO_ON_DINH.md:84`? (Em **không** sửa file
   yêu cầu đó — cần anh xác nhận trước.)

## 8. Bằng chứng của chính tài liệu này

```bash
# Cơ chế Windows (chỉ ĐỌC — windows-app đang có claim hiệu lực)
grep -n "add\", \"route\"\|nexthop\|_chinaBypassRoutes" windows/PrivateVPNWindows.Core/Tunnel/ChinaBypass.cs \
  windows/PrivateVPNWindows.Core/Tunnel/WintunWireGuardDriver.cs
# macOS compile cùng file với iOS
grep -n "HysteriaPacketTunnelProvider.swift\|ChinaRouteBypass.swift\|platform: macOS" project.yml
# Android A7: không tồn tại trong repo (mọi ref)
git grep -l "addDisallowedApplication\|cn-apps" $(git for-each-ref --format='%(refname)' refs/heads refs/remotes) -- android/
# Không có artifact cho lần đo "lệch route" 19/09
grep -rln "lệch route\|netstat -rn" evidence/ .privatevpn/reports/ .privatevpn/memory/
```
