# 2026-08-23 Authenticated Enrollment Real-Fix Pass

## Scope

- BUG-20260823-001 repo-side real fix for public token bootstrap bypass.
- iOS and macOS clients now require a persisted coordinator auth session before control-plane provisioning.
- App clients request one-time enrollment tokens from `POST /v1/enrollment-tokens` with `Authorization: Bearer <session>`.
- Device registration sends both Bearer session and the one-time enrollment token to `POST /v1/peers/register`.
- `control-plane/` reference implementation disables legacy `/v1/tokens` and `/device` unless explicit non-production env flags are set.

## Verification

| Check | Result | Evidence |
|---|---:|---|
| Xcode full project build | PASS | `BuildProject` succeeded in 9.583s |
| Swift live diagnostics for edited iOS/macOS files | PASS | Xcode diagnostics reported no issues |
| Control-plane auth tests | PASS | `npm test --prefix control-plane` |
| App runtime calls to old `fetchJoinToken()` | PASS | `rg` shows no app connect path calls, only the legacy client helper and fail-closed server route |

## Remaining Release Gate

Production `https://api.meetflowai.site` still runs the VPS coordinator from `/root/privatevpn/dist/server.js`, not this repo's `control-plane/` reference server. Before App Store release:

1. Port/deploy the same fail-closed policy to the VPS coordinator.
2. Verify unauthenticated `POST /v1/tokens` returns `401`, `403`, `404`, or `410`.
3. Verify active signed-in test user can call `POST /v1/enrollment-tokens`.
4. Verify unsubscribed/revoked user cannot mint enrollment tokens or re-register.
