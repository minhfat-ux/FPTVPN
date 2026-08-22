# Verification Report

- **Report ID:** VERIFY-YYYYMMDD-001
- **Task ID:** TASK-YYYYMMDD-001
- **Date:** YYYY-MM-DD
- **Verifier:** <agent or human>
- **Overall Result:** pass | fail | partial | not_run

## Scope

<What behavior, module, or release area was verified?>

## Environment

| Item | Value |
|---|---|
| OS | <OS/version> |
| Toolchain | <tool/version> |
| Device/Simulator | <device> |
| Backend/Service | <environment> |

## Checks

| Check | Command/Steps | Result | Evidence ID |
|---|---|---|---|
| Static review | `git diff --cached` | pass/fail | EVID-YYYYMMDD-001 |
| Build | `<command>` | pass/fail/not_run | EVID-YYYYMMDD-002 |
| Tests | `<command>` | pass/fail/not_run | EVID-YYYYMMDD-003 |
| Manual flow | `<steps>` | pass/fail/not_run | EVID-YYYYMMDD-004 |

## Findings

| Severity | Finding | Path/Area | Action |
|---|---|---|---|
| high/medium/low | <finding> | `<path>` | <next action> |

## Evidence Summary

```text
<sanitized command output or manual result summary>
```

## Not Verified

| Area | Reason | Required Before Release |
|---|---|---:|
| <area> | <reason> | yes/no |

## Conclusion

<Pass/fail/partial and what must happen next.>
