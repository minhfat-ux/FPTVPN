# CURRENT_WORK.md

Current task tracked here (schema per spec §31). Structured state also in
`.privatevpn/status/project.json`.

| Field | Value |
|-------|-------|
| Task ID | TASK-G2-MESH-EXITNODE / TASK-G3-ACCOUNT-MULTIDEVICE (next) |
| Objective | GATE 2/3: Tailscale-style WireGuard mesh with VPS coordinator + exit node. macOS app registers + connects via wg-quick; iOS app same client, device blocked. NEXT: account login + add device (user owns many devices). |
| Requirement IDs | FR-VPN-001..005, FR-DEVICE-001/002, FR-PROVISION-001/002, FR-AUTH-001, NFR-SEC-001, NFR-UX-001, NFR-PERF-001, NFR-REL-001 |
| Requirement baseline | RS-20260819-01 |
| Rule baseline | RULESET-0001 |
| Expert consultations | none yet; mesh/coordinator integration done (2026-08-21) |
| Assigned agent/runtime | Culi (orchestrator) |
| Status | macOS app RUNS (registers + wg-quick). Coordinator mesh + exit-node registry verified. iOS real-device blocked. |
| Files in scope | iOS/, mac/PrivateVPNMac/, project.yml, Vendor/WireGuardKit/, control-plane/ (superseded), scripts/mac-test.sh, docs/, .privatevpn/, evidence/ |
| Dependencies | xcodegen 2.46.0, Go 1.26.6, Node 24 (VPS coordinator), wg/wg-quick (macOS), sshpass (ops) |
| Acceptance criteria | macOS connect end-to-end (needs manual sudo wg-quick). iOS device E2E blocked by Xcode DDI. Exit-node list from backend works. |
| Expected evidence | coordinator /v1/peers/register returns overlay IP; wg0 auto-provisions peer; /v1/nodes lists exit nodes; macOS app build/launch |
| Start commit | fafbf5b (GATE 0) |
| End commit | af972a9 (exit-node registry + server list + macOS toggle) |

## Next task (continuation rule §103)

- **Design + build account login & add-device (Tailscale-style)**: users table,
  auth (email+password or token), user→devices ownership, device list UI, revoke.
- Confirm macOS end-to-end tunnel (user runs `sudo wg-quick up`, verify exit IP).
- Update SRS/ARCHITECTURE for Tailscale model + macOS target.
- Push iOS app to FPTVPN repo.
- iOS real-device E2E (blocked: reinstall Xcode for iOS 26.6 DeviceSupport).
