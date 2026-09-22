# KẾ HOẠCH DEV iOS + macOS — "TỐC ĐỘ & ỔN ĐỊNH KHI XEM VIDEO"

> Lập 22/09/2026 theo yêu cầu chủ dự án. Đầu vào **bắt buộc đọc trước**: `docs/YEU_CAU_TOC_DO_ON_DINH.md`
> (yêu cầu + máy trạng thái + tiêu chí A1–A6), `docs/VERSIONING.md` (sổ phát hành + luật tăng version),
> `docs/PUBLISHER_PROCESS.md` §0/§2b/§2c (điều kiện phát hành + test iPhone thật).
> Phạm vi: **iOS + macOS** (hai bên dùng chung source — `project.yml:215-225,308-316`), làm trước Android/Windows.
> Trạng thái: **KẾ HOẠCH — chờ chủ dự án chốt 3 câu hỏi ở §7 rồi Mac thi công.**

## 1. Kết luận quan trọng nhất: hướng "ramp" hiện tại của iOS/macOS SAI theo yêu cầu mới

`docs/YEU_CAU_TOC_DO_ON_DINH.md` §3.1 đã đo và kết luận: **nâng số khai băng thông (hysteria2 Brutal)
KHÔNG làm tăng tốc độ tải** — server bật `ignoreClientBandwidth: true`; đo thật: khai 3,8 Mbps vẫn tải
35 Mbps, khai 12–13 Mbps tải 5,7–7,1 Mbps.

Nhưng đó lại **đúng là thứ iOS/macOS đang làm**:
- `iOS/PrivateVPNPacketTunnel/HysteriaBandwidthControl.swift` (69 KB) — cả bộ máy "đo → nhớ theo mạng →
  ramp số khai", tới 5 lần dựng lại transport/phiên (`rampMaxAttempts = 5`,
  `HysteriaPacketTunnelProvider.swift:116`);
- `rebuildTransportForBandwidth()` (`:663-713`) — dựng lại transport **chỉ để áp số khai mới**;
- macOS vừa được bật lại đường này (P1b, nhánh `mac/parity-1.4.1`).

⇒ Việc cần làm **không phải** tinh chỉnh `HysteriaBandwidthControl`, mà là **đổi mục tiêu của vòng
ramp sang ĐƯỜNG + NODE**, và **giảm** số lần dựng lại (yêu cầu A4: ≤1 lần/30 phút, phải có log lý do).
Số khai băng thông chỉ còn là tham số phụ (giữ để không tự bóp mạng), **không** phải cơ chế tăng tốc.

## 2. Hiện trạng (số liệu đọc từ code, không suy đoán)

| Hạng mục yêu cầu | iOS/macOS hiện có | Kết luận |
|---|---|---|
| Đo goodput **thật** | CÓ: `HysteriaTransport.utunPacketCounters(fd:)` → `fromGoBytes/toGoBytes` (`HysteriaPacketTunnelProvider.swift:526-537`), lấy mẫu 1 s (`:113`) | **Tái dùng được** làm đồng hồ của máy trạng thái |
| Ramp | Chỉ đổi **số khai** + dựng lại transport (`:663-713`) | ❌ Sai hướng (§1) |
| Thang nâng cấp đường | Không có. Có sẵn 4 thành phần đường: `HysteriaTransport` (QUIC), `WSRelayClient`, `WGRelayClient`, `RelayUDPListener` | ❌ Phải viết mới (`TransportLadder`) |
| Khoá ở mức đã đạt (A3) | Không có khái niệm "stable level" | ❌ |
| Trần dựng lại + log lý do (A4) | Ngược lại: tới 5 lần/phiên cho ramp | ❌ |
| Watchdog "UP mà không có gói" (A5 ≤15 s / hồi ≤15 s) | Mac **đã viết** `LivenessWatchdog.swift` + vòng 15 s + tự dựng lại 3 lần trên nhánh `mac/parity-1.4.1` — **chưa merge vào `main`** | ⚠️ Có code, phải merge + chỉnh ngưỡng theo A5 |
| Kênh dò riêng sau STABLE (A6) | Không có | ❌ Việc lớn nhất của đợt này |
| Giữ interface VPN khi dựng lại (A2) | CÓ: fd cầu `TunnelBridge`, dựng lại transport không đổi tun (`:270-278`) | ✅ Nền tốt, chỉ cần đo khựng ≤1–3 s |
| UI state/message lệch (như Android) | Chưa kiểm | ❓ Phải rà |
| 16 KB page size cho lib Go | Chưa kiểm (`libwg-go.a` + framework Hysteria build bằng gomobile) | ❓ Phải kiểm |

