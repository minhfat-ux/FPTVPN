# Đo & kiểm chứng "khai băng thông động" trên iPad/iPhone (feature 19/09/2026)

Tài liệu này để **chủ dự án tự đo trên thiết bị thật**. Không cần Mac cắm cáp — chỉ cần iPad
đã cài bản IPA mới + một Mac (hoặc chính iPad) đọc log.

Vì sao phải đo trên thiết bị: feature này quyết định số khai cho Brutal CC, mà Brutal **pace
theo đúng số khai** ⇒ chỉ số đo thật mới nói được ngưỡng nào đúng. Xem `HysteriaBandwidthControl.swift`.

## 0. Feature làm gì (để đọc log cho đúng)

| Giai đoạn | Hành vi |
|---|---|
| Chưa từng đo mạng này | Khai đúng mặc định cũ (30/100 Mbps) — **không làm mạng nào chậm hơn trước** |
| Đang có traffic | Mỗi 1s đo byte hai chiều của utun ⇒ số đo có sau ≤3s, giữ đỉnh trung bình trượt 10s |
| Cuối phiên / có ramp | Ghi `lastUpKbps`/`lastDownKbps` + đỉnh theo **khoá mạng** (UserDefaults của extension) |
| Lần sau vào cùng mạng | Khai luôn ở mức đã đạt (bộ nhớ), rồi ramp tiếp nếu còn dư địa |
| Đường nhanh hơn số khai | Khi dùng hết ≥85% số khai trong ≥10s (hoặc đỉnh vượt số khai ≥15%) ⇒ tăng ×1,25 (bão hoà rõ ≥90% ⇒ ×1,5) |
| Mất gói liên tục ≥5s | Hạ ×0,7 rồi tăng lại (chống khai quá cao) |
| Khi nào áp số mới | **Chỉ khi tunnel rảnh ≥2s** — số khai được Go đọc một lần trong `MobileConnect`, đổi số = dựng lại transport = đứt stream. Đang truyền thì để dành cho lần kết nối sau. |

## 1. Cài bản mới

```bash
# trên Mac: cài IPA vào iPad (đã bật Developer Mode hoặc bản ad-hoc có UDID của máy)
xcrun devicectl device install app --device <TÊN-Ipad> /đường/dẫn/FlowVPN.ipa
```

## 2. Bật VPN rồi đo tốc độ

1. Mở app **VPNFlow** trên iPad → Connect → đợi biểu tượng VPN xanh (~5s).
2. Mở Safari → đo tốc độ: `fast.com` hoặc `speedtest.net` (đo 2–3 lượt, mỗi lượt cách nhau ~10s).
   * **Lượt đo quan trọng nhất là lượt THỨ HAI/THỨ BA**: lượt đầu chạy với số khai cũ, ramp chỉ
     áp được ở khoảng rảnh giữa hai lượt ⇒ lượt sau mới thấy số mới có tác dụng.
3. Muốn thấy ramp rõ hơn: sau lượt đo, **để máy yên ~10–20 giây** (đừng tải gì) để tunnel rảnh,
   rồi đo lại.

## 3. Đọc log `bw:`

Cách A — qua Console trên Mac (iPad cắm cáp hoặc cùng Wi-Fi):

```bash
# 1) tìm UDID/tên thiết bị
xcrun devicectl list devices
# 2) xem log của tiến trình extension (subsystem com.privatevpn.app.packet-tunnel)
log stream --device <TÊN-Ipad> --predicate 'subsystem == "com.privatevpn.app.packet-tunnel"' --level default
#    (nếu bản log không hiện, dùng: --predicate 'process == "PrivateVPNPacketTunnel"')
```

Cách B — lấy file log của extension (đầy đủ nhất, có cả dòng `bw:`):

```bash
xcrun devicectl device copy from \
  --device <TÊN-Ipad> \
  --domain-type appDataContainer \
  --domain-identifier com.privatevpn.app.packet-tunnel \
  --source Documents/relay.log \
  --destination /tmp/relay-ipad.log
grep 'bw:' /tmp/relay-ipad.log
```

## 4. Cần gửi lại gì (3 dòng log)

```bash
grep -E 'bw:' /tmp/relay-ipad.log | tail -20
```

Chủ dự án chỉ cần gửi **3 dòng**:

1. dòng `bw: chuẩn bị phiên — net=… declared up=… down=… reason=…`
2. **một** dòng `bw: net=… measured=… declared up=… down=… reason=…` (lúc đang đo tốc độ)
3. **một** dòng `bw: ramp net=… observed=… old=… new=… reason=idle-reconnect|loss-backoff`
   (nếu trong phiên đó **không có** dòng nào ⇒ ghi rõ "không có ramp" — đó cũng là kết quả có ích)

