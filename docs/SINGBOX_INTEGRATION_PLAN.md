# Kế hoạch tích hợp sing-box (libbox) — bỏ transport tự viết trên Android & iOS

- **Version:** v0.1 (DRAFT)
- **Date:** 2026-09-13
- **Status:** DRAFT — **bị chặn ở quyết định license (§7.1)**; chưa có dòng code nào được sửa
- **Liên quan:** `docs/HANDOVER_2026-09-13_china_ip_block_and_funnel.md` §4 "Tầng 2" (tài liệu này **là** Tầng 2),
  `docs/CHINA_TRANSPORT_ROADMAP.md`, `docs/ARCHITECTURE.md` §12, `docs/DEVELOPMENT.md` §5c, `docs/XCODE_CLOUD.md`
- **Nguyên tắc:** đây là **PLAN**. Mọi số liệu không tự đo được đều ghi rõ "chưa xác minh" (Phụ lục B).

## 1. Mục tiêu & phạm vi

### 1.1 Mục tiêu

1. **Xoá gốc của sự cố 13/09**: không còn socket loop, `protect()`, watchdog, zombie tunnel do Kotlin/Swift tự viết
   (`HysteriaVpnService.oneConnectPass()`, `wsRelayAttempt()`, `WSRelayBridge`, `tunnelUp` giả trong `DiagnosticsLog`).
2. **Đường dữ liệu chịu chặn theo IP**: nhiều outbound song song đi trên **hạ tầng dùng chung** (Tailscale Funnel,
   Cloudflare Tunnel) + IP node trực tiếp, có **URL-test/failover tự động** ở trong core thay vì vòng lặp Kotlin/Swift.
3. **Config do control-plane sinh** (đổi node/đổi đường/rotate credential **không cần phát hành app**).
4. **Trạng thái tunnel nói thật**: health lấy từ số liệu thật của core (delay từng outbound, `ConnectionsIn/Out`,
   traffic, memory của chính core) — không đoán.

### 1.2 Trong phạm vi / ngoài phạm vi

| Hạng mục | Quyết định |
|---|---|
| Lớp transport/outbound (hysteria2, VLESS/Reality, Trojan, WS/TLS, urltest/selector) | **THAY** bằng sing-box |
| Vỏ TUN: Android `VpnService`, iOS `NEPacketTunnelProvider` | **GIỮ** — luật của 2 nền tảng, không thể thay |
| Foreground service + notification (`specialUse`) | **GIỮ** (`HysteriaVpnService` — Android 15/16 bỏ type `vpn`) |
| Quản lý state/UI (`VPNManager.kt`, `VPNManager.swift`, `VPNState`) | **GIỮ**, chỉ đổi nguồn sự thật khi "up" (health thật thay vì `serve()` trả về) |
| `Config.kt` / `ControlAPIClient` | **GIỮ**, bỏ dần các hằng số transport (`HY_PASSWORD`, `HY_OBFS`, `HY_PORTS`, `WS_RELAY_URL`) |
| Control plane (`control-plane/src`) | **MỞ RỘNG** — thêm sinh config + endpoint (§5) |
| Server/node (hysteria2, wgrelay, wsrelay, Caddy, Funnel) | **MỞ RỘNG** — thêm đường VLESS+WS+TLS / Reality (§5.3, Phase 5) |
| macOS (`PrivateVPNMac`) | **NGOÀI PHẠM VI đợt 1** — nhưng `project.yml` dùng **chung** `PacketTunnelProvider.swift` cho iOS + macOS, nên mọi thay đổi ở file đó **phải** build được cả 2 target (§4.6, xem cảnh báo trong `docs/DEVELOPMENT.md` §3) |
| WireGuard cho khách ngoài TQ | Không đổi trong đợt 1; có thể chuyển sang outbound `wireguard` của sing-box sau |

### 1.3 Kết quả mong đợi (đo được)

| Chỉ số | Hiện tại | Mục tiêu |
|---|---|---|
| Thời gian tới đường dự phòng khi IP node bị chặn | ~25s (do `oneConnectPass()` thử TCP relay → UDP trước WS) | < 5s (URL-test interval 1–3 phút + pre-flight, hoặc chuyển tay ở `selector`) |
| "Connected nhưng không có mạng" | Có thật (log 21:41–21:42 13/09) | 0 ca: core báo delay thật, watchdog hạ tunnel khi mọi outbound chết |
| Reconnect khi đổi mạng (WiFi → 4G) | Tự viết, dựa `Mobile.stop()` + dựng lại socket | `CommandServer.resetNetwork()` + default-interface monitor của core |
| Rotate credential/đổi đường | Phải phát hành app (giá trị nằm trong APK) | Config từ control-plane, đổi trong 1 lần fetch |

## 2. Vì sao sing-box — map với sự cố 13/09

### 2.1 Sự cố (theo `HANDOVER_2026-09-13_china_ip_block_and_funnel.md`)

GFW chặn **IP công cộng của cả 2 node** (`103.173.155.50`, `103.6.234.233`) từ mạng TQ: TCP 443/9444 timeout,
SYN tới server nhưng SYN-ACK không về TQ (chặn chiều vào TQ). Hệ quả: API chết + data path chết cùng lúc.
Chỉ còn đường sống là hạ tầng **dùng chung** (Tailscale Funnel `wss://fcnvpn.tail303be3.ts.net:8443`, Cloudflare quick tunnel).

### 2.2 Bảng map: triệu chứng → gốc trong code hiện tại → cơ chế của sing-box

| Triệu chứng thật | Gốc trong code hiện tại | sing-box giải quyết bằng |
|---|---|---|
| Chặn **theo IP** làm chết mọi thứ (API + data) | Client chỉ biết **IP node**: `Config.HY_SERVER`, `HY_TCP_RELAY_HOST`, `Config.API_FALLBACK_ADDRESSES`; đường sống (WS qua Funnel) là **phương án cuối, thử sau cùng** (`oneConnectPass()` gọi `wsRelayAttempt()` ở cuối) | Nhiều outbound **ngang hàng** trong `urltest`/`selector`: `vless`+WS+TLS qua Funnel 443, `vless`+WS+TLS qua Cloudflare, `vless`+Reality tới IP node, `hysteria2` UDP trực tiếp. Core tự đo delay và tự chọn |
| Tunnel treo "connected" nhưng không có traffic | `WSRelayBridge.onFailure()` chỉ set `connected=false`; `Mobile.serve()` vẫn chạy ⇒ `tunnelUp=true` mà datagram không đi đâu (việc Tầng 1 §1 của HANDOVER) | Health **thật** từ core: `OutboundGroupItem.URLTestDelay`, `StatusMessage.{ConnectionsIn,ConnectionsOut,Uplink,Downlink,Memory}`; shell đọc qua `CommandClient` và hạ tunnel khi mọi outbound chết |
| Failover chậm (~25s/lượt, "quay tít") | Thứ tự thử cứng trong Kotlin, timeout từng transport 2.5–6s, backoff 3→30s | `urltest.interval` + `urltest.tolerance` tự đo định kỳ; `selector` cho phép đổi tay tức thì (`selectOutbound`) |
| Đổi mạng nền không được áp | Tự viết: `NetworkMonitor` → `onUnderlyingNetworkChanged()` → `Mobile.stop()` → dựng lại socket, socket bị "ghim" vào WiFi đã chết | `PlatformInterface.startDefaultInterfaceMonitor()` + `CommandServer.resetNetwork()`; core tự rebind theo interface mặc định |
| Socket của chính tunnel bị hút vào tunnel | Tự viết + `protect()` thủ công, thứ tự `protect()` **trước** `connect()` là bắt buộc (bug đã gặp thật) | `PlatformInterface.autoDetectInterfaceControl(fd)` → `VpnService.protect(fd)` (Android) do core gọi, không còn code app tự nhớ thứ tự |
| `serve()` trả về bị hiểu nhầm là "user stop" | Đã từng là bug (`serveOutcome()` phải phân biệt 3 ca) | Không còn "serve()": vòng đời là `startOrReloadService` / `closeService` |

### 2.3 Điều sing-box **KHÔNG** giải quyết (phải nói rõ để không kỳ vọng sai)

- **Không tạo ra đường mới.** Nếu IP node bị chặn và Funnel/Cloudflare cũng bị chặn thì mọi outbound đều chết.
  Cái sing-box cho là *tự chuyển* giữa các đường đã có, không phải *tự sinh* đường.
- **Không thay server.** Muốn có đường WS/TLS thì **server phải chạy thêm listener** VLESS+WS+TLS (Phase 5, §5.3).
  Lưu ý kỹ thuật quan trọng: **hysteria2 không đi được trong WebSocket** (nó là QUIC/UDP; V2Ray transport `ws`
  chỉ áp cho outbound TCP như VLESS/VMess/Trojan). Vì vậy "Hysteria-over-WS" hiện tại — một bridge UDP↔WS tự viết —
  **không có tương đương trong sing-box**; phải thay bằng VLESS+WS+TLS (hoặc giữ bridge như phương án chuyển tiếp, §4.5).
- **Không sửa được chất lượng exit node.** `CHINA_TRANSPORT_ROADMAP.md` đã ghi node1 đo ~0 B/s lúc nghẽn;
  core nhanh đến mấy cũng không bù được băng thông node.
- **Không tự quyết license** — xem §7.1 (đây là blocker thật).

## 3. Cách lấy và nhúng libbox

### 3.1 Số liệu artifact đã xác minh (13/09/2026)

