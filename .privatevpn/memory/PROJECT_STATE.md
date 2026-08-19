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

## What is implemented but unverified?
- Docs/bootstrap artifacts (SRS, architecture, ADRs, rules, KB, memory, bug registry,
  status, dashboard) — created, not externally verified.
- GATE 1 skeleton code (state model, UI, extension) — buildable + unit-tested is
  evidence of buildability, not real-device VPN runtime verification (GATE 2+).

## What is running?
Culi orchestration session (this one).

## What is blocked?
- Real VPN runtime (GATE 2+): simulator cannot run Packet Tunnel; requires physical
  iPhone + Apple team with Network Extension entitlement (identity exists).
- Server/control-plane: no Vietnam node credentials or API details provided.

## What is stale?
Nothing yet (fresh repo).

## What is next?
1. ✅ Commit GATE 0 artifacts.
2. ✅ Generate Xcode project with xcodegen (app + Packet Tunnel extension).
3. ✅ Implement state model, VPNManager, minimal SwiftUI UI.
4. ✅ Build with xcodebuild → capture BUILD SUCCEEDED log in evidence/.
5. ✅ Commit GATE 1; report.
6. GATE 2: real-device build/signing, WireGuard provisioning vs Vietnam node,
   tunnel runtime E2E (blocked: needs physical iPhone + Node/control-plane creds).