## 3. Máy trạng thái phải implement (bám §2b của yêu cầu)

| Pha | Vào pha | Việc | Ra pha | Log bắt buộc |
|---|---|---|---|---|
| **START** | vừa connect | **ĐO MẠNG GỐC trước** (§4.7) rồi mới khai báo; nối bằng **đường tốt nhất đã nhớ** (lưu trong UserDefaults theo `NetworkIdentity` — đã có), đo goodput 1 s, cửa sổ trượt 12 s | có mẫu goodput đầu tiên | `start: raw=<r> Mbps, path=<x> goodput=<y>` |
| **RAMP** | 15–90 s | goodput < 8 Mbps **và** còn bậc đường chưa thử ⇒ **nâng cấp đường**, tối đa 3 lần, một chiều | goodput ≥ 8 Mbps bền 10 s → STABLE; hết bậc → STABLE mức thấp nhất | `ramp: <bậc cũ> → <bậc mới> (goodput <y>)` |
| **STABLE** | đạt mốc | **khoá** đường + số khai; ghi `stable at <X> Mbps`; **cấm** dựng lại vì lý do tốc độ | đường hỏng (A5) → DEGRADED; kênh dò chứng minh lãi → RAMP | `stable at <X> Mbps (path=<x>)` |
| **PROBE** | trong STABLE, phiên rảnh ≥5 s | mở **kênh riêng** (mục 4.4); nhịp 5 phút → ×2 → trần 30 phút | gain ≥1,25× ở **2 lần liên tiếp** → RAMP; không → giữ nguyên | `probe: no gain (X vs Y) -> keep stable` |
| **DEGRADED** | goodput <2 Mbps **và** probe hỏng, hoặc watchdog kết luận | chuyển đường/node kế tiếp; **phát hiện ≤15 s, có mạng lại ≤15 s** | có mạng → STABLE (mức cũ hoặc thấp hơn) | `degraded: detected in <t>s -> switching` |
| **HOLD** (hết đường — chủ dự án chốt 22/09) | đã thử hết bậc đường mà vẫn không có mạng | **GIỮ đường đã chọn**, tunnel vẫn UP, **KHÔNG** `closeTun()` (không rò rỉ ra nhà mạng), **KHÔNG** hạ tunnel; **ping định kỳ ≤15 s** để chờ mạng về | ping thành công → về STABLE (mức cũ) rồi PROBE lại | `hold: giữ <path>, ping lại mỗi <t>s (lần <n>)` |

## 4. Thiết kế kỹ thuật (file:line, tái dùng tối đa)

### 4.1 `TransportLadder` — MỚI, thuần logic, unit-test được
File mới `iOS/PrivateVPNPacketTunnel/TransportLadder.swift` (thêm vào **cả 2 target** trong `project.yml`).
- Thứ tự bậc (theo §2c của yêu cầu): **QUIC/UDP trực tiếp → TCP relay trực tiếp → WS relay của node khác**.
- Mỗi bậc sinh ra một `HysteriaTransport.Options` khác nhau (host/port/transport) — dùng lại đúng struct
  đang có (`HysteriaPacketTunnelProvider.swift:135` `currentOptions`).
- Hàm thuần: `nextPath(after:)`, `remember(good:)`, `restore()`, `reset()` — test bằng `swiftc` harness
  như Mac đã làm cho `LivenessWatchdog` (30/30 PASS là mức bằng chứng đang dùng).

### 4.2 `GoodputMeter` — tách từ `HysteriaBandwidthControl`
Giữ cửa sổ trượt 12 s / mẫu 1 s trên `utunPacketCounters` (đã có). Trả `goodputKbps` + `isBusy`
(dùng cho "chỉ dò khi rảnh ≥5 s"). **Không** phụ thuộc số khai ⇒ tách được khỏi phần Brutal.

