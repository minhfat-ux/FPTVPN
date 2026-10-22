# QA — Test failover gateway: tắt Mac/Windows thì app PHẢI tìm được đường sống

- **Yêu cầu chủ dự án (23/10/2026):** "bắt windows harness test hết các case để không lặp lại
  lỗi tắt gateway Mac, hoặc Windows, thì app phải tìm đường sống".
- **Phạm vi:** app VPNFlow TV (v90+), ProxyDirector, guard `com.tvflow.watchdog`,
  gateway Mac (`192.168.100.5`) và Windows (`192.168.100.11`).
- **Nguyên tắc số 1:** hệ thống **không bao giờ được để `http_proxy` trỏ vào cổng chết** quá 90 s.
  Không có đường nào sống ⇒ phải fail-open `:0` (TV còn Internet trực tiếp).

## 1. Định nghĩa các tuyến

| Tên | Địa chỉ | Node mặc định |
|---|---|---|
| TV | `127.0.0.1:1081` (local proxy của app) | Flow1 `103.173.155.50` |
| WIN | `192.168.100.11:18081` (gateway laptop) | Flow1 |
| MAC2 | `192.168.100.5:18081` (gateway Mac, smart route) | Flow2; `*.tv360.vn` → Flow3 |
| MAC3 | `192.168.100.5:18083` (tuỳ chọn, Flow3 trực tiếp) | Flow3 `103.6.235.39` |

Ba chế độ: `auto` (ưu tiên điểm cao nhất), `tv` (chỉ TV), `gateway` (chỉ gateway list).

## 2. Ma trận case bắt buộc

| # | Chế độ | Thiết lập | Hành động | Kỳ vọng | Thời gian |
|---|---|---|---|---|---|
| 1 | auto | cả 3 sống | để yên 3–5 phút | giữ tuyến điểm cao (hysteresis, không nhảy liên tục) | – |
| 2 | auto | cả 3 sống | tắt TV tunnel | proxy → WIN hoặc MAC còn sống | ≤75 s (hoặc Refresh ≤15 s) |
| 3 | auto | cả 3 sống | tắt WIN | proxy → TV hoặc MAC | ≤75 s |
| 4 | auto | cả 3 sống | tắt MAC (bootout toàn bộ agent) | proxy → TV hoặc WIN | ≤75 s |
| 5 | auto | WIN đã tắt | tắt tiếp TV | proxy → MAC | ≤75 s |
| 6 | auto | MAC đã tắt | tắt tiếp TV | proxy → WIN | ≤75 s |
| 7 | auto | TV đã tắt | tắt tiếp WIN | proxy → MAC | ≤75 s |
| 8 | auto | cả 3 chết | tắt nốt tuyến cuối | proxy → `:0`, TV có Internet trực tiếp | ≤150 s |
| 9 | auto | đang ở tuyến dự phòng | bật lại TV | proxy quay về TV nếu TV tốt hơn ≥15% | ≤75 s |
| 10 | tv | TV sống | tắt TV | proxy → `:0`, **không** sang gateway | ≤150 s |
| 11 | tv | TV chết | bật TV | proxy → `127.0.0.1:1081` | ≤75 s |
| 12 | gateway | WIN + MAC sống | tắt WIN | proxy → MAC | ≤75 s |
| 13 | gateway | chỉ còn MAC | tắt MAC | proxy → `:0` | ≤150 s |
| 14 | gateway | đang `:0` | bật MAC | proxy → `192.168.100.5:18081` | ≤75 s |
| 15 | auto | – | **cổng mở nhưng tunnel chết** (bridge sống, relay chết) | health-check phải coi là chết, không giữ proxy | ≤75 s |
| 16 | auto | – | gateway rất chậm (relay treo, ~0 kbps) | điểm thấp ⇒ không được chọn; nếu đang chọn phải rời | ≤75 s |
| 17 | auto | – | reboot TV | proxy không trỏ cổng chết; app/guard dọn & đặt lại đúng | ≤120 s sau boot |
| 18 | auto | – | đổi Wi-Fi (mạng khác) | director đánh giá lại, không giữ proxy chết | ≤75 s |
| 19 | auto | – | LMK kill app VPNFlow | guard phát hiện proxy chết → fail-open/gateway; app mở lại đặt đúng | ≤150 s |
| 20 | auto | – | gỡ/cập nhật app | không còn proxy chết sót lại | – |
| 21 | – | Mac smart route | **kill riêng relay Flow3** (bridge vẫn sống) | route `*.tv360.vn` phải fallback sang upstream còn sống (Flow2) hoặc báo lỗi rõ; proxy hệ thống không chết | ≤30 s |
| 22 | – | Mac smart route | **kill riêng relay Flow2** (mặc định) | traffic mặc định (FPT) fallback Flow3 hoặc fail rõ ràng; TV360 vẫn chạy | ≤30 s |
| 23 | – | đang phát FPT LIVE | tắt tuyến đang dùng | stall tối đa ~30 s rồi tự phát lại (hoặc báo lỗi cho user), không treo vĩnh viễn | ≤30 s |

