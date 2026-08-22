# Agentic Project Template Pack

Copy this folder into a new project when the project will use Codex, local RAG,
and secondary code agents.

Recommended target layout:

```text
.privateproject/
  memory/
    CURRENT_TASK.md
    CURRENT_WORK.md
    DECISIONS.md
    EVIDENCE_LOG.md
    LESSONS_LEARNED.md
    OPEN_QUESTIONS.md
    PROJECT_STATE.md
    VERIFIED_FACTS.md
  handoffs/
    YYYY-MM-DD-agent-task.md
  reports/
    YYYY-MM-DD-verification.md
  prompts/
    REVIEWER_PROMPT.md
  tmp/
docs/
  AGENTIC_PROJECT_WORKFLOW.md
```

## Files in this template pack

| File | Purpose |
|---|---|
| `RULES.md` | Shared operating rules for agents, evidence, verification, memory, and git |
| `CURRENT_TASK.md` | Active task tracking template |
| `AGENT_HANDOFF.md` | Per-agent completion/handoff template |
| `EVIDENCE_LOG.md` | Evidence registry template |
| `VERIFICATION_REPORT.md` | Build/test/manual verification report template |
| `REVIEWER_PROMPT.md` | Prompt template for DSH, opencode, Hermes, Cline, or another reviewer |

## Minimum setup checklist

- Rename `.privateproject/` to the project-specific private directory if needed.
- Add `.privateproject/tmp/`, `secrets/`, `.tmp/`, and local env files to
  `.gitignore`.
- Keep templates that contain no secrets in git.
- Keep generated indexes, local credentials, and machine-only artifacts out of
  git.
- Make one main agent responsible for final diff review, validation, commit, and
  push.
