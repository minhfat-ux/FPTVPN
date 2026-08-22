# Agentic Project Rules

These rules are reusable across projects. Project-specific rules may add
constraints, but should not weaken these defaults.

## 1. Authority

- Source code and repo-backed docs are authoritative.
- Chat history is context, not durable project state.
- Agent-local memory is cache, not truth.
- Important decisions must be written to repo-backed memory or docs.
- Fresh agents must be able to continue from files in the repo.

## 2. Agent Ownership

- One main agent owns the final repo state.
- Secondary agents may review, plan, or edit only in assigned file/module scopes.
- Multiple agents must not edit the same file set at the same time.
- Secondary agents must not commit or push unless explicitly promoted to main
  owner for that task.
- All secondary-agent changes must be reviewed by the main agent before merge.

## 3. Evidence

- No evidence means not verified.
- Evidence must map to a requirement, task, bug, or release checklist item.
- Evidence must be reviewable and reproducible.
- Agent narrative alone is not evidence.
- Secret-bearing evidence must be sanitized before it is written to docs.
- Contrary evidence invalidates stale verification.

Acceptable evidence examples:

- Build command and result.
- Test command and result.
- Manual reproduction steps and observed output.
- Screenshot path or screen recording path, if it contains no secrets.
- API request/response summary with tokens redacted.
- Store/admin dashboard setting summary, with account identifiers redacted.

## 4. Verification

- Build pass does not equal product pass.
- Mock tests do not satisfy final real-device or real-service acceptance.
- Bug fixes require regression verification where practical.
- Affected verified behavior must be retested after changes.
- Do not hide test failures.
- Product-critical flows need manual or E2E verification before release.
- Security-sensitive features need negative tests where relevant.

Verification levels:

| Level | Meaning | Examples |
|---|---|---|
| `not_checked` | No verification run | Fresh implementation, docs-only claim |
| `static_checked` | Reviewed code/config only | Diff review, lint-style check |
| `build_checked` | Build or compile succeeded | Xcode build, package build |
| `unit_checked` | Unit tests passed | XCTest, Testing, Jest, pytest |
| `integration_checked` | Local service integration passed | API + DB, app + local backend |
| `manual_checked` | Human/device workflow verified | Install, login, connect, purchase |
| `production_checked` | Live production behavior verified | Store, live backend, live payment |

## 5. Memory Updates

Update memory when:

- Product direction changes.
- A release blocker is found or resolved.
- A technical decision affects future work.
- A task is left incomplete.
- A workaround or temporary unlock is added.
- A platform clone prompt needs to inherit a behavior.

Do not write unverified claims into `VERIFIED_FACTS.md`.

## 6. Task Tracking

Each active task should have:

- Objective.
- Scope.
- Owner.
- Status.
- Files expected to change.
- Validation plan.
- Evidence links.
- Open questions.
- Handoff notes.

Allowed statuses:

| Status | Meaning |
|---|---|
| `proposed` | Not started |
| `in_progress` | Actively being worked |
| `blocked` | Cannot progress without input or external state |
| `needs_review` | Work complete, awaiting review |
| `verified` | Validated with evidence |
| `done` | Merged/committed/pushed or otherwise closed |
| `deferred` | Explicitly moved to a future version |

## 7. Git Safety

- Never commit secrets.
- Never revert unrelated user changes.
- Review `git status --short` before committing.
- Review staged diff before committing.
- Commit only intentional changes.
- Generated caches and local indexes must stay ignored.
- Use clear commit messages that describe the actual change.

## 8. Reviewer Agent Rules

Reviewer agents must:

- Avoid edits unless explicitly assigned a worker task.
- Report findings first, ordered by severity.
- Include file paths or doc sections.
- Separate facts from assumptions.
- State what evidence they used.
- State missing evidence.
- Avoid exposing secrets.

## 9. Worker Agent Rules

Worker agents must:

- Stay within assigned file/module ownership.
- Assume other agents or users may be changing the repo.
- Avoid reverting unrelated edits.
- List every changed file in the final handoff.
- Provide validation performed and validation not performed.
- Stop and report if assigned scope conflicts with existing changes.
