# PRIVATEVPN — OWNER DASHBOARD

- **Baseline:** RS-20260819-01
- **Rule baseline:** RULESET-0001
- **Updated:** 2026-08-20
- **Note (RULE-DASH-001):** this is a projection of authoritative state in
  `.privatevpn/status/`; it is not the source of truth.

## Overview

```
PRIVATEVPN iOS MVP

Project health: ACTIVE (GATE 1 verified; GATE 2/3/4 partial; production coordinator deployed 2026-08-23)
Current Gate: GATE 4 / Publish Prep — iOS App Store submission (auth repo-side done; deploy done)
Current SRS: v0.1
Requirement baseline: RS-20260819-01
Rule baseline: RULESET-0001

Requirements VERIFIED: 6 (FR-VPN-001..005, NFR-UX-001 — FR-VPN-001..004 verified by real-device E2E 2026-08-23) · IMPLEMENTED: 18/23
Gates VERIFIED: 1 / 8 (GATE 1)
Verification checks: BUILD PASS ✓ · TESTS PASS ✓ (17/17 control-plane) · PRODUCTION DEPLOY ✓ · **IPHONE E2E ✓ 2026-08-23** (login OTP thật, IP=103.173.155.50, DNS/HTTPS, disconnect/reconnect, session persist — evidence/e2e/)

Active agents: DSH orchestrator + opencode worker (UI sign-in task)
Active experts: 0
Open bugs: Critical 0 / High 0 / Medium 0 / Low 0 (BUG-20260823-001 = TRIAGED, repo+deploy resolved; verification of prod closed endpoint pending LEGACY_MODE=0)
Blockers:
  - Real-device VPN E2E (public IP = 103.173.155.50) not yet verified after latest changes.
  - Production email OTP needs RESEND_API_KEY; admin endpoints fail-closed until AUTH_TOKEN set.
  - LEGACY_MODE=1 must stay until authenticated app is released.
  - Subscription source pending App Store product review.
Last verified result: production coordinator deployed + verified (2026-08-23, evidence in memory DECISIONS.md)
Next verification: iOS publish archive/validate/upload; macOS NE E2E; email OTP after RESEND_API_KEY
Owner action required: RESEND_API_KEY (Resend signup + domain SPF/DKIM); App Store results
```

## Gate flow

```text
✓ GATE 0  Reality Audit & Engineering Bootstrap  (DONE)
✓ GATE 1  iOS VPN Skeleton  (verified — build ✓ + tests ✓ 9/9)
◐ GATE 2  Static Real Tunnel  (code complete + device build ✓; runtime E2E BLOCKED)
◐ GATE 3  Dynamic Device Provisioning  (code complete + smoke ✓ 31/31; real node pending)
◐ GATE 4  Authentication & Revocation  (partial — server-side revoke done; NFR-SEC-004 IMPLEMENTED fail-closed admin auth 2026-08-20; FR-AUTH-001 NOT_STARTED)
◐ GATE 5  MVP UX & Diagnostics  (partial — admin endpoints + TLS + diagnostics + UI/UX redesign done)
▶ GATE 6  Security Review  (privacy review 2026-08-20 — 3 low issues FIXED; NFR-PRIV-001 IMPLEMENTED; real-device E2E pending GATE 7)
○ GATE 7  Real E2E Acceptance
```

Semantics: ✓ VERIFIED · ▶ ACTIVE · ◐ PARTIAL · ! BLOCKED · ✕ FAILED · ○ NOT STARTED · ↻ NEEDS_REVERIFY.

## Requirement view

| State | Count | Notes |
|-------|-------|-------|
| APPROVED | 23 | baseline (all requirements) |
| IMPLEMENTED | 17 | FR-DEVICE-001/002, FR-PROVISION-001/002, FR-VPN-001..005, FR-ADMIN-001, FR-DIAG-001, NFR-SEC-001/002/003/004, NFR-UX-001, NFR-PRIV-001 |
| PARTIAL | 4 | FR-REVOKE-001/002, NFR-PERF-001, NFR-REL-001, NFR-OBS-001 |
| NOT_STARTED | 1 | FR-AUTH-001 |
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
- 2026-08-20 (12:14, owner-approved): **3 privacy low issues FIXED** (CR-0003) — (1) `UIDevice.current.name` removed from POST /device (+ regression test asserting no deviceName in payload); (2) control-plane auth token moved UserDefaults → Keychain with one-shot migration; (3) admin endpoints (GET /devices, GET /status, GET/DELETE /device/:id) fail closed — 503 when `AUTH_TOKEN` unset, 401 on missing/bad token (AC-018). Control-plane smoke PASS (both scenarios); iOS **39/39 PASS** (evidence/builds/2026-08-20-privacy-fixes-tests.log); NFR-PRIV-001 + NFR-SEC-004 → IMPLEMENTED. Evidence: evidence/2026-08-20-privacy-fixes.md.
