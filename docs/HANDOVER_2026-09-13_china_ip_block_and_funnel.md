# HANDOVER — 2026-09-13: GFW chặn IP cả 2 node + kiến trúc "không phụ thuộc IP"

Tài liệu này để phiên làm việc tiếp theo vào việc ngay, không phải dò lại.

## 1. Sự việc

- Từ WiFi khách sạn (Trung Quốc, IP công cộng `120.234.32.53`), GFW chặn **cả hai IP node**:
  - node-1 `103.173.155.50` (VNPT) — chặn trước, ~19:00
  - node-2 `103.6.234.233` (Online Data) — chặn sau, ~20:40 (sau khi API + toàn bộ client dồn về node-2)
- Triệu chứng: app Android báo *"cannot reach VPNFlow service"*, app iOS không dựng nổi tunnel.
- **Bằng chứng đo được (buộc đi thẳng WiFi bằng `--interface en0` / `IP_BOUND_IF`):**
  - TCP `103.173.155.50:443`, `103.6.234.233:443/:9444` → timeout
  - Trong khi `baidu.com` / `example.com` từ chính máy đó = 200, ping gateway 15ms → không phải lỗi máy/app
  - Bắt gói trên node-1 lúc còn thông: SYN của client **tới được** server, server trả SYN-ACK, nhưng gói trả lời **không về tới TQ** → chặn ở chiều vào TQ đúng đặc trưng GFW.
- Lưu ý: Mac "vẫn vào được API" là nhờ **Tailscale (exit node = node-1, đi qua DERP relay)**, không phải đường của khách.

## 2. Kiến trúc hiện tại

### node-2 `103.6.234.233` (Online Data) — đang là CỬA CHÍNH
- `flowvpn-cp.service` — control plane, `127.0.0.1:7778` (đã chuyển từ node-1 sang, node-1 chỉ còn standby)
- Caddy: `api.meetflowai.site` + `meetflowai.site` phục vụ **nội bộ** (static `/var/www/flowvpn` + `reverse_proxy 127.0.0.1:7778`); `/meetflow/*` vẫn proxy sang node-1 (backend MeetFlow AI chưa dời — phụ thuộc duy nhất còn lại)
- `wgrelay-wg.service` TCP 9444 → UDP 443 (WireGuard)
- `wgrelay.js` TCP 8443 → UDP 8443 (Hysteria); hysteria server ×3 (8443/28443/54443)
- `wg0` UDP 443 (WireGuard), `node-self-report.timer` (5 phút/lần)
- DNS: `api.meetflowai.site` và `meetflowai.site` → `103.6.234.233` (nên giữ TTL 60)

### node-1 `103.173.155.50` (VNPT) — exit node + cửa dự phòng
- `flowvpn-cp` **đã stop + disable** (dữ liệu giữ nguyên)
- `cp-proxy.service` `127.0.0.1:7781` → control plane node-2 (dùng cho Funnel)
- `wsrelay.service` `127.0.0.1:7782` → UDP 443 (WG) — mỗi binary message WS = 1 datagram
- `wsrelay-hy.service` `127.0.0.1:7784` → UDP 8443 (Hysteria)
- hysteria server ×3, `wg0` UDP 443, relay TCP 9444/8443, Tailscale 1.102 + Funnel
- `node-self-report.timer` (5 phút/lần) — báo IP công cộng hiện tại về coordinator

### Tailscale Funnel (URL cố định — đã kiểm chứng xuyên được mạng chặn)
| Endpoint | Trỏ tới | Dùng cho |
|---|---|---|
| `https://fcnvpn.tail303be3.ts.net` | cp-proxy 7781 → control plane node-2 | API/buy/entitlement |
| `wss://fcnvpn.tail303be3.ts.net:8443` | wsrelay-hy → Hysteria UDP 8443 | data path Android |
| `wss://fcnvpn.tail303be3.ts.net:10000` | wsrelay → WG UDP 443 | data path iOS (ĐÃ CHẠY THẬT — xem dưới) |

Đo từ đường đang bị chặn: `API qua Funnel = http=200, ~1.4s` ✓
Tailnet hostname: `fcnvpn.tail303be3.ts.net`; node id funnel: `nxQSyDow6811CNTRL`.

> **ĐÃ CHẠY THẬT (13/09 22:47, iPad):** cổng `:10000` trước đây ghi "chưa dùng" — nay đã
> kiểm chứng: `Received handshake response`, 8,5 MB qua tunnel, ~429 kbps (đỉnh 604 kbps).
> Đo lại bằng `python3 scripts/measure-relay-throughput.py <log>`.

