# PROJECT_STATE.md

- **Updated:** 2026-08-23
- **Authoritative answer to "what is the state?"** — see also `.privatevpn/status/project.json`.

## What are we building?
PrivateVPN: a Tailscale-style WireGuard mesh. A coordinator on a VPS allocates
overlay IPs and provisions peers; devices (iOS app, macOS app, other nodes)
register with the coordinator and connect through an **exit node** on the same
VPS to route Internet through Vietnam.

Current publish focus: **iOS FlowVPN**. The app installs on device after fixing
the packet tunnel extension bundle version; StoreKit paywall, legal/support
links, localization, and App Store review checklist items are in place. Archive,
Validate, Upload, and App Store processing are not yet verified.

## Current SRS?
v0.1 (baseline RS-20260819-01), updated with exit-node registry/admin and
cross-platform clone prompt requirements.

## Current requirement baseline?
RS-20260819-01 (CR-0001 accepted).

## Current rule baseline?
RULESET-0001.

## Current gate?
GATE 4/Publish Prep — iOS App Store submission preparation. Coordinator mesh and
exit-node registry are implemented; account/multi-device ownership remains next.

## Architecture (as-built, 2026-08-23)
```
Coordinator + exit node = same VPS 103.173.155.50
  - coordinator: /root/privatevpn (Node, port 7777, Express + node:sqlite)
      endpoints: /v1/health, /v1/peers/register, /v1/peers/heartbeat,
                 /v1/peers, /v1/peers/me, /v1/peers/revoke,
                 /v1/enrollment-tokens, /v1/tokens (dev-only)
      WireGuard wg0 (10.77.0.1/24, UDP 443), public key N0vGtqZ2SARCXkvVUU/KfAZMvfwszkvF/ROLL4DLIQ8=
      on register -> wg set wg0 peer <key> allowed-ips <ip>/32
      on revoke  -> wg set wg0 peer <key> remove
  - enrollment token: single-use, short-lived, user/subscription-bound
  - /v1/tokens (POST) is legacy/dev-only and must fail closed in production

App (macOS + iOS) uses ControlAPIClient -> /v1/enrollment-tokens ->
/v1/peers/register, then connects to the selected exit node with full-tunnel
allowedIPs 0.0.0.0/0.
```

## What is VERIFIED?
- macOS app **FlowVPN** builds with the embedded
  `PrivateVPNMacPacketTunnel.appex`; the production macOS tunnel path is
  NetworkExtension + WireGuardKit, not `wg-quick`/sudo/Homebrew.
- Coordinator auto-provisions peers into wg0 on register (verified: a test peer
  public key appeared in `wg show wg0 peers` after register).
- `POST /v1/peers/register` returns `{peer_id, overlay_ip, network,
  peer_credential, peers[]}`; IP pool 10.77.0.2–254.
- **Exit-node registry in SQLite** (`/root/flowvpn-cp/data/nodes.db`, `node:sqlite`):
  `GET /v1/nodes` (public) + `GET/POST/PATCH/DELETE /v1/admin/nodes` (admin, Bearer
  AUTH_TOKEN; 503 fail-closed if unset). `vietnam-1` seeded. Apps list + pick the
  exit node from the backend (backend-first, no production hardcode).
- **Admin page public**: `https://meetflowai.site/PrivateVPN/Admin` (list + edit views,
  token persisted, auto-load). **Per-node health**: `GET /v1/admin/nodes/:id/health`
  (latency, bandwidth, capability) — verified live (0.1ms, rx 3.1GB/tx 10.1GB, 13 peers).
- Public legal/support pages are live and return HTTP 200:
  `https://meetflowai.site/FlowVPNPrivacy.html` and
  `https://meetflowai.site/SupportPrivateVPN.html`.
- iOS app and packet tunnel plist/entitlements lint OK after App Store prep.
- iOS Swift parse passes after StoreKit paywall, debug premium bypass, language
  pack, and Apple subscription disclosure changes.
- **Email-OTP login production verified (2026-08-23)**: `POST /v1/auth/email/start`
  sends real OTP via the owner SMTP server (`no-reply@meetflowai.site`, Postfix 465);
  SPF PASS + DMARC `p=none` added -> **iCloud (me.com) and Gmail receive OTP**.
  Full auth flow verified: start -> verify (session 30d) -> enrollment-token 201 ->
  Bearer register 201 -> peer in wg0. Login screen is a dedicated full-screen view
  (iOS `LoginView.swift`, macOS `LoginViewMac.swift`).
- macOS UI now uses a fixed iPhone-sized content window, shows connecting
  feedback while provisioning/requesting VPN permission, disables duplicate
  Connect taps, surfaces safe errors, and has a close button on the paywall.
- Device install popup `MissingBundleVersion` for `PrivateVPNPacketTunnel.appex`
  was diagnosed from Xcode run `.xcresult` and fixed by giving the extension
  `CFBundleShortVersionString = 1.0` and `CFBundleVersion = 1`.
- macOS main screen = single Connect/Disconnect toggle (matches iOS); permission
  prompt can be delayed while the app fetches nodes/token, registers the peer,
  saves the VPN profile, and reloads it from preferences.
- macOS app loads exit nodes from `GET /v1/nodes`, exposes a server/location
  selector in the main window and menu bar, disables Connect until at least one
  backend node is available, and no longer falls back to stale locally cached
  nodes when the coordinator returns an empty node list during Connect.
