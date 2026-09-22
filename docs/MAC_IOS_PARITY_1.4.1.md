# Parity macOS/iOS với Windows 1.4.1 — watchdog & tự dựng lại

> Ghi 21/09/2026 theo yêu cầu chủ dự án: *"xem lại hiện trạng bản Mac và iOS để so sánh với bản
> Windows. Bản Windows đang chạy rất ổn định, cần update macOS và iOS tương tự."*
> Trạng thái: **PHÂN TÍCH XONG — chờ máy Mac thi công Swift + build + test thiết bị.**
> Máy Windows **không build được** iOS/macOS (`*.xcodeproj` bị gitignore, `project.yml` + xcodegen,
> chỉ Xcode trên macOS build được).

## 1. Kết luận ngắn (đọc cái này là đủ)

**iOS và macOS CHƯA có watchdog "tunnel còn sống nhưng không chở gói" chạy suốt phiên, và CHƯA tự
dựng lại khi transport/relay chết giữa phiên.** Gặp hai ca đó app **gỡ tunnel** (khách mất VPN) chứ
không tự cứu. Windows 1.4.1 có cả hai và đã đo thực tế 3,4 giờ không mất mạng, watchdog 0 lần báo oan.

⚠️ **Tài liệu cũ ghi SAI điều này.** `docs/RELEASE_PLAN_2026-09-24.md` §2.1 viết *"iOS/macOS đã có
(`PacketTunnelProvider.probeTraffic` + `rebuildFromLiveness`, trần `maxLivenessRebuilds`)"* — **không
đúng**: ba thứ đó nằm ở `iOS/PrivateVPNPacketTunnel/PacketTunnelProvider.swift` nhưng **file này không
thuộc target nào** (đã sửa lại ở tài liệu đó).

## 2. Vì sao code "trông như đã có" mà thực tế không chạy

| Bằng chứng | Nội dung |
|---|---|
| `project.yml:124-137` | Liệt kê **tường minh** source của target extension iOS: `HysteriaPacketTunnelProvider` / `HysteriaTransport` / `HysteriaBandwidthControl` / `WSRelayClient` / `RelayLink` / `RelayUDPListener` / `RelayDiagnostics` / `HysteriaDefaults`. **Không có** `PacketTunnelProvider.swift`. |
| `project.yml:121-123` | Comment ghi rõ: extension iOS **hysteria-only**, `PacketTunnelProvider.swift` / `WGRelayClient.swift` "không còn nằm trong target nào" (lý do: hai Go runtime ⇒ `duplicate symbol '__cgo_panic'`). |
| `iOS/PrivateVPNPacketTunnel/Info.plist:27-28` | `NSExtensionPrincipalClass = $(PRODUCT_MODULE_NAME).HysteriaPacketTunnelProvider` ⇒ extension thật là lớp Hysteria. |
| `iOS/PrivateVPNPacketTunnel/PacketTunnelProvider.swift:26-47,1078-1210` | Nơi chứa `livenessInterval=10`, `maxLivenessMisses=3`, `maxLivenessRebuilds=2`, `runLivenessCheck`, `rebuildFromLiveness`, `watchdogGrace`, `maxWatchdogRebuilds` — **code chết**. |
| `mac/…` | macOS **dùng chung** source với iOS (app: `project.yml:215-225`; extension: `project.yml:308-316`) ⇒ một bản vá phủ **cả hai** nền tảng. |

## 3. Bảng so sánh (đo trên cây build thật)

