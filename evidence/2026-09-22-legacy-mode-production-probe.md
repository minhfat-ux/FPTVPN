# Evidence — Production is running `LEGACY_MODE=1` (unauthenticated provisioning open)

- **Date:** 2026-09-22
- **Verifier:** Solution Architect (DSH harness Mac)
- **Requirement:** FR-AUTH-001, FR-REVOKE-002, NFR-SEC-004 / AC-018
- **Bug:** BUG-20260823-001 (re-confirmed open; original evidence `evidence/2026-08-23-tokens-open-production.md`)
- **Result:** **CONFIRMED — production control plane is in legacy mode**

## 1. Discriminator (why this probe is conclusive)

`POST /v1/peers/register` has two mutually exclusive branches when no `Authorization` header is sent
(`control-plane/src/index.js:4897-4931`):

| `LEGACY_MODE` | Code path | Response |
|---|---|---|
| `"1"` | `authStore.consumeJoinToken(join_token)` → `index.js:4924` | `401 {"error":"Invalid or expired join token","message":"Invalid or expired join token"}` |
| not `"1"` | early return → `index.js:4921-4922` | `401 {"error":"Unauthorized","message":"Valid user session required"}` |

The error string `Invalid or expired join token` exists only in
`control-plane/src/auth-store.js:249-251`, which is reachable only inside the legacy branch.
Both outcomes are HTTP 401, so the **response body is the discriminator**.

## 2. Command run (from developer Mac)

```bash
curl -s -o /dev/null -w "%{http_code}" --max-time 15 https://api.meetflowai.site/v1/health
curl -s --max-time 20 -X POST https://api.meetflowai.site/v1/peers/register \
  -H 'Content-Type: application/json' \
  -d '{"join_token":"PVPN-JOIN-INVALID-PROBE-DOES-NOT-EXIST","name":"probe","platform":"probe",
       "wireguard_public_key":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="}' \
  -w "\nHTTP=%{http_code}\n"
```

Output:

```text
200
{"error":"Invalid or expired join token","message":"Invalid or expired join token"}
HTTP=401
```

**Conclusion:** the request took the `LEGACY_MODE === "1"` branch. Unauthenticated token issuance
is live in production on 2026-09-22.

## 3. Why this probe does not change data

- The join token sent is a non-existent literal, so `consumeJoinToken()` throws at the
  `if (!row)` guard (`auth-store.js:249`) **before** any `_save()` call. No token is created,
  no device record is written, no peer is provisioned on the exit node.
- No token value was minted, so nothing new is usable by an attacker as a result of this test.
- The earlier evidence file (`2026-08-23`) used a **mutating** `POST /v1/tokens` (HTTP 201, real
  token issued, value masked). This probe deliberately avoids that.

## 4. Source-level corroboration

- `control-plane/src/index.js:151` — `const LEGACY_MODE = process.env.LEGACY_MODE ?? "1";`
  (defaults to the insecure state).
- `control-plane/src/index.js:4283` — `/v1/tokens` issues a token with no auth check when
  `LEGACY_MODE === "1"`.
- `control-plane/src/index.js:318` — the global `AUTH_TOKEN` middleware explicitly exempts
  `/v1/tokens` in legacy mode.
- `control-plane/src/index.js:144,152,153` — every sibling dev/legacy flag additionally requires
  `!IS_PRODUCTION`; `LEGACY_MODE` is the only one that does not.

## 5. Client dependency (which build keeps this endpoint alive)

| Client | Provisioning path in repo source | Depends on legacy? |
|---|---|---|
| Windows | `MainView.axaml.cs:254` `FetchJoinTokenAsync()`, `:262` `accessToken: null` | **YES** |
| iOS | `VPNManager.swift:409` `fetchEnrollmentToken` | no |
| macOS | `VPNManagerMac.swift:307-327` `fetchEnrollmentToken` | no |
| Android | `VPNManager.kt:407-429` `fetchEnrollmentToken` + Bearer | no |

`fetchJoinToken` remains defined at `iOS/PrivateVPN/Services/ControlAPIClient.swift:741` but has zero
callers in `iOS/` or `mac/`.

## 6. Impact

Unchanged from the 2026-08-23 assessment: paywall bypass (free VPN for anyone) and revocation
bypass at risk. See `docs/adr/0005-legacy-mode-fail-closed.md` for the phased retirement plan.

## 7. Not verified by this evidence

- The production systemd unit's actual environment (`LEGACY_MODE` explicit vs. default) — needs
  server-side inspection; it decides whether a fail-closed default change is a no-op or an
  immediate behavioural change.
- Whether a **revoked** device can re-register through the legacy path (reasoned as likely, not tested).
- The shipped Windows binary was not disassembled; the dependency above is source-level.
