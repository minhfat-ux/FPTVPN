# Evidence Log

Only write evidence that is reproducible, reviewable, and sanitized.

| Evidence ID | Date | Task/Requirement | Level | Result | Evidence | Notes |
|---|---|---|---|---|---|---|
| EVID-YYYYMMDD-001 | YYYY-MM-DD | TASK-YYYYMMDD-001 | not_checked | pending | <path or command> | <notes> |

## Evidence Levels

| Level | Meaning |
|---|---|
| `not_checked` | No verification run |
| `static_checked` | Code/config/docs reviewed |
| `build_checked` | Build or compile command completed |
| `unit_checked` | Unit test suite completed |
| `integration_checked` | Local integration flow completed |
| `manual_checked` | Human/device workflow completed |
| `production_checked` | Live production behavior completed |

## Sanitization Rules

- Redact tokens, passwords, private keys, account IDs, Apple team IDs when needed.
- Do not paste full secret-bearing logs.
- Prefer command, timestamp, summary, and redacted excerpts.
- Store large artifacts in ignored local folders if they contain sensitive data.
