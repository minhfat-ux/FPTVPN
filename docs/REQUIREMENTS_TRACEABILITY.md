# PRIVATEVPN — REQUIREMENTS TRACEABILITY

- **Baseline:** RS-20260819-01
- **Date:** 2026-08-19

Traceability chain (spec §15): Requirement Version → Architecture/ADR → Rule set →
Task → Agent → Implementation → Test → Evidence → Verification.

## Per requirement

| ID | Version | ADR | Rules | Task | Implementation | Test | Evidence | Verification |
|----|---------|-----|-------|------|----------------|------|----------|--------------|
| FR-AUTH-001 | v1 | ADR-0004 | RULE-SEC-004 | (future GATE 4) | — | — | — | — |
| FR-DEVICE-001 | v1 | ADR-0004 | RULE-SEC-001 | (GATE 3) | — | — | — | — |
| FR-DEVICE-002 | v1 | ADR-0004 | RULE-SEC-001/002/003 | (GATE 3) | — | — | — | — |
| FR-PROVISION-001 | v1 | ADR-0002 | RULE-VPN-006 | (GATE 3) | — | — | — | — |
| FR-PROVISION-002 | v1 | ADR-0002 | RULE-VPN-006 | (GATE 3) | — | — | — | — |
| FR-VPN-001 | v1 | ADR-0002 | RULE-VPN-001/002 | (GATE 2) | — | — | — | — |
| FR-VPN-002 | v1 | ADR-0002 | RULE-VPN-003 | (GATE 2) | — | — | — | — |
| FR-VPN-003 | v1 | ADR-0002 | RULE-VPN-004 | (GATE 2) | — | — | — | — |
| FR-VPN-004 | v1 | ADR-0002 | RULE-VPN-002 | (GATE 2) | — | — | — | — |
| FR-VPN-005 | v1 | ADR-0004 | RULE-IOS-003 | TASK-G1-003 (state model) | `iOS/PrivateVPN/VPNState.swift` | unit test (state transitions) | `evidence/builds/*.log` | BUILD PASS (buildability only) |
| FR-REVOKE-001 | v1 | ADR-0004 | RULE-SEC-005 | (GATE 4) | — | — | — | — |
| FR-REVOKE-002 | v1 | ADR-0004 | RULE-SEC-005 | (GATE 4) | — | — | — | — |
| FR-ADMIN-001 | v1 | ADR-0004 | RULE-SEC-004 | (GATE 5) | — | — | — | — |
| FR-DIAG-001 | v1 | ADR-0004 | RULE-IOS-003 | TASK-G1-004 (diagnostics row) | `iOS/PrivateVPN/` | — | build log | BUILD PASS (partial) |
| NFR-SEC-001 | v1 | ADR-0004 | RULE-SEC-001 | (GATE 3) | — | — | — | — |
| NFR-SEC-002 | v1 | — | RULE-SEC-004 | (GATE 3) | — | — | — | — |
| NFR-SEC-003 | v1 | — | RULE-SEC-003, RULE-GIT-004 | GATE 0 | `.gitignore` | secret scan | `evidence/security/secret-scan.log` | PASS |
| NFR-SEC-004 | v1 | — | RULE-SEC-004 | (GATE 4) | — | — | — | — |
| NFR-PRIV-001 | v1 | — | RULE-SEC-002 | (GATE 6) | — | — | — | — |
| NFR-PERF-001 | v1 | ADR-0004 | RULE-IOS-003 | TASK-G1-002 | `VPNManager.swift` | — | build log | BUILD PASS (partial) |
| NFR-REL-001 | v1 | ADR-0004 | RULE-IOS-003 | TASK-G1-002 | `VPNManager.swift` | — | build log | BUILD PASS (partial) |
| NFR-UX-001 | v1 | — | RULE-IOS-003 | TASK-G1-001 (UI) | `ContentView.swift` | — | build log | BUILD PASS |
| NFR-OBS-001 | v1 | — | RULE-DASH-001/006 | GATE 0 | `.privatevpn/status/project.json` | — | — | PARTIAL |

> Note (RULE-VERIFY-005, ADR-0004): BUILD PASS in GATE 1 proves buildability only.
> `IMPLEMENTED` ≠ `VERIFIED`. GATE 1 items are marked IMPLEMENTED, not VERIFIED.
