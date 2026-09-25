# CHẨN ĐOÁN iOS — "tự disconnect / số diagnostics không đúng / không ramp như Android"

Ngày 24/09/2026 (tối) · Người làm: harness Mac · Bằng chứng: `relay.log` **máy thật** (iPhone 14 Pro
Max, bản 1.4.4/21, phiên 15:47→22:07, 2.828 dòng) kéo bằng
`xcrun devicectl device copy from --domain-type appDataContainer --domain-identifier com.privatevpn.app.packet-tunnel`.

## 1. Số liệu đo được từ log

| Chỉ số | Giá trị | Ghi chú |
|---|---|---|
| `transport vừa thay (ramp băng thông)` | **7 lần / 1 phiên** | mỗi lần là một lần khách thấy "đứt rồi nối lại" |
| `transport vừa thay (tự phục hồi sống-còn)` | 1 lần | 22:07:12 — lúc tunnel chỉ **RẢNH** |
| `stopTunnel: reason=1` (userInitiated) | 5 lần | phần lớn là khách bấm Connect lại (app dọn phiên cũ) |
| Nhịp lấy mẫu thật | **~25 s/mẫu** (min 10 s, max 224 s) | code đặt 1 s; timer bị nghẽn bởi probe chặn trong cùng hàng đợi |
| Nguồn đo có đúng? | **ĐÚNG** khi có tải: bridge 21.650 kbps ↔ `observed=16.779` | 21:22:45 — **không** phải lỗi "bộ đếm hỏng" như nghi ngờ ban đầu |

## 2. Chuỗi nhân–quả (mỗi mắt đều có dòng log)

1. Vòng ramp quyết định áp số mới **giữa phiên** ⇒ `bw: ramp-apply … apply=idle-now` (21:21:02)
   ⇒ **dựng lại transport** (`transport vừa thay (ramp băng thông)`).
2. Dựng lại ⇒ **bộ đếm cầu reset về 0** (`Go→packetFlow` 15.311 gói → 10.556 gói; 21:21:18
   `observed=0 rawWindowBytes=0`).
3. `observed≈0` ⇒ vòng ramp và watchdog lại tưởng "đường chết" ⇒ dựng lại/gỡ tiếp. Ví dụ watchdog
   22:07:12: *"không tiến triển 10s: chiều về đứng yên (delta ra 0) trong khi máy vẫn gửi (delta
   vào 36)"* ⇒ `TỰ DỰNG LẠI transport` — dù 45 s trước đó chiều về **vẫn chảy** (4979 → 4997 gói).
4. Nếu "im lặng" đủ 45 s ⇒ `selfRescue` → `setStatus(code: codeNoTraffic)` + gỡ tunnel; **app** đọc
   mã đó rồi `stopVPNTunnel()` + `state = .failed` (`iOS/PrivateVPN/VPNManager.swift:283-301`)
   ⇒ khách thấy **"tự ngắt"**.

## 3. Android đã giải đúng bài này (nguồn sự thật)

`android/app/src/main/java/com/privatevpn/app/vpn/HysteriaVpnService.kt` — `applyRampDecision`
(nguyên văn):

> "KHÔNG dựng lại client giữa phiên (bỏ hẳn nhánh `if (idle) Mobile.stop()` cũ).
> Vì sao (đo trên máy 21–22/09/2026, 11,7 giờ): có **33 lần** log ghi `apply=idle-now` ⇒ 33 lần
> dựng lại QUIC giữa phiên, mỗi lần là một lần "đứt rồi nối lại" mà khách thấy — trong khi lợi ích
> của việc đổi số khai giữa phiên gần như bằng 0 (server đã bật `ignoreClientBandwidth`; đo thực tế:
> khai 3,8 Mbps vẫn tải được 35 Mbps, tức số khai KHÔNG bóp chiều tải xuống). Số mới vẫn được ghi
> nhớ (`rememberBest`) và áp ở lần kết nối/đổi mạng kế tiếp."

Watchdog Android: `PROBE_INTERVAL_MS = 15_000`, `RELAY_SILENCE_WARN_SEC = 45` (**chỉ cảnh báo**),
`PROBE_WINS_NEEDED = 2`; comment dòng 1846: phát hiện thật trong ~30–60 s, **không phải ~10 s**.

## 4. Đã sửa (bản 1.4.5 / build 22)

| # | File | Sửa | Vì sao |
|---|---|---|---|
| 1 | `iOS/PrivateVPNPacketTunnel/HysteriaBandwidthControl.swift` | `allowsTransportRebuild`: `true` → **`false`** | Đường tự-áp giữa phiên chuyển sang `deferBandwidthRampForNextConnect()` (đã có sẵn + có test): **ghi nhớ** số mới theo mạng, áp ở lần kết nối/đổi mạng kế tiếp — đúng Android. Hết 7 lần swap/phiên |
| 2 | `iOS/PrivateVPNPacketTunnel/HysteriaPacketTunnelProvider.swift` | luật H2 dùng `stallSilenceDeadline = 45` (thay `tcpBlackholeDeadline = 10`), thêm `stallStrikesToRebuild = 2`, `stallTeardownDeadline` 45 → **120** | Hết dựng lại/gỡ oan khi tunnel RẢNH. Vẫn giữ: TCP blackhole đầu phiên (SYN mà không SYN-ACK) gỡ sau **10 s** |
| 3 | cùng file | thêm `supervisorStallStrikes` (về 0 khi chiều về có gói mới; về 0 ở đầu phiên) | Đếm strike LIÊN TIẾP như `PROBE_WINS_NEEDED = 2` của Android |

