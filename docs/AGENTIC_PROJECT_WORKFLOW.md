# Agentic Project Workflow

- **Version:** v0.1
- **Date:** 2026-08-23
- **Scope:** reusable workflow for future software projects using Codex, local RAG,
  and secondary code agents.

## 1. Goal

Use one primary coding agent to own the repo state, while using local retrieval
and secondary agents for focused review, planning, and parallel investigation.

The primary rule is simple:

```text
One main agent edits, validates, commits, and pushes.
Other agents advise, review, or work in isolated worktrees.
```

## 2. Recommended project structure

Each project should keep a small local operating layer next to the source code:

```text
.privateproject/
  memory/
    CURRENT_WORK.md
    DECISIONS.md
    LESSONS_LEARNED.md
    OPEN_QUESTIONS.md
    PROJECT_STATE.md
    VERIFIED_FACTS.md
  prompts/
    PLATFORM_CLONE_PROMPT.md
    RELEASE_REVIEW_PROMPT.md
    ARCHITECTURE_REVIEW_PROMPT.md
  tools/
    rag_search.py
    RAG_README.md
  tmp/
docs/
  SRS.md
  ARCHITECTURE.md
  DEVELOPMENT.md
  RELEASE_CHECKLIST.md
  AGENTIC_PROJECT_WORKFLOW.md
```

Use a project-specific directory name such as `.privatevpn/`, `.privatecrm/`, or
`.privateadmin/` when useful. Keep the internal structure consistent.

## 3. Git policy

Commit:

- Reusable documentation.
- Architecture decisions.
- Prompt templates that contain no secrets.
- Local RAG helper source code.
- Product requirements and release checklist.

Do not commit:

- `.privateproject/tmp/`
- RAG indexes or caches.
- VPS credentials.
- SSH private keys.
- `.env` files with live tokens.
- App Store, Play Console, or payment provider credentials.

Add the private paths to `.gitignore`:

```gitignore
.privateproject/tmp/
secrets/
.tmp/
*.local.env
```

## 4. Agent roles

| Role | Tool examples | Responsibility |
|---|---|---|
| Main implementer | Codex | Read code, make scoped edits, run validation, review diff, commit, push |
| Local retrieval | RAG helper | Retrieve relevant code/docs/memory before planning or prompting another agent |
| Parallel worker | Codex sub-agent, Cline | Implement a bounded task in a disjoint file/module scope |
| Reviewer | DSH, opencode, Hermes | Provide second opinion, checklist review, architecture risks, test gaps |
| Planner | Cline plan mode, DSH headless | Produce implementation plan without editing files |

## 5. Default workflow

1. Capture the user request in `memory/CURRENT_WORK.md` if it changes product
   direction or affects later releases.
2. Query local RAG for relevant code, docs, decisions, and known issues.
3. Let the main agent inspect the authoritative files.
4. For large tasks, split work by ownership:
   - iOS app files
   - macOS app files
   - backend/coordinator files
   - docs and release checklist
5. Use secondary agents only for scoped tasks or review.
6. Main agent reviews every diff before accepting it.
7. Run the smallest useful validation first, then broader build/test checks.
8. Commit only intentional changes.
9. Push only after validating that secrets and generated caches are excluded.

## 6. Local RAG usage

Use RAG before asking broad questions or handing context to another agent:

```bash
python3 .privateproject/tools/rag_search.py --rebuild
python3 .privateproject/tools/rag_search.py "server selection connect flow" --limit 8
python3 .privateproject/tools/rag_search.py "release checklist storekit payment" --limit 8
```

Feed the retrieved snippets into the reviewer prompt. Do not ask external agents
to infer repo state without context.

## 7. Secondary agent usage

Use secondary agents for independent work, not for uncontrolled repo mutation.

Good tasks:

- "Review these files for release-blocking issues. Do not edit."
- "Plan the Android clone from this iOS/macOS SRS. Do not edit."
- "In a separate worktree, update only backend admin docs."
- "Compare StoreKit flow against the release checklist."

Avoid:

- Allowing multiple agents to edit the same files.
- Giving auto-approve permissions during release work.
- Letting a secondary agent commit or push.
- Sending secrets, private keys, or live credentials in prompts.

## 8. Suggested commands

### Codex sub-agent

Use for parallel codebase questions or disjoint implementation slices. The main
agent must integrate and review results.

### Cline

Plan-only mode:

```bash
cline -p --cwd . "Plan the next-version server selection upgrade. Do not edit files."
```

Isolated implementation:

```bash
cline --worktree --cwd . "Update only docs for the backend node admin flow."
```

### opencode

One-shot review:

```bash
opencode run --dir . "Review docs/SRS.md and docs/RELEASE_CHECKLIST.md for gaps."
```

With a model override:

```bash
opencode run --dir . -m deepseek/deepseek-v4-flash "Review this architecture plan."
```

### DSH

Headless reviewer:

```bash
dsh --profile headless "Review the release plan using the provided RAG snippets."
```

Web mode:

```bash
dsh web
```

### Hermes

Single review query:

```bash
hermes-agent -q "Review the backend coordinator risk list for production launch."
```

## 9. Release safety checklist

Before release or publish:

- `git status --short` contains only expected files.
- `.gitignore` excludes caches, secrets, local keys, and temporary artifacts.
- No agent-generated file contains credentials.
- All product decisions are reflected in `docs/SRS.md` or equivalent.
- Platform clone prompts are updated when product flow changes.
- Main app and extensions build in the release scheme.
- App payment/free-trial behavior is checked against store configuration.
- Backend endpoints used by the app are documented and reachable.
- A reviewer agent has checked for missing release blockers.

## 10. Prompt template for reviewer agents

```text
You are reviewing this project as a secondary agent.

Rules:
- Do not edit files.
- Do not commit or push.
- Do not request or expose secrets.
- Use only the provided snippets and explicit file paths.
- Focus on release blockers, architecture risks, missing tests, and unclear requirements.

Context:
<paste RAG snippets and relevant docs here>

Task:
Review the requested area and return:
1. Findings ordered by severity.
2. File paths or docs sections involved.
3. Recommended next actions.
4. Questions that block implementation.
```

## 11. Prompt template for platform cloning

```text
You are cloning an existing product to a new platform.

Rules:
- Preserve product behavior unless explicitly changed.
- Treat SRS, architecture docs, and current memory as source of truth.
- Do not invent backend endpoints.
- Keep platform-specific implementation idiomatic.
- Identify differences caused by OS permissions, app store policy, payment APIs,
  networking APIs, and background execution limits.

Inputs:
- Product SRS
- Current architecture document
- Release checklist
- Existing platform UI and flow notes
- Backend API contract

Output:
1. Platform architecture.
2. Screen and state flow.
3. API integration plan.
4. Permission and entitlement requirements.
5. Payment/subscription handling.
6. Test plan.
7. Release checklist.
8. Open questions.
```

## 12. Operating rule

When in doubt, keep the main repo conservative:

```text
Retrieve context first.
Plan with evidence.
Edit in one owner lane.
Review with another model.
Validate locally.
Commit only clean, intentional changes.
```
