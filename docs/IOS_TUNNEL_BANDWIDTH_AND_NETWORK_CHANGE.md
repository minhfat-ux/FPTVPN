# iOS — CƠ CHẾ BĂNG THÔNG, RAMP, WATCHDOG & ĐỔI MẠNG (nguồn sự thật cho agent)

> Viết 25/09/2026 sau một đêm sửa lỗi thật trên iPhone 14 Pro Max + iPad (A16). Mọi con số dưới đây
> **đo từ log máy thật** hoặc **trích file:line** — không phải mô tả suông.
> Bất biến + cổng chặn nằm ở `AGENTS.md` §7. **Đọc §7 trước khi sửa; đọc file này để hiểu vì sao.**

## A. Đường đi của gói & nguồn số

```
app khách ─┐
           ├─► NEPacketTunnelFlow ──► TunnelBridge (cầu packetFlow↔fd) ──► socketpair ──► Go/hysteria
hệ thống ──┘        (bridgeCounters: toGo/fromGo + toGoBytes/fromGoBytes)         │
                                                                                  ▼
                                                            WSRelayClient (udpFrames/bytesFromRelay)
                                                                                  │
                                                            wss://api.meetflowai.site/relay/<node>
                                                                                  ▼
                                                                     hysteria node (UDP 8443)
```

| Việc | Nguồn số | Ghi chú |
|---|---|---|
| Hiển thị Down/Up trên thẻ Diagnostics | `bridgeCounters.fromGoBytes/toGoBytes`, nhịp riêng **1 s** (`startDisplayTicker`) | Lấy trung bình 3 mẫu |
| Vòng ramp (chốt số khai) | cùng nguồn byte, qua `BandwidthControl.sample` | **1 mẫu/giây** là thiết kế |
| Watchdog "không chở gói" | gói `toGo/fromGo/toGoDropped` (cầu) **+** `udpFrames/bytesFromRelay` (relay) | Có luật relay-stall + SYN |
| Tự phục hồi / đổi mạng | như trên | Dựng lại transport, **giữ TUN** |

⚠️ `src=utun` trong dòng `bw: sample` là **chuỗi in cứng**, KHÔNG phải chỉ báo nguồn thật.

## B. Luật cấp phát số khai (parity Android)

- **Nấc tĩnh theo loại mạng** (`NetworkTier`): Wi-Fi/wired `30/100 Mbps` · di động `8/12 Mbps`
  (= `Config.HY_UP/DOWN`, `Config.MOBILE_UP/DOWN` của Android). **Chỉ áp khi không có số đo.**
- **`decide`** (port 1-1 từ `BandwidthPolicy` của Android, có test): 4 dải 150/95/80%, giảm xóc 60%,
  sàn 500/1000, `declareRatioPct = 85`.
- **Đo đường thật TRƯỚC khi mở client** (`preMeasure`, 1,5 MB / 2,5 s / 200 KB), rồi:
  - bắt tay **< 200 ms** ⇒ dùng công thức Android (`whole request`);
  - bắt tay **≥ 200 ms** ⇒ **luôn dùng số của PHẦN ĐỌC** (không tính bắt tay);
  - **bỏ mẫu** chỉ khi **phần đọc** mỏng: `< 200 ms` hoặc `< 200 KB`.
- **Số đo TƯƠI luôn thắng bộ nhớ**: có số đo ⇒ `down = 85% × số đo` (kẹp nấc tĩnh + sàn/trần).
  Bộ nhớ chỉ dùng khi đo hỏng, và bị kẹp `best ≤ 1,5 × số đo gần nhất`.
- **Mạng mới + đo hỏng** ⇒ khởi điểm thận trọng (`12/8 Mbps`, `reason=cautious-new-network`) rồi để ramp leo.

## C. Bộ nhớ theo mạng (chống khai sai giữa các mạng)