#### ⚠️ Relay WS là của TỪNG NODE, không dùng chung được
`wss://…:10000` hạ cánh vào **WireGuard của node-1**. Vì WireGuard xác thực bằng **khoá**,
client chọn node-2 (được cấp khoá node-2) mà đi qua relay này thì gói handshake mã hoá tới
khoá node-2 nhưng lại tới `wg0` của node-1 → node-1 **không giải được và không có peer này**
→ **im lặng tuyệt đối**, log chỉ thấy gửi hoài mà `framesFromRelay=0`. Đây là gốc lỗi
"connected nhưng không có mạng" trên iPad. (Android thoát được vì Hysteria xác thực bằng mật
khẩu dùng chung, không theo peer key — relay hạ cánh node-1 vẫn chạy, chỉ là exit thành node-1.)

Đã sửa tận gốc: control plane cấp **`ws_relay_url` theo từng node** (`GET /v1/nodes`), client
dùng đúng URL của node đang chọn, và ghi log rõ khi phải đoán.

**Thứ tự deploy bắt buộc:**
1. Deploy control plane (tự migrate thêm cột `ws_relay_url`; db cũ vẫn mở được — có test).
2. Đặt relay cho node-1 qua admin API (`PATCH /v1/admin/nodes/node-1`, body
   `{"ws_relay_url":"wss://fcnvpn.tail303be3.ts.net:10000"}`). **node-2 để null** vì nó
   không có relay — đó chính là thông tin client cần.
3. Rồi mới phát hành app. App cũ vẫn chạy bình thường ở bước 1–2 (chúng bỏ qua key lạ:
   Android `ignoreUnknownKeys=true`, iOS `Codable`).

**Việc còn lại (chưa làm, cần owner):** coordinator vẫn xếp `vietnam-2` priority 50 đứng trước
`node-1` (100), nên người dùng mới ở TQ để mặc định sẽ chọn node-2 — mà node-2 **không có relay**
và IP thì bị chặn. Hai hướng: cho node-2 một relay (thêm entry Funnel trỏ vào WG của node-2),
hoặc xếp node-1 lên trước cho client ở mạng bị chặn.

### Cloudflare quick tunnels (tạm, giữ làm đường dự phòng thứ hai)
- API: `https://additionally-indianapolis-totals-ties.trycloudflare.com`
- Hysteria relay: `https://experts-competition-began-weekend.trycloudflare.com`
- `cloudflared` ×3 trên node-1 (2 tunnel + precheck), URL đổi khi restart.

### Coordinator: health + tự báo IP
- `POST /v1/nodes/self` (header `X-Node-Secret`) — node tự báo IP → cập nhật `endpoint` trong `nodes.db`
- `POST /v1/nodes/:id/report` `{ok, reason}` — client báo node tới được hay không
- `GET /v1/nodes` xếp: node bị ≥3 báo lỗi trong 30 phút **tụt xuống dưới**, rồi mới theo `priority`
- `nodes.db`: `vietnam-2` priority 50 (đứng đầu), `node-1` priority 100; `ssh_target` node-1 = `root@103.173.155.50`, vietnam-2 = NULL (local)
- Secret nằm ở drop-in `/etc/systemd/system/flowvpn-cp.service.d/node-secret.conf` (node-1) và env service trên node-2

## 3. Trạng thái client

### Android (repo `android/`)
- **1.3.2 (versionCode 12) đã cài trên Fold5**; các tính năng đã có:
  - `Config.API_FALLBACK_ADDRESSES` (ghim IP, node-2 trước) + `coordinatorDns` trong `ControlAPIClient`
  - `Config.API_FALLBACK_BASES = ["https://fcnvpn.tail303be3.ts.net"]` + `fallbackInterceptor` (thử lại request qua host dự phòng khi IOException)
  - `Config.WS_RELAY_URL = "wss://fcnvpn.tail303be3.ts.net:8443"`, `Config.WS_RELAY_PORT = 8443`
  - `vpn/WSRelayBridge.kt` — cầu UDP↔WS, socket OkHttp được `protect()` (bắt buộc, nếu không sẽ bị hút vào chính tunnel → `Connection reset`)
  - `HysteriaVpnService`: `wsRelayAttempt()` (thử **cuối cùng**), nhớ transport `"ws"`, tự chuyển node sau 2 pass chết, báo health về coordinator