| Hạng mục | Windows 1.4.1 | iOS/macOS hiện tại (1.4.0 — iOS build 16, macOS build 14) |
|---|---|---|
| Watchdog "sống mà không chở gói" **suốt phiên** | **CÓ**: nhịp 15s, im 60s **VÀ** thử qua tunnel fail 3 lần (`windows/PrivateVPNWindows.Core/Tunnel/RelayHealthWatchdog.cs:30,33,36,39,224-270`) | **KHÔNG**. Chỉ supervisor **15 giây đầu phiên** (`HysteriaPacketTunnelProvider.swift:52,57,803-962`) |
| Tín hiệu phát hiện | byte luỹ kế sing-box (clash_api) + HTTP GET qua chính tunnel | bộ đếm gói utun/relay; **không** có phép thử "bằng chứng sống" ⇒ dễ báo oan nên họ không dám chạy suốt phiên |
| Hành động khi phát hiện | **TỰ DỰNG LẠI 3 lần**, chờ 2s/5s/10s, có kiểm tra đổi phiên rồi mới trả mạng về đường trực tiếp (`windows/PrivateVPNWindows.App/ViewModels/VpnConnectionService.cs:73,519-592`) | `selfRescue` → **gỡ tunnel** + mã `TUNNEL_NO_TRAFFIC` (`HysteriaPacketTunnelProvider.swift:1118-1136,1190-1205`) |
| Transport/relay chết giữa phiên | cùng đường `Faulted` ⇒ dựng lại 3 lần | `handleDeath` → `teardownAndCancel`, **không dựng lại** (`:331-355`) |
| Trần khai báo băng thông | **0/0 = không khai** (BBR). Đo thật: 0/0 → **68,6 Mbps**, khai 30/100 → **45,5 Mbps** (`windows/PrivateVPNWindows.Core/…/HysteriaRelayDefaults.cs` + commit `e1e3fbe`) | nấc tĩnh **30/100 Mbps** (`iOS/PrivateVPN/Services/HysteriaDefaults.swift:44-45`; `VPNManager.swift:692-693`; provider `:1446-1447`) ⇒ mạng < 30 Mbps là **tự bóp** |
| Đo → nhớ theo loại mạng → ramp | KHÔNG có | **CÓ** (`HysteriaBandwidthControl.swift`) — iOS/macOS hơn Windows |
| Nhắc mềm "có bản mới" | code có nhưng **chết** (view model không được tham chiếu) | **CÓ**, kèm cài OTA (`ContentView.swift:185-189,196-208`) |
| Gửi kênh khi hỏi phiên bản | `platform` optional, dễ rơi payload iOS | **CÓ** `?platform=ios|macos` (`ControlAPIClient.swift:673-686`) |

## 4. Việc phải làm (thứ tự bắt buộc)

### P0 — watchdog suốt phiên + tự dựng lại (bản vá chính của 1.4.1)
Sửa **`iOS/PrivateVPNPacketTunnel/HysteriaPacketTunnelProvider.swift`** (một chỗ, cả iOS + macOS dùng):

1. **Thêm hằng** cạnh `trafficCheckInterval` (`:57`):
   `livenessInterval = 15`, `livenessSilenceLimit = 60`, `livenessStrikesToRebuild = 3`,
   `livenessRebuildMax = 3`, backoff `2s/5s/10s`, mã bỏ cuộc dùng lại `codeNoTraffic` (`:39`).
2. **Vòng lặp suốt phiên** (mở ở cuối `startTunnel` sau khi tunnel "lên", huỷ trong `stopTunnel` và
   trong `teardownAndCancel`): nhịp 15s, chốt theo `session` hiện có (`:73,143-147`) để callback của
   phiên cũ không giẫm chân.
3. **Tín hiệu 1** — dùng bộ đếm đã có: `tunnelFdForCounters` (`:72`) + snapshot `toGo/fromGo`
   (đang dùng ở `:460-461`). Byte **tăng** ⇒ coi như sống, reset mọi strike.