- Khoá ưu tiên: `wifi|ssid:<SSID>` → `wifi|router:<MAC>` → `wifi|if:en0`; di động `cell|if:pdp_ip0`.
  Đọc theo `lookupKeys` (hẹp → rộng) nên bản ghi cũ vẫn gặp được.
- SSID cần **entitlement `com.apple.developer.networking.wifi-info`** (app + extension) **+ quyền vị trí**
  (`NSLocationWhenInUseUsageDescription`, app xin khi Connect). Đã bật capability cho cả 2 App ID và
  **kiểm chứng trong IPA**: `wifi-info = CO` ở `FlowVPN.app` và `PrivateVPNPacketTunnel.appex`.
- **Đổi mạng THẬT** (`NetworkChangePolicy.isRealChange`) ⇒ `resetMeasurementForNewNetwork()` xoá
  `peak*`, `hasRealMeasurement`, `everMeasured`, vòng mẫu 12 s, `stable`, proxy mất gói, số đo đường thật
  ⇒ **đỉnh mạng cũ không bao giờ ghi cho mạng mới**. Ca "khoá chỉ đổi MỨC CỤ THỂ" (cùng mạng) thì **không** xoá.

## D. Ramp trong phiên — đang TẮT có chủ đích

- `allowsTransportRebuild = false`. Số mới **ghi nhớ** và áp ở **lần kết nối/đổi mạng kế tiếp**
  (`apply=deferred-next-connect`) — đúng Android.
- **Vì sao tắt**: build 29 (25/09) bật lại ⇒ trên máy thật tunnel **tự ngắt rồi KHÔNG nối lại được**.
  Android cũng cố ý không dựng lại giữa phiên (đo 11,7 giờ: 33 lần `apply=idle-now` = 33 lần khách thấy đứt).
- Muốn "đổi số mà không chạm khách" thì phải thêm hàm đổi băng thông lúc chạy ở **cầu Go**
  (`Mobile.objc.h` hiện chỉ có `MobileConnect/MobileServe/MobileStop`, số khai đọc MỘT LẦN) ⇒ phải sửa Go + build lại framework.

## E. Watchdog & tự phục hồi (đừng làm câm nó)

- Nhịp **15 s**; `livenessSilenceLimit = 15 s`; `strikesToRebuild = 2`; trần **45 s** mới dựng lại;
  teardown **120 s**.
- **Luật relay-stall** (Android parity): máy đẩy gói vào cầu mà `udpFrames` **đứng yên ≥20 s** ⇒ strike.
  Ca thật 22:23→22:56: máy gửi 180 gói/15 s, relay đóng băng >30 s, watchdog cũ trả `.alive` suốt 32 phút.
- **Luật SYN**: có SYN vào mà **không có SYN-ACK** nào về ≥15 s ⇒ strike (miễn nhiễm ca khách đang UPLOAD).
- **Không bao giờ bỏ cuộc**: bỏ nhánh "chịu thua/HOLD"; thử lại ngầm **mãi** với nhịp 2→5→10→20→30→60 s.
- **Hàng đợi RIÊNG** cho nhịp watchdog (`livenessQueue`) và việc dựng lại (`recoveryQueue`): build 25/26
  từng có **0 nhịp tim suốt phiên** vì nhịp nằm chung hàng đợi với lời gọi CHẶN.
- Trần `recoveryStuckTimeout = 120 s`: hết trần mà vẫn `recovering` ⇒ nhả cờ + nhả quyền để nhịp sau thử tiếp.

## F. ĐỔI MẠNG GIỮA PHIÊN ⇒ tự dựng lại transport (parity Android)

