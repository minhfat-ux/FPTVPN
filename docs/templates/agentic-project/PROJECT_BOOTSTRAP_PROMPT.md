# Project Bootstrap Prompt

Use this prompt when starting a new project with an agent that should follow the
repo-backed memory, evidence, verification, and secondary-agent workflow.

```text
You are the main coding agent for this project.

Before writing product code, initialize or verify the repo-backed agent workflow:

1. Create or verify these project docs:
   - docs/SRS.md
   - docs/ARCHITECTURE.md
   - docs/DEVELOPMENT.md
   - docs/RELEASE_CHECKLIST.md
   - docs/AGENTIC_PROJECT_WORKFLOW.md

2. Create or verify private project memory:
   - .privateproject/memory/CURRENT_WORK.md
   - .privateproject/memory/CURRENT_TASK.md
   - .privateproject/memory/PROJECT_STATE.md
   - .privateproject/memory/DECISIONS.md
   - .privateproject/memory/VERIFIED_FACTS.md
   - .privateproject/memory/OPEN_QUESTIONS.md
   - .privateproject/memory/LESSONS_LEARNED.md
   - .privateproject/memory/EVIDENCE_LOG.md

3. Create or verify reusable templates and rules:
   - docs/templates/agentic-project/RULES.md
   - docs/templates/agentic-project/CURRENT_TASK.md
   - docs/templates/agentic-project/AGENT_HANDOFF.md
   - docs/templates/agentic-project/EVIDENCE_LOG.md
   - docs/templates/agentic-project/VERIFICATION_REPORT.md
   - docs/templates/agentic-project/REVIEWER_PROMPT.md
   - docs/templates/agentic-project/PROJECT_BOOTSTRAP_PROMPT.md

4. Create a local RAG helper if useful for this project:
   - .privateproject/tools/rag_search.py
   - .privateproject/tools/RAG_README.md

Rules:
- Source code and repo-backed docs are authoritative.
- Chat history is not durable memory.
- One main agent owns final repo state.
- Secondary agents may only review, plan, or edit isolated scopes.
- No evidence means not verified.
- Every meaningful task must update CURRENT_TASK or CURRENT_WORK.
- Every verification must be recorded in EVIDENCE_LOG or a verification report.
- Never commit secrets, local credentials, private keys, generated caches, or tmp files.
- Add .privateproject/tmp/, secrets/, .tmp/, and local env files to .gitignore.
- Before commit: check git status, review staged diff, run relevant validation.

Workflow for every task:
1. Read memory and docs first.
2. Use local RAG/search to gather relevant context.
3. Write or update CURRENT_TASK with objective, scope, owner, expected files, and validation plan.
4. Implement only scoped changes.
5. Validate with commands or manual steps.
6. Record evidence.
7. Write handoff if incomplete, delegated, blocked, or risky.
8. Commit only intentional changes.

For large work:
- Split tasks by file/module ownership.
- Use secondary agents only for isolated implementation or review.
- Main agent reviews all secondary output before merging.

Now initialize this project workflow, then propose the first implementation plan.
```

## Existing Repo Session Prompt

Use this shorter prompt when starting a new session inside a repo that already
has the workflow files:

```text
Read docs/AGENTIC_PROJECT_WORKFLOW.md, docs/templates/agentic-project/RULES.md,
and .privateproject/memory/*.md first. Follow that workflow exactly: update
CURRENT_TASK, use RAG/search before planning, record evidence for verification,
and do not commit secrets or generated caches.
```

Replace `.privateproject` with the project-specific memory directory, such as
`.privatevpn`, `.privatecrm`, or `.privateadmin`.
