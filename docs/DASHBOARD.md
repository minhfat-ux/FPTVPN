# PRIVATEVPN — OWNER DASHBOARD

- **Baseline:** RS-20260819-01
- **Rule baseline:** RULESET-0001
- **Updated:** 2026-08-20
- **Note (RULE-DASH-001):** this is a projection of authoritative state in
  `.privatevpn/status/`; it is not the source of truth.

## Overview

```
PRIVATEVPN iOS MVP

Project health: ACTIVE (GATE 1 verified — GATE 2/3 code complete + smoke pass; GATE 4/5 partial)
Current Gate: GATE 5 — MVP UX & Diagnostics (GATE 6 security review started)
Current SRS: v0.1
Requirement baseline: RS-20260819-01
Rule baseline: RULESET-0001

Requirements VERIFIED: 2 (FR-VPN-005, NFR-UX-001 — per requirements.json verified=2026-08-19)
Gates VERIFIED: 1 / 8 (GATE 1)
Verification checks: BUILD PASS ✓ (GATE 1 + GATE 2 device re-verify, 2026-08-19) · TESTS PASS ✓ (9/9) · CONTROL-PLANE SMOKE ✓ (auth/IP-pool/idempotency/delete) · ADMIN+TLS SMOKE ✓ 31/31 (evidence/2026-08-19-control-plane-admin-tls.log)

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
✓ GATE 1  iOS VPN Skeleton  (verified — build ✓ + tests ✓ 9/9)
◐ GATE 2  Static Real Tunnel  (code complete + device build ✓; runtime E2E BLOCKED)
◐ GATE 3  Dynamic Device Provisioning  (code complete + smoke ✓ 31/31; real node pending)
◐ GATE 4  Authentication & Revocation  (partial — server-side revoke done; FR-AUTH-001/NFR-SEC-004 NOT_STARTED)
◐ GATE 5  MVP UX & Diagnostics  (partial — admin endpoints + TLS + diagnostics + UI/UX redesign done)
▶ GATE 6  Security Review  (privacy review evidence 2026-08-20 — NFR-PRIV-001)
○ GATE 7  Real E2E Acceptance
```

Semantics: ✓ VERIFIED · ▶ ACTIVE · ◐ PARTIAL · ! BLOCKED · ✕ FAILED · ○ NOT STARTED · ↻ NEEDS_REVERIFY.

## Requirement view

| State | Count | Notes |
|-------|-------|-------|
| APPROVED | 23 | baseline (all requirements) |
| IMPLEMENTED | 15 | FR-DEVICE-001/002, FR-PROVISION-001/002, FR-VPN-001..005, FR-ADMIN-001, FR-DIAG-001, NFR-SEC-001/002/003, NFR-UX-001 |
| PARTIAL | 6 | FR-REVOKE-001/002, NFR-PERF-001, NFR-REL-001, NFR-OBS-001, NFR-PRIV-001 |
| NOT_STARTED | 2 | FR-AUTH-001, NFR-SEC-004 |
| VERIFIED | 2 | FR-VPN-005, NFR-UX-001 (requirements.json verified=2026-08-19) |

## Open bugs

None yet. See `.privatevpn/bugs/`.

## Recent activity

- GATE 1 code written (app + packet tunnel + state model + 9 unit tests).
- xcodegen generate → simulator build **BUILD SUCCEEDED** (evidence/builds/gate1-simulator-build.log).
- Unit tests **9/9 passed** (evidence/builds/gate1-simulator-tests.log) — VPNState mapping + action guards.
- Evidence summary + status files updated (evidence/gate1-verification.md, .privatevpn/status/).
- Environment: fixed wedged Xcode build system (restart) + freed ~2 GB on 100%-full system disk.
- `6d1a1f7` (2026-08-19 21:38): UI/UX redesign + GATE 3/5 admin endpoints (GET /devices, GET /status) + TLS (TLS_CERT_FILE/TLS_KEY_FILE); control-plane smoke **31/31 PASS** (evidence/2026-08-19-control-plane-admin-tls.log); FR-ADMIN-001 / NFR-SEC-002 / FR-DIAG-001 → IMPLEMENTED.
- 2026-08-20: privacy review (NFR-PRIV-001 / AC-019) — evidence/2026-08-20-privacy-review.md: 19 points reviewed (12 iOS + 7 control-plane), 3 low-severity issues recorded (deviceName transmission, auth token in UserDefaults, unauthenticated admin endpoints when AUTH_TOKEN unset); no code changes; docs synced with .privatevpn/status/requirements.json (RULE-DASH-001).
- 2026-08-20 (11:30): GATE 3 iOS unit tests verified — **37/37 PASS, TEST SUCCEEDED** (iPhone 16 Pro simulator, evidence/builds/2026-08-20-gate3-tests.log); NFR-SEC-001 → IMPLEMENTED (Keychain + DeviceIdentity), NFR-PRIV-001 → PARTIAL (evidence AC-019, 3 low issues pending GATE 6).
