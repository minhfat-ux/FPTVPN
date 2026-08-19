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
GATE 2 — WireGuard integration (code done, device build verified; real connect blocked).

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

## What is implemented but unverified?
- Docs/bootstrap artifacts (SRS, architecture, ADRs, rules, KB, memory, bug registry,
  status, dashboard) — created, not externally verified.
- GATE 1 skeleton code (state model, UI, extension) — buildable + unit-tested is
  evidence of buildability, not real-device VPN runtime verification (GATE 2+).
- WireGuard integration (KeychainStore keypair, WireGuardConfig parser,
  PacketTunnelProvider using WireGuardAdapter, VPNManager config, VPNConfigStore +
  SettingsView) — compiles + device build links, but **no real tunnel connect
  verified** (needs server + device).

## What is running?
Culi orchestration session (this one).

## What is blocked?
- Real VPN runtime (GATE 2+): simulator cannot run Packet Tunnel; requires physical
  iPhone + Apple team with Network Extension entitlement (identity exists).
- Server/control-plane: no Vietnam node credentials, endpoint, or peer public key
  provided. The user now enters endpoint + peer key via the in-app Configuration
  screen (`SettingsView`/`VPNConfigStore`), replacing the previous hardcoded
  placeholders in `VPNManager.makeConfig()`.
- Simulator link of `libwg-go.a` fails (Go iOS-simulator runtime lacks a darwin symbol);
  WireGuard is device-only (documented, acceptable — simulator can't run a tunnel).
- Unit tests cannot run on the iOS Simulator because the test host builds the whole
  app, which links `libwg-go.a` (simulator-incompatible). Tests require a device or
  a way to exclude WireGuard from the test host.

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
8. GATE 2: real-device E2E — needs physical iPhone + Vietnam node endpoint/peer
   public key entered in the app (blocked).
