# CURRENT_WORK.md

Current task tracked here (schema per spec §31). Structured state also in
`.privatevpn/status/project.json`.

| Field | Value |
|-------|-------|
| Task ID | TASK-G2-WIREGUARD-INTEGRATION / TASK-G3-CONTROL-PLANE |
| Objective | GATE 2: WireGuard framework integrated, keypair + real tunnel path implemented. GATE 3: control plane (device registration, IP allocation, peer provisioning) implemented. |
| Requirement IDs | FR-VPN-001..005, FR-DEVICE-001/002, FR-PROVISION-001/002, NFR-SEC-001, NFR-UX-001, NFR-PERF-001, NFR-REL-001 |
| Requirement baseline | RS-20260819-01 |
| Rule baseline | RULESET-0001 |
| Expert consultations | none yet; GATE 2 WireGuard wiring done |
| Assigned agent/runtime | Culi (orchestrator) |
| Status | GATE 1 COMPLETED; GATE 2 code complete + device build verified; GATE 3 control plane implemented + smoke-tested |
| Files in scope | docs/, .privatevpn/, evidence/, project.yml, iOS/, control-plane/, README.md, .gitignore, Vendor/WireGuardKit/ |
| Dependencies | xcodegen 2.46.0, Go 1.26.6 (homebrew, for libwg-go.a), Node.js >= 18 (control plane) |
| Acceptance criteria | GATE 1 builds + tests pass (done); GATE 2: WireGuardKit vendored + device build links libwg-go.a (done); GATE 3: control plane registers device, allocates IP, provisions peer (smoke-verified, real node pending) |
| Expected evidence | `evidence/builds/2026-08-19-gate1-*.log`, `evidence/builds/2026-08-19-gate2-wireguard-device-build.log`, `evidence/builds/2026-08-19-gate2-device-build-verify.log`, `evidence/2026-08-19-control-plane-smoke.md` |
| Start commit | fafbf5b (GATE 0) |
| End commit | 464d793 (control-plane) — GATE 2/3 code |

## Next task (continuation rule §103)

- GATE 3/4: revoke UI (FR-REVOKE-001/002), auth flow (FR-AUTH-001), admin visibility
  (FR-ADMIN-001) — deploy control plane + decide auth approach first.
- GATE 2 formal gate review (verifier authority) + real-device E2E (blocked: needs
  physical iPhone + Vietnam node credentials).
