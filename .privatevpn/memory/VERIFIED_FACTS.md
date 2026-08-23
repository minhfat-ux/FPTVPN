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
| VF-012 | **Coordinator (VPS 103.173.155.50) auto-provisions peers into wg0 on register**: `POST /v1/peers/register` returns `{peer_id, overlay_ip, network, peer_credential, peers[]}` and the peer's public key appears in `wg show wg0 peers`; revoke runs `wg set ... remove`. Coordinator is Node 24 (node:sqlite), WireGuard wg0 at 10.77.0.1/24 UDP 443 | `curl` transcripts; `wg show wg0 peers` on VPS | 2026-08-21 |
| VF-017 | **Coordinator TLS enabled**: `https://api.meetflowai.site/v1/nodes` returns HTTP/2 200 through Caddy reverse proxy to Node on `127.0.0.1:7777`; Caddy HTTP/3 disabled so WireGuard keeps UDP 443. | `curl https://api.meetflowai.site/v1/nodes`; `systemctl status caddy` | 2026-08-22 |
| VF-013 | **Historical pre-NE macOS app path verified**: FPTPrivateVPN built, launched, registered with the coordinator via `POST /v1/peers/register`, and drove `wg-quick` to the VPS exit node. This path is now superseded by the NetworkExtension implementation. | `mac/PrivateVPNMac/`; `xcodebuild -scheme PrivateVPNMac`; register curl | 2026-08-21 |
| VF-014 | **iOS + macOS unit tests 36/36 PASS** on iOS Simulator after coordinator integration (ControlAPIClient rewritten for /v1/peers/register; some ProvisionedConfig/RegisterDeviceResponse tests removed) | `xcodebuild ... test` | 2026-08-21 |
| VF-015 | **Coordinator exit-node registry works**: `POST /v1/nodes` adds a node; `GET /v1/nodes` lists it (verified: `vietnam-1`, endpoint 103.173.155.50:443, pubkey N0v...IQ8=); app fetches the list and macOS connect uses the selected node | `curl` /v1/nodes; VPNManagerMac connect | 2026-08-21 |
| VF-016 | **macOS NetworkExtension refactor compiles & links**: app + embedded `PrivateVPNMacPacketTunnel.appex` build with `CODE_SIGNING_ALLOWED=NO` → BUILD SUCCEEDED (arm64). VPNManagerMac uses `NETunnelProviderManager`; no wg-quick/sudo dependency remains. **Runtime tunnel not yet verified** (requires NE-capable Mac App Development signing profile). | `xcodebuild -scheme PrivateVPNMac -destination 'platform=macOS' build CODE_SIGNING_ALLOWED=NO` → BUILD SUCCEEDED | 2026-08-21 |
| VF-018 | Public iOS legal/support pages are reachable: `FlowVPNPrivacy.html` and `SupportPrivateVPN.html` return HTTP/2 200 from `meetflowai.site`; Apple Standard EULA URL returns HTTP/2 200. | `curl -I https://meetflowai.site/FlowVPNPrivacy.html`; `curl -I https://meetflowai.site/SupportPrivateVPN.html`; `curl -I https://www.apple.com/legal/internet-services/itunes/dev/stdeula/` | 2026-08-22 |
| VF-019 | iOS device install failure was caused by `PrivateVPNPacketTunnel.appex` missing a non-empty `CFBundleVersion`; Xcode run result showed `MIInstallerErrorDomain Code: 33 MissingBundleVersion`. The extension plist was updated to `CFBundleShortVersionString = 1.0`, `CFBundleVersion = 1`, and `plutil -lint` passes. | `xcrun xcresulttool get object --legacy ... Run-PrivateVPN-2026.08.22_19-10-58...`; `plutil -lint iOS/PrivateVPNPacketTunnel/Info.plist` | 2026-08-22 |
| VF-020 | iOS StoreKit paywall has product IDs `Monthly_Premium` and `Yearly_Premium`; Debug builds bypass premium with `#if DEBUG`, while Release/App Store requires StoreKit entitlements. | `rg`/source inspection of `iOS/PrivateVPN/SettingsView.swift` | 2026-08-22 |
| VF-021 | iOS App Store checklist local validation passed after subscription disclosure changes: app/extension plist and entitlements lint OK; iOS Swift files parse OK. | `plutil -lint iOS/PrivateVPN/Info.plist iOS/PrivateVPNPacketTunnel/Info.plist iOS/PrivateVPN/PrivateVPN.entitlements iOS/PrivateVPNPacketTunnel/PacketTunnel.entitlements`; `xcrun --sdk iphoneos swiftc -parse ...` | 2026-08-22 |
| VF-022 | macOS FlowVPN build/package check passed after runtime fixes: `FlowVPN.app` embeds `Contents/PlugIns/PrivateVPNMacPacketTunnel.appex`; app and extension are signed with Network Extension entitlement; build succeeded after removing the script line that deleted the embedded extension. | `xcodegen generate`; Xcode build log `BuildProject-Log-20260823-000709.txt`; `codesign -d --entitlements` on app + appex; bundle inspection | 2026-08-23 |

| VF-023 | **iPhone 14 Pro Max E2E PASS (2026-08-23):** login email-OTP thật (iCloud nhận OTP), Connect thành công, public IP = 103.173.155.50, DNS + HTTPS hoạt động, Disconnect về nhà mạng, Reconnect lại VN node, kill app → vẫn signed in. Server-side: peer iPhone active (10.77.0.14, handshake 29s), health latency 0.1ms, bandwidth tăng. | `evidence/e2e/2026-08-23-iphone-e2e.md` | 2026-08-23 |

| VF-024 | **macOS FlowVPN E2E PASS (2026-08-23):** Mac app (Xcode signed, NE) connect thành công — session persist, IP = 103.173.155.50, DNS/HTTPS, disconnect/reconnect OK (owner xác nhận). Server-side: peer Mac active (10.77.0.9, handshake 22s), health latency 0.1ms. | `evidence/e2e/2026-08-23-mac-e2e.md` | 2026-08-23 |

| VF-025 | **Node 2 (103.6.234.233) egress verified (2026-08-23):** device connect qua node 2, mạng thông (transfer 65 MiB/1.2 GiB, handshake 34s). Fix routing: thêm 10.77.0.1/24 vào wg0 + rp_filter=0 + NAT 10.77 (persist wg0.conf). Multi-node provisioning qua SSH hoạt động. | `docs/EXIT_NODE_RUNBOOK.md`, DECISIONS 2026-08-23 | 2026-08-23 |

NOT verified: latest iOS/macOS production end-to-end VPN connectivity,
public-IP change, DNS/HTTPS through tunnel, reconnect/disconnect, and App Store
review flow after the most recent paywall/localization/macOS NetworkExtension
changes.

NOT verified for iOS publish: Xcode Archive, Organizer Validate, App Store
Connect Upload, build processing, and App Review approval.
