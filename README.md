# PrivateVPN — iOS MVP

Private VPN iOS application: an authorized user installs the app, authenticates,
registers their device, gets WireGuard credentials provisioned against our own
Vietnam VPN node, connects/disconnects, and can revoke a device.

This repository is engineered under the CULI orchestration model. See:

- `docs/spec/CULI_PRIVATEVPN_IOS_MASTER_SPEC.md` — master product/engineering spec
- `docs/SRS.md` — authoritative system requirements
- `docs/ARCHITECTURE.md` — architecture baseline
- `docs/PROJECT_FLOW.md` — project flow and gates
- `.privatevpn/memory/PROJECT_STATE.md` — authoritative current project state

## Status

Current gate: **GATE 1 — iOS VPN Skeleton** (in progress / build verified).
See `.privatevpn/memory/PROJECT_STATE.md` for the authoritative status.

## Layout

```text
iOS/                  iOS app + Packet Tunnel provider
docs/                 SRS, architecture, ADRs, registry, changelog
.privatevpn/          rules, knowledge base, memory, bugs, status, reports
evidence/             real build / test / network evidence
```

## Build (simulator)

```bash
/opt/homebrew/bin/xcodegen generate
xcodebuild -project PrivateVPN.xcodeproj -scheme PrivateVPN \
  -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
```
