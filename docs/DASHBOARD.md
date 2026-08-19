# PRIVATEVPN — OWNER DASHBOARD

- **Baseline:** RS-20260819-01
- **Rule baseline:** RULESET-0001
- **Updated:** 2026-08-19
- **Note (RULE-DASH-001):** this is a projection of authoritative state in
  `.privatevpn/status/`; it is not the source of truth.

## Overview

```
PRIVATEVPN iOS MVP

Project health: ACTIVE (GATE 0/1 in progress)
Current Gate: GATE 1 — iOS VPN Skeleton
Current SRS: v0.1
Requirement baseline: RS-20260819-01
Rule baseline: RULESET-0001

Requirements VERIFIED: 0 (by evidence)
Gates VERIFIED: 0 / 8
Verification checks: BUILD PASS (GATE 1, to be run)

Active agents: 1 (Culi/orchestrator — this session)
Active experts: 0 consulted (GATE 0 bootstrap; planned for GATE 1 WireGuard wiring)
Open bugs: Critical 0 / High 0 / Medium 0 / Low 0
Blockers:
  - Simulator cannot run a real Packet Tunnel (needs physical iPhone) — affects GATE 2+, NOT GATE 1.
  - No server/control-plane credentials provided yet — affects GATE 2+.
Last verified result: environment audit captured (evidence/environment_audit.md)
Next verification: simulator build (xcodebuild) → BUILD SUCCEEDED evidence
Owner action required: none for GATE 0/GATE 1 (simulator scope)
```

## Gate flow

```text
◐ GATE 0  Reality Audit & Engineering Bootstrap  (IN PROGRESS)
○ GATE 1  iOS VPN Skeleton
○ GATE 2  Static Real Tunnel
○ GATE 3  Dynamic Device Provisioning
○ GATE 4  Authentication & Revocation
○ GATE 5  MVP UX & Diagnostics
○ GATE 6  Security Review
○ GATE 7  Real E2E Acceptance
```

Semantics: ✓ VERIFIED · ▶ ACTIVE · ◐ PARTIAL · ! BLOCKED · ✕ FAILED · ○ NOT STARTED · ↻ NEEDS_REVERIFY.

## Requirement view

| State | Count | Notes |
|-------|-------|-------|
| APPROVED | 25 | baseline |
| IMPLEMENTED | 3 | FR-VPN-005, NFR-UX-001, NFR-SEC-003 |
| PARTIAL | 4 | FR-DIAG-001, NFR-PERF-001, NFR-REL-001, NFR-OBS-001 |
| VERIFIED | 0 | no evidence-based verification yet |

## Open bugs

None yet. See `.privatevpn/bugs/`.

## Recent activity

- GATE 0 docs created (SRS, architecture, ADRs, registry, changelog, flow, security, dev, e2e).
- Engineering bootstrap created (rules, knowledge, memory, bugs, evidence, status).