- APK/AAB trên trang buy hiện vẫn là **1.2.8** (chưa cập nhật 1.3.x) — `https://meetflowai.site/dl/VPNFlow-1.3.x-*`
- Build: `JAVA_HOME=~/jdk/jdk-17.0.20.1+1/Contents/Home`, `./gradlew :app:assembleModernRelease` / `:app:bundleModernRelease` (flavor `modern` minSdk 26, `legacy` minSdk 24)

### iOS (repo `ios/`)
- Đã có: relay TCP (WGRelayClient), health report (`NodeHealthReporter`, gửi sau 15s), `nodeId` trong `WireGuardConfig`
- **Chưa có**: API dự phòng + WS bridge (spec: dùng `wss://fcnvpn.tail303be3.ts.net:10000` vì iOS dùng WireGuard)
- Build: `xcodegen generate` (project.pbxproj KHÔNG commit) → `xcodebuild -scheme PrivateVPN -destination 'generic/platform=iOS' -derivedDataPath .dd-ios-ipad`
- Cài: `xcrun devicectl device install app --device 5BA3126D-4776-5F75-8B10-0A60559ED1CC <app>` (iPad phải **mở khoá**)

## 4. Việc cần làm — thứ tự ưu tiên

### Tầng 1: cho ổn định (làm trước, ~1 giờ)

> **Cập nhật cuối ngày 13/09 (phiên tiếp nhận):** mục 1, 2, 3, 5 đã XONG trên Android —
> commits `3d46f51`, `f6d58fd`; bằng chứng `evidence/2026-09-13-tier1-android-tunnel-recovery.log`;
> quyết định + lý do ở `.privatevpn/memory/DECISIONS.md`. **Chưa test trên thiết bị thật**
> (không có máy nào kết nối adb) — các bước đo trên máy thật nằm ở mục 3 của file bằng chứng.
> Mục 4 CHƯA làm.

1. ✅ `WSRelayBridge`: khi WS `onFailure`/`onClosed`/`onClosing` → callback `onDead` →
   service gọi `Mobile.stop()` để `serve()` trả về và vòng `runTunnel()` dựng lại transport
   + WS mới. Gác hai điều kiện `running` + `opened` (stop() chủ động không bị coi là sự cố;
   chưa từng mở được thì không báo động) và chỉ báo một lần.
2. ✅ Watchdog: **cách làm khác handover một chút** — không đo "WS im lặng" mà dùng chính
   probe end-to-end đã có (`probeThroughTunnel()`), nay trả `Boolean`. 2 lần probe liên tiếp
   thấy tunnel UP mà HTTP **và** DNS đều không trả lời → `Mobile.stop()` để dựng lại. Lý do:
   đo "WS im" sẽ dương tính giả khi tunnel khoẻ nhưng người dùng không tải gì; đo gói thật
   thì bao được cả đường TCP relay/UDP trực tiếp, không riêng WS. Chỉ tính chết khi CẢ HAI
   probe tịt (một trong hai có thể bị chặn riêng).
   **Lưu ý về con số:** phản ứng thật là **~30–60s**, KHÔNG phải ~10s như mục 2 gốc mong muốn —
   một vòng probe tốn ~30s khi transport đã chết (15s interval + HTTP connect 4s + read 6s +
   DNS 4s) và cần 2 vòng liên tiếp. Đổi lại là không dựng lại tunnel chỉ vì mạng mất gói một cú.
   Muốn nhanh hơn thì hạ `PROBE_INTERVAL_MS` hoặc timeout trong `probeThroughTunnel()`.
3. ✅ Đã hạ **cả hai**: `TCP_CONNECT_TIMEOUT_MS` 2500 → 1200ms và `armAttemptBudget()` đặt
   trần bắt tay 4s (đường trực tiếp) / 15s (đường WS). Cần trần này vì client Go nằm trong
   `hysteria.aar` đóng sẵn, không truyền được timeout handshake từ Kotlin.
   **Thứ tự mới**: preferred → 2 TCP relay → **1 cổng UDP trực tiếp** → WS relay → các cổng
   UDP còn lại. Cố ý KHÔNG đưa WS lên đầu cho tất cả: người không bị chặn sẽ bị bắt đi vòng
   qua Tailscale/Cloudflare oan, còn họ đang đi đường trực tiếp trong <1s. Kết quả: người bị
   chặn từ ~25s xuống ~7–11s mới tới WS. Đường trực tiếp đã thử ở lượt ưu tiên thì bỏ qua
   (trường hợp IP bị chặn giữa phiên), nhưng `"ws"` thì vẫn thử lại.
