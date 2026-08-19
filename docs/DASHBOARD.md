# PRIVATEVPN — OWNER DASHBOARD

- **Baseline:** RS-20260819-01
- **Rule baseline:** RULESET-0001
- **Updated:** 2026-08-19
- **Note (RULE-DASH-001):** this is a projection of authoritative state in
  `.privatevpn/status/`; it is not the source of truth.

## Overview

```
PRIVATEVPN iOS MVP

Project health: ACTIVE (GATE 1 verified — GATE 2/3 code complete, runtime E2E blocked)
Current Gate: GATE 3 — Dynamic Device Provisioning (control plane implemented)
Current SRS: v0.1
Requirement baseline: RS-20260819-01
Rule baseline: RULESET-0001

Requirements VERIFIED: 1 (FR-VPN-005; GATE 2/3 code verified by build + smoke)
Gates VERIFIED: 1 / 8 (GATE 1)
Verification checks: BUILD PASS ✓ (GATE 1 + GATE 2 device re-verify, 2026-08-19) · TESTS PASS ✓ (9/9) · CONTROL-PLANE SMOKE ✓ (auth/IP-pool/idempotency/delete)

Active agents: 1 (Culi/orchestrator — this session)
Active experts: 0 consulted (bootstrap; planned for GATE 2 WireGuard wiring)
Open bugs: Critical 0 / High 0 / Medium 0 / Low 0
Blockers:
  - Real VPN connect needs physical iPhone + Network Extensions provisioning profile (paid team) — GATE 2/7.
  - No production Vietnam node credentials: control plane runs DRY_RUN; real wg provisioning needs node access + WG_SERVER_PUBKEY/WG_PUBLIC_ENDPOINT.
  - Internal system disk pressure (8.6 Gi free at last check). Watch before next build.
Last verified result: GATE 1 simulator build + 9/9 unit tests (evidence/builds/*.log, evidence/gate1-verification.md)
Next verification: GATE 1 formal gate review (verifier authority, spec §33)
Owner action required: none for GATE 1 (simulator scope)
```

## Gate flow

```text
✓ GATE 0  Reality Audit & Engineering Bootstrap  (DONE)
✓ GATE 1  iOS VPN Skeleton  (build ✓ + tests ✓ 9/9; formal review pending)
▶ GATE 2  Static Real Tunnel  (code complete + device build ✓; runtime E2E BLOCKED)
▶ GATE 3  Dynamic Device Provisioning  (control plane code + smoke ✓; real node pending)
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

- GATE 1 code written (app + packet tunnel + state model + 9 unit tests).
- xcodegen generate → simulator build **BUILD SUCCEEDED** (evidence/builds/gate1-simulator-build.log).
- Unit tests **9/9 passed** (evidence/builds/gate1-simulator-tests.log) — VPNState mapping + action guards.
- Evidence summary + status files updated (evidence/gate1-verification.md, .privatevpn/status/).
- Environment: fixed wedged Xcode build system (restart) + freed ~2 GB on 100%-full system disk.