4. **Tín hiệu 2 (phải thiết kế cho iOS, KHÔNG copy Windows)** — lý do: socket của extension **không đi
   qua tunnel**, nên "probe HTTP qua tunnel" như Windows là vô nghĩa ở đây (chính code hiện tại ghi
   vậy: `:1017-1019,1041-1051`). Hai lựa chọn, chọn theo số đo trên máy thật:
   - (a) **Bất đối xứng**: trong cửa sổ 60s, máy **có** gửi gói vào tunnel (`toGo` tăng) mà `fromGo`
     gần như **không** tăng ⇒ đường hỏng. Đây là mở rộng của phép thử TCP-blackhole đã có (`:884-891`)
     từ 15s đầu phiên ra toàn phiên — **ưu tiên cách này** vì không cần thêm I/O.
   - (b) `relay.frameCounts` (`HysteriaTransport.swift:126`) không tăng trong 60s **VÀ** (a) đúng.
   Chỉ kết luận khi **cả** tín hiệu 1 im **và** tín hiệu 2 xác nhận (đúng bài học "tránh báo oan" của
   Windows: người dùng không duyệt web thì tín hiệu 1 im một mình là chưa đủ).
5. **Dựng lại có trần, tái dùng đường đã có**: gọi lại đúng cặp hàm đang dùng cho ramp —
   `rebuildTransportForBandwidth()` (`:663`) / `startTransportRetrying(options:)` (`:727`) với
   `currentOptions` (`:135`) — tối đa **3 lượt**, chờ **2s/5s/10s**. Hết lượt mới `teardownAndCancel`
   + `codeNoTraffic`. **Không** dựng lại khi phiên đã đổi.
6. **Không được đụng đường đang tốt**: reset strike khi có byte mới, khi đang ramp băng thông
   (`bandwidthRebuildInFlight`, `:109`), hoặc khi tunnel vừa mới lên (< 60s).

### P1 — bỏ trần khai báo băng thông tĩnh (tăng tốc, đã đo trên Windows)
- `iOS/PrivateVPN/Services/HysteriaDefaults.swift:44-45` đang `upKbps = 30_000`, `downKbps = 100_000`.
- Windows bỏ hẳn (0/0) và đo được **+50% tốc độ** trên cùng node. iOS/macOS **không nên copy thẳng 0/0**
  vì `HysteriaBandwidthControl` dùng nấc tĩnh làm `fallback` và làm tỉ lệ quy đổi
  (`HysteriaBandwidthControl.swift:40-41,945-958`), và 0 = tắt Brutal.
- **Cách làm đúng**: hạ nấc tĩnh xuống mức không tự bóp (đề xuất `up=5_000`, `down=20_000`) **hoặc**
  giữ nguyên nhưng bảo đảm phép đo luôn thắng nấc tĩnh. **Phải đo trên máy thật** (RAW vs VPN, ≥2 lần
  mỗi bên) trước — không sửa mù.

### P1b — macOS: bật lại ramp băng thông giữa phiên (đang tắt cứng)
Trên macOS, số khai đo được **chỉ áp ở lần kết nối sau** vì đường dựng lại transport bị chặn:
`HysteriaBandwidthControl.swift:81-87` (`allowsTransportRebuild` chỉ `true` khi `#if os(iOS)`) và
`HysteriaPacketTunnelProvider.swift:714-719` (`rebuildTransportForBandwidth` trả `nil` trên macOS).
Trong khi nhánh iOS `:663-713` đã có sẵn và fd của macOS cũng là socketpair qua `TunnelBridge`
(`:270-278`). ⇒ mở cho macOS để đo–ramp có tác dụng ngay trong phiên.

### P2 — bump số hiệu khi build (chưa bump trong repo, cố ý)
Chỉ bump **sau khi** P0 xong và đã test thiết bị, để không phát hành số 1.4.1 mà thiếu tính năng:
- `project.yml:86-87` (app iOS): `16 / 1.4.0` → **`17 / 1.4.1`**
- `project.yml:160-161` (extension iOS): `1.4.0 / 16` → **`1.4.1 / 17`**
- `project.yml:232-233` (app macOS): `1.4.0 / 14` → **`1.4.1 / 15`**
- `project.yml:344-345` (extension macOS): `1.4.0 / 14` → **`1.4.1 / 15`**
- `iOS/PrivateVPNPacketTunnel/Info.plist:19-22` (literal): `1.4.0 / 16` → **`1.4.1 / 17`**