4. ❌ **Chưa làm** — vẫn đang là Hysteria-over-WS. Chuyển sang WireGuard-over-WS cổng 10000
   là một phần của việc Tầng 2 (sing-box): `docs/SINGBOX_INTEGRATION_PLAN.md` (đang được soạn
   trong phiên 13/09 — nếu file chưa có thì việc đó chưa xong).
5. ✅ Thêm `HY_RELAY_UP_KBPS = 800` / `HY_RELAY_DOWN_KBPS = 4000` trong `Config.kt`, dùng
   riêng cho lượt thử qua WS (trước đây dùng chung 20Mbps của đường trực tiếp). **Số này là
   mức khởi điểm bảo thủ, chưa đo trên mạng TQ thật — cần chỉnh theo số đo.**


### Tầng 2: fix triệt để
- **Bỏ tự viết transport bằng Kotlin/Swift** — đó là gốc của lỗi hôm nay (socket loop, protect, watchdog, zombie, chậm).
- Tích hợp **sing-box (libbox)** cho Android + iOS: nhiều outbound (Funnel WSS, Cloudflare tunnel, IP node), **URL-test tự chuyển**, tự reconnect khi mạng đổi, transport khó chặn (VLESS/Reality/Trojan/Hysteria2 + WS/TLS), uTLS.
- Control plane (đang chạy tốt trên node-2) sinh config sing-box cho app.

### Việc khác
- iOS parity: API dự phòng + WS bridge cổng 10000.
- **Play**: paywall Android vẫn là WebView nạp trang thanh toán web → rủi ro bị từ chối (Payments policy). Cần cờ build theo flavor: bản Play chỉ hiện Play Billing, bản web/china giữ WebView.
- **IP mới node-1**: đã yêu cầu nhà cung cấp. Khi có IP mới: chạy `/root/ip-swap.sh <IP_MOI>` trên node-2 (cập nhật Caddy upstream + `nodes.db`), và `tailscale`/cloudflared không ảnh hưởng.
- Thêm URL dự phòng thứ hai (Cloudflare tunnel) vào danh sách trong app.
- `repo ↔ VPS`: đã đồng bộ `control-plane/src` (VPS = repo, gồm `connection-stats.js`). **Nhớ diff trước khi deploy** — đã từng gây 502 vì repo mới hơn VPS.

## 5. Truy cập & công cụ

- node-1: chỉ vào được qua **tailnet** `ssh -i secrets/.tmp/flowvpn_support_page_ed25519 root@100.76.147.111` (IP công cộng bị chặn từ TQ)
- node-2: `sshpass -p <secrets/node2-103.6.234.233.env> ssh root@103.6.234.233` (từ TQ cũng bị chặn — đi vòng qua node-1 bằng key `/root/.ssh/id_node1`)
- Secrets trong `secrets/`: `flowvpn-vps-root-access.env` (key + password node-1), `node2-103.6.234.233.env`
- Máy Mac: Tailscale có CLI ở `/Applications/Tailscale.app/Contents/MacOS/Tailscale`; app Tailscale đang dùng node-1 làm exit node (nên test "đường thật" phải bind en0)
- Log client: Android `adb shell tail /sdcard/Android/data/com.privatevpn.app/files/diagnostics.log` + `adb logcat -s VPNFLOW_DIAG VPNFLOW_DEBUG`; iOS: `xcrun devicectl device copy from --domain-type appDataContainer --domain-identifier com.privatevpn.app.packet-tunnel --source Documents/relay.log`

## 6. Trạng thái kiểm chứng cuối (13/09 ~21:45)

- Funnel API từ đường bị chặn: **200 / 1.56s** ✓
- `wsrelay-hy` ✓ `wsrelay` ✓ `cp-proxy` ✓ hysteria(node-1) ×3 ✓ cloudflared ×3 ✓ Funnel 4 entry "Funnel on" ✓
- Android đã **có mạng thật** qua Funnel+WS (chậm), nhưng cầu WS chết thì tunnel treo ở trạng thái "connected" → đúng việc Tầng 1 phải sửa.

## 7. Trạng thái 14/09/2026 — bỏ store, phát qua web (đọc mục này trước khi làm tiếp)

