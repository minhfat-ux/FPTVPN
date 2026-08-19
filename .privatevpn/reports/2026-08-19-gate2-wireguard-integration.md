# REPORT — GATE 2 WIREGUARD INTEGRATION (STATIC REAL TUNNEL)

- **Timestamp:** 2026-08-19
- **Commit:** (assigned at commit time)
- **Gate:** GATE 2 (prep / integration stage)
- **SRS:** v0.1 | **Baseline:** RS-20260819-01 | **Rules:** RULESET-0001
- **Status:** CODE DONE + DEVICE BUILD VERIFIED; real connect BLOCKED (no server/device)

## Objective
Move from the fake/skeleton tunnel to a real WireGuard tunnel path: framework
integrated, on-device keypair, real `startTunnel` via `WireGuardAdapter`, and a
configuration model ready to receive server-provisioned values.

## Verified facts
- Go 1.26.6 installed (Homebrew). `libwg-go.a` built from vendored WireGuardKit
  (wireguard-go v0.0.0-20230209153558-1e2c3e5a3c14). `VERIFIED_FACTS.md` VF-007.
- Device build (`generic/platform=iOS`) links WireGuardKit + libwg-go.a →
  `** BUILD SUCCEEDED **`; extension embedded + signed team G6XW3RN6LJ.
  Log: `evidence/builds/2026-08-19-gate2-wireguard-device-build.log`. VF-008.

## Deliverables
- `Vendor/WireGuardKit/` — vendored WireGuardKit package (WireGuardKit /
  WireGuardKitC / WireGuardKitGo). Patch: `#include <sys/types.h>` in
  `WireGuardKitC.h` (Xcode 26 explicit-module fix); `go.mod`/`go.sum` pinned to
  wireguard-go 2023 (Go 1.26 compat).
- `project.yml` — package at `path: Vendor/WireGuardKit`; pre-build script builds
  `libwg-go.a` via Go (both app + extension targets); `LIBRARY_SEARCH_PATHS`.
- `iOS/PrivateVPN/Services/KeychainStore.swift` — WireGuard keypair generate/store
  in Keychain (private key never leaves device).
- `iOS/PrivateVPN/Services/WireGuardConfig.swift` — `WireGuardConfig` model +
  `makeTunnelConfiguration()` (validation); `VPNDevice` (Tailscale-style device).
- `iOS/PrivateVPNPacketTunnel/PacketTunnelProvider.swift` — real `startTunnel`/
  `stopTunnel`/`handleAppMessage` via `WireGuardAdapter`; reads config from
  `providerConfiguration`.
- `iOS/PrivateVPN/VPNManager.swift` — creates/loads keypair, builds
  `WireGuardConfig`, sends it through `providerConfiguration["wireguard"]`.

## Requirements status (GATE 2 scope)
- **FR-VPN-005** — now backed by a real WireGuard tunnel path (was skeleton).
- **NFR-SEC-003** — device keypair in Keychain; private key not persisted to disk/server.
- Provisioning/user/device registration (control plane) — NOT started (no backend).

## Bugs / blockers
- **Blocker:** real connect requires a physical iPhone + a provisioning profile with
  the Network Extensions entitlement (Apple Developer paid account) — not present.
- **Blocker:** no Vietnam node endpoint or peer public key provided → config uses
  placeholders in `VPNManager.makeConfig()`.
- **Known limitation:** `libwg-go.a` does not link for the iOS Simulator (Go
  iOS-simulator runtime lacks a darwin exception-handler symbol). WireGuard is
  device-only. Acceptable — the simulator cannot run a Packet Tunnel anyway.
- **Disk note (LL-005):** `/` hit 99% full during Go/Xcode builds; freed via
  `go clean -cache`, `brew cleanup`, and removing `ModuleCache.noindex` (~4 GB).

## Next objective
- Provide Vietnam node endpoint + peer public key (or control-plane API), then
  replace placeholders in `VPNManager.makeConfig()`.
- Attach a physical iPhone + signing profile → real-device tunnel E2E.
- Commit WireGuard integration + evidence.
