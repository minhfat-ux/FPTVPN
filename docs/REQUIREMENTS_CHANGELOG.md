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

## Change history

| CR | Date | Type | Result | Effective baseline |
|----|------|------|--------|--------------------|
| CR-0001 | 2026-08-19 | Initial baseline | ACCEPTED | RS-20260819-01 |
| CR-0002 | 2026-08-20 | Docs sync + privacy review (AC-019 evidence) | ACCEPTED | RS-20260819-01 |

## Rules for changes

- Material changes (behavior/security/UX/scope/AC/tests, spec §10) require a new CR-xxxx.
- Formatting/typo changes do not require a CR.
- Accepted material changes trigger: impact analysis (§12) → affected tasks marked
  CONTEXT_STALE → re-verification of affected claims (RULE-REQ-006).