## 3. Cách mô phỏng (dùng thật, không mock)

```bash
# TV tunnel chết (không kill luôn director nếu muốn test director):
adb shell am force-stop com.privatevpn.app.tv.dev      # kill cả app
# hoặc chỉ dừng service tunnel (nếu ROM cho phép)
adb shell am stopservice com.privatevpn.app.tv.dev/com.privatevpn.app.vpn.HysteriaVpnService

# Windows gateway: dừng script gateway (gateway-up.ps1 -Stop) hoặc tắt laptop
# Mac gateway:
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/site.flowvpn.relay.plist
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/site.flowvpn.bridge.plist
# chỉ chết node, giữ cổng mở (case 15/21/22):
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/site.flowvpn.relay3.plist   # Flow3 chết, bridge3 vẫn mở

# Quan sát proxy hiện tại
adb shell settings get global http_proxy
adb logcat -s VPNFLOW_DIAG TVFlowGuard | grep -iE "tuyến|proxy|gateway|fail-open"
tail -f ~/Library/Application\ Support/flowvpn/bridge.log | grep " via "
```

## 4. Tiêu chí nghiệm thu

- Mọi case trong bảng: **proxy luôn trỏ cổng còn sống hoặc `:0`**, không case nào để cổng chết >90 s.
- `auto`: chọn theo **điểm đo thật**, không quay về "tuyến đầu tiên" khi điểm cũ hết hạn.
- `tv`/`gateway`: tôn trọng đúng chế độ (không nhảy chéo).
- Phục hồi **hai chiều** (chết → sống → quay lại tuyến tốt).
- Mac smart route: **fallback theo từng route tên miền** khi node tương ứng chết (case 21/22).
- Bằng chứng kèm theo mỗi case: `settings get global http_proxy` trước/sau, log proxy,
  `diagnostics.log` (điểm các tuyến), `bridge.log` (dòng `via`).

## 5. Mẫu báo cáo

| # | Kỳ vọng | Thực tế | Thời gian chuyển | Pass/Fail | Bằng chứng |
|---|---|---|---|---|---|
| 2 | tự sang tuyến sống | | | | |

## 6. Việc harness cần sửa nếu fail

- Case 21/22: `tools/http-socks-bridge` hiện chọn upstream theo **hậu tố tên miền cố định**;
  cần **health-check từng upstream** (TCP + HTTP 204) và fallback sang upstream kế tiếp khi node chết.
- Case 15/16: health-check phải là request thật (không chỉ TCP), có ngưỡng throughput tối thiểu.
- Case 17/18/19: đảm bảo boot receiver + network callback + guard cùng phối hợp, không đè nhau.
- Case 23: app nên tự retry stream sau khi tuyến đổi (hoặc hiện thông báo thay vì treo).

> Ghi chú: Mac gateway và Windows gateway phải **độc lập** — tắt một bên không được làm mất
> Internet của TV; đây chính là lỗi lặp lại trước đây.
