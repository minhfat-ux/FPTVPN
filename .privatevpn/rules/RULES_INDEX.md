# RULES INDEX

- **Rule baseline:** RULESET-0001
- **Date:** 2026-08-19
- **Precedence (spec §63):** Safety/security → current user-approved requirements →
  project mandatory rules → approved architecture/ADRs → project best practices →
  global best practices → agent preference.

## Rule files

| File | Scope |
|------|-------|
| GLOBAL_AGENT_RULES.md | RULE-GLOBAL-001..010 |
| REQUIREMENT_RULES.md | RULE-REQ-001..006 |
| MEMORY_RULES.md | RULE-MEM-001..006 |
| KNOWLEDGE_RULES.md | RULE-KB-001..006 |
| CODING_RULES.md | RULE-CODE-001..008 |
| SECURITY_RULES.md | RULE-SEC-001..008 |
| IOS_RULES.md | RULE-IOS-001..007 |
| VPN_RULES.md | RULE-VPN-001..008 |
| GIT_RULES.md | RULE-GIT-001..007 |
| TESTING_RULES.md | RULE-TEST-001..007 |
| EVIDENCE_RULES.md | RULE-EVID-001..006 |
| BUG_RULES.md | RULE-BUG-001..008 |
| EXPERT_RULES.md | RULE-EXPERT-001..006 |
| REVIEW_RULES.md | RULE-REVIEW-001..004 + RULE-VERIFY-001..006 |
| DASHBOARD_RULES.md | RULE-DASH-001..006 |

## Key rules enforced this session

- RULE-GLOBAL-001/002: claims ≠ verified; agents cannot mark gates VERIFIED.
- RULE-GLOBAL-009: do not fabricate evidence.
- RULE-IOS-007: simulator success != VPN E2E.
- RULE-VPN-001/002: handshake != working VPN; public IP must be verified independently.
- RULE-EVID-001: no evidence = not verified.
- RULE-SEC-003 / RULE-GIT-004: never commit secrets.
- RULE-DASH-002: never display IMPLEMENTED as VERIFIED.

## Rule change management

Material rule changes use RC-xxxx records. Current baseline: **RULESET-0001**.
