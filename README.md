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

## Build & run (simulator)

The project is signed automatically (ad-hoc) so it can be built and run directly
from Xcode on the iOS Simulator. Regenerate the project after editing `project.yml`:

```bash
/opt/homebrew/bin/xcodegen generate
```

Build + run from Xcode, or via CLI:

```bash
xcodebuild -project PrivateVPN.xcodeproj -scheme PrivateVPN \
  -destination 'generic/platform=iOS Simulator' build
```

> Note: `CODE_SIGNING_ALLOWED=NO` is NOT set in the project anymore — it was removed
> so the app can be signed and installed on the simulator from Xcode. If you only
> want an unsigned compile check from the CLI, pass `CODE_SIGNING_ALLOWED=NO` on the
> command line.
