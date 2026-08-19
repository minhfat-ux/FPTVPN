# VERIFIED_FACTS.md

Only evidence-backed statements. Agent/Expert claims are never promoted directly
(RULE-MEM-004, RULE-GLOBAL-001).

| # | Fact | Evidence | Date |
|---|------|----------|------|
| VF-001 | Development environment: Xcode 26.6 (17F113), Swift 6.3.3, iOS SDK 26.5 simulators, xcodegen 2.46.0 installed, git 2.50.1 user MinhNb2 | `evidence/environment_audit.md` (raw command output) | 2026-08-19 |
| VF-002 | A codesigning identity for minhnb2@me.com exists on this Mac | `evidence/environment_audit.md` | 2026-08-19 |
| VF-003 | Repo was empty at start (no commits); git status verified | `evidence/environment_audit.md` | 2026-08-19 |
| VF-004 | (pending) App + extension build with xcodebuild succeeds | `evidence/builds/` | after GATE 1 |

NOT verified: any VPN connectivity, public-IP change, DNS/HTTPS through tunnel,
revocation. These require GATE 2+/real device.
