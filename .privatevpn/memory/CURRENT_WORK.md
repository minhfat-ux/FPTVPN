# CURRENT_WORK.md

Current task tracked here (schema per spec §31). Structured state also in
`.privatevpn/status/project.json`.

| Field | Value |
|-------|-------|
| Task ID | TASK-G1-SKELETON / TASK-G2-WIREGUARD-INTEGRATION |
| Objective | GATE 1: iOS app + Packet Tunnel skeleton, real state model, build succeeds, unit tests pass. GATE 2 prep: WireGuard framework integrated, keypair + real tunnel path implemented. |
| Requirement IDs | FR-VPN-005, FR-DIAG-001, NFR-UX-001, NFR-PERF-001, NFR-REL-001, NFR-OBS-001, NFR-SEC-003 |
| Requirement baseline | RS-20260819-01 |
| Rule baseline | RULESET-0001 |
| Expert consultations | none yet; GATE 2 WireGuard wiring in progress |
| Assigned agent/runtime | Culi (orchestrator) |
| Status | GATE 1 COMPLETED; GATE 2 WireGuard integration CODE DONE + device build OK (uncommitted) |
| Files in scope | docs/, .privatevpn/, evidence/, project.yml, iOS/, README.md, .gitignore, Vendor/WireGuardKit/ |
| Dependencies | xcodegen 2.46.0, Go 1.26.6 (homebrew, for libwg-go.a) |
| Acceptance criteria | GATE 1 builds (BUILD SUCCEEDED) + unit tests pass (9/9); GATE 2 prep: WireGuardKit vendored + device build links libwg-go.a |
| Expected evidence | `evidence/builds/2026-08-19-gate1-simulator-build.log`, `evidence/builds/2026-08-19-gate1-tests.log` |
| Start commit | fafbf5b (GATE 0) |
| End commit | e23eae9 (GATE 1 skeleton — build ✓, tests ✓) |

## Next task (continuation rule §103)

- GATE 1 formal gate review (verifier authority).
- GATE 2 (Static Real Tunnel): WireGuard framework + keypair + real tunnel path
  implemented and device-build verified; **BLOCKED for real connect** — needs
  physical iPhone + server/control-plane credentials (endpoint + peer public key).
