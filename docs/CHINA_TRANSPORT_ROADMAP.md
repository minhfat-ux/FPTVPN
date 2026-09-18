# China Transport Roadmap (Hysteria2 Integration)

> Status: ✅ **SHIPPED** — hysteria2 là transport chính cho mọi bản Android; Web APK & AAB 1.2.4 đã phát hành 2026-09-12
> Date: 2026-09-09 (cập nhật 2026-09-12)

## KIẾN TRÚC CUỐI CÙNG (2026-09-12)

**Server (mỗi node):**
- hysteria2 server: **UDP 8443, 28443, 54443** (`/etc/hysteria-server-<port>.yaml`), auth `<HY_AUTH_PASSWORD>`,
  obfs **salamander** `<HY_OBFS_PASSWORD>`, cert self-signed CN=meetflowai.site
- TCP relay (Go, `tools/node-setup/relay.go`): **TCP 8443 → UDP 8443** và **TCP 9445 → UDP 8443**
  (framing 2-byte big-endian length; dùng cho mạng chặn UDP như GFW/corporate NAT)
- WireGuard legacy vẫn còn: TCP 9444 → UDP 443 (wgrelay), chỉ giữ cho client cũ
- Chạy bằng **systemd** (`hysteria@<port>`, `hyrelay@<port>`) — xem `tools/node-setup/provision-node.sh`

**Client Android (`HysteriaVpnService` + `mobile.Mobile` từ AAR):**
1. Tạo socket transport **trong Java** (TCP relay hoặc UDP) → `protect()` → chuyển fd sang Go
   (thiếu bước protect là bug "connected but no internet": packet tự lọt vào tunnel chưa kết nối)
2. `Mobile.connect(...)` **trước khi** `establish()` VpnService ⇒ mọi transport fail thì mạng máy **không bị mất**
3. Chỉ sau khi connect thành công mới `establish()` + `Mobile.serve(fd, ...)` (TUN fd của VpnService)
4. **Brutal CC**: client khai báo băng thông (`upKbps`/`downKbps`) → server pace theo, chịu loss tốt hơn
5. **Foreground service** (`specialUse`) + **retry vô hạn backoff** + **nhớ transport đã chạy**
6. Thứ tự thử: transport đã nhớ → TCP relay 8443/9445 → UDP 8443/28443/54443

**AAR được build tái lập:** `tools/hysteria-android/build.sh` (clone hysteria `app/v2.12.2` → patch TUN fd →
wrapper `mobile.go` → `gomobile bind` → `android/app/libs/hysteria.aar`).

**Giới hạn đã biết:** node2 (103.6.234.233, AS152992) bị **GFW chặn UDP ở mức IP** ⇒ bắt buộc đi TCP relay;
hướng dẫn chọn dải IP mới ở `docs/EXIT_NODE_IP_GUIDE.md` (ưu tiên AS135905/VNPT như node1).

## Problem (validated, 2026-09-08/09)

Testing from China (hotel Wi-Fi + mobile data) proved:

1. **GFW blocks plain WireGuard UDP** to our VN exit nodes — both iOS and Android
   show "Connected" (tunnel interface up) but no traffic, because the server's
   handshake responses never arrive (inbound UDP dropped on the China path).
2. **TCP to the same servers passes** (verified: 0.09–0.13 s connects through
   the hotel/GFW path). This is exactly why Tailscale (DERP relay over TCP 443)
   works in China while raw WG does not.
3. **WG-over-TCP relay works but is slow** — proved on Android:
   - node1 runs a UDP<->TCP relay daemon (wgrelay.js, TCP 9444 <-> WG UDP 443).
   - The Android app (WGRelay.kt, Config.USE_RELAY) wraps WG in the relay.
   - Handshake + traffic flow verified server-side (peer transfer counters grow).
   - Speed is poor (~11 KB/s with cubic, still low after BBR) — TCP relays over
     lossy China<->VN paths are inherently slow.
4. **Exit-node bandwidth is the real ceiling** — node1 (VNPT) raw downloads
   measured ~0 B/s from multiple CDNs during testing; a fast protocol is useless
   on a starved exit node.

## Decision

Adopt **Hysteria2** as the China-mode transport: QUIC + salamander obfuscation,
evades GFW and is fast (UDP-based). FlowVPN keeps WireGuard for unrestricted
regions; Hysteria2 becomes the data plane when behind the GFW.

## Running services (server side, node1 = 103.173.155.50)

