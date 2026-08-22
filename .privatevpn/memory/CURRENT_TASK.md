# Current Task

- **Task ID:** TASK-20260823-MAC-SERVER-SELECTION
- **Title:** Upgrade macOS FlowVPN server selection and connect readiness
- **Owner:** main agent
- **Status:** verified
- **Created:** 2026-08-23
- **Updated:** 2026-08-23

## Objective

macOS FlowVPN should follow the next-version backend-first server selection
flow: load exit nodes from the coordinator, show a selected server/location to
the user, and only allow Connect after a backend node is available.

## Scope

In scope:

- macOS main window server/location selector.
- macOS menu-bar server/location selector/status.
- `VPNManagerMac` node loading and connect preconditions.
- macOS build/diagnostic evidence.

Out of scope:

- iOS server selection upgrade.
- Account login / add-device model.
- Mac App Store product ID replacement.
- Real production VPN egress verification, which requires a signed run and
  Network Extension-capable provisioning profile.

## Context

- Relevant docs:
  - `docs/AGENTIC_PROJECT_WORKFLOW.md`
  - `docs/SRS.md`
  - `docs/ARCHITECTURE.md`
- Relevant memory:
  - `.privatevpn/memory/CURRENT_WORK.md`
  - `.privatevpn/memory/PROJECT_STATE.md`
  - `.privatevpn/reports/2026-08-23-secondary-review.md`
- Relevant code:
  - `mac/PrivateVPNMac/VPNManagerMac.swift`
  - `mac/PrivateVPNMac/ContentViewMac.swift`
  - `mac/PrivateVPNMac/PrivateVPNMacApp.swift`
  - `mac/PrivateVPNMac/VPNThemeMac.swift`

## Plan

| Step | Status | Owner | Notes |
|---|---|---|---|
| 1. Gather context | done | main | Read rules/memory and used local RAG |
| 2. Implement macOS server selection | done | main | Changes scoped to macOS client |
| 3. Validate diagnostics/build | done | main | Xcode diagnostics and BuildProject passed |
| 4. Record evidence | done | main | Report added under `.privatevpn/reports/` |
| 5. Commit | proposed | main | Commit only intentional changes |

## Expected File Changes

| Path | Owner | Reason |
|---|---|---|
| `mac/PrivateVPNMac/VPNManagerMac.swift` | main | Backend-first node loading and connect preconditions |
| `mac/PrivateVPNMac/ContentViewMac.swift` | main | Main-window server selector |
| `mac/PrivateVPNMac/PrivateVPNMacApp.swift` | main | Menu-bar selected server/status |
| `mac/PrivateVPNMac/VPNThemeMac.swift` | main | Localized server selector strings |
| `.privatevpn/memory/CURRENT_TASK.md` | main | Current task state |
| `.privatevpn/reports/2026-08-23-macos-server-selection.md` | main | Verification report |

## Validation Plan

| Check | Required | Evidence target |
|---|---:|---|
| Static diff review | yes | `.privatevpn/reports/2026-08-23-macos-server-selection.md` |
| Xcode diagnostics | yes | `.privatevpn/reports/2026-08-23-macos-server-selection.md` |
| Mac build | yes | `.privatevpn/reports/2026-08-23-macos-server-selection.md` |
| Real VPN egress | no | Deferred: needs signed NE-capable run |

## Evidence

| Evidence ID | Level | Summary |
|---|---|---|
| EVID-20260823-MAC-001 | static_checked | Xcode file diagnostics passed for changed macOS files |
| EVID-20260823-MAC-002 | build_checked | Xcode BuildProject passed |
| EVID-20260823-MAC-003 | not_checked | Real VPN egress not run; requires signed NE-capable profile |

## Open Questions

- Real macOS egress verification still depends on a signed Network
  Extension-capable build/profile.

## Handoff

Mac server selection upgrade is code/build verified. iOS server selection
remains a separate deferred task. Real macOS tunnel egress still requires a
signed run with an NE-capable provisioning profile.