### 4.3 Handoff trong suốt (A2)
Đã có nền: `TunnelBridge` giữ fd, dựng lại chỉ thay transport bên dưới (`:270-278`, `:663-713`).
Việc còn lại: **đo** khựng bằng mốc `fromGo/toGo` trước–sau handoff và ghi log `handoff: stall=<ms>`;
mục tiêu ≤1–3 s. Nếu vượt ⇒ rollback về bậc cũ (giữ STABLE).

### 4.4 `ProbeChannel` — MỚI (A6, việc lớn nhất)
- Mở transport **thứ hai** trên socket/cổng riêng, **có `protect()`** (iOS) — không dùng chung fd với phiên chính.
- Chạy **burst 2–3 s hoặc 1–3 MB**, đo goodput thật rồi **đóng ngay**.
- Chỉ chạy khi: phiên rảnh ≥5 s, không ở chế độ tiết kiệm pin, chưa có kênh dò nào đang chạy (trần 1).
- Nhịp: 5 phút, không lãi thì **giãn ×2 tới trần 30 phút**.
- Ngưỡng "lên được": goodput dò **≥ stable × 1,25** ở **2 lần liên tiếp** ⇒ mới handoff; mức stable mới
  = đo được − 20%.
- Ràng buộc cứng phải log: tốc độ phiên chính không giảm >10% khi dò; **0 lần** rời `Connected`.
- Trần: **3 lần ramp/phiên**; ramp xong quay lại PROBE.

### 4.5 Watchdog (A5) — merge việc Mac đã làm
Merge `LivenessWatchdog.swift` + vòng 15 s từ nhánh `mac/parity-1.4.1` vào `main`, rồi **chỉnh ngưỡng
theo A5**: kết luận "đứng" khi im ≥ **15 s** (không phải 60 s) **và** có bằng chứng bất đối xứng
(máy gửi mà không nhận); tự dựng lại tối đa 3 lần (2/5/10 s).
⚠️ **Sửa theo quyết định 22/09:** hết 3 lần dựng lại ⇒ **KHÔNG** `teardownAndCancel` nữa. Chuyển sang
pha **HOLD** (§3): giữ nguyên đường đã chọn + tunnel UP + ping định kỳ ≤15 s chờ mạng về. Mã
`TUNNEL_NO_TRAFFIC` chỉ dùng để **hiển thị/log**, không dùng để hạ tunnel. Giữ nguyên tinh thần
"không báo oan" (chỉ kết luận khi 2 tín hiệu cùng xấu).

### 4.6 Rà 2 lỗi nhỏ nhưng khách thấy
- **State/message lệch UI** (Android từng bị "Connected" + "Reconnecting…"): kiểm nhánh cập nhật
  `state`/`message` trong `HysteriaPacketTunnelProvider` + `VPNManagerMac.swift:228-241` (app hạ tunnel
  theo message) — đối chiếu xem có xoá `message` khi lên `Connected` không.
- **16 KB page size**: kiểm `Vendor/WireGuardKit` (`libwg-go.a`) + `iOS/Frameworks/Hysteria*.xcframework`
  — `otool -l <binary> | grep -A3 LC_SEGMENT_64` xem `__TEXT` page size; nếu 4 KB thì build lại
  gomobile/Go với `-Wl,-z,max-page-size=16384` (Go ≥1.23). Đây là cảnh báo của Android 16 nhưng cùng
  toolchain gomobile nên phải kiểm.

### 4.7 `RawLinkProbe` — MỚI: đo **MẠNG GỐC** trước khi khai báo (chủ dự án chốt 22/09)
> Nguyên văn: *"Mạng gốc thấp thì đương nhiên VPN cũng bị bóp rồi. Nên cần biết mạng gốc đang ra sao
> rồi mới khai báo cho VPN."*

- **Đo bằng socket `protect()`** (đi thẳng ra nhà mạng, **KHÔNG** qua tunnel) — hoặc đo ngay trước khi
  bật tunnel. Burst **2–3 s / 1–3 MB** tới cùng URL đo (`https://proof.ovh.net/files/10Mb.dat`) để so
  được với goodput qua VPN.