| Service | Listen | Purpose |
|---|---|---|
| Hysteria2 server (/root/hysteria.bin) | UDP :8443 | New China transport (QUIC, obfs salamander) |
| WG relay daemon (/root/wgrelay.js) | TCP :9444 | WG-over-TCP fallback (proven, slow) |
| wstunnel server | TCP :9443 | WS tunnel spare |
| WireGuard wg0 | UDP :443 | Existing WG exit (non-China users) |

Hysteria2 server config (/etc/hysteria/server.yaml): port 8443, self-signed
cert /etc/hysteria/cert.pem, obfs salamander password <HY_OBFS_PASSWORD>, auth
password in file. Start: /root/hysteria.bin server -c /etc/hysteria/server.yaml.
TODO: convert to systemd service.

## Android integration plan (in progress)

Android cannot run hysteria2 as a root CLI; must bind the Go core via gomobile
and feed it the app-owned VpnService TUN fd.

1. [x] Install gomobile (~/go/bin/gomobile)
2. [ ] Install Android NDK (sdkmanager ndk;26.1.10909125)
3. [ ] Fetch hysteria2 core (github.com/apernet/hysteria/app/v2)
4. [ ] Write a small Go wrapper exporting a Client (start/stop/state) callable
      via gomobile, taking the TUN fd + server config (server, port, obfs,
      auth, TLS-insecure for self-signed).
5. [ ] gomobile bind -> hysteria.aar (arm64, armv7, x86_64)
6. [ ] Android app:
   - App-owned VpnService (needed anyway for WG-relay socket protection).
   - Establish VpnService -> get TUN fd -> hand to hysteria2 client.
   - "China mode": select exit node -> connect via hysteria2 (server-side
     Hysteria2 runs on the exit nodes).
   - Keep GoBackend WG path for non-China mode.
7. [ ] Test on device behind GFW; measure speed.

### Key Android learning (from WG-relay work)

- protect() only works through the ACTIVE VpnService. The wireguard AAR
  (GoBackend(Context)) owns its own GoBackend$VpnService; the app can reach
  it by reflection on the static vpnService CompletableFuture and call
  protect(socket) once the tunnel is UP (verified working).
- A separate non-establishing VpnService cannot protect sockets.
- Relay responses must go back to the WireGuard source port (not hardcoded).

## iOS / macOS plan (WireGuardKit)

Both use native NetworkExtension. Integration approach:
- Embed the Hysteria2 core (gomobile bind for iOS produces an .xcframework;
  macOS likewise), or ship the hysteria2 tun client.
- PacketTunnelProvider establishes the tunnel and hands the TUN fd to the
  hysteria2 client core inside the extension.
- Add "China mode" selection identical to Android.

## Server / node rollout

- Run Hysteria2 on every exit node (node1 DONE; node2 pending IP change ticket
  — provider approved but new IP not yet visible; node2 still 103.6.234.233).
- Track node bandwidth: exit nodes need high-bandwidth providers for China
  users; node1 (VNPT) measured ~0 B/s raw during congestion — verify plan and
  consider moving exits to higher-capacity providers.

## Open questions

1. Node2 IP: provider approved change, not yet applied. Build Hysteria2 on node2
   now (old IP) or wait for the new IP?
2. Keep WG relay/wstunnel as fallback or remove once Hysteria2 ships?
3. Hysteria2 TLS: self-signed + client insecure for now; real cert (Let's
   Encrypt via the meetflowai.site domain) before release.

---

## Appendix: verified integration details (2026-09-09, code-ready)

### Repo layout (cloned at /tmp/hysteria, tag app/v2.12.2)
- Modules: root, app/v2, core/v2, extras/v2 (multi-module).
- Client core: `core/v2/client` — `NewClient(*Config) (Client, *HandshakeInfo, error)`.
  Config: ServerAddr net.Addr, Auth string, TLSConfig{InsecureSkipVerify}, QUICConfig,
  BandwidthConfig, ConnFactory, FastOpen.
- TUN server: `app/v2/internal/tun` (`tun.Server`) — imports the apernet/sing-tun fork
  (github.com/apernet/sing-tun v0.2.6-0.2025...). Serve() builds tun.Options then
  `tun.New(opts)` + `tun.NewSystem(...)` + Run.
- sing-tun fork `tun.Options` HAS `FileDescriptor int` → Android VpnService fd support.

