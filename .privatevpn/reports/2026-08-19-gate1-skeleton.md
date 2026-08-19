# REPORT — GATE 1 iOS VPN SKELETON

- **Timestamp:** 2026-08-19
- **Commit:** (assigned at commit time)
- **Gate:** GATE 1
- **SRS:** v0.1 | **Baseline:** RS-20260819-01 | **Rules:** RULESET-0001
- **Status:** COMPLETE (simulator build + unit tests verified)

## Objective
GATE 1 = iOS app + Packet Tunnel provider skeleton with a real state model, buildable via `xcodebuild`.

## Verified facts
- Environment: Xcode 26.6, Swift 6.3.3, xcodegen 2.46.0 (`evidence/environment_audit.md`).
- App + extension + tests build for **iOS Simulator** → `** BUILD SUCCEEDED **`
  (`evidence/builds/2026-08-19-gate1-simulator-build.log`).
- Unit tests (VPNState state machine) → `** TEST SUCCEEDED **`, **9/9 passed, 0 failures**
  (`evidence/builds/2026-08-19-gate1-tests.log`).

## Deliverables
- `project.yml` — XcodeGen manifest: app, packet-tunnel extension, unit-test targets,
  Network Extension `packet-tunnel-provider` entitlement. `CODE_SIGNING_ALLOWED=NO`
  removed from project-level settings so the app signs ad-hoc and runs from Xcode
  on the simulator (fixes "executable is not codesigned").
- `iOS/PrivateVPN/` — app sources:
  - `VPNState.swift` — state machine (`disconnected/connecting/connected/disconnecting/failed`),
    `NEVPNStatus` mapping, `canConnect`/`canDisconnect`.
  - `VPNManager.swift` — `@MainActor ObservableObject`, load/save preferences,
    start/stop tunnel.
  - `ContentView.swift` — minimal SwiftUI connect/disconnect UI.
  - `PrivateVPNApp.swift`, `Info.plist`, `PrivateVPN.entitlements`.
- `iOS/PrivateVPNPacketTunnel/` — `PacketTunnelProvider.swift` (start/stop tunnel, network
  settings), `PacketTunnel.entitlements`.
- `iOS/PrivateVPNTests/VPNStateTests.swift` — 9 tests, all passing.
- `PrivateVPN.xcodeproj` — regenerated from `project.yml` (build artifact, git-ignored).

## Requirements status (GATE 1 scope)
- **FR-VPN-005** — IMPLEMENTED (state model, connect/disconnect).
- **NFR-UX-001** — IMPLEMENTED (minimal connect/disconnect UI).
- **NFR-PERF-001** — PARTIAL (skeleton; real perf E2E deferred to GATE 2+).
- **NFR-REL-001** — PARTIAL (build reliability only; real-device runtime GATE 2+).

## Bugs / blockers
- None logged (bug registry empty).
- Blocker (documented, GATE 2+): real Packet Tunnel runtime requires physical iPhone;
  simulator cannot run Network Extension. Real-device signing requires `DEVELOPMENT_TEAM`
  on the extension target (not set by design for simulator-only GATE 1).

## Next objective
- GATE 2: real-device build/signing, WireGuard provisioning against Vietnam node,
  tunnel runtime E2E — needs physical iPhone + Node/control-plane credentials.