Quyết định của chủ dự án: **không nộp App Store / Google Play nữa**. Mọi gói bán qua
`meetflowai.site/buy` (QR/chuyển khoản), mua **một lần, KHÔNG tự động gia hạn**. Quyền Premium
lấy từ `subscription_status.is_active` của backend (`GET /v1/auth/session`).

Đã làm xong:
- Xoá StoreKit (iOS + macOS) và Play Billing (Android); paywall cả 3 nền tảng là WebView `/buy`.
- iOS phát bằng file IPA của mình: `GET /v1/downloads/ios` đọc `/root/flowvpn-ipa/VPNFlow-latest.ipa`
  trên **node-2** (route đã deploy — hiện trả 404 vì chưa có file).
- Dọn mọi chỗ khách ĐỌC thấy còn nhắc store: FAQ `/support` (5 ngôn ngữ), câu "cần cập nhật"
  (5 ngôn ngữ), nút "Điều khoản sử dụng" (trước là EULA của Apple), tên app `VPNFlow`.
- Ép cập nhật iOS nay trả link tải IPA thay vì link App Store (`store_url` trước đây RỖNG ⇒ nút
  "Cập nhật" trên máy khách đi vào trang App Store không có app).
- Phiên bản iOS/macOS **1.3.2 (build 12)** — khớp Android `versionCode 12` / `1.3.2`.
- Bằng chứng đầy đủ: `evidence/2026-09-14-support-faq-and-ios-update-store-removal.log`.

Đã deploy xong (14/09 ~01:30, chủ dự án cho phép agent chính ssh/scp):
1. IPA 1.3.2 đã lên `/root/flowvpn-ipa/VPNFlow-latest.ipa` trên node-2 — sha256 trên server khớp
   máy build (`7d47bf63…`), `GET /v1/downloads/ios` → **200**, 4.945.632 byte, 200KB đầu giống hệt
   file gốc. Nút tải trên `/buy` đã hoạt động thật.
2. Control plane đã rsync `src/` từ **HEAD sạch** lên node-2 (backup ở
   `/root/flowvpn-cp/src.bak-20260914-012621`; đã so md5 trước khi ghi: server chỉ thiếu đúng 2
   file `app-version.js` + `support-page.js`, còn lại trùng HEAD) rồi `systemctl restart flowvpn-cp`
   → `active`, cổng 7778. `/support` cả 5 ngôn ngữ nay còn **0** chữ `App Store`/`Apple ID`/
   `reportaproblem`/`Restore Purchases`; `/v1/app-version` (UA iOS) trả
   `ipa_url` = `store_url` = link tải IPA (trước đó RỖNG ⇒ nút "Cập nhật" đi vào ngõ cụt).
3. **Caddy node-2 (site `meetflowai.site`)**: thêm `handle /v1/downloads/ios` → `127.0.0.1:7778`.
   Vì sao cần: site block mở TỪNG đường một (`/v1/downloads/android` có sẵn, ios thì chưa), nên
   Node trả 200 nhưng edge trả 404 — đúng ca `/guide` đã từng gặp. Backup
   `/etc/caddy/Caddyfile.bak-20260914-013452`, `caddy validate` = "Valid configuration",
   `systemctl reload caddy` xong vẫn `active`; `/buy`, `/support`, `/terms`, `/guide`, `/health`
   đều 200 sau reload.

Còn lại (cần chủ dự án quyết / làm):
1. Đặt `latest_ios_version = 1.3.2` trong tab admin để máy cũ được nhắc cập nhật (agent chính
   KHÔNG tự đổi: đây là quyết định sản phẩm, ảnh hưởng khách đang dùng).
2. ⚠️ **Cảnh báo thương mại**: IPA đang ký `development` (4 UDID) nhưng `/buy` mời MỌI khách
   "Tải cho iPhone / iPad" — máy không có UDID trong profile **không cài được**. Cần ghi rõ trên
   `/buy`, hoặc bỏ nút iOS cho tới khi có kênh cài được (ad-hoc/enterprise/TestFlight).
3. `payments.js` còn nhánh `iosLineStore` + badge App Store/TestFlight; chúng chỉ hiện khi biến
   môi trường `APP_STORE_URL_*`/TestFlight được cấu hình ⇒ **kiểm env server, nên xoá hẳn**.
   (File này đang được một session khác sửa dở — đừng sửa chồng.)
4. `control-plane/src/index.js` còn `DEFAULT_STORE_URL = APP_STORE_URL ?? "https://apps.apple.com/app/flowvpn"`
   và field `app_store_url` trong tab admin: giờ **vô tác dụng** (app-version không đọc nữa) —
   nên xoá cùng lúc với mục 3.
