# DECISIONS.md

Durable engineering decisions (see also `docs/adr/`).

| Date | Decision | Reference |
|------|----------|-----------|
| 2026-08-19 | Xcode project generated via xcodegen (project.yml authoritative) | ADR-0001 |
| 2026-08-19 | VPN mechanism = Packet Tunnel Provider (NEPacketTunnelProvider) | ADR-0002 |
| 2026-08-19 | Separate app target + extension target | ADR-0003 |
| 2026-08-19 | Real VPN state model; evidence-gated verification; no fake connected | ADR-0004 |
| 2026-08-19 | GATE 1 targets simulator build (no signing team); real-device runtime deferred with documented blocker | SECURITY.md §4, PROJECT_STATE.md |
| 2026-08-19 | Requirement baseline RS-20260819-01 accepted | CR-0001 |
| 2026-08-19 | WireGuard framework = WireGuardKit (wireguard-apple), vendored into `Vendor/WireGuardKit` (patched sys/types.h for Xcode 26; wireguard-go pinned 2023 for Go 1.26 compat) | PROJECT_STATE.md, VERIFIED_FACTS.md VF-007 |
| 2026-08-19 | Device keypair kept per-device (Tailscale-style: user owns many devices); private key only in Keychain, never on server | ARCHITECTURE.md §2, VERIFIED_FACTS.md |
| 2026-08-19 | `libwg-go.a` built by a pre-build script (Go) at link time; simulator link unsupported (Go iOS-simulator runtime) → WireGuard is device-only | PROJECT_STATE.md |