| Câu hỏi | Kết luận đã kiểm chứng | Nguồn |
|---|---|---|
| Bản phát hành mới nhất | **v1.14.0**, publish 2026-08-31 | [GitHub Releases API](https://api.github.com/repos/SagerNet/sing-box/releases/latest) |
| Go version bắt buộc (v1.14.0) | `go 1.25.5` trong `go.mod` | [go.mod @ v1.14.0](https://raw.githubusercontent.com/SagerNet/sing-box/v1.14.0/go.mod) |
| Nhánh mặc định của repo | `testing` (không phải `main`/`dev`) | [repo API](https://api.github.com/repos/SagerNet/sing-box) |
| Có `libbox.aar` chính thức trong Releases? | **KHÔNG.** Assets chỉ có app/binary (SFA/SFI/SFM/SFW, `sing-box-*-android-*.tar.gz`…). Không có `libbox.aar`, không có `Libbox.xcframework` | [assets v1.14.0](https://github.com/SagerNet/sing-box/releases/tag/v1.14.0) |
| Có artifact Maven Central? | **KHÔNG.** `search.maven.org` trả `numFound: 0` cho `libbox`, `sing-box`, `com.sagernet`, `g:io.nekohasekai` | [Maven Central Search API](https://search.maven.org/solrsearch/select?q=libbox&rows=20&wt=json) |
| Vậy lấy ở đâu? | **Tự build bằng `gomobile bind`** từ `./experimental/libbox`. Script chính thức: `cmd/internal/build_libbox/main.go` (Android → `libbox.aar` + `libbox-legacy.aar`; Apple → `Libbox.xcframework`) | [build_libbox/main.go](https://raw.githubusercontent.com/SagerNet/sing-box/testing/cmd/internal/build_libbox/main.go) |
| gomobile nào? | Fork **`github.com/sagernet/gomobile`** (BSD-3-Clause) — script import `_ "github.com/sagernet/gomobile"` | [SagerNet/gomobile](https://github.com/SagerNet/gomobile) |
| Java bắt buộc khi bind Android | Script fail nếu `java --version` không chứa `openjdk 17` | `checkJavaVersion()` trong build_libbox |
| App tham chiếu để copy cách nhúng | SFA (Android): `implementation(files("libs/libbox.aar"))`, `app/libs/` bị gitignore; SFI (iOS): `Libbox.xcframework` bị gitignore, copy vào gốc repo | [SFA app/build.gradle.kts](https://raw.githubusercontent.com/SagerNet/sing-box-for-android/dev/app/build.gradle.kts), [SFI .gitignore](https://raw.githubusercontent.com/SagerNet/sing-box-for-apple/dev/.gitignore) |

### 3.2 Android

**Build (đề xuất, bám đúng script chính thức):**

```bash
# toolchain: Go 1.25.5 (đúng go.mod v1.14.0), JDK 17, Android SDK + NDK
git clone --depth 1 -b v1.14.0 https://github.com/SagerNet/sing-box /tmp/sing-box
cd /tmp/sing-box
go install github.com/sagernet/gomobile/cmd/gomobile@latest && go install github.com/sagernet/gomobile/cmd/gobind@latest

# tags: KHÔNG dùng nguyên bộ tag của upstream (xem bảng bên dưới)
gomobile bind -v \
  -o libbox.aar \
  -target android \
  -androidapi 24 \
  -javapkg=io.nekohasekai \
  -libname=box \
  -tags with_quic,with_utls,with_wireguard,badlinkname,tfogo_checklinkname0 \
  ./experimental/libbox
```

| Chọn | Giá trị | Vì sao |
|---|---|---|
| `-androidapi 24` | 24 | Bằng đúng `minSdk` flavor `legacy` của repo ⇒ **một** `libbox.aar` dùng cho cả `modern` (26) và `legacy` (24); **không cần** `libbox-legacy.aar` (bản đó chỉ để hạ xuống API 21 và bỏ `with_naive_outbound`) |
| `-javapkg=io.nekohasekai` | giữ nguyên | Tên class Java/Kotlin thành `io.nekohasekai.libbox.*` — đúng như SFA dùng; đổi `javapkg` chỉ làm lệch tài liệu upstream, không có lợi |
| `-tags` | rút gọn so với upstream | Upstream bật cả `with_naive_outbound, with_clash_api, with_usbip, with_openvpn, with_openconnect, with_tailscale` → tăng size + bề mặt tấn công + memory. Ta chỉ cần QUIC (hysteria2) + uTLS/Reality (nếu chọn) + wireguard (nếu giữ WG outbound) |
| Linker flags | lấy từ `release/LDFLAGS` của repo sing-box | Docs yêu cầu downstream dùng nguyên file này (`-checklinkname=0` đi kèm tag `badlinkname`) — [Build from source](https://sing-box.sagernet.org/installation/build-from-source/) |
| ABI | mặc định `armeabi-v7a, arm64-v8a, x86, x86_64` | Cần quyết định ABI split, xem §7.2 |

**Nhúng vào app (mô tả thay đổi — KHÔNG thực hiện trong tài liệu này):**

1. Đặt artifact: `android/app/libs/libbox.aar` (cùng chỗ `hysteria.aar`; `hysteria.aar` 29.7 MB đang được commit,
   `hysteria-sources.jar` bị `.gitignore`).
2. `android/app/build.gradle.kts` — thêm **một dòng** vào khối `dependencies` (ngay cạnh dòng hysteria hiện có):

   ```kotlin
   implementation(files("libs/hysteria.aar"))   // hiện có (đường legacy)
   implementation(files("libs/libbox.aar"))     // THÊM — sing-box core (Phase 1)
   ```

   Không cần `flatDir`, không cần version catalog, không cần dependency mới nào khác.
   (`useLegacyPackaging = true` trong `packaging.jniLibs` là cách SFA làm khi native lib không nạp được — **chưa xác minh**
   là repo này có cần hay không; chỉ thêm nếu gặp lỗi `UnsatisfiedLinkError`.)
3. Không đổi `targetSdk`/`compileSdk`/flavor. `libbox.aar` khai `minSdk 24`, khớp cả 2 flavor.

### 3.3 iOS

**Build (đề xuất, bám script chính thức):**

```bash
cd /tmp/sing-box
gomobile bind -v \
  -target ios,iossimulator \
  -libname=box \
  -tags-not-macos=with_low_memory \
  -iosversion=15.0 \
  -tags with_quic,with_utls,badlinkname,tfogo_checklinkname0 \
  ./experimental/libbox
# → Libbox.xcframework   (upstream còn thêm tvos,tvossimulator,macos; ta KHÔNG cần → giảm size)
```

- `-tags-not-macos=with_low_memory`: **script chính thức của upstream truyền cờ này cho mọi target Apple không phải macOS**
  (xác minh trong `build_libbox/main.go`). Đây chính là tag "tiết kiệm bộ nhớ" cho NetworkExtension.
  *Nội dung cụ thể của tag này chưa xác minh được* (không có file/tài liệu nào tên `low_memory` trong tree v1.14.0) →
  Phụ lục B.
- `-target ios,iossimulator` là **đề xuất của tôi**, khác upstream (upstream build cả tvOS + macOS): bỏ 3 slice không dùng
  để giảm dung lượng. Nếu muốn dùng chung cho `PrivateVPNMac` sau này thì phải thêm slice `macos` → build lại.
- Yêu cầu nền tảng: SFI công bố **iOS 15.0+**; repo này target iOS 17.0 ⇒ thoả.
- **Cần build trên máy có Xcode + Go 1.25.5 + gomobile**; không build được trên Xcode Cloud một cách hợp lý (§7.2).

**Nhúng qua `project.yml` + xcodegen (mô tả thay đổi — KHÔNG thực hiện):**

Cách vendor hiện tại của repo **không phải** xcframework: `project.yml` khai một **SwiftPM package local**
(`packages: WireGuardKit: { path: Vendor/WireGuardKit }`) rồi `dependencies: - package: WireGuardKit`.
Thư mục `Vendor/` hiện chỉ có `WireGuardKit`. ⇒ Nhúng xcframework là **pattern mới** trong repo, và xcodegen hỗ trợ sẵn:

```yaml
# project.yml — thêm vào CẢ HAI target tunnel (iOS + macOS), xem cảnh báo §4.6
    dependencies:
      - framework: Vendor/Libbox.xcframework
        embed: false        # xcframework tĩnh: KHÔNG embed (mặc định đã false cho app-extension, ghi rõ cho chắc)
      - package: WireGuardKit   # (giữ ở Phase 1–3, xoá khi bỏ hẳn WireGuard trên iOS)
```

- Vị trí artifact: `Vendor/Libbox.xcframework/` (cùng chỗ `Vendor/WireGuardKit`).
- `dependencies: framework: path` là cú pháp chính thức của xcodegen để link "framework hoặc XCFramework"
  ([XcodeGen ProjectSpec — Dependency](https://raw.githubusercontent.com/yonaskolb/XcodeGen/master/Docs/ProjectSpec.md)).
- **Bắt buộc** thêm cho **cả** `PrivateVPNPacketTunnel` (iOS) **và** `PrivateVPNMacPacketTunnel` (macOS), vì 2 target
  dùng chung `iOS/PrivateVPNPacketTunnel/PacketTunnelProvider.swift`
  (`project.yml:98` khai cả thư mục, `project.yml:244` chỉ khai đúng 1 file provider) — bài học thật đã ghi ở
  `docs/DEVELOPMENT.md` §3 (13/09/2026, `WGRelayClient.swift` + `RelayDiagnostics.swift` làm macOS build đứt).
- Sau khi sửa `project.yml`: `xcodegen generate`, rồi build **cả 2** scheme:

  ```bash
  xcodebuild -project PrivateVPN.xcodeproj -scheme PrivateVPN    -configuration Release -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
  xcodebuild -project PrivateVPN.xcodeproj -scheme PrivateVPNMac -configuration Release -destination 'generic/platform=macOS'         CODE_SIGNING_ALLOWED=NO build
  ```

- `Libbox.xcframework` **phải** có mặt trong repo (hoặc được tải trong `ci_scripts/ci_post_clone.sh` kèm checksum):
  Xcode Cloud clone sạch từ git, không có file local. Xem §7.2 và việc cần owner quyết §8.

### 3.4 Giới hạn bộ nhớ của NetworkExtension — rủi ro thật, phải đo

| Số liệu | Giá trị | Nguồn |
|---|---|---|
| Giới hạn của **packet tunnel provider** trên iOS | **50 MiB** (`ActiveHard 50 MB`); app proxy & DNS proxy 15 MiB; filter control/data 50 MiB; app push 24 MiB | Bảng giới hạn được dẫn lại kèm link Apple forum trong [XTLS/Xray-core#4422](https://github.com/XTLS/Xray-core/issues/4422) |
| Chữ ký crash thật khi vượt | `EXC_RESOURCE -> PacketTunnel[pid] exceeded mem limit: ActiveHard 50 MB (fatal)` … `killed by jetsam reason per-process-limit` | [EbrahimTahernejad/Tun2SocksKit#33](https://github.com/EbrahimTahernejad/Tun2SocksKit/issues/33), [XTLS/libXray#102](https://github.com/XTLS/libXray/issues/102) |
| Vì sao khó: baseline đã cao | Trong ca của Tun2SocksKit, sau `startTunnel()` tiến trình đã chiếm **~30 MB** khi chưa tải gì | Tun2SocksKit#33 |
| Core Go có fit không? | **Google Go runtime + core Go từng bị coi là nguyên nhân** của việc chạm trần thấp ở thời kỳ đầu ([golang/go#21489](https://github.com/golang/go/issues/21489)). Với sing-box: upstream **có** ship SFI trên App Store từ iOS 15 và build kèm `with_low_memory` ⇒ *về nguyên tắc là fit*, nhưng **không có số đo công khai** | [sing-box for Apple platforms](https://sing-box.sagernet.org/clients/apple/) |
| Bài học đắt giá từ Xray | Core bị chết ngay khi nạp **geosite/geoip** vào RAM (rule-set lớn không lọt 50 MB) | Xray-core#4422 |
| Cách tự đo trong app | `StatusMessage.Memory` (int64) mà libbox **tự báo** qua `CommandClient` | [command_types.go](https://raw.githubusercontent.com/SagerNet/sing-box/testing/experimental/libbox/command_types.go) |

**Hệ quả thiết kế (bắt buộc tuân thủ ở §5.4):** config sinh cho iOS **không** được dùng rule-set geoip/geosite lớn;
DNS cache nhỏ; không bật Clash API; không bật gVisor/naive (giảm code + heap); và shell phải theo dõi
`StatusMessage.Memory` để tự hạ tải trước khi jetsam giết extension.

## 4. Kiến trúc tích hợp

### 4.1 Android — `HysteriaVpnService` trở thành vỏ mỏng

```text
VPNManager.connect()                      (giữ nguyên: chọn node, claim device, state UI)
      └─ startService(Intent EXTRA_CONFIG_JSON)          ← thay EXTRA_HOST/EXTRA_HOSTS
SingBoxVpnService : VpnService (đổi tên từ HysteriaVpnService khi Phase 6)
      ├─ SingBoxPlatformInterface : io.nekohasekai.libbox.PlatformInterface
      │     ├─ openTun(TunOptions): Int      → Builder().establish()!!.fd   ← TUN do app tạo, giao fd cho core
      │     ├─ autoDetectInterfaceControl(fd) → protect(fd)                 ← thay hết logic protect() thủ công
      │     ├─ useProcFS()                   → Build.VERSION.SDK_INT < Q    (đúng như SFA)
      │     ├─ startDefaultInterfaceMonitor(listener) → NetworkMonitor hiện có (map Network → tên interface)
      │     └─ findConnectionOwner(...)      → ConnectivityManager.getConnectionOwnerUid (API 29+)
      └─ CommandServer(handler, platformInterface)
            ├─ start()
            ├─ startOrReloadService(configJson, null)   ← core tự dựng TUN qua openTun()
            ├─ resetNetwork()                            ← gọi khi NetworkMonitor thấy đổi mạng nền
            ├─ pause()/wake()                            ← màn hình tắt/mở (tiết kiệm pin, metered data)
            └─ closeService() / close()
BoxServiceHandler : CommandServerHandler        (serviceStop/serviceReload → dừng/dựng lại service)
CommandClient (tuỳ chọn, trong process service)  → status/outbounds/connections stream cho watchdog + UI
```

Điểm mấu chốt: **TUN vẫn do app tạo** (`VpnService.Builder`), nhưng **core là bên quyết định thông số**
(mtu/address/dns/routes nằm trong `TunOptions` do libbox truyền vào `openTun`) — đúng như SFA đang làm
([VPNService.kt](https://raw.githubusercontent.com/SagerNet/sing-box-for-android/dev/app/src/main/java/io/nekohasekai/sfa/bg/VPNService.kt),
[PlatformInterfaceWrapper.kt](https://raw.githubusercontent.com/SagerNet/sing-box-for-android/dev/app/src/main/java/io/nekohasekai/sfa/bg/PlatformInterfaceWrapper.kt)).
Vì vậy overlay IP (`100.100.100.101/30`) chuyển từ `HysteriaVpnService.companion` sang **config** (`inbounds[].address`)
— một nguồn sự thật duy nhất, có thể đổi từ control-plane.

### 4.2 iOS — `PacketTunnelProvider` trở thành vỏ mỏng

```text
PacketTunnelProvider : NEPacketTunnelProvider          (giữ: file này dùng chung iOS + macOS!)
      ├─ ExtensionPlatformInterface : LibboxPlatformInterfaceProtocol, LibboxCommandServerHandlerProtocol
      │     └─ openTun(options) → dựng NEPacketTunnelNetworkSettings từ options
      │                          (getAutoRoute/getMTU/getInet4Address/getDNSServerAddress/getInet4RouteAddress…)
      │                          → setTunnelNetworkSettings(settings)
      │                          → trả fd của packetFlow cho core
      └─ LibboxCommandServer(handler: self, platformInterface: self) → start / startOrReloadService / closeService
```

- Cách lấy fd (đúng như upstream SFI đang làm):
  `packetFlow.value(forKeyPath: "socket.fileDescriptor")` (KVC vào thuộc tính **private** của Apple) —
  fallback `LibboxGetTunnelFileDescriptor()`
  ([ExtensionPlatformInterface.swift](https://raw.githubusercontent.com/SagerNet/sing-box-for-apple/dev/Library/Network/ExtensionPlatformInterface.swift)).
  ⚠️ **Rủi ro thật**: đường KVC private này có thể vỡ ở iOS mới và là thứ App Review có thể chất vấn →
  đưa vào checklist kiểm thử mỗi bản iOS (§7.5).
- Ghi chú: upstream SFI dùng `usePlatformAutoDetectControl() = false` và `autoDetectControl()` rỗng ⇒ trên iOS
  **không** có `protect()`; loop-prevention dựa vào NetworkExtension. Việc "socket của core không tự chui vào tunnel"
  **phải được kiểm chứng bằng test thật** (nghiệm thu Phase 3), không được giả định.

### 4.3 API libbox dùng để thay thế watchdog/health tự viết

| Việc hiện tại (tự viết) | API libbox thay thế | Xác minh |
|---|---|---|
| `probeThroughTunnel()` HTTP 1.1.1.1 + DNS query mỗi 15s | `CommandClient.urlTest(outboundTag)` (đo thật qua từng outbound) + `OutboundGroupItem.URLTestDelay` | `command_client.go:570`, `command_types.go:64` |
| `DiagnosticsLog.relayRxBytes/TxBytes`, `probeRelayReachable()` | `StatusMessage.{Uplink,Downlink,UplinkTotal,DownlinkTotal,ConnectionsIn,ConnectionsOut,TrafficAvailable}` | `command_types.go:29` |
| "Tunnel up but no traffic" | Watchdog đọc status stream: mọi `URLTestDelay == 0`/timeout và traffic không tăng trong N giây ⇒ `closeService()` + `startOrReloadService()` (hạ tunnel thay vì treo) | như trên |
| `NetworkMonitor` → `Mobile.stop()` → dựng lại socket | `CommandServer.resetNetwork()` (+ `startDefaultInterfaceMonitor` của PlatformInterface) | `command_server.go:309` |
| Chuyển node sau 2 pass chết (`NODE_FAILOVER_AFTER_PASSES`) | `urltest` (tự động) hoặc `CommandClient.selectOutbound(groupTag, outboundTag)` (chuyển tay/ép đường) | `command_client.go:557` |
| `Mobile.stop()` để `serve()` trả về | `CommandServer.closeService()`; đóng hẳn: `close()` | `command_server.go:226`, `:194` |
| (không có) memory khi "connected but no internet" | `StatusMessage.Memory` → cảnh báo trước jetsam trên iOS | `command_types.go:30` |

### 4.4 Vòng đời & tính chất "không được để mất mạng" (giữ như hiện tại)

Hiện tại có một tính chất **cố ý** trong `HysteriaVpnService`: `Mobile.connect()` chạy **trước** `establish()`,
nên "mọi transport fail thì mạng của máy không bị mất" (`docs/ARCHITECTURE.md` §12). Với libbox, TUN được tạo
**khi service start** (`openTun`), nên phải chủ động giữ lại tính chất này:

1. **Pre-flight gate (bắt buộc, Phase 1):** trước khi gọi `startOrReloadService`, service thử **một** phép đo rẻ tiền
   ra ngoài tunnel (ví dụ `TCP connect 443` tới host Funnel và tới IP node, song song, timeout 2s, có `protect()`).
   Chưa có đường nào sống ⇒ **không** start core (state `CONNECTING`, backoff), máy vẫn có mạng riêng.
2. **Chỉ start core khi pre-flight pass** → `startOrReloadService(config, null)` → TUN lên cùng lúc đường đã thông.
3. **Watchdog health (Phase 4):** đọc `StatusMessage` + `URLTestDelay`; khi mọi outbound chết:
   `closeService()` (TUN xuống, máy về mạng thường) → backoff → pre-flight → start lại. Đây **chính là** bản sửa
   "tunnel treo ở trạng thái connected" mà không cần tự viết lại logic transport.
4. **Stop của người dùng:** `closeService()` → `close()` → `stopSelf()`; `onRevoke()` xử lý như SFA.
5. `START_STICKY` + foreground `specialUse` + notification: giữ nguyên như hiện tại.

### 4.5 Số phận code cũ

| File / artifact | Quyết định | Khi nào |
|---|---|---|
| `vpn/WSRelayBridge.kt` (131 dòng, cầu UDP↔WS tự viết) | **Xoá** — thay bằng outbound `vless`+`transport: ws`+`tls` qua Funnel/Cloudflare. Xem phương án chuyển tiếp bên dưới | Phase 6 |
| `vpn/WGRelay.kt` (138 dòng) + `vpn/RelayProtectService.kt` | **Xoá**; nếu cần WG-over-TCP: outbound `wireguard` của sing-box + relay server sẵn có | Phase 6 |
| `iOS/PrivateVPNPacketTunnel/WGRelayClient.swift` (376 dòng) | **Xoá** | Phase 6 |
| `iOS/…/RelayDiagnostics.swift` | Giữ tới hết Phase 5 (log chẩn đoán rất có giá trị khi so sánh 2 engine); sau đó thay bằng log của core | Phase 6 |
| `android/app/libs/hysteria.aar` (29.7 MB) + `mobile.Mobile` | **GIỮ làm đường dự phòng** (Phase 1–5, bật bằng cờ `Config.TRANSPORT_ENGINE`), chỉ xoá sau khi sing-box đã chạy ổn ở TQ ≥ 1 chu kỳ phát hành | Phase 6 |
| `Config.kt`: `HY_PASSWORD`, `HY_OBFS`, `HY_PORTS`, `HY_TCP_RELAY_PORTS`, `WS_RELAY_URL` | Chuyển sang **config do control-plane sinh**; các giá trị đang nằm trong APK đã phát hành ⇒ **phải rotate** (coi như đã công khai — chính comment trong `Config.kt` đã thừa nhận) | Phase 2 |
| `Config.kt`: `HYSTERIA_MODE` | Thêm cờ `TRANSPORT_ENGINE` (giá trị `singbox` hoặc `legacy`) để đảo ngược được | Phase 1 |
| `diagnostics/DiagnosticsLog.kt` | Giữ (UI + file log), bổ sung trường `engine`, `outbound`, `urlTestDelay` | Phase 1 |
| WireGuard trên iOS (`WireGuardKit` + `wireguard-go` build trong preBuildScript) | Giữ ở đợt 1; nếu chuyển sang outbound `wireguard` thì xoá được **cả** WireGuardKit lẫn preBuild `make` (giảm size extension + bớt 1 chuỗi build) | Sau Phase 5 |

**Phương án chuyển tiếp cho đường WS (nếu chưa kịp làm server Phase 5):** giữ `WSRelayBridge` **nguyên trạng** và khai
`hysteria2` outbound trỏ `server: 127.0.0.1`, `server_port: <port bridge>` — core vẫn là bên chạy tunnel/urltest,
bridge chỉ còn là "đoạn dây" tạm. Cách này **không** được coi là trạng thái đích (vẫn còn code tự viết) nhưng cho phép
ship Phase 1–4 mà không cần đổi server.

### 4.6 File thay đổi dự kiến (toàn bộ kế hoạch, không phải 1 commit)

| File | Thay đổi |
|---|---|
| `android/app/build.gradle.kts` | +1 dòng `implementation(files("libs/libbox.aar"))`; (tuỳ chọn) ABI splits |
| `android/app/libs/libbox.aar` | artifact build mới (§3.2) |
| `android/app/src/main/java/com/privatevpn/app/vpn/SingBoxPlatformInterface.kt` | **mới** |
| `android/app/src/main/java/com/privatevpn/app/vpn/SingBoxVpnService.kt` | **mới** (Phase 1–5), sau đó thay `HysteriaVpnService` |
| `…/vpn/HysteriaVpnService.kt` | giữ ở Phase 1–5 (đường legacy); xoá ở Phase 6 |
| `…/vpn/WSRelayBridge.kt`, `…/WGRelay.kt`, `…/RelayProtectService.kt` | xoá ở Phase 6 |
| `…/vpn/VPNManager.kt` | truyền `EXTRA_CONFIG_JSON` thay `EXTRA_HOST/HOSTS/HOST_IDS`; state "up" lấy từ health của core |
| `android/app/src/main/java/com/privatevpn/app/Config.kt` | +`TRANSPORT_ENGINE`, +endpoint config; bỏ dần credentials |
| `project.yml` | thêm `- framework: Vendor/Libbox.xcframework` cho **cả** 2 target tunnel |
| `Vendor/Libbox.xcframework/` | artifact build mới (§3.3) |
| `iOS/PrivateVPNPacketTunnel/ExtensionPlatformInterface.swift` | **mới** |
| `iOS/PrivateVPNPacketTunnel/PacketTunnelProvider.swift` | viết lại phần `startTunnel`/`stopTunnel` (giữ nguyên chữ ký override) |
| `iOS/PrivateVPNPacketTunnel/WGRelayClient.swift` | xoá ở Phase 6 |
| `iOS/PrivateVPN/VPNManager.swift` | truyền `singbox_config` trong `providerConfiguration` thay `wireguard` |
| `iOS/PrivateVPN/Services/WireGuardConfig.swift` | thêm kiểu `SingBoxConfig` (hoặc file mới) — **đừng** nhồi vào `WireGuardConfig` |
| `control-plane/src/singbox-config.js` | **mới** — sinh config (§5) |
| `control-plane/src/index.js` | +endpoint trả config; `node-store.js` +cột thông tin đường |
| `control-plane/test/singbox-config.test.js` | **mới** — `node --test` |
| `ci_scripts/ci_post_clone.sh` | chỉ đổi **nếu** chọn phương án tải xcframework trong CI (§7.2) |
| `docs/ARCHITECTURE.md` §12, `docs/DEVELOPMENT.md` §5c, `docs/CHINA_TRANSPORT_ROADMAP.md` | cập nhật khi từng Phase xong (không sửa trước) |

## 5. Config do control-plane sinh

### 5.1 Dạng config (ví dụ đầy đủ, sing-box 1.14)

```json
{
  "log": { "level": "warn" },
  "dns": {
    "servers": [
      { "type": "udp",   "tag": "local",  "server": "1.1.1.1", "detour": "direct" },
      { "type": "https", "tag": "remote", "server": "1.1.1.1", "detour": "proxy" }
    ],
    "rules": [ { "ip_accept_any": true, "server": "local" } ],
    "final": "remote",
    "strategy": "prefer_ipv4",
    "cache_capacity": 1024
  },
  "inbounds": [
    {
      "type": "tun",
      "tag": "tun-in",
      "address": ["100.100.100.101/30"],
      "mtu": 1420,
      "auto_route": true,
      "strict_route": true,
      "route_exclude_address": ["<IP node 1>", "<IP node 2>"],
      "stack": "system",
      "platform": { "http_proxy": { "enabled": false } }
    }
  ],
  "outbounds": [
    { "type": "selector", "tag": "proxy",
      "outbounds": ["auto", "funnel-ws", "cf-ws", "node-reality", "node-hy2"],
      "default": "auto",
      "interrupt_exist_connections": false },

    { "type": "urltest", "tag": "auto",
      "outbounds": ["funnel-ws", "cf-ws", "node-reality", "node-hy2"],
      "url": "https://www.gstatic.com/generate_204",
      "interval": "3m", "tolerance": 150,
      "idle_timeout": "30m" },

    { "type": "vless", "tag": "funnel-ws",
      "server": "fcnvpn.tail303be3.ts.net", "server_port": 443,
      "uuid": "<uuid>",
      "tls": { "enabled": true, "server_name": "fcnvpn.tail303be3.ts.net" },
      "transport": { "type": "ws", "path": "/vpnflow", "headers": { "Host": "fcnvpn.tail303be3.ts.net" } } },

    { "type": "vless", "tag": "cf-ws",
      "server": "<cloudflare-tunnel-host>", "server_port": 443,
      "uuid": "<uuid>",
      "tls": { "enabled": true, "server_name": "<cloudflare-tunnel-host>" },
      "transport": { "type": "ws", "path": "/vpnflow" } },

    { "type": "vless", "tag": "node-reality",
      "server": "<IP node>", "server_port": 443,
      "uuid": "<uuid>", "flow": "xtls-rprx-vision",
      "tls": { "enabled": true, "server_name": "<SNI mượn>",
               "utls": { "enabled": false, "fingerprint": "chrome" },
               "reality": { "enabled": true, "public_key": "<reality public key>", "short_id": "<short id>" } } },

    { "type": "hysteria2", "tag": "node-hy2",
      "server": "<IP node>", "server_port": 8443,
      "password": "<hy2 password>",
      "obfs": { "type": "salamander", "password": "<obfs password>" },
      "up_mbps": 10, "down_mbps": 50,
      "tls": { "enabled": true, "certificate_public_key_sha256": ["<pin>"] } },

    { "type": "direct", "tag": "direct" }
  ],
  "route": {
    "rules": [
      { "action": "sniff" },
      { "protocol": "dns", "action": "hijack-dns" },
      { "ip_is_private": true, "outbound": "direct" },
      { "ip_cidr": ["<IP node 1>/32", "<IP node 2>/32"], "outbound": "direct" },
      { "domain_suffix": ["meetflowai.site", "ts.net", "trycloudflare.com"], "outbound": "direct" }
    ],
    "final": "proxy",
    "default_domain_resolver": { "server": "local" }
  },
  "experimental": {
    "cache_file": { "enabled": true, "store_fakeip": false }
  }
}
```

**Đã kiểm chứng:** ví dụ JSON trên **parse được** và **validate sạch (0 lỗi)** bằng JSON Schema chính thức của
sing-box v1.14.0 (`docs/schema.json`, kiểm bằng `jsonschema` Draft 2020-12). Nguồn schema:
<https://raw.githubusercontent.com/SagerNet/sing-box/v1.14.0/docs/schema.json>. Khi control plane đổi cấu trúc config,
có thể dùng lại đúng cách kiểm này như một bài test (`node --test` không có JSON Schema built-in ⇒ cần tự viết kiểm tra
shape, hoặc validate ở CI bằng công cụ ngoài — xem việc cần owner quyết §8).

Ghi chú kỹ thuật đã kiểm chứng cho từng mảnh:

| Mảnh | Kiểm chứng |
|---|---|
| `urltest`: `type/tag/outbounds/url/interval/tolerance/idle_timeout/interrupt_exist_connections` | [URLTest outbound](https://sing-box.sagernet.org/configuration/outbound/urltest/) |
| `selector` (nhóm chọn tay, để UI "đổi đường" và để ép đường khi test) | [Selector outbound](https://sing-box.sagernet.org/configuration/outbound/selector/) |
| `vless`: `uuid/flow/network/tls/transport/…` | [VLESS outbound](https://sing-box.sagernet.org/configuration/outbound/vless/) |
| `hysteria2`: `password/server_ports/hop_interval/up_mbps/down_mbps/obfs{salamander,gecko}/bbr_profile` | [Hysteria2 outbound](https://sing-box.sagernet.org/configuration/outbound/hysteria2/) — tương ứng các tham số đang khai trong `Config.kt`, **nhưng khác đơn vị**: `Config.kt` dùng `HY_UP_KBPS`/`HY_DOWN_KBPS` (Kbps) còn sing-box dùng `up_mbps`/`down_mbps` (Mbps) ⇒ phải chia 1000 khi sinh config |
| `tls.utls` / `tls.reality` (`public_key`, `short_id`) | [TLS (shared)](https://sing-box.sagernet.org/configuration/shared/tls/) |
| `tun`: `address/mtu/auto_route/strict_route/route_exclude_address/stack/platform.http_proxy` | [Tun inbound](https://sing-box.sagernet.org/configuration/inbound/tun/) |
| DNS dạng **typed server** (từ 1.12): `{"type":"udp","tag":…,"server":…}` | [DNS Server](https://sing-box.sagernet.org/configuration/dns/server/) |
| `route.final`, `route.rules` | [Route](https://sing-box.sagernet.org/configuration/route/) |
| ⚠️ `route.auto_detect_interface` **chỉ hỗ trợ Linux/Windows/macOS** — **không** có trên Android/iOS | Route docs (mục Fields) |
| ⚠️ TLS `engine` (từ 1.14): `go` / `apple` / `windows` — trên iOS có thể chọn engine TLS của Apple (đòn giảm memory/size cần đo) | TLS (shared) docs |

### 5.2 Luồng & endpoint

| Bước | Hiện tại (code thật) | Sau khi đổi |
|---|---|---|
| App lấy node | `GET /v1/nodes` (`control-plane/src/index.js:365`, `listPublicNodes`) | giữ nguyên (app vẫn hiển thị danh sách/độ trễ) |
| App đăng ký thiết bị | `POST /v1/peers/register` (`index.js:2576`) → `{peer_id, overlay_ip, network, peer_credential, peers}` | **thêm** field `singbox_config` (object) + `singbox_config_version` |
| App làm mới config | (không có) | **mới**: `GET /v1/client/config` (Bearer session, kiểm tra entitlement/device) → `{version, config, expires_at}` |
| Chọn node đứng đầu | `selectExitNode()` + health report (`POST /v1/nodes/:id/report`) | giữ, và dùng **chính thứ tự đó** để xếp `urltest.outbounds` + `selector.default` |
| Credential transport | Hằng số trong APK (`Config.kt`) | Server-side: env/DB; app chỉ nhận config |
| Đường phụ (Funnel/CF) | Hằng số trong APK (`WS_RELAY_URL`, `API_FALLBACK_BASES`) | Bảng/cột mới trong `nodes.db` |

### 5.3 Control plane phải thêm gì (danh sách việc)

| # | Việc | Chi tiết |
|---|---|---|
| 1 | Module `src/singbox-config.js` | Hàm thuần `buildSingBoxConfig({ user, device, node, endpoints, platform })` → object JSON. Không I/O ⇒ test được bằng `node --test` |
| 2 | Endpoint | Trả config trong `POST /v1/peers/register` (v1 shape) **và** `GET /v1/client/config` để refresh; cả hai đều `requireUserAuth` + kiểm tra subscription/device |
| 3 | Dữ liệu node | `node-store.js` (`exit_nodes` ở `nodes.db`) cần thêm thông tin đường: host Funnel/CF, port, path WS, `uuid`, `reality_public_key`/`short_id`, port hysteria2, obfs; **private key Reality ở lại node**, control plane chỉ giữ public key |
| 4 | Credential người dùng | UUID VLESS theo **user** (hoặc theo device) + password hysteria2 dùng chung → sinh ở server, không nằm trong APK; thêm endpoint admin để rotate |
| 5 | Thứ tự & nhóm | `urltest.outbounds` xếp theo thứ tự `GET /v1/nodes` (đã có logic "node bị ≥3 báo lỗi trong 30 phút tụt xuống") |
| 6 | Route rule "đừng tự chặn mình" | Đưa host API (`api.meetflowai.site`, `fcnvpn.tail303be3.ts.net`, `*.trycloudflare.com`) + IP node vào `direct` — **nếu thiếu, app sẽ tự chặn API của chính nó** |
| 7 | Hồ sơ theo nền tảng | `platform: "ios"` hoặc `"android"` → iOS: ít outbound/rules hơn, `cache_capacity` nhỏ, **không** Clash API, **không** rule-set lớn (§3.4) |
| 8 | Kiểm tra config trước khi trả | `node --test` cho shape + (tuỳ chọn) `Libbox.checkConfig(json)` ở phía app trước khi start; không trả config sai làm chết tunnel |
| 9 | Versioning | `singbox_config_version` để app biết khi nào cần fetch lại; config có `expires_at` (ví dụ 30 ngày) để buộc làm mới |
| 10 | **Server (ngoài control plane)** | Thêm listener **VLESS+WS+TLS** sau Funnel (Funnel chỉ expose entry đã cấu hình — HANDOVER ghi `:8443` cho `wsrelay-hy`, `:10000` cho `wsrelay` WG) + Cloudflare tunnel, và **VLESS+Reality** trên IP node; hysteria2 giữ nguyên. Đây là việc **owner/ops** thực hiện, không nằm trong repo app |

### 5.4 Quy tắc bắt buộc khi sinh config

1. **Không dùng rule-set geoip/geosite** trong profile iOS (bài học Xray: nạp geo vào RAM là chết ở 50 MB) — dùng
   `domain_suffix`/`ip_cidr` viết thẳng, danh sách ngắn.
2. **Luôn có outbound `direct`** và rule cho traffic tới API/node ⇒ tránh tự chặn API (bug "cannot reach service").
3. **Không dựa vào `auto_detect_interface`** (không hỗ trợ Android/iOS).
4. **`up_mbps/down_mbps` cho hysteria2 phải khai đúng thực tế đường relay** (HANDOVER Tầng 1 §5: brutal CC khai 20 Mbps
   trong khi thực tế thấp hơn → tự gây nghẽn). Control plane nên trả giá trị theo **từng đường** (direct vs relay).
5. **Không `insecure: true`** khi lên production: dùng cert thật (Let's Encrypt qua `meetflowai.site`) hoặc
   `certificate_public_key_sha256` (pin) — hiện server dùng cert self-signed và client `InsecureSkipVerify`
   (`CHINA_TRANSPORT_ROADMAP.md` §Open questions 3).
6. Overlay IP / DNS phải **trùng** với những gì shell khai trong `openTun` (một nguồn: `inbounds[0]`).

## 6. Lộ trình (mỗi phase ship & test độc lập được)

| Phase | Nội dung | "Done" kiểm chứng được | Đảo ngược |
|---|---|---|---|
| **P0 — Quyết định & đo** (không ship code app) | Chốt license (§7.1); viết `scripts/build-libbox.sh` (Android + iOS, ghim tag `v1.14.0` + Go 1.25.5); build thử cả 2 artifact | Script chạy lại được trên máy sạch; **ghi lại số đo thật**: dung lượng `libbox.aar`, `Libbox.xcframework`, số ABI, thời gian build; quyết định commit hay tải trong CI | Xoá script |
| **P1 — Android core chạy song song** | `SingBoxVpnService` + `SingBoxPlatformInterface`; config **một** outbound `hysteria2` trực tiếp (chưa có nhóm); cờ `Config.TRANSPORT_ENGINE`; `HysteriaVpnService` giữ nguyên | Trên máy VN: bật `TRANSPORT_ENGINE=singbox` → có mạng, có traffic; tắt cờ → đường hysteria cũ vẫn chạy y như trước; **pre-flight gate**: khi cấu hình trỏ vào IP không tồn tại thì máy **không** mất mạng (kiểm tra bằng cách browse khi state = CONNECTING) | Đổi cờ |
| **P2 — Control plane sinh config** | `singbox-config.js` + endpoint + credential server-side + `node --test` | `npm test` xanh (test mới); app lấy config từ server (không còn credential trong APK); sửa node trong `nodes.db` → app đổi đường sau 1 lần refresh, **không** phát hành app | Trả lại config hardcode |
| **P3 — iOS core chạy** | `ExtensionPlatformInterface` + `PacketTunnelProvider` mới; `project.yml` + xcframework; build **cả** iOS & macOS scheme | Trên iPad/iPhone thật: tunnel lên, có mạng; `StatusMessage.Memory` < 50 MB sau **30 phút** tải Safari; không có jetsam kill trong log; macOS scheme vẫn BUILD SUCCEEDED | Bỏ dependency, revert provider |
| **P4 — Health thật & tự hồi** | `CommandClient` status/outbounds stream vào `DiagnosticsLog`/UI; watchdog hạ tunnel khi mọi outbound chết; `resetNetwork()` khi đổi mạng; chỉnh `interval/tolerance` | Test có kịch bản: (a) WiFi → 4G giữa lúc đang tải → tunnel tự hồi < 5s; (b) chặn 1 đường (config trỏ sai 1 outbound) → tự đổi đường, người dùng không thấy "connected nhưng không mạng"; (c) rút mạng hoàn toàn → state về `CONNECTING`, **không** treo `CONNECTED` | Cờ tắt watchdog |
| **P5 — Đường mới phía server** | Thêm VLESS+WS+TLS sau Funnel + Cloudflare tunnel, VLESS+Reality trên IP node; cert thật/pin; control plane phát config nhiều outbound + `urltest` | Từ đường TQ: (a) `node-*` chết (mô phỏng bằng IP sai) → tự chuyển sang `funnel-ws` trong < 1 chu kỳ interval; (b) đo tốc độ + độ ổn định từng đường, ghi vào `docs/` | Server: tắt listener mới |
| **P6 — Bỏ code cũ** | Xoá `WSRelayBridge.kt`, `WGRelay.kt`, `RelayProtectService.kt`, `WGRelayClient.swift`, `hysteria.aar`, `mobile.Mobile`, credential trong `Config.kt`; cập nhật `ARCHITECTURE.md` §12 + `DEVELOPMENT.md` §5c | 1 chu kỳ phát hành (web APK + Play AAB) không hồi quy: crash-free rate & tỉ lệ kết nối thành công **không giảm**; `rg` cho `mobile.Mobile` và `WSRelayBridge` trong `android/` không còn kết quả nào | Rollback = phát hành lại bản trước (relay server vẫn giữ tới khi hết client cũ) |
| **P7 (tuỳ chọn)** | macOS dùng cùng engine; chuyển WireGuard sang outbound `wireguard`, xoá WireGuardKit + preBuild `make` | macOS E2E như `docs/ARCHITECTURE.md` §B5 | Bỏ khỏi scope |

**Thứ tự bắt buộc:** P0 → (P1 ∥ P2) → P3 → P4 → P5 → P6. Không làm P6 trước P5 (nếu không sẽ mất đường duy nhất
chạy được ở TQ).

## 7. Rủi ro & câu hỏi mở

### 7.1 License GPL-3.0 — **blocker lớn nhất, phải quyết trước khi viết dòng code nào**

**Sự thật đã kiểm chứng**

| Điều | Nội dung | Nguồn |
|---|---|---|
| License của sing-box | **GPL-3.0-or-later** + một điều khoản cộng thêm: *"In addition, no derivative work may use the name or imply association with this application without prior consent."* | [LICENSE @ testing](https://raw.githubusercontent.com/SagerNet/sing-box/testing/LICENSE) |
| License của SFA/SFI (app tham chiếu) | Cũng GPL-3.0-or-later + cùng điều khoản; README còn ghi rõ fork không được đăng lên store dưới tên gốc | [SFA README](https://raw.githubusercontent.com/SagerNet/sing-box-for-android/dev/README.md) |
| Cảnh báo về metadata | GitHub API báo license của repo sing-box là `Other/NOASSERTION`, và **báo sai** license của `MetaCubeX/mihomo` là MIT trong khi `LICENSE` thực tế là **GPL-3.0** ⇒ luôn đọc file LICENSE, đừng tin badge | [repo API](https://api.github.com/repos/SagerNet/sing-box), [mihomo LICENSE](https://raw.githubusercontent.com/MetaCubeX/mihomo/main/LICENSE) |

**(a) Apple App Store — có xung đột, nói thẳng là có**

- GPLv3 §10: *"You may not impose any further restrictions on the exercise of the rights granted or affirmed under this
  License."* ([GPLv3 text](https://www.gnu.org/licenses/gpl-3.0.txt)). Điều khoản App Store mà người dùng phải chấp nhận
  (DRM/FairPlay, giới hạn số thiết bị, cấm cài bản sửa đổi, Apple là bên phân phối duy nhất) là **những hạn chế bổ sung**
  ⇒ mâu thuẫn. GPLv3 §6 còn đòi "Installation Information" cho *User Product* — điều iOS/App Store không thể đáp ứng.
- Tiền lệ thật: **VLC bị rút khỏi App Store tháng 1/2011 vì xung đột GPL**
  ([The Next Web](https://thenextweb.com/news/apple-officially-pulls-vlc-from-the-app-store),
  [9to5Mac](https://9to5mac.com/2011/01/07/vlc-for-ios-removed-from-the-app-store/),
  [ZDNet: "No GPL Apps for Apple's App Store"](https://www.zdnet.com/article/no-gpl-apps-for-apples-app-store/)).
  VLC chỉ **quay lại App Store tháng 7/2013 sau khi được cấp phép lại dưới MPLv2** — tức là **đổi license**, không phải
  "Apple chấp nhận GPL" ([VideoLAN press: VLC for iOS 2.0](https://www.videolan.org/press/ios2out.html),
  [Ars Technica](https://arstechnica.com/gadgets/2013/07/vlc-media-player-returns-to-the-ios-app-store-after-30-month-hiatus/)).
- Vì sao SFI của tác giả sing-box vẫn ở App Store được: **tác giả giữ bản quyền** nên tự miễn trừ cho mình
  ([App Store listing SFI](https://apps.apple.com/app/sing-box-vt/id6673731168)). Điều đó **không** chuyển quyền đó cho
  FlowVPN. (Ghi chú thêm: chính docs sing-box ghi app đang tạm không cập nhật được trên App Store vì lý do **review**
  — không liên quan license nhưng cho thấy rủi ro review là thật:
  [sing-box for Apple platforms](https://sing-box.sagernet.org/clients/apple/).)
- ⇒ **Kết luận:** đóng gói `Libbox.xcframework` vào `PrivateVPNPacketTunnel` và phát hành lên App Store là **không được
  phép theo GPL-3.0** nếu không có (i) sự cho phép/dual-license của chủ sở hữu bản quyền sing-box, hoặc (ii) chuyển app
  sang license tương thích, hoặc (iii) đổi engine. **Không có chương trình dual-license/commercial-exception nào được
  công bố công khai** mà tôi tìm thấy (docs chỉ có Sponsors) ⇒ nếu chọn hướng (i) thì phải **liên hệ tác giả**, coi như
  **chưa xác minh được là sẽ xin được**.

**(b) Google Play — không có rào cản của store, nhưng có hậu quả thương mại**

- Google Play **không** cấm GPL (không có điều khoản tương đương vụ App Store ở trên).
- Nhưng GPLv3 §6 buộc: ai nhận binary phải được cấp **Corresponding Source** của **toàn bộ** tác phẩm dẫn xuất.
  `libbox.aar` được **liên kết tĩnh** vào app ⇒ app FlowVPN (branch `main`/`web` **và** branch `store` — xem
  `docs/DEVELOPMENT.md` §5c) trở thành tác phẩm dẫn xuất ⇒ **toàn bộ source client phải phát hành dưới GPL-3.0**
  cho người nhận app, kể cả bản bán qua web.
- Hệ quả trực tiếp: đối thủ được phép fork và bán lại (kể cả bán APK như mình đang bán), và điều khoản cộng thêm của
  sing-box cấm dùng tên sing-box để gây liên tưởng (ta cũng không định làm vậy).
- Bán phần mềm GPL là **hợp pháp** (GPL không cấm thu tiền); vấn đề ở đây là **mô hình "closed-source client" chấm hết**.

**Có thể làm gì (các phương án — owner chọn, §8)**

| # | Phương án | Ưu | Nhược | Đánh giá |
|---|---|---|---|---|
| 1 | **Chấp nhận GPL**: mở source client, ship sing-box cả 2 store | Giải pháp kỹ thuật tốt nhất, nhanh nhất, dùng đúng core đã được kiểm chứng | Mất lợi thế source kín; đối thủ fork được; **rủi ro App Store vẫn còn** (GPL vs App Store) | Chỉ đủ nếu chấp nhận mở source **và** chấp nhận rủi ro bị Apple gỡ |
| 2 | **Xin exception/dual-license từ tác giả sing-box** | Giữ được app kín; dùng core tốt nhất | **Chưa xác minh** là tác giả có bán license; chi phí/điều kiện không rõ; thời gian không kiểm soát được | Rủi ro cao về tiến độ, cần hỏi sớm (P0) |
| 3 | **Đổi engine sang license permissive**: Xray-core (MPL-2.0) + hysteria core (MIT) | MPL-2.0 chỉ copyleft theo **file** ⇒ ít ràng buộc toàn app hơn GPL; hysteria (đã ship, MIT) lo phần QUIC | Không có `urltest/selector` đóng gói sẵn như sing-box (Xray có mô hình balancer/observatory khác — **cần kiểm tra**, Phụ lục B #12) ⇒ phải tự viết lại một phần logic chọn đường, đúng thứ đang muốn bỏ; Xray trên iOS cũng có vấn đề memory đã ghi nhận ([Xray-core#4422](https://github.com/XTLS/Xray-core/issues/4422)); libXray (MIT) chỉ là wrapper | Feasible nhưng **không** giải quyết trọn vẹn mục tiêu §1.1 |
| 4 | **Chỉ dùng lớp tun2socks permissive** (MIT): Tun2SocksKit / hev-socks5-tunnel / tun2socks | Giấy phép sạch | Chỉ là TUN→SOCKS, vẫn phải có core (Xray/hysteria) + tự làm failover ⇒ **không** giảm được phần tự viết | Không đủ một mình |
| 5 | **Core chạy ngoài tiến trình (out-of-process)** để tránh "dẫn xuất" | Về lý thuyết tách được GPL | **iOS: bất khả thi** — extension phải sở hữu fd TUN, iOS không cho spawn tiến trình phụ tuỳ ý; Android cũng bị hạn chế exec + vẫn là "giao tiếp chặt" nên **ranh giới pháp lý không chắc** | Không dùng được cho mục tiêu iOS |
| 6 | **Core ở server-side** | Không đụng license | Không giải quyết được gì: chặn nằm ở **chặng cuối** từ máy khách tới node | Loại |
| 7 | **Giữ nguyên Hysteria (MIT) + tự viết failover** | License sạch, đã chạy được | Đúng thứ đã gây ra sự cố 13/09 (Tầng 1 phải vá liên tục) | Chỉ là "không làm gì" |

> ⚠️ Tôi **không phải luật sư**. Kết luận trên là đọc trực tiếp text GPL-3.0 + tiền lệ công khai; trước khi phát hành
> bất kỳ bản nào có libbox lên App Store cần **ý kiến luật sư** (đặc biệt nếu chọn phương án 1).

### 7.2 Kích thước binary, cold start, build/CI

| Hạng mục | Số liệu / đánh giá | Nguồn |
|---|---|---|
| APK hiện tại | `hysteria.aar` = **29.7 MB** (đang commit trong git) cho 1 core | `ls -l android/app/libs/hysteria.aar` |
| APK của SFA (cùng core, cùng gomobile) | **121.11 MB** universal (4 ABI) và **34.87 MB** cho `arm64-v8a` ⇒ phần native của libbox cỡ **~25–35 MB/ABI** | [assets v1.14.0](https://github.com/SagerNet/sing-box/releases/tag/v1.14.0) |
| ⇒ Ảnh hưởng lên APK FlowVPN | Nếu **không** ABI split, APK sẽ tăng theo số ABI (ước tính **+30…+100 MB**); SFA phải bật `splits.abi` + `isUniversalApk` để sống chung với chuyện này | [SFA build.gradle.kts](https://raw.githubusercontent.com/SagerNet/sing-box-for-android/dev/app/build.gradle.kts) |
| iOS | `Libbox.xcframework` **chưa đo** (Phụ lục B). Tham chiếu gián tiếp: app SFI cho `iphoneos-arm64` nặng **28.07 MB** | asset `SFI-1.14.0-iphoneos-arm64.deb` |
| Cold start | Go runtime init + `Setup()` + `startOrReloadService` + QUIC/WS handshake. **Chưa đo.** Rủi ro UX: nút Connect "đứng" lâu hơn hiện tại ở lần đầu | — |
| Build/CI | Build `libbox.aar` cần **Go 1.25.5 + gomobile + JDK 17 + Android NDK**; build `Libbox.xcframework` cần **Go + gomobile + Xcode**, cross-compile nhiều slice (chậm) | `cmd/internal/build_libbox/main.go` |
| `ci_scripts/` + `docs/XCODE_CLOUD.md` | `ci_post_clone.sh` hiện cài Go **bằng brew** (không ghim version) cho `wireguard-go`. Nếu bắt Xcode Cloud build luôn `Libbox.xcframework` thì phải: ghim Go 1.25.5, cài `gomobile`, chạy bind cho `ios,iossimulator` — **thời gian build CI tăng mạnh và dễ vỡ**. **Đề xuất: KHÔNG build trong CI**; build ở máy/CI riêng rồi **commit artifact** (giống `hysteria.aar`) hoặc tải trong `ci_post_clone.sh` kèm **checksum** | `ci_scripts/ci_post_clone.sh`, `docs/XCODE_CLOUD.md` |
| Repo nằm trên volume **exFAT** | Thêm binary hàng chục–trăm MB làm nặng repo và làm git trên exFAT thêm bất ổn (đã có gotcha riêng trong `DEVELOPMENT.md` §5c) ⇒ cần quyết định commit vs tải (§8) | `docs/DEVELOPMENT.md` §5c |

### 7.3 Bộ nhớ iOS (50 MB) — rủi ro kỹ thuật thật, không phải lý thuyết

- Giới hạn **50 MiB** cho packet tunnel provider, chữ ký crash `EXC_RESOURCE … ActiveHard 50 MB`, bị `jetsam` kill:
  §3.4 (nguồn ở đó).
- Đòn giảm đã biết: **tag `with_low_memory`** cho target không phải macOS (script chính thức dùng), **bỏ** các tag nặng
  (`with_gvisor`, `with_naive_outbound`, `with_clash_api`, `with_tailscale`), **không nạp rule-set geo**,
  `cache_capacity` nhỏ, hạn chế số connection (Safari giữ rất nhiều connection — chính là ca gây chết trong
  Tun2SocksKit#33 và libXray#102), và theo dõi `StatusMessage.Memory` để tự ngắt trước.
- Ẩn số lớn: extension iOS hiện **đã** chạy WireGuard (Go) trong cùng tiến trình (`WireGuardKit` +
  `wireguard-go` build ở preBuild). Nếu P3 chạy **song song** 2 core Go trong extension, memory/size sẽ cộng dồn
  ⇒ **khuyến nghị**: ở P3 **không** link WireGuardKit vào extension iOS nữa (chỉ đường sing-box), hoặc coi đây là
  điều kiện chặn của P3. Đây là lý do kỹ thuật để P3 và P7 gắn với nhau.
- Nghiệm thu bắt buộc: **30 phút tải Safari liên tục, mở/đóng nhiều tab**, đọc log jetsam + `StatusMessage.Memory`;
  không có ca kill nào. Đây là "done" của P3.

### 7.4 Reality/uTLS có thực sự giúp ở TQ? — nói thật là **chưa đủ bằng chứng**

- **Sự cố 13/09 là chặn theo IP**, không phải chặn theo dấu vân tay giao thức. Với chặn IP thì **không giao thức nào
  cứu được** (kể cả Reality): cái cứu được là đi trên **hạ tầng dùng chung** (Funnel/Cloudflare) và **tự chuyển đường**.
  Đây là điểm quan trọng nhất để không đặt cược sai vào "đổi giao thức sẽ hết bị chặn".
- **Chính docs của sing-box phản đối mạnh uTLS**: mục `utls` ghi *"Not Recommended — uTLS has had repeated
  fingerprinting vulnerabilities discovered by researchers … making it unsuitable for censorship circumvention.
  For TLS fingerprint resistance, use NaiveProxy instead."*
  ([TLS shared — utls](https://sing-box.sagernet.org/configuration/shared/tls/)). ⇒ **Không** nên quảng cáo "uTLS chống
  GFW"; nếu bật, bật như một **thử nghiệm có đo**, và **tắt mặc định** (`utls.enabled: false` trong ví dụ §5.1).
- **Reality**: không tìm được đánh giá độc lập, có phương pháp, về hiệu quả trước GFW **ở thời điểm hiện tại** ⇒ coi là
  *giả thuyết cần đo*, không phải sự thật. Reality cũng cần một SNI "mượn" hợp lý và keypair riêng ở server.
- **Hysteria2** (đang chạy) có lợi thế thật đã đo được: QUIC/UDP + obfs salamander + Brutal CC — nhanh khi UDP không bị
  chặn; nhưng đúng là **node2 từng bị chặn UDP ở mức IP** ⇒ cần TCP/WS làm đường song song
  (`docs/CHINA_TRANSPORT_ROADMAP.md` §"Giới hạn đã biết").
- **Kết luận trung thực:** giữ hysteria2 (UDP) **và** thêm VLESS+WS+TLS (TCP 443 qua hạ tầng dùng chung) làm 2 họ đường
  **đo song song** trong `urltest`; Reality là outbound **thứ ba, đo rồi mới bật mặc định** cho người dùng TQ.
  Tiêu chí bật: thắng theo số đo từ đường TQ thật (tỉ lệ kết nối + tốc độ + độ ổn định 24h), không theo cảm tính.

### 7.5 Rủi ro vận hành khác

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| iOS: lấy fd qua KVC private `packetFlow.value(forKeyPath: "socket.fileDescriptor")` vỡ ở iOS mới | Cao | Test trên iOS mới nhất mỗi bản; có fallback `LibboxGetTunnelFileDescriptor()`; theo dõi upstream SFI |
| Socket của core tự chui vào tunnel (loop) trên iOS | Trung | Test riêng ở P3 ("handshake timeout khi tunnel vừa lên" là dấu hiệu) |
| Config do server sinh sai → tất cả client chết cùng lúc | Cao | `Libbox.checkConfig` trước khi start + `node --test` + version/expiry + rollout theo % |
| Debug khó hơn: core là "hộp đen" Go | Trung | Bật `log.level: debug` theo yêu cầu, đẩy log core vào `DiagnosticsLog`/file log sẵn có; giữ đường legacy để so sánh |
| Phụ thuộc 1 upstream (SagerNet) | Trung | Ghim tag `v1.14.0`, giữ patch riêng tối thiểu (**không** fork core), ghi lại script build |
| Funnel/Cloudflare cũng bị chặn (kịch bản xấu hơn 13/09) | Trung | Nhiều họ đường + nhiều nhà cung cấp; giữ đường "IP node trực tiếp" làm outbound riêng |
| `docs/XCODE_CLOUD.md` đã ghi CI từng vỡ vì thiếu Go/xcodegen | Trung | Không thêm bước build core vào Xcode Cloud (§7.2) |

## 8. Việc cần owner quyết

| # | Quyết định | Vì sao chỉ owner quyết | Ai bị chặn |
|---|---|---|---|
| 1 | **License**: (a) mở source client để dùng GPL; (b) liên hệ tác giả sing-box xin exception/dual-license; (c) đổi sang engine permissive (Xray MPL-2.0 + hysteria MIT); (d) dừng kế hoạch | Là quyết định pháp lý + mô hình kinh doanh, ảnh hưởng cả App Store lẫn Play | **Toàn bộ P1–P7** |
| 2 | **Commit binary vào git hay tải trong CI** (`libbox.aar`, `Libbox.xcframework`) — repo nằm trên exFAT, `hysteria.aar` 29.7 MB đang được commit | Ảnh hưởng repo, CI, thời gian clone, chi phí | P0 (cách đóng gói artifact) |
| 3 | **ABI nào** cho Android (bỏ `x86`/`x86_64`? giữ `armeabi-v7a` cho Fire OS 6 ở flavor `legacy`?) | Ảnh hưởng dung lượng bản bán qua web (tải từ TQ rất chậm) | P1 |
| 4 | **Endpoint config**: thêm field `singbox_config` vào `/v1/peers/register`, hay endpoint mới `/v1/client/config`? TTL/rotation bao lâu? | Thay đổi API công khai đã có client cũ dùng | P2 |
| 5 | **Có giữ WireGuard cho khách ngoài TQ** trong cùng engine (thêm `with_wireguard`) hay bỏ hẳn? | Ảnh hưởng size + phạm vi test | P1/P7 |
| 6 | **Cho phép thay đổi production phía server** (thêm VLESS+WS+TLS sau Funnel/Cloudflare, VLESS+Reality trên node, cert thật/pin) — theo AGENTS.md worker **không** được đụng server | Việc production, cần owner thực hiện/duyệt | P5 (và do đó P6) |
| 7 | **macOS** có vào scope đợt này không (dùng chung `PacketTunnelProvider.swift`) | Ảnh hưởng nhân lực + rủi ro CI macOS | P3/P7 |
| 8 | **Rotate credential hysteria** đang nằm trong APK đã phát hành (`Config.kt`) | Việc vận hành server | P2 |

## 9. Phụ lục A — Nguồn đã kiểm chứng (13/09/2026)

### sing-box / libbox

- Releases & asset: <https://github.com/SagerNet/sing-box/releases/tag/v1.14.0> (v1.14.0, 2026-08-31; SFA apk 34.87 MB/ABI, universal 121.11 MB; SFI deb 28.07 MB)
- Script build libbox (nguồn sự thật cho lệnh gomobile, tag, `libbox-legacy.aar`, `Libbox.xcframework`, `with_low_memory`, yêu cầu JDK 17): <https://raw.githubusercontent.com/SagerNet/sing-box/testing/cmd/internal/build_libbox/main.go>
- `go.mod` v1.14.0 (`go 1.25.5`): <https://raw.githubusercontent.com/SagerNet/sing-box/v1.14.0/go.mod>
- LICENSE (GPL-3.0-or-later + điều khoản tên): <https://raw.githubusercontent.com/SagerNet/sing-box/testing/LICENSE>
- Build tags & linker flags: <https://sing-box.sagernet.org/installation/build-from-source/>
- JSON Schema chính thức (dùng để validate ví dụ §5.1): <https://raw.githubusercontent.com/SagerNet/sing-box/v1.14.0/docs/schema.json>
- API: `PlatformInterface` <https://raw.githubusercontent.com/SagerNet/sing-box/testing/experimental/libbox/platform.go> ·
  `CommandServer` <https://raw.githubusercontent.com/SagerNet/sing-box/testing/experimental/libbox/command_server.go> ·
  `CommandClient` (URLTest/SelectOutbound/streams) <https://raw.githubusercontent.com/SagerNet/sing-box/testing/experimental/libbox/command_client.go> ·
  `StatusMessage`/`OutboundGroup` <https://raw.githubusercontent.com/SagerNet/sing-box/testing/experimental/libbox/command_types.go>
- Config docs: [urltest](https://sing-box.sagernet.org/configuration/outbound/urltest/) ·
  [selector](https://sing-box.sagernet.org/configuration/outbound/selector/) ·
  [VLESS](https://sing-box.sagernet.org/configuration/outbound/vless/) ·
  [Hysteria2](https://sing-box.sagernet.org/configuration/outbound/hysteria2/) ·
  [TLS (utls/reality/engine)](https://sing-box.sagernet.org/configuration/shared/tls/) ·
  [Tun inbound](https://sing-box.sagernet.org/configuration/inbound/tun/) ·
  [DNS](https://sing-box.sagernet.org/configuration/dns/) · [DNS Server (typed)](https://sing-box.sagernet.org/configuration/dns/server/) ·
  [Route](https://sing-box.sagernet.org/configuration/route/)
- App tham chiếu: [SFA](https://github.com/SagerNet/sing-box-for-android) (`app/build.gradle.kts`, `bg/BoxService.kt`, `bg/VPNService.kt`, `bg/PlatformInterfaceWrapper.kt`) ·
  [SFI](https://github.com/SagerNet/sing-box-for-apple) (`Library/Network/ExtensionPlatformInterface.swift`, `Extension/PacketTunnelProvider.swift`) ·
  [SFI trên App Store](https://apps.apple.com/app/sing-box-vt/id6673731168) · [sing-box for Apple platforms](https://sing-box.sagernet.org/clients/apple/)
- Maven Central: không có artifact `libbox`/`sing-box`: <https://search.maven.org/solrsearch/select?q=libbox&rows=20&wt=json>
- gomobile fork (BSD-3-Clause): <https://github.com/SagerNet/gomobile>
- xcodegen — cú pháp dependency `framework:`: <https://raw.githubusercontent.com/yonaskolb/XcodeGen/master/Docs/ProjectSpec.md>

### License / pháp lý

- GPLv3 (text gốc): <https://www.gnu.org/licenses/gpl-3.0.txt> (§10 "no further restrictions", §6 Installation Information)
- VLC bị rút khỏi App Store 2011: [The Next Web](https://thenextweb.com/news/apple-officially-pulls-vlc-from-the-app-store) ·
  [9to5Mac](https://9to5mac.com/2011/01/07/vlc-for-ios-removed-from-the-app-store/) ·
  [ZDNet — No GPL Apps for Apple's App Store](https://www.zdnet.com/article/no-gpl-apps-for-apples-app-store/)
- VLC quay lại **sau khi đổi sang MPLv2**: [VideoLAN press](https://www.videolan.org/press/ios2out.html) ·
  [Ars Technica](https://arstechnica.com/gadgets/2013/07/vlc-media-player-returns-to-the-ios-app-store-after-30-month-hiatus/)
- License các engine thay thế (đã đọc file LICENSE): Xray-core **MPL-2.0** · v2ray-core **MIT** ·
  hysteria **MIT** (repo hiện redirect sang `HyNetworks/hysteria`) · mihomo **GPL-3.0** (dù GitHub API báo MIT)

### Giới hạn bộ nhớ iOS

- Bảng giới hạn (packet tunnel 50 MiB…) kèm dẫn nguồn Apple forum: <https://github.com/XTLS/Xray-core/issues/4422>
- Crash log thật `ActiveHard 50 MB`: <https://github.com/EbrahimTahernejad/Tun2SocksKit/issues/33> · <https://github.com/XTLS/libXray/issues/102>
- Go runtime & giới hạn memory của NetworkExtension (ca cũ): <https://github.com/golang/go/issues/21489>
- (Thread gốc trên Apple forum `developer.apple.com/forums/thread/73148` bị chặn bot khi truy cập ⇒ không đọc trực tiếp
  được; số liệu lấy từ các issue dẫn lại — xem Phụ lục B)

### Repo này (đã đọc code)

`android/app/src/main/java/com/privatevpn/app/vpn/HysteriaVpnService.kt` (807 dòng; `oneConnectPass`, `wsRelayAttempt`,
`udpAttempt`, `tcpRelayAttempt`, `ensureTun`, `startProbeLoop`) · `…/WSRelayBridge.kt` · `…/WGRelay.kt` ·
`…/RelayProtectService.kt` · `…/VPNManager.kt` (`nodeHosts`, `startHysteriaService`) ·
`android/app/src/main/java/com/privatevpn/app/Config.kt` · `android/app/build.gradle.kts`
(`implementation(files("libs/hysteria.aar"))`) · `iOS/PrivateVPNPacketTunnel/PacketTunnelProvider.swift` ·
`iOS/PrivateVPN/Services/WireGuardConfig.swift` (`relayHost`, `nodeId`) · `iOS/PrivateVPN/VPNManager.swift` ·
`project.yml` (293 dòng; `packages: WireGuardKit path: Vendor/WireGuardKit`; 2 target tunnel dùng chung 1 file provider) ·
`control-plane/src/index.js` (`/v1/nodes`, `/v1/nodes/:id/report`, `/v1/peers/register`, `buildClientConfig`) ·
`control-plane/src/node-store.js` (`exit_nodes`) · `control-plane/package.json` · `ci_scripts/ci_post_clone.sh` ·
`docs/HANDOVER_2026-09-13_china_ip_block_and_funnel.md` · `docs/ARCHITECTURE.md` §12 · `docs/DEVELOPMENT.md` §3 & §5c ·
`docs/CHINA_TRANSPORT_ROADMAP.md`

**Khác biệt giữa brief và code (theo luật AGENTS.md §2 — theo code):** brief nói control plane "no external HTTP
framework; node built-in http", nhưng `control-plane/package.json` khai `express` + `cors` và `src/index.js` dùng
`app.get/app.post` của Express (chỉ `node:http`/`node:https` được dùng để tạo server/`listen`). Kế hoạch này viết theo
**code thật** (thêm route bằng Express như các route hiện có).

## 10. Phụ lục B — Điều **CHƯA** xác minh (phải kiểm tra trước/trong P0–P1)

| # | Điều chưa xác minh | Cách kiểm tra |
|---|---|---|
| 1 | Dung lượng thật của `libbox.aar` (4 ABI) và `Libbox.xcframework` (`ios,iossimulator`) | Build ở P0 rồi `ls -l` / `du -sh`; ghi số vào tài liệu này |
| 2 | Cold start thật của core trên Android/iOS (từ `startOrReloadService` tới có traffic) | Đo bằng mốc thời gian trong `DiagnosticsLog` |
| 3 | Bộ nhớ thật của libbox trong extension iOS (có/không đạt 50 MB dưới tải Safari) | P3: 30 phút soak + `StatusMessage.Memory` + log jetsam |
| 4 | `with_low_memory` **thực sự làm gì** (không tìm thấy file/tài liệu nào mô tả trong tree v1.14.0) | Đọc commit/issue upstream hoặc so sánh số đo memory khi build có/không tag |
| 5 | Trang Apple forum `thread/73148` (nguồn gốc con số 50 MB) không truy cập được do chặn bot | Mở bằng trình duyệt thật; hoặc dùng số liệu crash log (đã có 2 nguồn độc lập) |
| 6 | Có hay không chương trình dual-license/commercial exception của sing-box | Hỏi trực tiếp tác giả (kênh liên hệ ghi trong LICENSE) — việc của owner |
| 7 | `useLegacyPackaging = true` có cần cho app này không | Chỉ thêm nếu gặp `UnsatisfiedLinkError` khi load `libbox` |
| 8 | `clash_api` / `with_gvisor` có bắt buộc cho `CommandServer`/status stream không (nếu bắt buộc thì không cắt được tag để giảm size/memory) | Build bản rút gọn ở P0 rồi chạy thử `CommandServer` + status/URLTest trên device |
| 9 | Thứ tự TUN-up so với outbound-ready trong libbox (ảnh hưởng trực tiếp tính chất "không mất mạng") | P1: test pre-flight gate + rút mạng giữa chừng |
| 10 | Có cần `Libbox.setup()`/`SetupOptions` trước khi start service trong app thật, và với tham số nào | Đọc `experimental/libbox/setup.go` + code SFA tại thời điểm code P1 |
| 11 | Funnel có expose được path **WS** trên 443 cho VLESS hay phải thêm entry/port khác (HANDOVER ghi Funnel dùng `:8443` cho `wsrelay-hy`, `:10000` cho `wsrelay` WG) | Đo trực tiếp ở P5 (việc ops) |
| 12 | Nếu phải bỏ sing-box thì engine thay thế (Xray-core MPL-2.0 / mihomo GPL-3.0 / hysteria MIT) đáp ứng được tới đâu: có VLESS/Reality không, có cơ chế URL-test/failover tương đương không, memory trên iOS ra sao | Đọc docs của từng engine + thử nghiệm nhỏ ở P0 (trước khi chốt license) — **tôi chưa xác minh** phần này |
| 13 | Tên/đường dẫn artifact SFI/SFA có đổi ở phiên bản mới (tài liệu này ghim v1.14.0) | Kiểm lại release notes khi bắt đầu P0 |