5. Trang `/terms` hiện chỉ nêu "MeetFlow AI Terms of Use" (0 lần VPNFlow) trong khi nút "Điều khoản
   sử dụng" của app và link trên `/support` đều trỏ vào đó — cần bổ sung phạm vi VPNFlow hoặc tạo
   trang riêng.

## 8. 14/09/2026 — "Cannot reach VPNFlow service" lần nữa: nguyên nhân + fix (đã phát hành 1.3.3)

### 8.1 Số đo (từ chính mạng của khách, Wi-Fi ICONLABHOTEL, TQ)

| Phép đo | Kết quả |
|---|---|
| `ping api.meetflowai.site` (→ 103.6.234.233) từ điện thoại | **100% packet loss** (IP bị chặn) |
| `ping 103.173.155.50` (node-1) từ điện thoại | **100% packet loss** |
| `ping fcnvpn.tail303be3.ts.net` từ điện thoại | 0% loss, ~110 ms ✅ |
| `curl --interface en0 --resolve …:443:103.84.155.217` (Funnel, đúng SNI) | **HTTP 200 / 0,97 s** ✅ |
| APK đang phát ở `/v1/downloads/android` | **1.2.8 (versionCode 8)** — dex **không có** chuỗi `fcnvpn.tail303be3.ts.net` ⇒ **không có đường dự phòng** |
| APK trên máy test (1.3.2) | có fallback (2 lần xuất hiện chuỗi trên) |

### 8.2 Chuỗi nguyên nhân

1. GFW chặn **cả hai IP node** ⇒ mọi request API trực tiếp (2 IP ghim trong app) chết.
2. **APK đang phát cho khách là 1.2.8 — không có** host dự phòng Funnel ⇒ ở mạng bị chặn, app
   không còn đường nào vào API → đúng câu "Cannot reach VPNFlow service".
3. Bản 1.3.2 (chỉ nằm trên máy test) có fallback nhưng **phụ thuộc DNS**: khi tunnel UP mà transport
   đã chết, DNS của máy bị trỏ vào trong tunnel (`dns=1.1.1.1`) nên
   `ws-relay: failed: Unable to resolve host "fcnvpn.tail303be3.ts.net"` (diagnostics 01:14–01:26)
   ⇒ chính đường dự phòng cũng không mở được.
4. Phụ: **node-1 hết sạch đĩa** — `/` 100% vì `/tmp/tcpcap.txt` **11,2 GB** còn sót từ đợt bắt gói;
   journald/rsyslog báo `No space left on device`, và node-1 trả **502** cho host API (control plane
   trên node-1 đã stop + disable theo thiết kế, nhưng Caddy vẫn trỏ vào 7778).

### 8.3 Đã sửa & đã phát hành

**App Android 1.3.3 (versionCode 13):**
- `Config.PINNED_HOST_ADDRESSES` — ghim IP cho `api.meetflowai.site` và `fcnvpn.tail303be3.ts.net`
  (103.84.155.217 / 103.84.155.153).
- `api/PinnedDns.kt` — trả IP ghim TRƯỚC; câu trả lời của DNS hệ thống chỉ được chờ **≤1,2 s** rồi bỏ
  (DNS treo vì bị hút vào tunnel chết không còn khoá được đường thoát). `WSRelayBridge` dùng cùng resolver.
- `ControlAPIClient` — fallback khi **IOException *và* 502/503/504**; so **đúng origin** (scheme+host+cổng)
  để không lặp; **nhớ host dự phòng đã chạy được** (TTL 10 phút) nên request sau đi thẳng, không phải chờ
  hết connect timeout; connectTimeout 6 s → **3 s**.
- Test: `ApiFallbackTest` (3 ca: refused → fallback, 502 → fallback, cả hai 502 → báo lỗi 1 lần) +
  `PinnedDnsConfigTest` (2 ca). Tổng **20 test, 0 fail**.
- **Đã kiểm chứng trên Fold5 thật, đúng mạng đang chặn IP**:
  `W api: api.meetflowai.site lỗi (failed to connect to /103.173.155.50 (port 443) … 6000ms) -> thử host dự phòng`
  rồi `I api: dùng host dự phòng fcnvpn.tail303be3.ts.net (HTTP 200)`.

**Phát hành:**
- APK `modern` (minSdk 26) và `legacy` (minSdk 24 / Fire OS) 1.3.3 đã đẩy lên node-2:
  `/root/flowvpn-apk/VPNFlow-latest.apk`, `…/VPNFlow-android7.apk` (sha256 khớp bản build local).
