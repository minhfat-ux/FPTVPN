# SECONDARY REVIEW — iOS publish-prep release readiness (REVIEWER_PROMPT.md)

- **Report ID:** VERIFY-20260823-001
- **Task ID:** TASK-IOS-PROD-PUBLISH-PREP (active) / TASK-G3-ACCOUNT-MULTIDEVICE (next)
- **Date:** 2026-08-23
- **Verifier:** DSH secondary reviewer (Codex-style agentic workflow, `docs/AGENTIC_PROJECT_WORKFLOW.md`)
- **Overall Result:** **partial** — proceed with caveats; release blocked until 4 checks are closed
- **Rule baseline:** RULESET-0001 · **Requirement baseline:** RS-20260819-01

> Reviewer role: read-only. No files were edited, committed, or pushed during this
> review (RULES.md §8 Reviewer Agent Rules). Evidence used: RAG index (148 files,
> rebuilt 2026-08-23), memory files, docs, and source inspection listed below.

---

## 1. Scope

Release-readiness review of the iOS FlowVPN App Store publish-prep state, with
focus on release blockers, architecture/security risks, missing tests, unclear
requirements, and user-facing regressions. Backend (VPS coordinator) state is
not reachable from this repo and is flagged as missing evidence where relevant.

## 2. Environment

| Item | Value |
|---|---|
| OS | macOS (Darwin, Apple Silicon) |
| Toolchain | Xcode 26.6 (17F113), Swift 6.3.3, xcodegen 2.46.0 |
| Device/Simulator | iOS 26.5 simulators (build only — RULE-IOS-007) |
| Backend/Service | VPS coordinator `https://api.meetflowai.site` (node:sqlite, port 7777, Caddy TLS) |
| Repo | `main` @ d5064bd; working tree clean at review time |

## 3. RAG snippets (retrieved 2026-08-23, `rag_search.py --rebuild` → 148 files)

- **server selection connect flow** → `CURRENT_WORK.md` "Next task: backend-first
  server selection (iOS+macOS)"; `docs/SRS.md` A8; `docs/FLOWVPN_ANDROID_WINDOWS_PROMPT.md`
  "load `/v1/nodes` before enabling Connect".
- **exit node backend selection** → SRS A4: `GET /v1/nodes` public; admin qua SSH
  tunnel; `CURRENT_WORK.md` "dynamic exit-node selection".
- **iOS publish archive upload** → `CURRENT_WORK.md` "Clean Build Folder → Archive →
  Validate → Upload"; `.privatevpn/status/project.json` blockers; `VERIFIED_FACTS.md`
  "NOT verified for iOS publish: Archive, Validate, Upload, processing, review".
- **release checklist storekit payment** → `docs/AGENTIC_PROJECT_WORKFLOW.md` §12.
- **macOS Premium temporary unlock** → `DECISIONS.md` 2026-08-23 (MacSubscriptionStore only).

## 4. Source inspected

- `iOS/PrivateVPN/ContentView.swift`, `SettingsView.swift` (SubscriptionStore + PaywallView)
- `iOS/PrivateVPN/VPNManager.swift`, `VPNState.swift`
- `iOS/PrivateVPN/Services/ControlAPIClient.swift`, `VPNConfigStore.swift`,
  `KeychainStore.swift`, `WireGuardConfig.swift`, `VPNLocation.swift`, `DeviceIdentity.swift`
- `iOS/PrivateVPNPacketTunnel/PacketTunnelProvider.swift`
- `iOS/PrivateVPN/Info.plist`, `project.yml`
- Memory: `PROJECT_STATE.md`, `CURRENT_WORK.md`, `DECISIONS.md`, `VERIFIED_FACTS.md`, `status/project.json`

---

## 5. Findings (ordered by severity)

### HIGH — release blockers

**H1. Public `/v1/tokens` bootstrap + no subscription-backed enrollment = paywall/revocation bypass (MUST verify production)**
- Path: `iOS/PrivateVPN/VPNManager.swift:132-133` (`bootstrap.fetchJoinToken()` — no auth),
  `iOS/PrivateVPN/Services/ControlAPIClient.swift:145-167` (`POST /v1/tokens`).
- Facts: app mints a fresh join token on every Connect; token is single-use, 30-min
  expiry. SRS Appendix A2 + `DECISIONS.md` require production tokens to be issued for a
  registered user with an active subscription, and the public bootstrap endpoint must be
  disabled outside local/internal builds. FR-AUTH-001 is still NOT_STARTED.
- Impact: if production still serves unauthenticated `POST /v1/tokens`, anyone with the
  app can mint a token, register a peer, and use the exit node for free (paywall bypass),
  and revocation is trivially bypassed (revoked device mints a new token + new name).
  Coordinator code lives on the VPS, not in this repo → **no evidence available here**.
