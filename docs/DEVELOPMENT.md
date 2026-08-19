# PRIVATEVPN — DEVELOPMENT

- **Version:** v0.1
- **Date:** 2026-08-19

## 1. Environment

- macOS (Darwin), Apple Silicon
- Xcode 26.6 (build 17F113)
- Swift 6.3.3
- iOS SDK 26.5 (simulator)
- xcodegen 2.46.0 (`/opt/homebrew/bin/xcodegen`)
- git user: MinhNb2
- No Apple signing team configured → simulator builds; runtime VPN needs real device + team

## 2. Project generation

`project.yml` is the source of truth (ADR-0001). Generate:

```bash
/opt/homebrew/bin/xcodegen generate
```

Generated `PrivateVPN.xcodeproj` is gitignored.

## 3. Build (simulator)

```bash
xcodebuild -project PrivateVPN.xcodeproj -scheme PrivateVPN \
  -destination 'generic/platform=iOS Simulator' \
  CODE_SIGNING_ALLOWED=NO build
```

Targets:

- `PrivateVPN` — iOS app
- `PrivateVPNPacketTunnel` — Packet Tunnel Provider extension (embedded)

## 4. Code conventions

- SwiftUI app UI.
- `VPNState` enum drives UI (never optimistic).
- `VPNManager` wraps NEVPNManager; state changes observed, not guessed.
- No custom cryptography; no WireGuard reimplementation (RULE-CODE-002).
- No secrets in code; Keychain for storage.
- No comments unless required; changes scoped (RULE-CODE-003).

## 5. Testing

- Unit tests for state model transitions (GATE 1).
- Future: provisioning flow, config persistence, error states (§82).
- Real E2E mandatory for final acceptance; mocks do not count (RULE-TEST-002).

## 6. Commit conventions

Commit message format (RULE-GIT-005, owner directive):

```text
feat(docs): GATE 0 bootstrap — SRS v0.1 ...
feat(ios): GATE 1 skeleton — app + packet tunnel + state model
build(ios): GATE 1 simulator build succeeded
```

Never commit secrets (RULE-GIT-004).
