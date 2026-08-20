# Privacy fixes — NFR-PRIV-001 / NFR-SEC-004 — 2026-08-20

Owner-approved follow-up to `evidence/2026-08-20-privacy-review.md` (CR-0002).
All 3 low-severity issues recorded there are now fixed. Change request: CR-0003.

## Fixes

### ISSUE #1 — `UIDevice.current.name` transmitted in POST /device (NFR-PRIV-001)
- `iOS/PrivateVPN/Services/ControlAPIClient.swift`: `register(publicKey:deviceId:platform:)` no
  longer takes or sends a `deviceName` field. Doc comment explains why (device names
  frequently contain the owner's real name and are not required by the VPN service).
- `iOS/PrivateVPN/VPNManager.swift`: dropped the `deviceName: UIDevice.current.name` argument.
- Server keeps its existing `"device"` default for the display name (`device-store.js`), so
  admin UI names degrade gracefully.
- Regression test: `ControlAPIClientTests.testRegisterSendsPublicKeyAndStableDeviceIdentity`
  now asserts `payload["deviceName"] == nil`.

### ISSUE #3 — Control-plane auth token plaintext in UserDefaults (NFR-PRIV-001 / NFR-SEC)
- `iOS/PrivateVPN/Services/VPNConfigStore.swift`: `controlPlaneToken` now persists to the
  Keychain via `KeychainStore` (service `com.privatevpn.app.keys`, account
  `control-plane.token`, `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`), not UserDefaults.
- One-shot migration: a legacy `config.controlPlane.token` UserDefaults value is moved to the
  Keychain and removed from UserDefaults on first load.
- Tests: `VPNConfigStoreTests.testTokenPersistsInKeychainNotUserDefaults` (token never lands in
  UserDefaults; survives a fresh store instance) + `testTokenMigratesFromLegacyUserDefaults`.

### ISSUE #17 — Admin endpoints unauthenticated when `AUTH_TOKEN` unset (NFR-SEC-004 / AC-018)
- `control-plane/src/index.js`: new `requireAdminAuth` middleware applied to the admin/owner
  surface — `GET /devices`, `GET /status`, `GET /device/:id`, `DELETE /device/:id`.
- Fail closed: when `AUTH_TOKEN` is not configured these endpoints return
  `503 {"error":"AUTH_TOKEN not configured — admin endpoints disabled"}` instead of being
  public. With `AUTH_TOKEN` set: `401` on missing/wrong token, `200` on match.
- `POST /device` (device registration) remains reachable in dev so the app can provision; when
  `AUTH_TOKEN` IS set the existing global middleware guards it too (verified 401 without token).

## Verification

### Control-plane smoke (manual, `node --check` + live server, 2 scenarios) — PASS
| Scenario | Endpoint | Expected | Actual |
|----------|----------|----------|--------|
| no AUTH_TOKEN | GET /health | 200 | 200 |
| no AUTH_TOKEN | GET /devices | 503 fail-closed | 503 |
| no AUTH_TOKEN | GET /status | 503 | 503 |
| no AUTH_TOKEN | GET /device/:id | 503 | 503 |
| no AUTH_TOKEN | DELETE /device/:id | 503 | 503 |
| no AUTH_TOKEN | POST /device | 201 (registration OK) | 201 |
| AUTH_TOKEN set | GET /devices no header | 401 | 401 |
| AUTH_TOKEN set | GET /devices wrong token | 401 | 401 |
| AUTH_TOKEN set | GET /devices correct token | 200 | 200 |
| AUTH_TOKEN set | GET /status correct token | 200 | 200 |
| AUTH_TOKEN set | POST /device no header | 401 (global auth) | 401 |
| AUTH_TOKEN set | POST /device correct token | 201 | 201 |

### iOS unit tests
- **39/39 PASS, TEST SUCCEEDED** (iPhone 16 Pro simulator,
  `evidence/builds/2026-08-20-privacy-fixes-tests.log`): the 37 existing
  tests (GATE 3 baseline) + 2 new (Keychain token persistence, legacy
  UserDefaults migration), 0 failures.

## Result

- NFR-PRIV-001 → **IMPLEMENTED** (all 3 privacy review issues resolved; AC-019 evidence:
  this file + `evidence/2026-08-20-privacy-review.md`).
- NFR-SEC-004 → **IMPLEMENTED** (AC-018: unauthorized requests rejected — admin surface
  fail-closed; server-side authorization now mandatory, not optional).
- `.privatevpn/status/requirements.json`, `docs/REQUIREMENTS_REGISTRY.md`, `docs/DASHBOARD.md`,
  `docs/REQUIREMENTS_CHANGELOG.md` synced per RULE-DASH-001.
