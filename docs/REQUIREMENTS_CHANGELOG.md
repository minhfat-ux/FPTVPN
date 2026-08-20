# PRIVATEVPN — REQUIREMENTS CHANGELOG

- **Latest baseline:** RS-20260819-01
- **Date:** 2026-08-20

Change requests are captured with stable IDs (CR-xxxx, spec §10-§12). Baseline
initialization is CR-0001.

## CR-0001 — Baseline initialization

- **ID:** CR-0001
- **Title:** Initialize SRS v0.1 requirement baseline
- **Requested by:** Owner (master spec directive)
- **Date:** 2026-08-19
- **Affected requirements:** all (initial set)
- **Current requirement:** none
- **Proposed requirement:** SRS v0.1 baseline RS-20260819-01 as registered in `docs/REQUIREMENTS_REGISTRY.md`
- **Reason:** GATE 0 bootstrap; convert master-spec objective into testable requirements.
- **Trigger/evidence:** `docs/spec/CULI_PRIVATEVPN_IOS_MASTER_SPEC.md` §1, §3, §7, §8.
- **Business impact:** none (new).
- **Technical impact:** establishes IDs, versions, gate mapping.
- **Security impact:** baseline security requirements NFR-SEC-* introduced.
- **UX impact:** none.
- **Architecture impact:** none yet.
- **Affected tasks:** all future tasks (record baseline).
- **Affected tests:** none yet.
- **Affected evidence:** none yet.
- **Affected gates:** GATE 0 artifacts.
- **Backward compatibility:** N/A (initial).
- **Migration need:** none.
- **Recommendation:** accept.
- **Decision:** ACCEPTED.
- **Decision owner:** MinhNb2 (owner) / Culi.
- **Effective requirement version:** SRS v0.1 / RS-20260819-01.

## CR-0002 — Docs sync with authoritative status + privacy review (AC-019)

- **ID:** CR-0002
- **Title:** Docs status sync + privacy review (NFR-PRIV-001 / AC-019 evidence)
- **Requested by:** Owner (verification workflow / master spec directive)
- **Date:** 2026-08-20
- **Affected requirements:** none changed — impl states of all 23 requirements synced to `.privatevpn/status/requirements.json`
- **Current requirement:** unchanged
- **Proposed requirement:** unchanged (docs-only; no SRS text change)
- **Reason:** RULE-DASH-001 — registry/dashboard are projections of authoritative state; sync after commit `6d1a1f7` (FR-ADMIN-001 / NFR-SEC-002 / FR-DIAG-001 → IMPLEMENTED). Privacy review produces AC-019 evidence for NFR-PRIV-001.
- **Trigger/evidence:** `.privatevpn/status/requirements.json`; `evidence/2026-08-20-privacy-review.md`.
- **Business impact:** none.
- **Technical impact:** none (docs + evidence only).
- **Security impact:** privacy review records 3 low-severity findings (no code fix in this CR): (1) `UIDevice.current.name` transmitted in POST /device; (2) control-plane auth token stored in UserDefaults plaintext; (3) admin endpoints unauthenticated when `AUTH_TOKEN` unset (depends on NFR-SEC-004).
- **UX impact:** none.
- **Architecture impact:** none.
- **Affected tasks:** none.
- **Affected tests:** none.
- **Affected evidence:** `evidence/2026-08-20-privacy-review.md` (new).
- **Affected gates:** GATE 6 (NFR-PRIV-001 evidence), GATE 5 (status sync).
- **Backward compatibility:** full.
- **Migration need:** none.
- **Recommendation:** accept.
- **Post-verify update (2026-08-20 11:30):** GATE 3 iOS unit tests re-verified — **37/37 PASS, TEST SUCCEEDED** (iPhone 16 Pro simulator, `evidence/builds/2026-08-20-gate3-tests.log`); `NFR-SEC-001` → IMPLEMENTED (Keychain backend + `DeviceIdentity`), `NFR-PRIV-001` → PARTIAL (AC-019 evidence exists; 3 low issues pending GATE 6). Registry/dashboard synced per RULE-DASH-001.
- **Decision:** ACCEPTED.
- **Decision owner:** MinhNb2 (owner) / Culi.
- **Effective requirement version:** SRS v0.1 / RS-20260819-01 (unchanged).

