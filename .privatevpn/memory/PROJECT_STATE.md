# PROJECT_STATE.md

- **Updated:** 2026-08-19
- **Authoritative answer to "what is the state?"** — see also `.privatevpn/status/project.json`.

## What are we building?
PrivateVPN iOS MVP: authorized user installs app, authenticates, registers device,
gets WireGuard credentials provisioned against our own Vietnam VPN node, connects,
routes Internet through Vietnam, verifies exit IP, disconnects, reconnects, and can
be revoked.

## Current SRS?
v0.1 (baseline RS-20260819-01).

## Current requirement baseline?
RS-20260819-01 (CR-0001 accepted).

## Current rule baseline?
RULESET-0001.

## Current gate?
GATE 1 — iOS VPN Skeleton (COMPLETE, simulator-verified). GATE 0 bootstrap deliverables committed.
GATE 2 — WireGuard integration (code complete + device build verified; real connect blocked).
GATE 3 — Dynamic device provisioning (control-plane implemented + smoke-tested; integration with real node pending).

## What is VERIFIED?
- Environment audit captured (`evidence/environment_audit.md`): Xcode 26.6,
  Swift 6.3.3, xcodegen 2.46.0, iOS 26.5 sims, signing identity present.
- App + Packet Tunnel extension + tests build for iOS Simulator via xcodebuild
  → `** BUILD SUCCEEDED **` (`evidence/builds/2026-08-19-gate1-simulator-build.log`).
- VPNState unit tests → `** TEST SUCCEEDED **`, 9/9 passed, 0 failures
  (`evidence/builds/2026-08-19-gate1-tests.log`). See `VERIFIED_FACTS.md` VF-004/005.
- App + Packet Tunnel extension sign ad-hoc and build from Xcode on the simulator
  → resolves "executable is not codesigned" run error (`CODE_SIGNING_ALLOWED=NO`
  removed from project-level settings).
- WireGuardKit vendored (`Vendor/WireGuardKit`), libwg-go.a built via Go 1.26.6,
  and the **device** build links it → `** BUILD SUCCEEDED **` (extension embedded
  + signed team G6XW3RN6LJ). See `VERIFIED_FACTS.md` VF-007/008.
- **Device build re-verified independently** after control-plane integration
  (`evidence/builds/2026-08-19-gate2-device-build-verify.log`) → BUILD SUCCEEDED.
- **Control-plane smoke test** (DRY_RUN, Node v26.6.0): 401 auth, 201 register +
  IP pool 10.77.0.2/.3, 200 idempotent re-register, 400 validation, DELETE →
  active=false + `wg` dry-run peer remove (`evidence/2026-08-19-control-plane-smoke.md`).
- **iOS unit test suite runs on iOS Simulator → TEST SUCCEEDED, 39/39 pass, 0
  failures** (ControlAPIClient, DeviceIdentity, KeychainStore, VPNConfigStore,
  VPNState, WireGuardConfig). Simulator build fixed via `GOOS_iphonesimulator := ios`
  in the WireGuardKitGo Makefile (`evidence/builds/2026-08-19-gate4-tests.log`,
  VF-011).

## What is implemented but unverified?
- Docs/bootstrap artifacts (SRS, architecture, ADRs, rules, KB, memory, bug registry,
  status, dashboard) — created, not externally verified.
- GATE 1 skeleton code (state model, UI, extension) — buildable + unit-tested is
  evidence of buildability, not real-device VPN runtime verification (GATE 2+).
- WireGuard integration (KeychainStore keypair, WireGuardConfig parser,
  PacketTunnelProvider using WireGuardAdapter, VPNManager config, VPNConfigStore +
  SettingsView) — compiles + device build links + unit-tested; **no real tunnel
  connect verified** (needs server + device).
- Control plane (Express: POST/GET/DELETE /device, IP pool 10.77.0.0/24, wg peer
  provisioning, bearer auth, DRY_RUN, TLS, /devices /status admin) — code complete +
  smoke-verified; **not yet run against a real WireGuard node** (no node credentials).
- ControlAPIClient (iOS side registers device on Connect when control-plane URL set)
  — unit-tested; runtime end-to-end path needs a reachable control plane + device.

## What is running?
Culi orchestration session (this one) + control-plane smoke test (finished).

## What is blocked?
- Real VPN runtime (GATE 2+): simulator cannot run Packet Tunnel; requires physical
  iPhone + Apple team with Network Extension entitlement (identity exists).
- **Xcode DeviceSupport missing for iOS 26.6** (only up to 16.4 present; Xcode.app
  is only ~4GB, incomplete install) → Developer Disk Image cannot mount → cannot
  install/run the app on a physical iPhone yet. Fix: reinstall/complete Xcode 26.6.
- Server/control-plane: no production Vietnam node credentials, endpoint, or peer
  public key provided. Dev preset (Hanoi test node) exists in-app; control plane
  needs WG_SERVER_PUBKEY/WG_PUBLIC_ENDPOINT of a live node to provision real peers.

## What is stale?
Nothing yet (fresh repo).

## What is next?
1. ✅ Commit GATE 0 artifacts.
2. ✅ Generate Xcode project with xcodegen (app + Packet Tunnel extension).
3. ✅ Implement state model, VPNManager, minimal SwiftUI UI.
4. ✅ Build with xcodebuild → capture BUILD SUCCEEDED log in evidence/.
5. ✅ Commit GATE 1; report.
6. ✅ WireGuard integration: vendored kit, keypair store, config parser, real
   `startTunnel` via WireGuardAdapter — code done, device build OK (committed 9033251).
7. ✅ Add in-app Configuration screen (VPNConfigStore + SettingsView) for endpoint /
   peer key; user-configurable instead of placeholders.
8. ✅ Control plane (Node.js): device registration + auto-provisioning + IP pool
   + bearer auth + DRY_RUN (commit 464d793, smoke-tested).
9. ✅ UI/UX redesign + admin endpoints (/devices, /status) + TLS + privacy fixes
   (commits 6d1a1f7, 1426c25); iOS unit tests 39/39 PASS on simulator (VF-011).
10. GATE 3/4: wire revoke UI (FR-REVOKE-001/002), auth (FR-AUTH-001), admin
    visibility (FR-ADMIN-001) — pending control-plane deployment decisions.
11. GATE 2: real-device E2E — needs physical iPhone + Vietnam node endpoint/peer
    public key entered in the app (blocked by missing Xcode DeviceSupport for iOS
    26.6 → reinstall/complete Xcode, plus live node provisioning).
