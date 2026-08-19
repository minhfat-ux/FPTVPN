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
