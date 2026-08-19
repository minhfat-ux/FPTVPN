# PRIVATEVPN — REQUIREMENTS CHANGELOG

- **Latest baseline:** RS-20260819-01
- **Date:** 2026-08-19

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

## Change history

| CR | Date | Type | Result | Effective baseline |
|----|------|------|--------|--------------------|
| CR-0001 | 2026-08-19 | Initial baseline | ACCEPTED | RS-20260819-01 |

## Rules for changes

- Material changes (behavior/security/UX/scope/AC/tests, spec §10) require a new CR-xxxx.
- Formatting/typo changes do not require a CR.
- Accepted material changes trigger: impact analysis (§12) → affected tasks marked
  CONTEXT_STALE → re-verification of affected claims (RULE-REQ-006).