- Missing evidence: `curl -X POST https://api.meetflowai.site/v1/tokens` (no auth) status.
- Fix: close public bootstrap or bind tokens to user+subscription before App Store
  submission; otherwise document explicitly in Review Notes with a follow-up plan.

**H2. Real-device E2E (exit IP / DNS / HTTPS / reconnect / revoke) not verified after latest changes**
- Facts: `VERIFIED_FACTS.md` tail: "NOT verified: latest iOS/macOS production end-to-end
  VPN connectivity, public-IP change, DNS/HTTPS through tunnel, reconnect/disconnect".
  `status/project.json` GATE_2="VERIFIED" rests on build + unit tests + coordinator smoke —
  not `production_checked` (RULE-VPN-001/002, RULE-IOS-007).
- Impact: Apple review will tap Connect on a real device; a broken tunnel path = rejection.
- Missing evidence: `manual_checked`/`production_checked` — public IP == 103.173.155.50,
  DNS, HTTPS, disconnect/reconnect.

### MEDIUM

**M1. Keychain access group hardcodes team prefix `G6XW3RN6LJ.com.privatevpn.shared`**
- Path: `iOS/PrivateVPN/Services/KeychainStore.swift:90`, `iOS/PrivateVPNPacketTunnel/PacketTunnelProvider.swift:86`.
- Facts: entitlements use `$(AppIdentifierPrefix)com.privatevpn.shared`;
  `evidence/environment_audit.md` lists 4 signing identities (incl. minhnb2@me.com
  K2QKJ93A6V and FPT SOFTWARE 1D563CAF).
- Impact: if the release archive is signed with a team other than G6XW3RN6LJ, the extension
  cannot read the private key → tunnel fails at start with "Missing WireGuard private key
  in shared Keychain" (hard to diagnose).
- Fix: pin release signing to G6XW3RN6LJ and verify the access group matches; or de-hardcode.

**M2. Optimistic `state = .connecting` before `startVPNTunnel()`**
- Path: `iOS/PrivateVPN/VPNManager.swift:70`.
- Facts: ADR-0004 forbids setting state from button taps; `.connecting` is set before the
  system confirms. Mitigated by the NEVPNStatusDidChange observer (overwrites) and the
  `catch` (sets `.failed`). `try manager?.connection.startVPNTunnel()` is optional-chained:
  if `manager == nil`, no error is thrown and the UI can stick at `.connecting`.
- Fix: guard `manager != nil` before start; drive state from `connection.status`.

**M3. Backend-first server selection (SRS A8) not implemented on iOS**
- Path: `iOS/PrivateVPN/VPNManager.swift:192-199` (hardcoded `vietnam-1` fallback),
  `iOS/PrivateVPN/Services/VPNConfigStore.swift:67-75,125-130`, `VPNLocation.swift` (preset).
- Facts: A8 requires Connect to build config only from a backend-selected node; hardcoded
  nodes only as DEBUG fallback. Today, if `/v1/nodes` fails, the app still connects to the
  hardcoded node on the production path. Recorded as the next task — not a publish blocker,
  but tracked drift.

**M4. No automated tests for SubscriptionStore / VPNManager.connect path**
- Facts: 39/39 tests cover ControlAPIClient, DeviceIdentity, KeychainStore, VPNConfigStore,
  VPNState, WireGuardConfig. `refreshEntitlements` (expiry/revocation), `purchase`/`restore`,
  and `provisionViaControlPlane` have no coverage. The `#if DEBUG return true` bypass in
  `isSubscribed` (`SettingsView.swift:110-116`) is compile-time and safe for Release, but
  there is no test asserting the bypass is absent in Release.

**M5. `VPNConfigStore.init` wipes `controlPlaneURL` on every launch**
- Path: `iOS/PrivateVPN/Services/VPNConfigStore.swift:118` (`defaults.removeObject` then
  force default); also `VPNManager.swift:134` writes an empty token to Keychain each connect.
- Impact: any override (e.g. staging URL) is silently destroyed every launch. Low impact
  today (Settings no longer exposes the field) but a risky data-destruction pattern.

### LOW

- **L1.** Placeholder endpoint `"0.0.0.0:51820"` sent to the coordinator on register
  (`VPNManager.swift:216`) — registry records a fake endpoint.
- **L2.** Evidence/docs sync drift: `requirements.json` FR-VPN-002 still cites
  "allowedIPs 0.0.0.0/0, ::/0" but code provisions IPv4-only `["0.0.0.0/0"]`;
  `docs/DASHBOARD.md` (2026-08-20) is older than `status/project.json` (2026-08-23) —
  sync before release (RULE-DASH-001).
- **L3.** iOS/macOS UX inconsistency on tap-during-connecting: iOS treats it as cancel
  (`canDisconnect` includes `.connecting`), macOS disables duplicate taps — unify/document.
