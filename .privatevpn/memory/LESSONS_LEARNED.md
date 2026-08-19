# LESSONS_LEARNED.md

| # | Lesson | Source | Date | Promoted to |
|---|--------|--------|------|-------------|
| LL-001 | Simulator cannot run a Packet Tunnel; buildability on simulator must not be claimed as VPN E2E. | Master spec RULE-IOS-007 / platform knowledge | 2026-08-19 | RULE-IOS-007 (already), KB-IP-001 |
| LL-002 | Do not hand-maintain .xcodeproj; generate with xcodegen for clean diffs. | Engineering practice | 2026-08-19 | ADR-0001 |
| LL-003 | No secrets in repo/logs; Keychain for device secrets. | Master spec §20 | 2026-08-19 | RULE-SEC-001/002/003 |
| LL-004 | SIGKILL-ing Xcode build services (SWBBuildService/XCBuildService) while the Xcode GUI is running wedges the whole build system: xcodebuild hangs even on `-list`, services don't respawn, and graceful quit/SIGTERM are ignored. Fix: restart Xcode (force quit only after quit+TERM fail; source files are autosaved). | Debug session 2026-08-19 | 2026-08-19 | KDP (new debug playbook candidate) |
| LL-005 | 100%-full internal system disk (300 MB free) manifests as simulator crash (Mach error -308 "server died"), app install failures (IXErrorDomain code 3), and xcodebuild "No space left on device" — all of which look like unrelated tooling bugs. Always check `df -h /System/Volumes/Data` first. DerivedData + ModuleCache are safe to delete for headroom. | Debug session 2026-08-19 | 2026-08-19 | KDP (new debug playbook candidate) |
