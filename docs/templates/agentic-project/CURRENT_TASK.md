# Current Task

- **Task ID:** TASK-YYYYMMDD-001
- **Title:** <short task title>
- **Owner:** <main agent or assigned agent>
- **Status:** proposed | in_progress | blocked | needs_review | verified | done | deferred
- **Created:** YYYY-MM-DD
- **Updated:** YYYY-MM-DD

## Objective

<What outcome must be true when this task is complete?>

## Scope

In scope:

- <file/module/behavior>

Out of scope:

- <file/module/behavior>

## Context

- Relevant docs:
  - `docs/SRS.md`
  - `docs/ARCHITECTURE.md`
- Relevant memory:
  - `.privateproject/memory/PROJECT_STATE.md`
  - `.privateproject/memory/DECISIONS.md`
- Relevant code:
  - `<path>`

## Plan

| Step | Status | Owner | Notes |
|---|---|---|---|
| 1. Gather context | proposed | main | Use RAG and direct file reads |
| 2. Implement | proposed | main | Keep changes scoped |
| 3. Validate | proposed | main | Run planned checks |
| 4. Review | proposed | reviewer | Secondary agent or manual review |
| 5. Commit | proposed | main | Only after clean diff |

## Expected File Changes

| Path | Owner | Reason |
|---|---|---|
| `<path>` | main | <why this file may change> |

## Validation Plan

| Check | Required | Evidence target |
|---|---:|---|
| Static diff review | yes | `.privateproject/memory/EVIDENCE_LOG.md` |
| Build | yes/no | `.privateproject/reports/YYYY-MM-DD-verification.md` |
| Unit tests | yes/no | `.privateproject/reports/YYYY-MM-DD-verification.md` |
| Manual/E2E | yes/no | `.privateproject/reports/YYYY-MM-DD-verification.md` |

## Evidence

| Evidence ID | Level | Summary |
|---|---|---|
| EVID-YYYYMMDD-001 | not_checked | <pending> |

## Open Questions

- <question or `None`>

## Handoff

<What a fresh agent needs to know to continue safely.>
