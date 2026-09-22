# ADR-0005: Retire the unauthenticated legacy provisioning path (`LEGACY_MODE`)

- **Status:** PROPOSED (owner decision required — this ADR does not change code)
- **Date:** 2026-09-22
- **Author:** Solution Architect (DSH harness Mac)
- **Related:** `BUG-20260823-001`, FR-AUTH-001, FR-REVOKE-002, FR-WIN-006, NFR-SEC-004 / AC-018
- **Supersedes (in part):** `docs/ARCHITECTURE.md` §B3 ("LEGACY (App-Store-review build, LEGACY_MODE=1 only)")

## Context

The control plane carries two provisioning paths:

| Path | Endpoint sequence | Auth | Subscription gate |
|---|---|---|---|
| **Authenticated** | `POST /v1/enrollment-tokens` → `POST /v1/peers/register` (Bearer + one-time enrollment token) | user session required | **yes** — `403 Active subscription required` (`control-plane/src/index.js:4265-4271`) |
| **Legacy** | `POST /v1/tokens` → `POST /v1/peers/register` (one-time join token, no session) | **none** | **none** (`control-plane/src/index.js:4280-4299`, `:4919-4931`) |

The legacy path exists only to keep a build that was **submitted to App Store review** working
after the dual-mode server was deployed. The gating flag is:

```js
// control-plane/src/index.js:151
const LEGACY_MODE = process.env.LEGACY_MODE ?? "1";
```

### Verified findings (2026-09-22)

1. **Production is currently in legacy mode.**
   A non-mutating probe — `POST /v1/peers/register` with a non-existent join token and no
   `Authorization` header — returns `401 {"error":"Invalid or expired join token"}`. That
   message is produced only by `authStore.consumeJoinToken()` (`control-plane/src/auth-store.js:246-255`),
   which is reachable only inside the `LEGACY_MODE === "1"` branch (`index.js:4924`). With
   `LEGACY_MODE=0` the same request returns `401 {"error":"Unauthorized","message":"Valid user session required"}`.
   Evidence: `evidence/2026-09-22-legacy-mode-production-probe.md`.

2. **The flag fails OPEN by default.** `?? "1"` means any deployment that loses the
   `LEGACY_MODE` env var silently re-opens unauthenticated token issuance in production.

3. **It is the only dev/legacy flag without a production guard.** Its three siblings all
   require `!IS_PRODUCTION`:
   - `ALLOW_DEV_TOKEN_BOOTSTRAP` (`index.js:144`)
   - `ALLOW_LEGACY_DEVICE_REGISTRATION` (`index.js:152`)
   - `AUTH_DEV_GRANT_SUBSCRIPTION` (`index.js:153`)

   `LEGACY_MODE` has no such guard.

4. **The original justification is stale.** `docs/ARCHITECTURE.md` §B6 records that iOS is no
   longer distributed through the App Store (Ad Hoc OTA on our own domain). The "reviewer must
   be able to connect" rationale no longer applies to iOS.

5. **Exactly one client still depends on it: Windows.**
   - `windows/PrivateVPNWindows.App/Views/MainView.axaml.cs:247-265` — on **every** Connect it calls
     `FetchJoinTokenAsync()` and then `RegisterAsync(..., accessToken: null, joinToken: joinToken, ...)`.
     There is no cache and no feature flag.
   - `windows/PrivateVPNWindows.Core/Api/ControlApiClient.cs:439-451` — `FetchEnrollmentTokenAsync(accessToken)`
     **already exists** in the same class. The wiring, not the capability, is missing.
   - iOS: `iOS/PrivateVPN/VPNManager.swift:405-409` uses `fetchEnrollmentToken`. `fetchJoinToken` is still
     defined (`iOS/PrivateVPN/Services/ControlAPIClient.swift:741`) but has **zero callers** in `iOS/` or `mac/`.
   - macOS: `mac/PrivateVPNMac/VPNManagerMac.swift:307-327` uses `fetchEnrollmentToken`.
   - Android: `android/.../vpn/VPNManager.kt:404-430` requires `accessToken`, uses `fetchEnrollmentToken`,
     and sends the Bearer header (`ControlAPIClient.kt:201`).

6. **Blast radius of an immediate cutover is "all Windows users", not "new installs only".**
   Because Windows re-registers on every Connect, setting `LEGACY_MODE=0` today would make every
   Windows client fail on its next Connect. Windows must be upgraded **before** the cutover.