- **Nhớ theo mạng**: lưu raw + thời điểm đo vào đúng bộ nhớ theo `NetworkIdentity` đang có
  (`HysteriaBandwidthControl` đã nhớ theo SSID/router/interface) ⇒ Wi-Fi nhà và 4G có số riêng, lần sau
  không phải đo lại ngay. Đo lại khi **đổi mạng** hoặc mỗi ~10 phút.
- **Dùng để làm 3 việc**:
  1. **Trần mục tiêu** = `min(8 Mbps, raw × biên an toàn)` — mạng gốc thấp thì không coi là fail;
  2. **Chốt số khai** cho VPN: **không vượt** mạng gốc (khai cao hơn ⇒ Brutal flood ⇒ mất gói), cũng
     **không** thấp hơn nhiều (tự bóp);
  3. **Mốc so sánh để biết nút thắt ở đâu**: `VPN goodput << raw` ⇒ nút thắt là **ĐƯỜNG/NODE** ⇒ ramp
     đường có ích; `VPN goodput ≈ raw` ⇒ đã chạm trần mạng thật ⇒ **đừng** ramp vô ích (tiết kiệm pin,
     tránh dựng lại oan).
- Chạy trên hàng đợi riêng, **không** chặn phiên chính; log bắt buộc: `raw: <x> Mbps (net=<identity>)`.

## 5. Thứ tự thi công & bằng chứng

| # | Việc | Ai | Bằng chứng |
|---|---|---|---|
| P0-1 | Merge `mac/parity-1.4.1` (watchdog) vào `main`, chỉnh ngưỡng A5 15 s/15 s | Mac | `swiftc` harness PASS + log thiết bị |
| P0-2 | `GoodputMeter` + `TransportLadder` (thuần logic) | Mac | unit test (harness) PASS, in bảng bậc đường |
| P0-3 | Máy trạng thái START/RAMP/STABLE/DEGRADED + log bắt buộc | Mac | log thiết bị có `stable at <X> Mbps` |
| P0-4 | **Kênh dò** (§4.4) | Mac | log `probe: …` + số đo 2 lần ≥1,25× |
| P1-1 | Rà state/message + 16 KB | Mac | ảnh UI + `otool` output |
| P1-2 | Giảm dựng lại transport vì ramp: từ 5 → **0** (giữ số khai cũ), chỉ dựng lại khi handoff/đường chết | Mac | log `rebuild reason=…` ≤1 lần/30 phút |
| P1-3 | Viết script đo chung (§5 yêu cầu) cho iOS/macOS | Windows (làm được) | script + output 1 phiên |

## 6. Nghiệm thu (dùng CHUNG cách đo của yêu cầu §5)

```
for i in $(seq 1 60); do
  curl -s -o /dev/null -w "%{http_code} %{size_download} %{speed_download} %{time_total}\n" \
    -m 60 "https://proof.ovh.net/files/10Mb.dat"
done
```
- **Đạt**: ≥8 Mbps **duy trì ≥10 phút**, **0 lần rời `Connected`** (đối chiếu log app), ≤1 lần dựng lại
  transport/30 phút và **mỗi lần có lý do trong log**.
- Đo **song song mạng gốc** (VPN tắt) để biết trần nhà mạng.
- ⚠️ Không dùng `speed.cloudflare.com` (đã đo sai: 493 kbps, jitter 992 ms trên đường RTT cao — chính
  `YEU_CAU_TOC_DO_ON_DINH.md` §5 đã cảnh báo).
- Trên iPhone/Mac: chạy vòng lặp này **qua tunnel** + xuất log chẩn đoán của app làm bằng chứng trạng thái.

## 7. Ba câu hỏi PHẢI chủ dự án chốt trước khi code (không tự quyết)

1. **Chính sách khi không còn đường nào** (`YEU_CAU_TOC_DO_ON_DINH.md` §4.2) — ✅ **CHỐT 22/09/2026 (chủ dự án):**
   *"Hết mọi đường thì dùng được đã chọn và chờ ping tiếp thôi."*
   ⇒ Nghĩa là: **KHÔNG** `closeTun()` (không để máy đi thẳng ra mạng nhà mạng), **KHÔNG** hạ tunnel,
   **KHÔNG** báo lỗi rồi đứng. Giữ **đường đã chọn** (last-good), tunnel vẫn `Connected`, và **ping định
   kỳ** (nhịp ≤15 s để thoả A5) chờ mạng về; ping được ⇒ về STABLE mức cũ rồi chạy lại PROBE.
   Đây là pha **HOLD** ở §3. Hệ quả kỹ thuật: khi ở HOLD, UI **không** được đổi trạng thái VPN (vẫn
   Connected); thông báo (nếu có) chỉ là dòng phụ, không chặn; và **cấm** mọi lần `closeTun()`/teardown
   vì lý do tốc độ.
