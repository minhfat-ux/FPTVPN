# PROJECT_STATE.md

- **Updated:** 2026-08-21
- **Authoritative answer to "what is the state?"** — see also `.privatevpn/status/project.json`.

## What are we building?
PrivateVPN: a Tailscale-style WireGuard mesh. A coordinator on a VPS allocates
overlay IPs and provisions peers; devices (iOS app, macOS app, other nodes)
register with the coordinator and connect through an **exit node** on the same
VPS to route Internet through Vietnam.

Current working app that RUNS: **macOS app (FPTPrivateVPN)** connecting to the
VPS exit node via wg-quick. iOS app is coded and builds/tests but real-device
tunnel is blocked (Xcode DeviceSupport).

## Current SRS?
v0.1 (baseline RS-20260819-01). **To be updated** for the Tailscale-style
account/device model + macOS target (see docs/SRS.md, pending edit).

## Current requirement baseline?
RS-20260819-01 (CR-0001 accepted).

## Current rule baseline?
RULESET-0001.

## Current gate?
GATE 2 — Real WireGuard integration (macOS app connects to VPS exit node;
iOS code complete, device blocked). GATE 3 — Dynamic device provisioning
(coordinator mesh working end-to-end on VPS).

## Architecture (as-built, 2026-08-21)
```
Coordinator + exit node = same VPS 103.173.155.50
  - coordinator: /root/privatevpn (Node, port 7777, Express + node:sqlite)
      endpoints: /v1/health, /v1/peers/register, /v1/peers/heartbeat,
                 /v1/peers, /v1/peers/me, /v1/peers/revoke, /v1/tokens
      WireGuard wg0 (10.77.0.1/24, UDP 443), public key N0vGtqZ2SARCXkvVUU/KfAZMvfwszkvF/ROLL4DLIQ8=
      on register -> wg set wg0 peer <key> allowed-ips <ip>/32
      on revoke  -> wg set wg0 peer <key> remove
  - join token: single-use, 30-min expiry (PVPN-JOIN-...)
  - /v1/tokens (POST) issues a fresh join token (open in dev)

App (macOS + iOS) uses ControlAPIClient -> /v1/peers/register, then connects
to exit node 103.173.155.50:443 with full-tunnel allowedIPs 0.0.0.0/0.
```

## What is VERIFIED?
- macOS app **FPTPrivateVPN** builds and launches; registers with coordinator
  and brings up wg-quick to the VPS exit node (manual sudo step). Evidence:
  `mac/PrivateVPNMac/`, build log in DerivedData.
- Coordinator auto-provisions peers into wg0 on register (verified: a test peer
  public key appeared in `wg show wg0 peers` after register).
- `POST /v1/peers/register` returns `{peer_id, overlay_ip, network,
  peer_credential, peers[]}`; IP pool 10.77.0.2–254.
- iOS unit tests → **36/36 PASS** on simulator (`evidence/builds/...`); iOS and
  macOS builds SUCCEEDED.
- WireGuardKit vendored; libwg-go.a built for device + simulator (simulator fixed
  via `GOOS_iphonesimulator := ios`).

## What is implemented but unverified?
- iOS app real-device tunnel (blocked: Xcode DeviceSupport missing for iOS 26.6,
  DDI cannot mount → cannot install/run on physical iPhone).
- Account login / multi-device ownership (Tailscale-style) — **NOT yet built**;
  current model uses one-time join tokens. This is the next design task.
- Revoke-from-app UI (peer revoke exists server-side via /v1/peers/revoke).

## What is running?
macOS FPTPrivateVPN app (test) + coordinator on VPS 103.173.155.50.

## What is blocked?
- **iOS real-device**: Xcode DeviceSupport only to 16.4 (Xcode.app ~4GB,
  incomplete) → Developer Disk Image cannot mount → cannot install on iPhone.
  Fix: reinstall/complete Xcode 26.6.
- Real tunnel egress unverified end-to-end (needs `sudo wg-quick up` on the Mac;
  user runs that step manually).
- Account/multi-device model (FR-AUTH-001) not implemented.

## What is stale?
- Previous "control-plane Express" (`control-plane/`) is superseded by the VPS
  coordinator mesh; kept in repo but not used by the app anymore.

## What is next?
1. ✅ WireGuardKit vendored + keypair store + config screen.
2. ✅ Coordinator mesh integration (register + auto wg provisioning).
3. ✅ macOS app FPTPrivateVPN builds + launches + registers.
4. 🔲 Confirm end-to-end tunnel on macOS (user runs `sudo wg-quick up`, verify
   exit IP).
5. 🔲 Design + build **account login + add device** (Tailscale-style): users
   table, auth, user→devices ownership.
6. 🔲 Update SRS/ARCHITECTURE for Tailscale model + macOS target.
7. 🔲 Push iOS app to FPTVPN repo (scope: iOS/ + project.yml + Vendor).
8. 🔲 iOS real-device E2E (needs Xcode reinstall).