## CR-0003 — Privacy low-issue fixes (owner-approved, GATE 6)

- **ID:** CR-0003
- **Title:** Fix 3 low-severity privacy review issues (deviceName transmission, token in UserDefaults, unauthenticated admin endpoints)
- **Requested by:** Owner (approval 2026-08-20, follow-up to CR-0002 findings)
- **Date:** 2026-08-20
- **Affected requirements:** NFR-PRIV-001 (PARTIAL → IMPLEMENTED), NFR-SEC-004 (NOT_STARTED → IMPLEMENTED)
- **Current requirement:** NFR-PRIV-001 partial (AC-019 evidence, 3 low issues); NFR-SEC-004 not started.
- **Proposed requirement:** both IMPLEMENTED.
- **Reason:** close GATE 6 privacy findings — (1) stop transmitting `UIDevice.current.name`
  in POST /device; (2) store control-plane auth token in Keychain instead of UserDefaults
  (one-shot migration); (3) admin endpoints fail closed when `AUTH_TOKEN` unset (AC-018).
- **Trigger/evidence:** `evidence/2026-08-20-privacy-review.md` (CR-0002), `evidence/2026-08-20-privacy-fixes.md`.
- **Business impact:** none (no UX change; token UX unchanged; device display name falls back to server default `"device"` until a user-chosen name is added).
- **Technical impact:** iOS — `ControlAPIClient.register` signature change (dropped
  `deviceName`), `VPNConfigStore.controlPlaneToken` backed by Keychain + migration;
  control-plane — `requireAdminAuth` middleware on admin routes (503 when unconfigured).
- **Security impact:** positive — device registry no longer publicly readable without
  authorization; credential no longer persisted plaintext; personal device name no longer
  transmitted.
- **UX impact:** none (fields/behavior unchanged from user perspective).
- **Architecture impact:** none.
- **Affected tasks:** none (executed as owner-approved GATE 6 follow-up run).
- **Affected tests:** `ControlAPIClientTests` (deviceName regression assertion),
  `VPNConfigStoreTests` (+2: Keychain persistence, UserDefaults migration).
- **Affected evidence:** `evidence/2026-08-20-privacy-fixes.md` (new), `evidence/builds/2026-08-20-privacy-fixes-tests.log` (new).
- **Affected gates:** GATE 4 (NFR-SEC-004), GATE 6 (NFR-PRIV-001).
- **Backward compatibility:** iOS client drops one optional request field (server ignores
  unknown fields and defaults the name); control-plane admin routes now require auth —
  intentional, per NFR-SEC-004.
- **Migration need:** token auto-migrates UserDefaults → Keychain on first app launch (one-shot).
- **Recommendation:** accept.
- **Decision:** ACCEPTED.
- **Decision owner:** MinhNb2 (owner) / Culi.
- **Effective requirement version:** SRS v0.1 / RS-20260819-01 (unchanged; impl-state only).

## Change history

| CR | Date | Type | Result | Effective baseline |
|----|------|------|--------|--------------------|
| CR-0001 | 2026-08-19 | Initial baseline | ACCEPTED | RS-20260819-01 |
| CR-0002 | 2026-08-20 | Docs sync + privacy review (AC-019 evidence) | ACCEPTED | RS-20260819-01 |
| CR-0003 | 2026-08-20 | Privacy fixes (NFR-PRIV-001 + NFR-SEC-004 → IMPLEMENTED) | ACCEPTED | RS-20260819-01 |

## Rules for changes

- Material changes (behavior/security/UX/scope/AC/tests, spec §10) require a new CR-xxxx.
- Formatting/typo changes do not require a CR.
- Accepted material changes trigger: impact analysis (§12) → affected tasks marked
  CONTEXT_STALE → re-verification of affected claims (RULE-REQ-006).
