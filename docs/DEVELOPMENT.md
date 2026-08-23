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

## 5b. Production deployment (VPS, as-built 2026-08-23)

- Production coordinator = `control-plane/` (this repo) deployed via systemd
  `flowvpn-cp.service` on the VPS (103.173.155.50): port 7778,
  `NODE_ENV=production`, `LEGACY_MODE=1`, dryRun=false; Caddy reverse-proxies
  `api.meetflowai.site` -> 127.0.0.1:7778.
- Data: JSON files under `/root/flowvpn-cp/data/` (`devices.json`, `auth.json`,
  `nodes.json`); migrated from the old sqlite coordinator
  (`/root/.privatevpn/coordinator.db`, read with `sqlite3` CLI, now installed).
- Redeploy after changing `control-plane/`:
  ```bash
  rsync -az --exclude node_modules --exclude data control-plane/ root@103.173.155.50:/root/flowvpn-cp/
  ssh root@103.173.155.50 'cd /root/flowvpn-cp && npm install --omit=dev && systemctl restart flowvpn-cp'
  ```
- Legacy review window: keep `LEGACY_MODE=1` until the authenticated app is released;
  then set `LEGACY_MODE=0` in the unit + restart.
- Rollback: `/root/flowvpn-cp/rollback.sh` (Caddy back to 7777); old
  `privatevpn.service` still exists for fallback.
- Set `RESEND_API_KEY` (OTP email) and `AUTH_TOKEN` (admin) once available.

## 6. Commit conventions

Commit message format (RULE-GIT-005, owner directive):

```text
feat(docs): GATE 0 bootstrap — SRS v0.1 ...
feat(ios): GATE 1 skeleton — app + packet tunnel + state model
build(ios): GATE 1 simulator build succeeded
```

Never commit secrets (RULE-GIT-004).