- Android: `NetworkMonitor` bật `rebuildRequested` → `rebuild: transport torn down → reconnecting on the new network`.
- iOS: `networkChangeStep(now:)` (gọi mỗi nhịp 1 s trong `bandwidthStep`) → `rebuildTransportForNetworkChange()`:
  - Đường **RIÊNG**, KHÔNG dùng `allowsTransportRebuild`;
  - **1 lần cho mỗi lần đổi mạng** + **cooldown 10 s** (`NetworkChangePolicy`), lọc "đổi mạng giả"
    (`other|if:unknown`, hoặc khoá cũ nằm trong `lookupKeys` của danh tính mới = cùng mạng);
  - Giữ TUN/route, dùng `performBandwidthRebuild` + `retargetTunnelFD`, kiểm chứng **≤3 s có gói vào cầu mới**;
  - **Thất bại ⇒ rollback transport cũ nhưng GIỮ số khai của MẠNG MỚI** (không bao giờ khai số Wi-Fi lên 4G/5G);
    nếu cả hai lần đều không lên ⇒ nhả quyền rồi vào chuỗi thử-lại-ngầm;
  - Log để grep: `bw: đổi mạng ⇒ dựng lại transport — lý do: net <cũ> -> <mới>` … `kết quả: ok declared up=… down=…`.

## G. Nghiệm thu bằng log máy thật

```bash
xcrun devicectl device copy from --device <id> --domain-type appDataContainer \
  --domain-identifier com.privatevpn.app.packet-tunnel --source Documents --destination /tmp/logs
```
Đọc `relay.log`. **Bảng 6 ca phải cover** (đo trên máy thật 24–25/09/2026):

| # | Ca | Bằng chứng đã có | Kỳ vọng |
|---|---|---|---|
| 1 | SSID mới | `net=wifi\|ssid:Minh's Z Fold5` → `wifi\|ssid:ICONLABHOTEL` | đổi khoá, không thừa hưởng số mạng cũ |
| 2 | WiFi khác băng thông | hotspot `500/1207` vs khách sạn `3993/13311`; iPad `42586` (85% × 50102) | số khai bám đo của chính mạng đó |
| 3 | 4G/5G | `net=cell\|if:pdp_ip0`, `ceil=12000`, `10.631 = 85% × 12.508` | khai theo nấc di động, không lẫn số WiFi |
| 4 | Đo hỏng | `do mang thuc te KHONG do duoc o ca 2 nguon → giu so cu`; mạng mới ⇒ `12/8` | lùi bộ nhớ / khởi điểm thận trọng |
| 5 | Đổi mạng giữa phiên | `bw: net đổi giữa phiên …` | tự dựng lại transport, mạng chạy lại ≤~6 s, **không** tự gỡ tunnel |
| 6 | Đo trừ bắt tay | `phần đọc 281–1784ms sau bắt tay 120–1014ms` | hết sai 7× (5.409 → 38.272/50.102 kbps) |

### G1. Điều kiện ĐẠT của cổng log — bổ sung 25/09/2026 (ba lỗi đã LỌT cổng cũ)

```bash
xcrun devicectl device copy from --device <id> --domain-type systemCrashLogs \
  --source . --destination <dir>/crash
python3 scripts/ios-log-acceptance.py <dir>/relay.log --crash-dir <dir>/crash   # exit 1 = KHÔNG ĐẠT
```