7. **Dead duplicate entry point.** `control-plane/src/dep-index.js` is a 3,449-line stale copy of
   `src/index.js` containing its own `LEGACY_MODE` logic (lines 115-121, 2453-2457, 2878-2883).
   It is referenced nowhere in the repository (`package.json` `main`/`start` and
   `deploy-node.sh:121` all use `src/index.js`). It is a security-relevant orphan.

8. **The bug is not tracked.** `BUG-20260823-001` is documented in
   `.privatevpn/memory/CURRENT_WORK.md` and `evidence/2026-08-23-tokens-open-production.md` but is
   **absent** from `.privatevpn/status/bugs.json`.

### Impact while legacy mode stays on

- **Paywall bypass:** anyone on the internet can mint a join token and obtain a provisioned peer.
- **Revocation bypass (at risk):** the legacy register path passes `userId: null` (`index.js:4927`),
  so a device record created that way carries no user binding. Whether a revoked device can
  re-register through this path is **not verified** — it must be tested, not assumed.
- **Device-limit enforcement (at risk):** the 3-device limit is user-scoped; peers registered with
  `userId: null` fall outside it unless a prior `POST /v1/devices/claim` binds them.

## Decision

Retire the legacy unauthenticated provisioning path in four ordered phases. **Phases 0-2 require
code changes in `control-plane/src/index.js` and `windows/`, which are outside this ADR's scope**
(`control-plane/src/index.js` is a protected area owned by the `windows` owner per `AGENTS.md` §6b).

- **Phase 0 — stop the silent re-open (safe, immediate).** Change the default to explicit opt-in:
  `const LEGACY_MODE = process.env.LEGACY_MODE === "1";`. Delete the orphan `dep-index.js`.
  *Precondition:* confirm the production systemd unit sets `LEGACY_MODE=1` **explicitly**
  (`DECISIONS.md` 2026-08-23 says it does). If production currently relies on the default, this
  change closes the hole immediately and breaks Windows — so verify the unit first.
- **Phase 1 — instrument before cutting.** Log/alert every `POST /v1/tokens` call with client
  user-agent and version. This turns "we think only Windows uses it" into measured fact.
- **Phase 2 — Windows parity (blocker removal).** In `MainView.axaml.cs`, replace
  `FetchJoinTokenAsync()` with `FetchEnrollmentTokenAsync(accessToken)` and pass
  `accessToken: accessToken` (not `null`) to `RegisterAsync`. Ship the build and confirm the
  installed base updates.
- **Phase 3 — cut over.** Set `LEGACY_MODE=0`, verify the legacy probe now returns
  `Valid user session required`, and keep the rollback path (unit file + restart) for one week.
- **Phase 4 — delete the code.** Remove the `/v1/tokens` route, the legacy branch in
  `/v1/peers/register`, the middleware exemption at `index.js:318`, and
  `createJoinToken`/`consumeJoinToken` from `auth-store.js`.

## Alternatives considered

1. **Keep `LEGACY_MODE=1` and only patch Windows later.** Rejected: leaves an unauthenticated
   internet-reachable provisioning endpoint for an unbounded window.
2. **Put `/v1/tokens` behind `AUTH_TOKEN` (the original `ADMIN_TOKEN` proposal from
   `evidence/2026-08-23-tokens-open-production.md`).** Rejected as the end state: it authenticates
   the *caller* but still issues unbound tokens, so paywall and revocation bypass remain. Useful
   only as a stopgap.
3. **Rate-limit `/v1/tokens`.** Rejected: mitigates volume, not the bypass.
4. **Flip the default to fail-closed and cut over immediately.** Rejected as a single step: it
   breaks every Windows user on their next Connect.

## Consequences

- One client release (Windows) is on the critical path before the endpoint can be closed.
- After retirement, provisioning has a single code path with one auth model and one subscription
  gate — smaller attack surface and a simpler SRS/architecture story.
- The `LEGACY_MODE` flag disappears entirely, so the fail-open default hazard cannot recur.

## Open questions (owner)

1. Confirm the production unit sets `LEGACY_MODE=1` explicitly (not via the default). This
   decides whether Phase 0 is a no-op hardening or an immediate behavioural change.
2. Windows release plan: is a Windows build acceptable on the critical path before cutover?
   (Windows 1.4.1 is released and owner-validated in real use — 3.4 h continuous with 0 false
   watchdog alarms, `docs/WINDOWS_HARNESS_TASK_1.4.0.md` §"XÁC NHẬN THỰC TẾ bản 1.4.1"; the two
   follow-up patches already committed as `4850b6c` land in the next build,
   `docs/RELEASE_PLAN_2026-09-24.md` §1.)
3. Should Windows gain a client-side premium gate, or is a clear server-`403` message enough?
4. Is a one-week rollback window acceptable, or is a longer soak required?