2. **Mạng gốc < 8 Mbps** — ✅ **CHỐT 22/09/2026 (chủ dự án):** *"Mạng gốc thấp thì đương nhiên VPN
   cũng bị bóp rồi. Nên cần biết mạng gốc đang ra sao rồi mới khai báo cho VPN."*
   ⇒ Không coi là fail. Nhưng **bắt buộc đo mạng gốc TRƯỚC** rồi mới khai báo: trần mục tiêu =
   `min(8 Mbps, mạng gốc × biên an toàn)`; nếu mạng gốc < 8 thì STABLE ở mức đạt được và ghi log
   `target capped by raw=<x> Mbps`. Số khai **không được vượt** mạng gốc (khai cao hơn chỉ làm Brutal
   flood ⇒ mất gói), và cũng **không** khai thấp hơn nhiều (tự bóp). Chi tiết: §4.7.
3. **Có được nâng cấp sang node KHÁC không** (A6 nêu "WS relay của node khác") — ⏳ *chờ chốt; đã giải thích cho chủ dự án 22/09.*
   **Node = máy chủ thoát** (node-1 `103.173.155.50`, node-2 `165.101.114.162`); khách chọn trong
   Settings (`VPNManager.swift:138-150`) và **IP thoát = IP của node đó**.
   - *Nâng cấp ĐƯỜNG* (QUIC/UDP → TCP relay → WS relay): **giữ nguyên node, IP thoát KHÔNG đổi** — đây
     là phần chính của kế hoạch, khách gần như không thấy gì.
   - *Nâng cấp NODE* (node-1 → node-2): **ĐỔI IP thoát** ⇒ web/ngân hàng/streaming có thể bắt đăng nhập
     lại, captcha, đổi vùng; phải bắt tay lại với khoá/config **của node khác** (đã có bug thật khi
     dùng chung URL relay cho mọi node — `VPNManager.swift:140-142`); hạ tầng có thể tính phiên/quota
     theo node.
   Ba lựa chọn: **(A)** không bao giờ đổi node giữa phiên (node chết ⇒ HOLD, khách tự đổi node);
   **(B)** chỉ nhảy node khi node hiện tại **CHẾT HẲN** (không phải chỉ chậm) — ưu tiên giữ node, node
   sống lại thì quay về node khách đã chọn; **(C)** nhảy cả khi chỉ chậm (đổi IP liên tục) — **không
   đề xuất**. *Đề xuất của Windows harness: **(B)**.*

## 8. Phụ thuộc & rủi ro

- **wsrelay phải khoẻ trước** (yêu cầu §3.3–3.4: cầu WS chết sau 11–19 ping, hồi 50–65 s; sự cố
  22/09 15:15–15:20 relay không trả pong). Client có làm đúng cũng không đạt A5 nếu relay chết ⇒
  việc này thuộc **server/node**, phải kiểm song song (đã có việc `T-20260922-09` cho server).
- **iOS: kênh dò trong extension** — extension là tiến trình riêng, phải bảo đảm socket dò `protect()`
  đúng, nếu không nó đi vòng ra ngoài tunnel và cho số sai.
- **Pin/data**: kênh dò phải tôn trọng chế độ tiết kiệm pin (yêu cầu §2c "không dò khi pin yếu") —
  cần API `ProcessInfo.isLowPowerModeEnabled` trong extension.
- **Phát hành**: theo `docs/VERSIONING.md` — bên build tăng version trong `project.yml` rồi mới build;
  đề xuất đợt này là **1.5.0** (iOS `CURRENT_PROJECT_VERSION` 18, macOS 16) — *chờ chủ dự án chốt số*.
  Sau khi build: cổng chặn → test iPhone thật (`PUBLISHER_PROCESS.md` §2c) → sổ `release-record append`
  → tag → email do publisher gửi.