| Tiêu chí mới | Dấu hiệu trong log | Ca thật |
|---|---|---|
| **Chiều về ĐÓNG BĂNG một chiều** | ≥3 khoảng `bridge:` (mỗi khoảng 5 s) liên tiếp máy gửi ≥20 gói mà `Go→packetFlow` KHÔNG tăng gói nào | Mac 25/09 19:42–19:43, relay `vn1hy`: 17 khoảng, máy gửi 1277 gói, chiều về đứng ở 360729 gói/125.639.055 B ⇒ app dựng lại transport **3 lần trên CÙNG relay** |
| **Jetsam/crash của extension** | `JetsamEvent-*.ips` có `PrivateVPNPacketTunnel` (`reason=per-process-limit`) hoặc `PrivateVPNPacketTunnel-*.ips` rơi vào khoảng phiên nào | iPad 25/09 19:09:42: `rpages=3202` ≈ 51 MB ⇒ iOS giết extension, log **không** có `stopTunnel`; iPhone còn ca `rpages=3200` (24/09) |
| **Phiên đầu file** | phần trước mốc `build: version=` đầu tiên vẫn được chấm (nhãn build `?`) | ca một chiều ở trên nằm đúng phần đầu file — cổng cũ **bỏ qua nguyên ca** |
| **Nội suy chuỗi lộ ra log** | dòng chứa `\(tên_biến)` nguyên văn | `HysteriaPacketTunnelProvider.swift:3515` thiếu dấu `\` ⇒ in ra `(\(code))` thay vì mã lỗi |

## H. Bẫy đã sập thật (đọc để không lặp lại)

| Bẫy | Triệu chứng | Chốt chặn |
|---|---|---|
| Bật tự-áp số khai trong phiên | Tunnel tự ngắt, **không nối lại được** (build 29) | §7c + `allowsTransportRebuild=false` |
| Nhịp watchdog chung hàng đợi với lời gọi chặn | **0 nhịp tim** suốt phiên ⇒ mọi luật không chạy | `livenessQueue`/`recoveryQueue` |
| Đo goodput tính cả bắt tay | Sai **7×** ⇒ khai thấp, ramp không leo | `PreMeasurePolicy` (ưu tiên phần đọc) |
| Khoá bộ nhớ chung `wifi\|if:en0` | Mang số WiFi này sang WiFi khác | entitlement wifi-info + khoá theo SSID |
| Đỉnh đo mạng cũ ghi cho mạng mới | Nhiễm số chéo mạng | `resetMeasurementForNewNetwork()` |
| **Thiếu env credential khi build** | IPA rỗng `HysteriaPassword` ⇒ `TUNNEL_START_FAILED` ⇒ **"bật lên tắt ngay"** (build 33) | cổng `archive-appstore.sh` + `ios-verify-ipa.sh` |
| `swiftc -parse` PASS nhưng thiếu hàm | Archive FAIL sau 15 phút build | phải `-typecheck`; không build lúc agent đang sửa |
| **Giữ `flowLock` rồi gọi hàm có `flowLock.lock()`** (`NSLock` không tái nhập) | Từ build 25→34 (26 phiên máy thật): mỗi phiên đúng **2 dòng `bw: sample`** (+5 s, +15 s) rồi im, **0 nhịp tim**, thẻ Diagnostics đứng im, không ramp, không dò được đổi mạng — mà cầu vẫn chở gói và vẫn in nhịp 5 s nên log trông "bình thường" | §7c + `scripts/ios-log-acceptance.py` (đếm theo phiên); trong vùng khoá đọc thẳng `transport`/`bridge` |
| **Chiều về đứt MỘT CHIỀU mà không đổi đường** | WS mở, handshake xong, watchdog có nhịp, máy vẫn gửi gói — nhưng `Go→packetFlow` đứng yên tuyệt đối (Mac 25/09 19:42–19:43, relay `vn1hy`: 17 khoảng, 1277 gói gửi, chiều về đứng ở 360729 gói) | `RelayFailoverWatch` (cửa sổ 15 s, 2 cửa sổ 0 gói về ⇒ đổi đường) + cổng log `--crash-dir`/một-chiều |
| **Extension chạm trần bộ nhớ per-process** | `JetsamEvent-*.ips`: `PrivateVPNPacketTunnel` `reason=per-process-limit`, `rpages=3202` ≈ 51 MB (iPad 25/09 19:09:42) — phiên kết thúc mà **không** có `stopTunnel` | ticker tài nguyên 60 s (footprint/resident/fds) + cổng log đọc crash report bắt buộc |
| **Chuỗi Swift thiếu dấu `\`** | log in nguyên văn `(\(code))` thay vì mã lỗi (HysteriaPacketTunnelProvider.swift:3515, iPad 25/09 19:08:41) | cổng log bắt "NỘI SUY CHUỖI LỘ RA LOG" |

