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
| 2026-08-19 | Control plane = small Node.js/Express service (control-plane/): POST /device registers, IP pool 10.77.0.0/24 (server-assigned, Tailscale-style), wg set provisioning, optional bearer auth, DRY_RUN mode for dev | commit 464d793, control-plane/README.md |
| 2026-08-19 | Device registers with control plane on Connect when control-plane URL configured in Settings (ControlAPIClient); manual endpoint/peer entry remains as fallback | VPNManager.swift, SettingsView.swift |
| 2026-08-21 | **Switch from local Express control-plane to the VPS coordinator mesh** (`minhfat-ux/privateVPN`, Node 24, port 7777, node:sqlite). ControlAPIClient rewritten for `/v1/peers/register`. The previous `control-plane/` is superseded (kept, unused). | PROJECT_STATE.md, VERIFIED_FACTS.md VF-012 |
| 2026-08-21 | **Exit-node model (Tailscale-style)**: app connects to the VPS exit node (103.173.155.50:443, pubkey N0v...IQ8=) with allowedIPs 0.0.0.0/0 for Internet egress; coordinator auto-provisions peers into wg0 on register/revoke | VF-012, VPNManager*.swift |
| 2026-08-21 | **macOS target `PrivateVPNMac`** added (SwiftUI app that registers + runs wg-quick); reuses ControlAPIClient; join token auto-fetched from `POST /v1/tokens` when empty | project.yml, mac/PrivateVPNMac/ |
| 2026-08-21 | **Join token = single-use, 30-min expiry**; app auto-fetches a fresh token each connect (no manual paste) | coordinator createJoinToken, VPNManagerMac |
| 2026-08-21 | Peer name made unique per register (`mac-<suffix>`) because coordinator enforces unique peer names | VPNManagerMac |
