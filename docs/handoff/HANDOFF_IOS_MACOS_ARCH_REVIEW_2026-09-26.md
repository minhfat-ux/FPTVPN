# Agent Handoff

- **Agent:** reviewer
- **Task ID:** TASK-20260926-IOS-MACOS-ARCH-REVIEW
- **Date:** 2026-09-26
- **Status:** needs_review

## Summary

Static architecture review of the current iOS and macOS clients found four implementation risks for teamlead planning. The highest-risk item is macOS handling `TUNNEL_NO_TRAFFIC` differently from iOS: iOS now lets the extension self-recover, while macOS still stops the VPN tunnel. The next release-sensitive item is the update gate: the app compares marketing versions only and does not account for iOS/macOS build numbers, even though the publisher process tracks build numbers as release evidence.

## Files Changed

| Path | Change Summary |
|---|---|
| `docs/handoff/HANDOFF_IOS_MACOS_ARCH_REVIEW_2026-09-26.md` | Added reviewer handoff for iOS/macOS architecture risks and implementation plan. |

## Findings

| Severity | Area | Finding | Evidence | Recommended Fix |
|---|---|---|---|---|
| High | macOS tunnel recovery | `VPNManagerMac` handles `TUNNEL_NO_TRAFFIC` and `TUNNEL_START_FAILED` in the same branch, then sets `diagnosticHandled`, stops provider polling, refreshes status, and calls `stopVPNTunnel()`. iOS intentionally does not stop the tunnel for `TUNNEL_NO_TRAFFIC` because the extension has watchdog/rebuild/failover logic. | `mac/PrivateVPNMac/VPNManagerMac.swift:299`, `mac/PrivateVPNMac/VPNManagerMac.swift:312`, `iOS/PrivateVPN/VPNManager.swift:363` | Mirror iOS behavior on macOS: only stop the tunnel for `TUNNEL_START_FAILED`. For `TUNNEL_NO_TRAFFIC`, log once, surface a warning/status message if useful, clear stale cache if required, and let the extension recover. |
| High | Update gate | `AppVersionService` compares only `CFBundleShortVersionString` with `minimum_version` and `latest_version`. `CFBundleVersion` is exposed as `currentBuild`, but not used. `AppVersionInfo` does not decode a build field. This can miss same-version higher-build releases. | `iOS/PrivateVPN/Services/AppVersionService.swift:25`, `iOS/PrivateVPN/Services/AppVersionService.swift:31`, `iOS/PrivateVPN/Services/ControlAPIClient.swift:307`, `docs/PUBLISHER_PROCESS.md` section 4 | Add optional build fields to `AppVersionInfo` for iOS/macOS release payloads, then compare `(version, build)` for forced and optional update checks. Include build in `AppVersionInfo.id` so SwiftUI sheets refresh when only the build changes. |
| Medium | Hysteria relay/node routing | iOS and macOS prefer node-specific `hy_relay_url`, but if it is missing they fall back to global `HysteriaDefaults.relayURLCandidates`, which includes relay paths for multiple nodes. A relay only lands on one node/port, so fallback can silently dial a relay that does not match the chosen `serverHost`. | `iOS/PrivateVPN/VPNManager.swift:811`, `mac/PrivateVPNMac/VPNManagerMac.swift:774`, `iOS/PrivateVPN/Services/HysteriaDefaults.swift:33` | Build hysteria relay candidates from the selected node only. If a node has no `hy_relay_url`, either fail with a clear config error or use direct UDP only. Do not use cross-node relay candidates unless the transport ladder also changes `serverHost` to the target node. |
| Medium | Hysteria start timeout | Provider start timeout is 35 seconds, but the relay open grace is 10 seconds and there are four relay entrance candidates. Worst-case sequential attempts can need 40 seconds plus margin, so the provider may cut off before trying all configured doors. | `iOS/PrivateVPNPacketTunnel/HysteriaPacketTunnelProvider.swift:41`, `iOS/PrivateVPNPacketTunnel/HysteriaPacketTunnelProvider.swift:48`, `iOS/PrivateVPNPacketTunnel/HysteriaTransport.swift:105` | Calculate start timeout from `candidateCount * relayOpenGrace + margin`, or reduce candidate count/grace so the total budget is internally consistent. |

## Decisions Made

| Decision | Reason | Persisted In |
|---|---|---|
| Review only; no implementation changes | User asked for senior architecture review and handoff for teamlead planning, not code changes. | This handoff |
| Treat macOS `TUNNEL_NO_TRAFFIC` parity as first implementation task | It directly affects user-visible self-disconnect behavior and conflicts with the iOS-side fix already documented in code. | This handoff |

## Evidence

