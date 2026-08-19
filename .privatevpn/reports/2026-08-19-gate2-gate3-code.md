# GATE 2/3 Report — Static Real Tunnel + Dynamic Device Provisioning (code)

- **Date:** 2026-08-19
- **Baseline:** RS-20260819-01 · RULESET-0001
- **Prepared by:** Culi orchestration (hermes executor, task_20260819_0190)
- **Scope:** GATE 2 (WireGuard integration) code completion + GATE 3 (control
  plane) implementation — simulator/device-build + smoke-test verification only;
  real-device E2E remains BLOCKED (no physical iPhone / node credentials).

## What was done (verified on disk, not claimed)

### GATE 2 — Static Real Tunnel (CODE_COMPLETE)
- WireGuardKit vendored (`Vendor/WireGuardKit`), `libwg-go.a` built (Go 1.26.6).
- Keypair in Keychain (`KeychainStore.swift`); real tunnel path via
  `PacketTunnelProvider` + WireGuardAdapter.
- `VPNManager` builds `WireGuardConfig` (endpoint, peer pubkey, allowedIPs
  0.0.0.0/0 + ::/0, keepalive 25) and starts/stops the tunnel.
- In-app Configuration screen (`SettingsView`/`VPNConfigStore`) — endpoint/peer
  key user-configurable; server location list with Hanoi test node preset.
- Device build re-verified independently:
  `xcodebuild -project PrivateVPN.xcodeproj -scheme PrivateVPN -destination
  'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build` → **BUILD SUCCEEDED**
  (`evidence/builds/2026-08-19-gate2-device-build-verify.log`, VF-009).

### GATE 3 — Dynamic Device Provisioning (IN_PROGRESS, code done)
- `control-plane/` Node.js/Express service (commit 464d793):
  - `POST /device` — register by WireGuard public key, allocate IP from
    10.77.0.0/24 pool (server-assigned, Tailscale-style), upsert peer via `wg`.
  - `GET /device/:id`, `DELETE /device/:id` (deactivate + `wg` peer remove).
  - Optional bearer auth (`AUTH_TOKEN`), `DRY_RUN=1` for development.
- iOS `ControlAPIClient.swift` — app registers device on Connect when a
  control-plane URL is configured in Settings.
- Smoke test (DRY_RUN, Node v26.6.0): 401 auth / 201 register (IP .2, .3) /
  200 idempotent re-register (same IP) / 400 validation / DELETE → active=false
  + wg dry-run peer remove — **all PASS** (`evidence/2026-08-19-control-plane-smoke.md`, VF-010).

## Acceptance criteria status

| AC | Requirement | Status |
|----|-------------|--------|
| AC-003 | FR-DEVICE-002 keypair local | Code complete (KeychainStore) — device verify pending |
| AC-004 | FR-PROVISION-001 unique persistent IP | Code + smoke verified (IP pool) |
| AC-005 | FR-PROVISION-002 server peer provisioned | Code + smoke verified (wg dry-run) |
| AC-006 | FR-VPN-001 tunnel on real device | Code complete — BLOCKED (no device/node) |
| AC-007 | FR-VPN-002 route via tunnel | Code complete (allowedIPs) — BLOCKED runtime |
| AC-008 | FR-VPN-003 disconnect restores routing | Code complete — BLOCKED runtime |
| AC-009 | FR-VPN-004 reconnect | Code complete — BLOCKED runtime |
| AC-002 | FR-DEVICE-001 device registered | Code + smoke verified (control plane) |
| AC-010 | FR-VPN-005 real state model | VERIFIED (GATE 1, 9/9 tests) |

## Blockers (unchanged, documented)
1. Real VPN runtime E2E: physical iPhone + Apple team with Network Extension
   entitlement.
2. Production node: no Vietnam node credentials / live endpoint for real `wg`
   provisioning (control plane currently DRY_RUN).

## Next
- GATE 3/4: revoke UI + auth flow (FR-REVOKE-001/002, FR-AUTH-001), admin
  visibility (FR-ADMIN-001) — after control-plane deployment decision.
- GATE 7: real E2E acceptance once device + node available.