### Patch applied (verified, 3 refs)
`app/internal/tun/server.go`: added `FileDescriptor int` to Server struct and mapped it
into the tun.Options in Serve(). Without this, Serve() always creates the tun by name
(root-only; Android apps must pass the VpnService fd).

### Wrapper design (next step — write in /tmp/hysteria/app/mobile, module app/v2 so it
can import app/v2/internal/tun)
```go
// gomobile-bindable. Start(host string, port int, auth, obfs string, fd, mtu int) error
cfg := &client.Config{
  ServerAddr: &net.UDPAddr{IP: net.ParseIP(host), Port: port},
  Auth:       auth,
  TLSConfig:  client.TLSConfig{InsecureSkipVerify: true}, // self-signed for now
}
c, info, err := client.NewClient(cfg)   // returns hyclient.Client
srv := &tun.Server{ HyClient: c, MTU: ..., Inet4Address: ..., FileDescriptor: fd, ... }
err = srv.Serve()
```
- Salamander obfs is NOT a field on client.Config: it lives in the QUIC dial layer
  (ConnFactory / quic fork). Must trace how the CLI passes obfs (look for where the
  app's client factory sets obfs before NewClient) and replicate in the wrapper.
- MTU/addresses: use hysteria defaults (1500; 100.100.100.101/30 + IPv6 /126) or the
  values FlowVPN already assigns (10.77.x overlay) — decide at bind time.
- DNS: sing-tun system stack needs a DNS server; confirm how the CLI handles it.

### gomobile bind (after wrapper compiles under GOOS=android)
```
cd /tmp/hysteria/app && gomobile bind -target=android -androidapi=26 \
  -o hysteria.aar github.com/apernet/hysteria/app/v2/mobile
```
(arm64/armv7/x86_64 auto). Put hysteria.aar under android/app/libs and add a gradle
dependency. Then app code: VpnService.Builder.establish() -> fd -> HysteriaClient.Start(...).

## Relay qua Cloudflare (đã triển khai 17–18/09/2026)

**Vì sao:** đo trên máy chủ dự án (ISP Trung Quốc, IP 120.234.32.53) cho thấy đường relay cũ
(chỉ expose qua **Tailscale Funnel**) bị giới hạn ~**1,7–2,5 MB/s** vì Funnel ingress đi qua DERP,
trong khi cùng lúc đường **Cloudflare → node-2 đạt 13,7 MB/s** (= đúng tốc độ đường truyền của khách).
Ngoài ra mọi IP node VN đều bị ISP Trung Quốc chặn (TCP 443/8443/10000/80 timeout), nên khách buộc
phải đi relay ⇒ Cloudflare là cửa vào tốt nhất (PoP HKG, ~0,1 s TTFB).

**Kiến trúc mới**
- Frontend WS chạy trên **node-2** (`/root/wsrelay.js` + module `ws` ở `/root/node_modules/ws`),
  4 unit systemd, bind `127.0.0.1`:
  `relay-cf-vn2wg` 7783→UDP 127.0.0.1:443 (WG node-2) · `relay-cf-vn2hy` 7785→UDP 127.0.0.1:8443 (hysteria node-2)
  `relay-cf-vn1wg` 7786→UDP 103.173.155.50:443 (WG node-1) · `relay-cf-vn1hy` 7787→UDP 103.173.155.50:8443 (hysteria node-1)
- Caddy node-2 (origin của Cloudflare cho `api.meetflowai.site`) route `/relay/vn*` → các cổng trên,
  có `flush_interval -1` cho WebSocket. Backup: `/etc/caddy/Caddyfile.bak-relaycf-*`.
- Dữ liệu node trong control plane đã trỏ sang Cloudflare:
  `node-1`: `wss://api.meetflowai.site/relay/vn1wg` · `/relay/vn1hy`
  `vietnam-2`: `wss://api.meetflowai.site/relay/vn2wg` · `/relay/vn2hy`
- **Funnel cũ vẫn bật** làm dự phòng (đã test vẫn trả 101).

**Rollback** (1 lệnh mỗi node, qua `PATCH /v1/admin/nodes/:id`):
- `node-1` → wg `wss://fcnvpn.tail303be3.ts.net:10000`, hy `wss://fcnvpn.tail303be3.ts.net:8443`
- `vietnam-2` → wg `wss://fcnvpn.tail303be3.ts.net/vn2`, hy `wss://fcnvpn.tail303be3.ts.net/vn2hy`

**Tinh chỉnh kèm theo (cùng ngày)**
- `/etc/sysctl.d/99-flowvpn-net.conf` trên cả 2 node: `bbr` + `fq` + buffer 16 MB + `tcp_mtu_probing=1`
  + `tcp_slow_start_after_idle=0` (node-2 trước đó là `cubic`/`pfifo_fast`/`rmem_max` 208 KB).
- Gỡ hysteria server trên cổng 28443/54443 (không ai tham chiếu) ở cả 2 node.
- Dừng + disable `flowvpn-harness.service` trên node-2 (swap 402 MB → 134 MB); bật lại:
  `systemctl enable --now flowvpn-harness`.

**Kiểm chứng**
- 4 đường `wss://api.meetflowai.site/relay/{vn1wg,vn1hy,vn2wg,vn2hy}` → **HTTP 101** qua Cloudflare (CF-RAY HKG).
- `/v1/nodes` (public) trả đúng URL Cloudflare.
- Tốc độ qua CF ≈ tốc độ đường truyền của khách (cùng thời điểm: CF 2,5 MB/s vs CF trực tiếp 2,6 MB/s;
  lúc đường truyền tốt: 13,7 MB/s) — tức CF không còn là nút thắt; DERP thì luôn kẹt ~2 MB/s.

### Sự cố 18/09/2026: node-1 hết RAM → mất hysteria/Tailscale

**Triệu chứng:** app Android treo "connecting"; Tailscale node-1 offline; Funnel chết (000); CP báo
`/v1/admin/nodes/node-1/health → reachable:false`.

**Nguyên nhân gốc (2 lớp):**
1. node-1 (961 MB RAM) **không có swap** ⇒ khi có tải lớn, kernel OOM-kill `tailscaled` (và các tiến trình
   userspace khác). MagicDNS của Tailscale là DNS của node-1 ⇒ tailscaled chết thì **DNS chết theo**
   (`/etc/resolv.conf` trỏ 100.100.100.100) và Funnel/exit node mất.
2. `hysteria` và `wgrelay` trên node-1 chạy **thủ công (không có unit systemd)** ⇒ sau khi VPS reboot,
   Android mất luôn transport hysteria (Android đặt `HYSTERIA_MODE = true`).

**Đã sửa (18/09/2026):**
- node-1: tạo `/swapfile` **2 GB** + ghi `/etc/fstab` (`vm.swappiness=10`) — chống OOM tái diễn.
- node-1: tạo `hysteria.service` (`/root/hysteria.bin server -c /etc/hysteria/server.yaml`) — đã `enable`.
- node-2: tạo `hysteria.service` (`/usr/local/bin/hysteria server -c /etc/hysteria-server.yaml`) — đã `enable`.
- node-1: `wgrelay.service` (TCP **9444**, cổng app Android dùng qua `Config.RELAY_PORT`) — đã `enable`.
- Cả 2 node: thêm `ignoreClientBandwidth: true` vào config hysteria ⇒ server **bỏ qua mức băng thông client
  tự khai** (app Android khai `HY_UP_KBPS=2000` / `HY_DOWN_KBPS=20000` ⇒ trước đây bị tự bóp còn 1,9 Mbps).
- CP: điền `ws_relay_url` cho cả 2 node (client cũ đọc field này) và bật lại node-1.

**Kiểm chứng:** client hysteria chạy tại node-1 trỏ `127.0.0.1:8443` tải được `https://api.ipify.org` ✓;
4 đường `wss://api.meetflowai.site/relay/{vn1hy,vn2hy,vn1wg,vn2wg}` → HTTP 101 ✓; Funnel `:8443` → 101 ✓;
`/v1/nodes` trả 2 node, cả hai `reachable:true`.

**Còn nợ ở phía app Android (cần build lại APK):** `Config.WS_RELAY_URL` đang hardcode
`wss://fcnvpn.tail303be3.ts.net:8443` (Funnel — nay là đường dự phòng, không phải đường chính);
`HY_UP_KBPS`/`HY_DOWN_KBPS` nên nâng lên mức thật; timeout khi thử direct UDP nên ngắn lại để không
"connecting hoài" khi mạng chặn UDP.

### Phát hành APK từ máy chủ shop (bài học 18/09/2026)

Đường mạng từ máy chủ shop (Trung Quốc) tới VPS rất không ổn định, đo được:

| Đường | Tốc độ upload |
|---|---|
| SSH công khai `103.173.155.50:22` | **~26 KB/s** (bị bóp) |
| Tailscale `100.76.147.111` | 0,05–1,3 MB/s, hay đứt giữa chừng |
| **Cloudflare (qua `api.meetflowai.site`)** | **~0,4 MB/s, ổn định nhất** |

**Cách phát hành đã dùng (chạy được):**
1. Trên node-2 chạy tạm 1 HTTP server nhận PUT (`/tmp/up-server.py`, cổng 8099, token trong path)
   và thêm route tạm `handle /apkup/* → 127.0.0.1:8099` vào Caddy của `api.meetflowai.site`
   (backup `Caddyfile.bak-apkup-*`) ⇒ upload đi qua Cloudflare.
2. **Cloudflare cắt request ở ~100 giây (HTTP 524)** ⇒ phải chia **≤ 12 MB/mảnh** rồi `cat` lại trên
   node-2 và so `sha256` với file gốc trên Mac. 24 MB/mảnh là quá lớn (524 giữa chừng).
3. Cài vào `/root/flowvpn-apk/VPNFlow-latest.apk` (giữ backup `*-backup-<ts>.apk`) — đó là file mà
   `/v1/downloads/android` phát cho khách; bản legacy là `VPNFlow-android7.apk`.
4. Cập nhật mốc phiên bản cho app tự nhắc cập nhật:
   `PATCH /v1/admin/android-version {"latest_version":"<x.y.z>"}`.
5. **Dọn route tạm `/apkup/*` + tắt server tạm** sau khi xong (đừng để lộ đường upload công khai).

Kiểm chứng sau khi phát hành: `sha256` file tải từ `https://meetflowai.site/v1/downloads/android`
phải **trùng** file build trên Mac, và `/v1/app-version?platform=android` trả đúng `latest_version`.

## TODO 19/09/2026 (chủ dự án yêu cầu, làm sau)

- **Bypass cho WeChat CHƯA xong** — cần làm tiếp (mục tiêu: WeChat không đi qua VPN / đi đúng đường nội địa để không bị chậm hoặc lỗi đăng nhập).
- **Yêu cầu tối thiểu cho mọi bản client: xem video streaming phải mượt** (băng thông duy trì liên tục, không chỉ burst ngắn) ⇒ đây là tiêu chí nghiệm thu cho phần port transport bên dưới.
- **Kiến trúc transport iOS/macOS/Windows**: hiện dùng WireGuard chồng trên TCP/WS relay ⇒ đo trên máy thật chỉ đạt **0,007–2 MB/s** và có lúc blackhole toàn bộ traffic (mất mạng). Đường ĐÚNG đã chứng minh là **hysteria2 qua Cloudflare** (app Android: **12–16 MB/s**). Việc port dùng **sing-box/libbox (XCframework)** cho Apple và bản Windows dùng cùng core — xem `docs/SINGBOX_INTEGRATION_PLAN.md`.

## Cập nhật 19/09/2026 (đêm) — số đo thật + hướng chốt

Chi tiết đầy đủ (bảng số đo, cạm bẫy đo lường, việc còn lại):
[`docs/TRANSPORT_SPEED_2026-09-19.md`](TRANSPORT_SPEED_2026-09-19.md). Tóm tắt:

- **Số "raw" trước đây sai** vì Mac đang bật Tailscale exit node ⇒ "mạng thật" đo
  lại được **122 Mbps** (15,3 MB/s). Khi đo phải `tailscale set --exit-node=`.
- Đường nhanh nhất đã kiểm chứng lại: hysteria2 **bọc WebSocket qua Cloudflare**
  (`/relay/vn2hy`) = **29,9 Mbps** (3,73 MB/s) khi đường khỏe; khi đường khách yếu
  thì tunnel đạt 83–100% raw. WireGuard-over-relay vẫn chỉ 0,007–2 MB/s.
- Đã viết transport dùng chung `tools/hysteria-relay/` (MIT hysteria + `wsrelay.go`
  tự viết, **không sửa upstream**) và **sửa bug relay**: `wsrelay.js` trên node-1 +
  node-2 cắt WebSocket sau 10 phút **bất kể có traffic** ⇒ mọi phiên streaming dài
  bị đứt giữa chừng; nay timer được làm mới theo traffic.
- Kiến trúc chốt: transport hysteria2-qua-WS + **sing-box** lo TUN/định tuyến/DNS
  (chủ dự án đã duyệt GPL-3.0) — `Libbox.xcframework` v1.14.1 đã build được cho
  iOS-device / iOS-simulator / macOS.