Kèm 3 thông tin: (a) loại mạng + tốc độ đo được của speedtest/fast.com, (b) tốc độ trước khi
cài bản này (nếu nhớ), (c) Wi-Fi hay 4G.

## 5. Cách đọc kết quả

| Hiện tượng trong log | Nghĩa là |
|---|---|
| `net=wifi\|router:aa:bb:…` | Nhận đúng mạng (MAC router). `net=wifi\|if:en0` = không đọc được MAC router (vẫn chạy, nhưng bộ nhớ dùng chung cho mọi Wi-Fi) |
| `net=wifi\|ssid:…` | Máy đã cấp quyền vị trí cho app ⇒ khoá mạng chính xác nhất |
| `measured` ≈ tốc độ speedtest, `declared` thấp hơn | Đang bị số khai chặn trần ⇒ **đúng ca cần ramp** |
| `measured` ≈ `declared` và có `bw: ramp … new=…` | Ramp đã chạy |
| Có `bw: net=… reason=memory` ở đầu phiên | Đã dùng bộ nhớ của mạng này (lần trước đã đo) |
| `reason=clamp` / `bw: ramp bỏ qua — trần … đã chặn` | Trần trên đã chặn, không tăng thêm được nữa |
| `bw: ramp … — hết 5 lượt dựng lại của phiên` | Số mới đã nằm trong bộ nhớ, sẽ áp ở lần kết nối sau (trần 5 lượt để ramp không phá tunnel) |

## 6. Đo phần "số khai đúng" (A/B chẩn đoán, tuỳ chọn)

Muốn kiểm tra nhanh "khai bao nhiêu là đúng" trên chính máy đó mà không cần chờ ramp: ghi file
chẩn đoán vào container của extension rồi Connect lại — giá trị này **thắng mọi quyết định động**
(xem `hysteriaOptions()` trong `HysteriaPacketTunnelProvider.swift`):

```bash
printf 'upKbps=30000\ndownKbps=100000\n' > /tmp/hysteria-diag.txt
xcrun devicectl device copy to \
  --device <TÊN-Ipad> \
  --domain-type appDataContainer \
  --domain-identifier com.privatevpn.app.packet-tunnel \
  --source /tmp/hysteria-diag.txt --destination Documents/hysteria-diag.txt
# đo tốc độ, ghi lại số; đổi downKbps=200000 rồi đo lại ⇒ so sánh
# XOÁ file sau khi đo xong, nếu không tunnel sẽ luôn dùng số ép tay:
xcrun devicectl device copy to --device <TÊN-Ipad> \
  --domain-type appDataContainer --domain-identifier com.privatevpn.app.packet-tunnel \
  --source /dev/null --destination Documents/hysteria-diag.txt
```

Kết quả mong đợi (đo 18–19/09/2026 trên Android/macOS): khai **sát** băng thông thật nhanh nhất;
khai cao hơn thật nhiều (300/1000) ⇒ tụt còn ~1,3 Mbps; khai thấp (8/12) ⇒ trần ~12 Mbps.

## 7. Giới hạn đã biết của bản này

* **Chưa có SSID** trong bản build này. Apple ghi rõ trong `NEHotspotNetwork.h`: `fetchCurrent`
  trả SSID khi app thoả 1 trong 4 điều kiện (quyền vị trí chính xác / đã cấu hình Wi-Fi bằng
  `NEHotspotConfiguration` / đã cài cấu hình VPN đang hoạt động / có `NEDNSSettingsManager`)
  **và** phải có entitlement `com.apple.developer.networking.wifi-info`. Bản này cố ý không có
  entitlement đó (thêm ⇒ cấp lại provisioning profile + prompt vị trí cho khách). Khoá mạng vì
  vậy dùng **MAC router** đọc từ bảng ARP — xem §5. Code vẫn thử `fetchCurrent`: ngày nào thêm
  entitlement thì SSID tự dùng được, không phải sửa code.
* **Trần trên không đọc được link speed Wi-Fi**: `if_media.h` không có trong SDK iPhoneOS (xem
  `linkSpeedKbps`). Trần lấy từ **đỉnh đo được × 1,5**, nên nếu lần đo đầu bị chính số khai chặn
  thì trần cũng bị chặn theo — cần 2–3 lượt đo (hoặc một phiên ramp) mới lên hết.
* **Ramp làm đứt kết nối đang mở** (tạo lại transport). Vì vậy nó chỉ chạy khi tunnel rảnh ≥2s và
  tối đa 5 lượt/phiên. Nếu thấy ramp gây khó chịu khi đang dùng thật ⇒ báo lại để tăng
  `idleBeforeChange` hoặc hạ trần số lượt (`rampMaxAttempts`).
