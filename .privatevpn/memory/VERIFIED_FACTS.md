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

NOT verified: any VPN connectivity, public-IP change, DNS/HTTPS through tunnel,
revocation. These require GATE 2+/real device.