**Không đụng**: MTU (1300), DNS, entitlements/keychain, relay/WS, ngưỡng ramp, nguồn byte của vòng
ramp. Đường dựng lại transport vẫn còn cho 2 ca **hợp lệ**: đổi mạng giữa phiên và watchdog tự phục
hồi khi tunnel hỏng thật.

## 5. Việc còn lại

1. Cài 1.4.5/22 lên iPhone thật (`xcrun devicectl device install app`) và cho chủ dự án dùng thật.
2. Kéo `relay.log` mới, kiểm 3 điều: **0** dòng `transport vừa thay (ramp băng thông)`; **0** lần
   `TỰ DỰNG LẠI` trong lúc rảnh; số Diagnostics khớp Ookla (± cùng bậc) và ổn định.
3. Đạt **§2c (7 mục)** rồi mới phát hành — lần này `scripts/publish-ios.sh --device-test <file>` chạy được.

---

# PHẦN 2 — Ca thật "Connected mà KHÔNG có mạng" (24/09 22:23→22:56) + bản vá build 24

Sau khi cài **1.4.5 (22)** (bỏ tự-áp giữa phiên) và cho chạy thật 32 phút, máy **vẫn** vào trạng
thái "Connected mà không có mạng"; chủ dự án phải **tự tắt VPN lúc 22:56**. Log iPhone (khoảng
22:23:42→22:56:00) — đây là **ca thứ hai**, khác hẳn ca ramp ở Phần 1:

| Bằng chứng | Số đo |
|---|---|
| Máy **gửi** vào tunnel | **180 gói / 15 s** (≈5,5 MB upstream cả phiên) |
| Chiều **về** | **10 gói / 15 s** — nhỏ giọt ~1,5 gói/s; tổng 12,25 MB / 32 phút |
| Heartbeat relay (`ws-relay: heartbeat`) | `framesFromRelay`/`bytesFromRelay` **đóng băng >30 s** |
| `dung-lai`/`TỰ GỠ` trong phiên | 0 / 0 |
| Watchdog sống-còn kết luận | **`.alive` suốt 32 phút** (`nhịp 20 — alive; delta 15s: vào 180 gói, ra 10 gói`) |

## Nguyên nhân gốc (lỗi LUẬT, không phải ngưỡng)

`LivenessWatchdog.tick` coi **chỉ cần 1 gói chiều về** là tunnel sống:
`if fromGo > lastFromGo { return .alive }`. Khi đường về suy giảm thành **dòng nhỏ giọt nhưng
không bao giờ bằng 0**, luật này không bao giờ kết luận hỏng — tăng `silenceLimit` lên bao nhiêu
cũng vô ích, vì nhánh `.alive` chạy trước. Vì vậy watchdog không dựng lại, không gỡ tunnel, khách
ngồi im trong trạng thái "Connected" mà không có mạng.

## Đã sửa (build **1.4.5 (24)**)

Thêm **bằng chứng hỏng mạnh nhất** — chính thứ app đã dùng ở đầu phiên
(`startTrafficSupervisor`, `tcpBlackholeDeadline`): **có SYN gửi vào tunnel mà KHÔNG có SYN-ACK nào
về trong ≥ `silenceLimit` (15 s)** ⇒ chặng về đứt.

| Vì sao tín hiệu này đúng | |
|---|---|
| Không thể là "tải chậm" | TCP bắt buộc có SYN-ACK mới mở được kết nối |
| **Không bắt oan khi khách UPLOAD** | luồng upload đã bắt tay xong từ trước ⇒ không sinh SYN mới; nếu có mở luồng mới thì SYN-ACK phải về ngay khi đường còn tốt |
| Không bắt oan lúc mới mở luồng | phải **giữ ≥15 s** kể từ SYN đầu tiên chưa được trả lời |
| Chống rung | vẫn cần **2 strike liên tiếp** mới dựng lại |

Kèm theo: mọi lần kết luận hỏng giờ ghi **lý do cụ thể** vào log
(`lastStallEvidence`, ví dụ `[SYN vào 12 gói mà KHÔNG có SYN-ACK nào về (tổng SYN-ACK 0), trong khi
chiều về chỉ nhỏ giọt 3 gói]`) — lần sau không phải đoán luật nào đã bắt.

Test: `scripts/ios-pure-logic-tests/run.sh` → **295/295 PASS** (thêm 5 khẳng định: SYN chưa đủ 15 s
⇒ chưa kết luận; ≥15 s ⇒ strike; đủ 2 strike ⇒ rebuild; đường tốt có SYN-ACK ⇒ `.alive`;
**upload lớn không bị báo oan**).