- **L4.** `PacketTunnelProvider.startTunnel` uses `try? config.makeTunnelConfiguration()`
  (`PacketTunnelProvider.swift:25`) — swallows the underlying config error, hurts diagnosability.

---

## 6. Checks table

| Check | Command/Steps | Result | Evidence ID |
|---|---|---|---|
| RAG index rebuild | `python3 .privatevpn/tools/rag_search.py --rebuild` | pass (148 files) | VERIFY-20260823-001 |
| RAG retrieval | 5 searches (server selection, exit node, iOS publish, storekit, macOS unlock) | pass | VERIFY-20260823-001 |
| Static review of iOS sources | read-only inspection (files in section 4) | pass (findings above) | VERIFY-20260823-001 |
| Real-device VPN E2E | not run (no device/production evidence in repo) | **not_run** | H2 |
| Production `/v1/tokens` auth check | not run (backend not reachable from this review) | **not_run** | H1 |
| StoreKit sandbox purchase/restore | not run | **not_run** | M4 |

---

## 7. Missing evidence (blocks release)

| Area | Reason | Required before release |
|---|---:|
| `POST /v1/tokens` without auth still open in production? | H1 — paywall/revocation bypass | **yes** |
| Real-device tunnel + exit IP = 103.173.155.50 | H2 — Apple review will test | **yes** |
| StoreKit sandbox purchase/restore/free-trial flow | M4 — no real evidence yet | **yes** |
| Release archive signing team (must match Keychain access group) | M1 | **yes** |
| Archive → Validate → Upload → App Store Connect processing | active task scope | **yes** |

## 8. Open questions blocking implementation/release

1. Is production `POST /v1/tokens` still open? If yes — close it or bind to user+subscription before submission?
2. Which signing team will the release archive use — must be G6XW3RN6LJ to match the hardcoded access group?
3. Is a physical iPhone with an NE-capable profile available for the final E2E and Apple review test?

## 9. Conclusion

**PARTIAL — proceed with caveats.** No code-level blocker in the reviewed sources, but
App Store submission should be gated on closing the four "yes" items in section 7, in priority
order: (1) verify/close public `/v1/tokens`, (2) pin release signing team + verify shared
Keychain, (3) real-device egress verification, (4) StoreKit sandbox test. M2-M5 and L1-L4
should be tracked for the next tasks (A8 server selection, account model) and do not block
the current publish.

---

# Agent Handoff (compatible with `docs/templates/agentic-project/AGENT_HANDOFF.md`)

- **Agent:** DSH secondary reviewer
- **Task ID:** TASK-IOS-PROD-PUBLISH-PREP (review only)
- **Date:** 2026-08-23
- **Status:** needs_review (for main agent/owner disposition)

## Summary

Ran the Codex-style agentic review flow: rebuilt the local RAG index (148 files),
retrieved context, read the iOS publish-prep sources and project memory, and produced
this read-only secondary review. No files were changed, committed, or pushed.

## Files Changed

None (reviewer — read-only).

## Decisions Made

| Decision | Reason | Persisted In |
|---|---|---|
| Review scope = iOS publish-prep release readiness | Active task per CURRENT_WORK.md | this report |
| 4 checks must close before App Store submission | H1/H2/M1/M4 are release-gating | this report |
| Findings M2-M5/L1-L4 tracked, not release-blocking | Non-blocking today; fold into A8/account tasks | this report |

## Evidence

| Evidence ID | Verification Level | Result |
|---|---|---|
| VERIFY-20260823-001 | static_checked | passed (findings recorded) |
| — | production_checked (real-device E2E) | not run |
| — | production_checked (`/v1/tokens` auth) | not run |
| — | manual_checked (StoreKit sandbox) | not run |

## Validation Performed

```text
python3 .privatevpn/tools/rag_search.py --rebuild   # 148 files indexed
python3 .privatevpn/tools/rag_search.py "<5 queries>" --limit 8
# read-only inspection of iOS sources + memory + docs (see section 4)
```

Result: index OK; findings in section 5.

## Validation Not Performed

| Check | Reason |
|---|---|
| Real-device VPN E2E | No device / production evidence in repo |
| Production `/v1/tokens` behavior | Backend not reachable from this review; coordinator code on VPS |
| StoreKit sandbox purchase/restore | Requires App Store Connect sandbox account + device |

## Risks

- H1 (open token bootstrap) is the highest-impact risk if unverified in production.
- M1 (hardcoded access group) can silently break the tunnel on the release build if the
  signing team differs from G6XW3RN6LJ.
- Docs/evidence drift (L2) could mislead the next session; sync before release.

## Open Questions

See section 8 (3 questions).

## Next Recommended Step

1. Main agent/owner: verify production `POST /v1/tokens` auth policy (curl, no auth).
2. Owner: confirm release signing team == G6XW3RN6LJ.
3. Plan real-device E2E + StoreKit sandbox test as the next concrete task, then Archive →
   Validate → Upload.