| Evidence ID | Verification Level | Result |
|---|---|---|
| EVID-20260926-001 | static_checked | Reviewed repo rules/docs: `docs/templates/agentic-project/RULES.md`, `docs/AGENTIC_PROJECT_WORKFLOW.md`, `docs/DEVELOPMENT.md`, `docs/SRS.md`, `docs/ARCHITECTURE.md`, `docs/IOS_TUNNEL_BANDWIDTH_AND_NETWORK_CHANGE.md`, `docs/PUBLISHER_PROCESS.md`, `docs/IOS_ADHOC_OTA.md`. |
| EVID-20260926-002 | static_checked | Reviewed source paths: `iOS/PrivateVPN/VPNManager.swift`, `mac/PrivateVPNMac/VPNManagerMac.swift`, `iOS/PrivateVPN/Services/AppVersionService.swift`, `iOS/PrivateVPN/Services/ControlAPIClient.swift`, `iOS/PrivateVPN/Services/HysteriaDefaults.swift`, `iOS/PrivateVPNPacketTunnel/HysteriaPacketTunnelProvider.swift`, `iOS/PrivateVPNPacketTunnel/HysteriaBandwidthControl.swift`. |
| EVID-20260926-003 | static_checked | `python3 scripts/ios-lint-locks.py` passed with `KẾT LUẬN: ĐẠT — không có lời gọi lấy khoá lồng nhau`. |
| EVID-20260926-004 | unit_checked | `bash scripts/ios-pure-logic-tests/run.sh` passed with `KẾT QUẢ: 517/517 PASS, 0 FAIL`. |
| EVID-20260926-005 | static_checked | Coordination check/claim completed on node-2 for this handoff file before writing. |

## Validation Performed

```text
ssh -o BatchMode=yes -o ConnectTimeout=10 -i $HOME/.ssh/fpt_vpn_node root@165.101.114.162 flowvpn-coord check docs/handoff/HANDOFF_IOS_MACOS_ARCH_REVIEW_2026-09-26.md --owner mac
```

Result:

```text
OK: khong ai khac dang giu docs/handoff/HANDOFF_IOS_MACOS_ARCH_REVIEW_2026-09-26.md
```

```text
ssh -o BatchMode=yes -o ConnectTimeout=10 -i $HOME/.ssh/fpt_vpn_node root@165.101.114.162 'flowvpn-coord claim --owner mac --area handoff-ios-macos-review --files docs/handoff/HANDOFF_IOS_MACOS_ARCH_REVIEW_2026-09-26.md --note "write iOS/macOS architecture review handoff for teamlead"'
```

Result:

```text
Da giu claim: [mac] handoff-ios-macos-review — docs/handoff/HANDOFF_IOS_MACOS_ARCH_REVIEW_2026-09-26.md (het han sau 90m)
```

```text
python3 scripts/ios-lint-locks.py
```

Result:

```text
KẾT LUẬN: ĐẠT — không có lời gọi lấy khoá lồng nhau
```

```text
bash scripts/ios-pure-logic-tests/run.sh
```

Result:

```text
KẾT QUẢ: 517/517 PASS, 0 FAIL
```

## Validation Not Performed

| Check | Reason |
|---|---|
| Xcode build | Review handoff only; no Swift source changed. |
| iOS archive / IPA verification | Not a release build task. |
| Real-device log acceptance | Requires device logs and crash reports; this was a static architecture review. |
| macOS runtime test | No implementation diff was produced. |

## Risks

- macOS may continue to self-disconnect during recoverable no-traffic windows until `VPNManagerMac` is brought to parity with iOS.
- Same-version higher-build releases may not prompt users to update until build-aware version checks are implemented.
- Cross-node hysteria relay fallback can hide a control-plane data issue by failing silently at the transport layer.
- Timeout tuning should be verified against real device logs after changing relay candidate behavior.

## Open Questions

- What exact build field names does `/v1/app-version?platform=ios|macos` return today: `ipa_build`, `mac_build`, `latest_build`, or another key?
- Should a missing `hy_relay_url` be treated as a hard configuration error, or should the clients allow direct UDP without relay fallback for that node?
- Should macOS clear `TunnelConfigCache`/`ExitNodeCache` on first `TUNNEL_NO_TRAFFIC` like iOS does, or only after a hard `TUNNEL_START_FAILED`?

## Next Recommended Step

Implementation order:

1. Update `mac/PrivateVPNMac/VPNManagerMac.swift` so `TUNNEL_NO_TRAFFIC` does not stop the tunnel.
2. Add build-aware update comparison in `AppVersionInfo` and `AppVersionService`.
3. Scope hysteria relay candidates to the selected node or fail clearly when `hy_relay_url` is missing.
4. Reconcile hysteria start timeout with relay candidate count and `relayOpenGrace`.
5. Run `python3 scripts/ios-lint-locks.py`, `bash scripts/ios-pure-logic-tests/run.sh`, Xcode diagnostics/build as appropriate, then validate final iOS/macOS release candidates with real-device logs before publishing.