## Còn lại (cần chủ dự án chốt)

- Nếu dựng lại transport **3 lần liên tiếp vẫn không có mạng**, app hiện vào pha **HOLD** (giữ
  nguyên tunnel) theo chốt 22/09/2026 ⇒ **vẫn ở trạng thái "Connected mà không có mạng"**. Đề xuất
  đổi nhánh này thành **tự trả mạng về máy** (`selfRescue` → `codeNoTraffic` → app
  `stopVPNTunnel()`), vì "VPN tắt" dễ chịu hơn "Connected mà không có mạng". Chờ anh chốt.
- `observedKbps` trên thẻ Diagnostics khi tunnel rảnh là **số nền**, không phải lỗi.

---

# PHẦN 3 — Watchdog CÂM từ build 25 (0 nhịp tim) + bản vá build 27

## 1. Phát hiện (đo trên log máy thật, đếm nhịp tim theo từng phiên)

| Phiên | Nhịp tim `giám sát sống-còn: nhịp N` | Kết luận |
|---|---|---|
| **1.4.5 (22)** 22:23→22:56 | **28** | watchdog chạy |
| **1.4.5 (24)** 23:05→23:12 | **4** | chạy |
| **1.4.5 (25)** 23:13→23:24 | **0** | ❌ **câm** |
| **1.4.5 (26)** 23:24→23:35 | **0** | ❌ **câm** |

Kèm 2 dấu vết: `BỎ QUA nhịp 1 — đang trong chuỗi tự dựng lại` (1 lần) và
`watchdog NGỪNG chạy` (1 lần) rồi **im hẳn**. Hệ quả: mọi luật phát hiện (SYN-không-SYN-ACK,
relay-stall) **không bao giờ chạy** — đúng lúc relay đóng băng 46 s (23:28:23→23:29:09) mà không ai bắt.

## 2. Chuỗi nguyên nhân (3 lỗi chồng nhau, đều do đợt sửa 24/09 tối)

1. **Nhịp watchdog chạy trên `queue` dùng chung** với `performBandwidthRebuild` /
   `rebuildTransportForLiveness` — hai lời gọi **CHẶN** (chờ WS/QUIC bắt tay). Một lượt dựng lại kẹt
   ⇒ nhịp câm luôn.
2. **`livenessRecovering` giữ `true` vô hạn**: bỏ nhánh "chịu thua/HOLD" mà **không có trần thời
   gian** cho một lượt dựng lại ⇒ mọi nhịp sau bị `guard !recovering` bỏ qua.
3. **Phiên đổi ⇒ huỷ vĩnh viễn watchdog**: nhịp đầu thấy `livenessSession != currentSession` thì gọi
   `cancelLivenessWatchdog()` — hàm này tắt **cả đồng hồ chết** (`watchdogGuardTimer`) và đặt
   `livenessCancelled = true` ⇒ không còn ai bật lại.

## 3. Bản vá build 27

| # | Sửa | Chi tiết |
|---|---|---|
| 1 | Thêm **hàng đợi riêng** `livenessQueue` | Nhịp watchdog không còn dùng chung `queue` với việc dựng lại ⇒ dựng lại kẹt cũng không làm câm nhịp |
| 2 | Thêm **`recoveryQueue`** | Việc tự dựng lại (lời gọi chặn) chạy ở đây, tách khỏi nhịp |
| 3 | **Trần thời gian** `recoveryStuckTimeout = 120 s` | Hết trần mà vẫn `recovering` ⇒ nhả cờ + nhả quyền dựng lại để nhịp sau thử tiếp (log rõ `tự phục hồi: KẸT >120s …`) |
| 4 | Phiên đổi ⇒ **BẬT LẠI** thay vì huỷ | Log `phiên đổi N→M — BẬT LẠI watchdog (trước đây huỷ vĩnh viễn ⇒ watchdog câm)` |

Test logic thuần: **300/300 PASS**.

## 4. Cách nghiệm thu (bắt buộc kiểm sau khi cài)

1. Trong log phải có `giám sát sống-còn: nhịp 4`, `nhịp 8`, … **đều đặn mỗi 60 s** (bằng chứng
   watchdog còn đập). Nếu lại 0 nhịp ⇒ phải dừng và điều tra tiếp, KHÔNG coi là đã xong.
2. Khi relay đóng băng (`udpFrames`/`bytesFromRelay` không đổi ≥20 s trong khi bridge vẫn đẩy gói)
   ⇒ phải thấy `máy đẩy N gói vào cầu trong nhịp vừa rồi mà relay KHÔNG nhận thêm frame nào …`
   rồi `đủ 2 strike — TỰ DỰNG LẠI transport`, và sau đó `udpFrames` phải **chạy lại**.
3. Không được có `HOLD` (đã bỏ nhánh chịu thua) và không được `TỰ GỠ` khi đường chỉ chậm.
