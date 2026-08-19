# PRIVATEVPN — PROJECT FLOW

- **Baseline:** RS-20260819-01
- **Date:** 2026-08-19
- **Source:** master spec §17, §18, §112

## Authoritative flow

```text
OBJECTIVE → REALITY AUDIT → SRS → ARCHITECTURE → RULES → KNOWLEDGE →
PROJECT MEMORY → REQUIREMENT → DOMAIN CLASSIFICATION → EXPERT CONSULTATION →
CULI DECISION → TASK GENERATION → AGENT SELECTION → EXECUTION → HANDOFF →
REVIEW → VERIFICATION → EVIDENCE → BUG/LEARNING IF NEEDED → MEMORY+KB UPDATE →
DASHBOARD UPDATE → GATE DECISION → NEXT TASK
```

Each flow node maps to a real project object:

| Flow node | Project object |
|-----------|----------------|
| OBJECTIVE | `docs/spec/...MASTER_SPEC.md` §1 |
| REALITY AUDIT | `evidence/environment_audit.md` |
| SRS | `docs/SRS.md` |
| ARCHITECTURE | `docs/ARCHITECTURE.md`, `docs/adr/` |
| RULES | `.privatevpn/rules/` |
| KNOWLEDGE | `.privatevpn/knowledge/` |
| PROJECT MEMORY | `.privatevpn/memory/` |
| REQUIREMENT | `docs/REQUIREMENTS_REGISTRY.md` |
| TASK | `.privatevpn/status/project.json` + `CURRENT_WORK.md` |
| AGENT | task context pack (§34) |
| HANDOFF | `.privatevpn/memory/AGENT_HANDOFFS/` |
| VERIFICATION | `evidence/` + VERIFIED_FACTS.md |
| BUG | `.privatevpn/bugs/` |
| DASHBOARD | `docs/DASHBOARD.md` + `.privatevpn/status/` |

## Gates (spec §18)

| Gate | Name | State |
|------|------|-------|
| 0 | Reality Audit & Engineering Bootstrap | IN_PROGRESS (this session) |
| 1 | iOS VPN Skeleton | IN_PROGRESS |
| 2 | Static Real Tunnel | NOT_STARTED |
| 3 | Dynamic Device Provisioning | NOT_STARTED |
| 4 | Authentication & Revocation | NOT_STARTED |
| 5 | MVP UX & Diagnostics | NOT_STARTED |
| 6 | Security Review | NOT_STARTED |
| 7 | Real E2E Acceptance | NOT_STARTED |

## Gate state machine

NOT_STARTED / IN_PROGRESS / PARTIAL / BLOCKED / FAILED / VERIFIED / NEEDS_REVERIFY.
Only Culi/verifier authority marks a gate VERIFIED (§33). No agent does.

## Failure flow (spec §104)

FAIL → create/reopen bug → attach evidence → classify root-cause domain → retrieve
known bugs/playbooks → consult Expert → generate rework task → assign agent →
retest. After two similar failed attempts: root-cause analysis + Expert escalation,
no blind retry.

## Continuation rule (spec §103, §112 STEP 27)

When a task verifies, automatically unlock the next non-blocked task. Never stop
after producing plans/documents if execution is possible.
