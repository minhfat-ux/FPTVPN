# LESSONS_LEARNED.md

| # | Lesson | Source | Date | Promoted to |
|---|--------|--------|------|-------------|
| LL-001 | Simulator cannot run a Packet Tunnel; buildability on simulator must not be claimed as VPN E2E. | Master spec RULE-IOS-007 / platform knowledge | 2026-08-19 | RULE-IOS-007 (already), KB-IP-001 |
| LL-002 | Do not hand-maintain .xcodeproj; generate with xcodegen for clean diffs. | Engineering practice | 2026-08-19 | ADR-0001 |
| LL-003 | No secrets in repo/logs; Keychain for device secrets. | Master spec §20 | 2026-08-19 | RULE-SEC-001/002/003 |
