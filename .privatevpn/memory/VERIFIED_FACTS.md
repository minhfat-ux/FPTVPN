# VERIFIED_FACTS.md

Only evidence-backed statements. Agent/Expert claims are never promoted directly
(RULE-MEM-004, RULE-GLOBAL-001).

| # | Fact | Evidence | Date |
|---|------|----------|------|
| VF-001 | Development environment: Xcode 26.6 (17F113), Swift 6.3.3, iOS SDK 26.5 simulators, xcodegen 2.46.0 installed, git 2.50.1 user MinhNb2 | `evidence/environment_audit.md` (raw command output) | 2026-08-19 |
| VF-002 | A codesigning identity for minhnb2@me.com exists on this Mac | `evidence/environment_audit.md` | 2026-08-19 |
| VF-003 | Repo was empty at start (no commits); git status verified | `evidence/environment_audit.md` | 2026-08-19 |
| VF-004 | App + Packet Tunnel extension + tests build for iOS Simulator via xcodebuild → BUILD SUCCEEDED | `evidence/builds/2026-08-19-gate1-simulator-build.log` | 2026-08-19 |
| VF-005 | VPNState unit tests: 9/9 pass, 0 failures (TEST SUCCEEDED) | `evidence/builds/2026-08-19-gate1-tests.log` | 2026-08-19 |
| VF-006 | App + Packet Tunnel extension sign ad-hoc (`Signature=adhoc`) and build from Xcode for the iOS Simulator after removing project-level `CODE_SIGNING_ALLOWED=NO` | `codesign -dv` on built `PrivateVPN.app` + `PlugIns/PrivateVPNPacketTunnel.appex`; `xcodebuild ... -destination 'iOS Simulator' build` → BUILD SUCCEEDED | 2026-08-19 |
| VF-007 | Go 1.26.6 installed via Homebrew; `libwg-go.a` built from vendored WireGuardKit (wireguard-go v0.0.0-20230209, sys/types.h patched for Xcode 26) | `go version`; `make PLATFORM_NAME=iphoneos ARCHS=arm64` in `Vendor/WireGuardKit/Sources/WireGuardKitGo` | 2026-08-19 |
| VF-008 | Device (`generic/platform=iOS`) build links WireGuardKit + libwg-go.a → BUILD SUCCEEDED; extension embedded + signed team G6XW3RN6LJ | `xcodebuild ... -destination 'generic/platform=iOS' build`; `codesign -dv` on `.appex` | 2026-08-19 |
| VF-009 | **Device build re-verified independently AFTER control-plane integration (ControlAPIClient etc.) → BUILD SUCCEEDED** | `evidence/builds/2026-08-19-gate2-device-build-verify.log` (xcodebuild, generic/platform=iOS, CODE_SIGNING_ALLOWED=NO) | 2026-08-19 |
| VF-010 | **Control-plane smoke test (DRY_RUN, Node v26.6.0): auth 401 → register 201 (IP 10.77.0.2, then .3) → idempotent re-register 200 (same IP) → validation 400 → DELETE deactivates (active=false) + wg dry-run peer remove** | `evidence/2026-08-19-control-plane-smoke.md` (raw curl transcript, server log) | 2026-08-19 |
| VF-011 | **iOS unit test suite (ControlAPIClient, DeviceIdentity, KeychainStore, VPNConfigStore, VPNState, WireGuardConfig) runs on iOS Simulator → TEST SUCCEEDED, 39/39 pass, 0 failures** (simulator build fixed via `GOOS_iphonesimulator := ios` in WireGuardKitGo Makefile) | `evidence/builds/2026-08-19-gate4-tests.log` | 2026-08-19 |
| VF-012 | **Coordinator (VPS 103.173.155.50:7777) auto-provisions peers into wg0 on register**: `POST /v1/peers/register` returns `{peer_id, overlay_ip, network, peer_credential, peers[]}` and the peer's public key appears in `wg show wg0 peers`; revoke runs `wg set ... remove`. Coordinator is Node 24 (node:sqlite), WireGuard wg0 at 10.77.0.1/24 UDP 443 | `curl` transcripts; `wg show wg0 peers` on VPS | 2026-08-21 |
| VF-013 | **macOS app FPTPrivateVPN builds (BUILD SUCCEEDED), launches, and registers with the coordinator via `POST /v1/peers/register`** (ControlAPIClient shared with iOS); then drives wg-quick to the VPS exit node (103.173.155.50:443, pubkey N0vGtqZ2SARCXkvVUU/KfAZMvfwszkvF/ROLL4DLIQ8=) with allowedIPs 0.0.0.0/0 | `mac/PrivateVPNMac/`; `xcodebuild -scheme PrivateVPNMac`; register curl | 2026-08-21 |
| VF-014 | **iOS + macOS unit tests 36/36 PASS** on iOS Simulator after coordinator integration (ControlAPIClient rewritten for /v1/peers/register; some ProvisionedConfig/RegisterDeviceResponse tests removed) | `xcodebuild ... test` | 2026-08-21 |
| VF-015 | **Coordinator exit-node registry works**: `POST /v1/nodes` adds a node; `GET /v1/nodes` lists it (verified: `vietnam-1`, endpoint 103.173.155.50:443, pubkey N0v...IQ8=); app fetches the list and macOS connect uses the selected node | `curl` /v1/nodes; VPNManagerMac connect | 2026-08-21 |

NOT verified: any VPN connectivity, public-IP change, DNS/HTTPS through tunnel,
revocation against a live node, real control-plane provisioning against a WireGuard
node. These require GATE 2+/real device + node credentials.
