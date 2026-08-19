# KNOWLEDGE BASE — INDEX

- **Status:** ACTIVE (bootstrap)
- **Date:** 2026-08-19
- **Model (spec §38):** KB-ID, title, domain, status, summary, provenance, confidence.
- **Lifecycle:** CANDIDATE → REVIEWED → ACTIVE → DEPRECATED/SUPERSEDED.

## Domains

| Domain | Path | Items |
|--------|------|-------|
| PRODUCT | `.privatevpn/knowledge/PRODUCT/` | KP-001 |
| ARCHITECTURE | `.privatevpn/knowledge/ARCHITECTURE/` | KA-001 |
| IOS | `.privatevpn/knowledge/IOS/` | KI-001 |
| VPN | `.privatevpn/knowledge/VPN/` | KV-001 |
| NETWORKING | `.privatevpn/knowledge/NETWORKING/` | — |
| SECURITY | `.privatevpn/knowledge/SECURITY/` | KS-001 |
| BACKEND | `.privatevpn/knowledge/BACKEND/` | — |
| TESTING | `.privatevpn/knowledge/TESTING/` | — |
| BUGS | `.privatevpn/knowledge/BUGS/` | — |
| BEST_PRACTICES | `.privatevpn/knowledge/BEST_PRACTICES/` | KBP-001 |
| DEBUG_PLAYBOOKS | `.privatevpn/knowledge/DEBUG_PLAYBOOKS/` | KDP-001 |
| PLATFORM | `.privatevpn/knowledge/PLATFORM/` | KPL-001 |
| AGENT_ENGINEERING | `.privatevpn/knowledge/AGENT_ENGINEERING/` | — |

## Active items

| KB-ID | Title | Domain | Confidence | Evidence |
|-------|-------|--------|------------|----------|
| KP-001 | Product scope boundary (MVP) | PRODUCT | HIGH | master spec §3 |
| KA-001 | Two-target architecture (app + extension) | ARCHITECTURE | HIGH | ADR-0003 |
| KI-001 | iOS VPN API surface (NEVPNManager + NEPacketTunnelProvider) | IOS | HIGH | Apple docs + ADR-0002 |
| KV-001 | WireGuard: handshake != working VPN | VPN | HIGH | master spec AP-VPN-001 |
| KS-001 | Device secret handling on iOS (Keychain) | SECURITY | HIGH | master spec §20 |
| KBP-001 | Evidence-based verification | AGENT_ENGINEERING | HIGH | RULE-EVID-* |
| KDP-001 | DNS-fail playbook placeholder | DEBUG_PLAYBOOKS | MED | spec §42 |
| KPL-001 | Simulator limits for Network Extension | PLATFORM | HIGH | RULE-IOS-007 |

Full item files live in the domain folders. Do not dump this KB into agent context;
route relevant items only (RULE-KB-002).