- iOS unit tests → **36/36 PASS** on simulator (`evidence/builds/...`); iOS and
  macOS builds SUCCEEDED.
- WireGuardKit vendored; libwg-go.a built for device + simulator (simulator fixed
  via `GOOS_iphonesimulator := ios`).

## What is implemented but unverified?
- iOS App Store Archive, Validate, Upload, App Store Connect processing, and
  Review submission (iPhone E2E đã PASS — evidence `evidence/e2e/2026-08-23-iphone-e2e.md`).
- macOS end-to-end connect: cần NE provisioning profile (0 profiles hiện tại;
  owner tạo trên Apple Developer Portal cho com.privatevpn.mac + .mac.packet-tunnel).
- macOS end-to-end tunnel connection/exit IP after latest NetworkExtension
  runtime fixes. Build/package are verified; live VPN egress still needs a
  signed run and public-IP check.
- Production StoreKit subscription/free-trial behavior from App Store Connect.
- Account login / multi-device ownership (Tailscale-style) — **NOT yet built**;
  current model uses one-time join tokens. This is the next design task.
- Revoke-from-app UI (peer revoke exists server-side via /v1/peers/revoke).

## What is running?
- **Production coordinator = `control-plane/` dual-mode server** (systemd
  `flowvpn-cp.service`, port 7778, NODE_ENV=production, LEGACY_MODE=1, dryRun=false).
  Caddy `api.meetflowai.site` -> 127.0.0.1:7778. Devices migrated from old sqlite
  (15 peers, IPs 10.77.0.2–.16 preserved). Old `privatevpn.service` (7777) kept for
  rollback (`/root/flowvpn-cp/rollback.sh`). sqlite3 CLI installed on VPS.
- **FPT Harness (DSH) backend ổn định** (2026-08-24): hết bad gateway (root cause 2 launchd tunnel job đánh nhau — đã gỡ `com.fpt.tunnel` + khóa single-instance trong `dsh-tunnel.sh`); phone browser cache immutable cho assets/plugins; installer 1-click `install-fpt-harness.sh`; nginx+caddy verified 0 lỗi sau fix; GUI nhóm "Ungrouped" đổi tên "MeetFlowAI". Chi tiết: `.dhs-setup/FPT-HARNESS-NOTES.md` (mục 10–14).
- macOS FlowVPN app (test) + iOS build.
- **Deploy pending items:** RESEND_API_KEY (email OTP sends real mail), AUTH_TOKEN
  (admin endpoints fail-closed 503 until set), LEGACY_MODE=0 (only after the
  authenticated app is released).
- Account/multi-device model (FR-AUTH-001): **repo-side implemented** (email-OTP login,
  enrollment tokens, Bearer register); production subscription source still pending
  App Store product review.

## What is stale?
- Previous "control-plane Express" (`control-plane/`) is superseded by the VPS
  coordinator mesh; kept in repo but not used by the app anymore.

## What is next?
0. 🔲 **Fix MeetFlowAI control-plane backend + research stability** (TODO 2026-08-25 — xem `CURRENT_TASK.md` TASK-20260825-MEETFLOWAI-BACKEND).
1. ✅ WireGuardKit vendored + keypair store + config screen.
2. ✅ Coordinator mesh integration (register + auto wg provisioning).
3. ✅ macOS app FlowVPN builds with embedded NetworkExtension.
4. ✅ Exit-node registry + server list from backend; macOS toggle button.
5. ✅ **Production refactor (macOS)**: NetworkExtension + WireGuardKit
   (NEPacketTunnelProvider + WireGuardAdapter); no wg-quick/sudo/Homebrew.
   Build-verified; runtime pending NE-capable signing profile.
6. ✅ iOS App Store prep: StoreKit paywall, product IDs, privacy/support/EULA
   links, manage subscription link, 5-language language pack, packet tunnel
   bundle version fix, debug-only premium bypass for device testing.
7. 🔲 iOS publish (owner, sau khi reject bản review cũ): Clean Build Folder → Archive →
   Validate → Upload → App Store Connect → **submit bản latest** (login email-OTP,
   backend-first, Delete Account, Mac 1.0). Nhớ: Privacy labels (Email/DeviceID/Purchases),
   "Can users delete account?" → Yes, App Review Notes (VPN/NE/WireGuard).
8. 🔲 Sign macOS app with NE-capable Mac App Development profile; verify
   Connect permission prompt, tunnel start, and end-to-end exit IP =
   103.173.155.50.
9. 🔲 Design + build **account login + add device** (Tailscale-style): users
   table, auth, user→devices ownership.
10. 🔲 Push iOS app to FPTVPN repo (scope: iOS/ + project.yml + Vendor).

## Android (bản clone, commit 3e7ea17 — CHƯA PUSH, chờ user push từ terminal)

- `android/` — Kotlin + Jetpack Compose + WireGuard tunnel AAR.
- Build: `cd android && ./gradlew :app:assembleDebug` (JDK 17, SDK platform 35).
- Build outputs: `~/.vpnflow-build/app/outputs/apk/{debug,release}/`.
- Trạng thái: compile + R8 PASS. Chưa chạy trên thiết bị thật (chưa có emulator/phone test).
- TODO: tạo Play Console project, product IDs, upload test; test thật VPN trên máy Android.