### P3 — chốt lại "bản macOS đang phát" (3 tài liệu đang mâu thuẫn nhau)
Không tự kiểm chứng được trong repo (`release/` chỉ có artifact Windows), nên phải đối chiếu trên node-2
(`/root/flowvpn-mac/VPNFlow-mac.dmg` + `GET /v1/downloads/mac`) rồi sửa cho khớp:

| Nguồn | Nói gì |
|---|---|
| `docs/PUBLISHER_PROCESS.md:84` (21/09) | macOS **1.3.3 (13)**, đã ký Developer ID + notarize + staple, DMG 21.617.309 B |
| `docs/RELEASE_ARTIFACTS_2026-09-19.md:136-145,165-169` | route tải phục vụ **1.4.0/14** (23.961.684 → 23.972.080 B), ký "Apple Development", **chưa notarize** |
| `docs/RELEASE_RUNBOOK.md:13` | bảng version đang phát ghi **macOS (DMG) 1.3.3 / 13** |

Lệch cả **số phiên bản** lẫn **đã notarize hay chưa** — mà notarize là điều kiện để khách mở không bị
cảnh báo (Gatekeeper). Phải chốt trước khi phát 1.4.1.

## 4b. Chiều ngược lại — Windows còn thiếu thứ macOS/iOS đã có

Không thuộc phạm vi brief này nhưng ghi lại để không mất (từ phân tích 21/09):

| macOS/iOS có | Windows hiện tại |
|---|---|
| Heartbeat control-plane **120s** giữ dashboard "đang kết nối" (`VPNManagerMac.swift:561-582`) | Hàm `HeartbeatAsync` **có nhưng không nơi nào gọi** (`windows/…/Api/ControlApiClient.cs:260-281`) |
| Nhắc mềm "có bản mới" + cổng chặn cứng (`ContentViewMac.swift:71-85,155-165`) | `ForceUpdateViewModel` / `FetchAppVersionAsync` là **code chết** (không call site) ⇒ Windows thực tế **không** thông báo cập nhật |
| Mã chẩn đoán đọc được từ app (`sendProviderMessage` + `TUNNEL_NO_TRAFFIC`) | chỉ log/chuỗi, không có mã |

## 5. Điều kiện nghiệm thu (bằng chứng bắt buộc, không có = chưa xong)

1. `xcodegen` sinh lại project; `xcodebuild` **build được cả 2 target** (iOS + `PrivateVPNMac`) —
   dán log `BUILD SUCCEEDED`.
2. Unit test hiện có vẫn xanh; thêm test cho quyết định mới (thuần logic, tách khỏi I/O để test được
   như `RelayHealthWatchdogTests.cs` của Windows).
3. **Test thiết bị thật**:
   - chạy liên tục ≥ **3 giờ** không mất mạng, log watchdog **0 lần kết luận oan**;
   - chủ động **kill tiến trình transport / chặn đường relay** ⇒ app **tự dựng lại** trong vài giây
     (ghi lại số lần + thời gian), chứ không gỡ tunnel;
   - ngắt VPN ⇒ máy **không mất mạng** (route về đường trực tiếp).
4. Số trong artifact đọc từ **bên trong file** (IPA/DMG), không tin tên file (`docs/PUBLISHER_PROCESS.md` §2).
5. Cập nhật `docs/RELEASE_PLAN_2026-09-24.md` nếu có thay đổi so với kế hoạch này.

## 6. Ai làm gì

| Việc | Ai |
|---|---|
| Phân tích, đối chiếu, brief này, sửa tài liệu sai | **Windows harness** (đã xong 21/09) |
| Sửa Swift P0/P1 trong `iOS/PrivateVPNPacketTunnel/…` | Windows viết được code nhưng **không compile được** — nên **Mac** viết/sửa để build ngay tại chỗ |
| Build + ký + notarize + phát hành + email | **Mac harness** (Xcode/xcodegen; xem `docs/MACOS_SIGN_NOTARIZE.md`, `docs/SCRIPTS` publisher) |
| Ghi số vào `docs/PUBLISHER_PROCESS.md` §6 | Mac harness |