- `/v1/downloads/android` trả bản modern, UA Android 7 / Fire OS tự nhận bản legacy;
  `/v1/downloads/android-legacy` cũng vậy. Gate `android_latest_version` = **1.3.3** (minimum giữ 1.2.6).
- **Khách bị chặn IP tải được APK qua Funnel**: `https://fcnvpn.tail303be3.ts.net/v1/downloads/android`
  (đã đo HTTP 200) — đây là đường duy nhất khi `meetflowai.site` bị chặn.

**Hạ tầng:**
- Dọn 11,2 GB `/tmp` trên node-1 (`/` 100% → 40%).
- `cp-proxy` (node-1) nay đi **HTTPS** tới `api.meetflowai.site` (SNI + `checkServerIdentity` đầy đủ)
  thay vì HTTP thẳng cổng 7778 — chặng node-1 → node-2 đi qua Internet nên token khách không được đi plaintext.
- Caddy node-1: upstream `127.0.0.1:7778` → **`127.0.0.1:7781` (cp-proxy)** ⇒ IP node-1 **hết 502** và trở
  lại làm cửa dự phòng: `curl --resolve api.meetflowai.site:443:103.173.155.50 /health` → **200**.

### 8.4 Còn lại (khuyến nghị, theo thứ tự)

1. **node-2 vẫn mở cổng 7778 ra Internet bằng HTTP** (`http://103.6.234.233:7778/health` → 200) —
   nên bind `127.0.0.1`. Cần sửa `control-plane/src/index.js` (`listen(PORT, "127.0.0.1")`) + deploy;
   **file này đang được session khác sửa** nên phải diff trước khi deploy.
2. **iOS/macOS chưa có API dự phòng và chưa ghim IP** — cùng lớp lỗi sẽ xảy ra với khách iPhone.
3. Thêm URL dự phòng thứ hai (Cloudflare quick tunnel) vào `API_FALLBACK_BASES` + ghim IP tương ứng.
4. Đổi IP node-1 (đã yêu cầu nhà cung cấp) để có cửa vào không bị chặn.

## 9. 14/09/2026 — Kiểm tra bản macOS có phát hành được chưa (test local)

### 9.1 Kết luận ngắn

**Chưa phát hành được.** Lý do không nằm ở code chất lượng mà ở **kênh phát hành** và **thiếu đường ống/backend
cho macOS**. Ngoài ra bản macOS đã **không compile được** từ lúc iOS thêm relay — đã sửa trong repo (xem 9.2).

### 9.2 Lỗi build đã sửa (chặn hẳn việc phát hành)

`project.yml` target `PrivateVPNMacPacketTunnel` chỉ có `PacketTunnelProvider.swift` + `WireGuardConfig.swift`,
trong khi iOS đã thêm `WGRelayClient.swift` / `WSRelayClient.swift` (có cả `WSRelayDefaults` nằm ở
`ControlAPIClient.swift`) ⇒ build macOS chết:

```
iOS/PrivateVPNPacketTunnel/PacketTunnelProvider.swift:17: error: cannot find type 'WGRelayClient' in scope
iOS/PrivateVPNPacketTunnel/PacketTunnelProvider.swift:20: error: cannot find type 'WSRelayClient' in scope
iOS/PrivateVPNPacketTunnel/WSRelayClient.swift:39: error: cannot find 'WSRelayDefaults' in scope
```

Đã sửa: target macOS dùng **cùng nguồn** với extension iOS (trừ `Info.plist`/entitlements của iOS) +
`ControlAPIClient.swift`. Sau đó:

- `xcodebuild -scheme PrivateVPNMac -configuration Debug -destination generic/platform=macOS -allowProvisioningUpdates`
  → **BUILD SUCCEEDED**, ký bằng `Apple Development: minhnb2@me.com`, profile tự tạo
  `Mac Team Provisioning Profile: com.privatevpn.mac.packet-tunnel` (App ID đã có capability Network Extensions).
- App chạy được: UI menu-bar "VPNFlow" hiện `Plan: Premium`, gọi API OK (có `cached.exitNodes.v1`),
  tạo được profile NE `VPN (com.privatevpn.mac) "FlowVPN"` và **kết nối lên `Connected`**, overlay
  `10.77.0.9` được gán vào `utun14`.
