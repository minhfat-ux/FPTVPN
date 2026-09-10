# China Transport Roadmap (Hysteria2 Integration)

> Status: planning → toolchain setup in progress (gomobile + NDK)
> Date: 2026-09-09

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
cert /etc/hysteria/cert.pem, obfs salamander password FlowVPN-8f3k, auth
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
