# CURRENT_WORK.md

Current task tracked here (schema per spec §31). Structured state also in
`.privatevpn/status/project.json`.

| Field | Value |
|-------|-------|
| Task ID | TASK-G1-SKELETON |
| Objective | GATE 1: iOS app + Packet Tunnel skeleton, real state model, build succeeds, unit tests pass. |
| Requirement IDs | FR-VPN-005, FR-DIAG-001, NFR-UX-001, NFR-PERF-001, NFR-REL-001, NFR-OBS-001, NFR-SEC-003 |
| Requirement baseline | RS-20260819-01 |
| Rule baseline | RULESET-0001 |
| Expert consultations | none yet (bootstrap); planned for GATE 2 WireGuard wiring |
| Assigned agent/runtime | Culi (orchestrator) |
| Status | COMPLETED (evidence recorded; formal gate review pending) |
| Files in scope | docs/, .privatevpn/, evidence/, project.yml, iOS/, README.md, .gitignore |
| Dependencies | xcodegen 2.46.0 (installed) |
| Acceptance criteria | GATE 1 builds (BUILD SUCCEEDED) + unit tests pass (9/9) |
| Expected evidence | `evidence/builds/gate1-simulator-build.log`, `evidence/builds/gate1-simulator-tests.log`, `evidence/gate1-verification.md` |
| Start commit | fafbf5b (GATE 0) |
| End commit | (set after GATE 1 commit) |

## Next task (continuation rule §103)

- GATE 1 formal gate review (verifier authority).
- GATE 2 (Static Real Tunnel): BLOCKED — needs physical iPhone + server/control-plane credentials.