- Thêm parity với iOS: `VPNManagerMac` nay truyền relay vào config
  (`.withRelay().withNodeId(node.id).withWSRelayURL(node.ws_relay_url)`) — trước đó macOS không hề dùng relay.

### 9.3 Vì sao test local vẫn "Connected nhưng không có mạng"

Không phải lỗi macOS: **tài khoản test đã chạm giới hạn 3 thiết bị**. Log control plane (node-2):

```
02:39:15  POST /v1/peers/register failed: Error: Device has been revoked
03:04:46  POST /v1/peers/register failed: Error: You can use VPNFlow on up to 3 devices…
          code: 'device_limit_reached'
03:05:30  (lặp lại)
```

⇒ Không có peer nào được cấp trên exit node cho khoá mới ⇒ handshake bị server bỏ im lặng ⇒ tunnel "Connected"
mà không có gói nào đi. Kiểm chứng ngược: các thiết bị mới nhất `10.77.0.41…48` **đều có peer trên node-1** ✓
nên đường cấp peer vẫn hoạt động; chỉ tài khoản này hết slot. Muốn test macOS thật: giải phóng 1 slot
(Settings → Devices → revoke bớt) rồi bấm Connect lại.

### 9.4 Blocker thật để phát hành macOS

| # | Việc | Chi tiết |
|---|---|---|
| 1 | **Kênh phát hành** | Tunnel đang là **app extension** ⇒ chỉ dùng được khi phát qua **Mac App Store**. Phát trực tiếp (web/DMG) bắt buộc chuyển sang **Network Extension system extension** (`packet-tunnel-provider-systemextension`). Chính log máy còn ghi: *"Current bundle … does not have a SystemExtensions directory"*. |
| 2 | **Không có đường ống build macOS** | `scripts/archive-appstore.sh mac direct` archive rồi export với `method=app-store-connect` và kết thúc bằng `ls "$IPA"/*.ipa` — đó là đường của **iOS**. macOS cần Developer ID + `.dmg`/`.zip` + `notarytool` + staple. |
| 3 | **Backend chưa có kênh macOS** | `/v1/app-version` chỉ có `ios_*`/`android_*` ⇒ client macOS nhận payload **của iOS** (`store_url` = link IPA iOS) nên nút "Cập nhật" sẽ đưa khách Mac sang bản iPhone; `/v1/downloads/macos` **404**; gate không có `latest_macos_version`/`minimum_macos_version`. |
| 4 | Phiên bản lệch | macOS `1.3.2`/12 trong khi Android đã `1.3.3`/13. |
| 5 | Không có test cho macOS | `PrivateVPNMac` scheme đặt `testTargets: []`. |

### 9.5 Việc nên làm (chọn 1 hướng)

- **A. Nhanh (khuyến nghị nếu muốn có bản Mac sớm):** phát qua **TestFlight internal** — app extension hợp lệ,
  không phải viết system extension; chỉ cần archive bằng method `app-store-connect` + upload (bản web-paywall
  vẫn dùng được cho tester nội bộ).
- **B. Đúng mô hình web (tự bán):** chuyển tunnel sang **system extension** rồi ký Developer ID + notarize,
  thêm route `/v1/downloads/macos` + `latest_macos_version`. Ước lượng 1–2 ngày, có phần "duyệt" của người dùng
  trong System Settings lần đầu bật.
- **C. Tạm gác macOS**, tập trung Android/iOS.

### 9.6 Cảnh báo vận hành khi test VPN trên máy Mac này

- Máy đang đi Internet qua **Tailscale exit node = node-1**. Bật tunnel FlowVPN sẽ **ngắt Tailscale**
  (macOS chỉ cho 1 VPN) ⇒ mọi kết nối bị chặn theo IP sẽ đứt. Sau khi test phải bật lại:
  `"/Applications/Tailscale.app/Contents/MacOS/Tailscale" up --accept-routes --exit-node-allow-lan-access --exit-node=100.76.147.111`
  (nếu chỉ chạy `up` trơn thì CLI từ chối đổi setting và máy mất mạng, dù `scutil` vẫn ghi Tailscale "Connected").
- `ws_relay_url` của **cả node-1 và vietnam-2 đang NULL** trong coordinator (handover §2 bước 2 chưa làm/đã mất
  khi migrate CP sang node-2). Client đang dùng giá trị đoán `wss://fcnvpn.tail303be3.ts.net:10000` (chỉ hạ cánh
  ở node-1) ⇒ nên set lại cho node-1 để khỏi phải đoán.
