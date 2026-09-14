# iOS Ad Hoc UDID Progress

Updated: 2026-09-14

## DONE

- Existing OTA UDID flow confirmed in `control-plane/src/ios-devices.js` and `control-plane/src/index.js`:
  - `/install/ios/register.mobileconfig`
  - `/install/ios/udid`
  - `/install/ios/status`
  - admin device list/add/mark-built endpoints
- Added account mapping fields to persisted iOS device records:
  - `userId`
  - `email`
- Callback metadata also preserves `IMEI` and `ICCID` when Apple sends them.
- Generated profile requests `UDID`, `VERSION`, `PRODUCT`, `SERIAL`, `IMEI`, and `ICCID`.
- Buy page now provides the Ad Hoc OTA install page when no direct IPA/store link is configured:
  `/install/ios`.
- When a direct IPA link is configured, the existing IPA button remains compatible; the Ad Hoc
  install flow remains available as the fallback path.
- iOS install guidance continues to require Safari and now follows the Ad Hoc OTA path before
  signed IPA installation.
- Added `IosDeviceStore.mapAccount()`.
- Added authenticated admin API:
  - `POST /v1/admin/ios/devices/:udid/account`
  - alias `/admin/ios/devices/:udid/account`
  - accepts `userId` or `email`; validates account exists through `AuthStore`.
- Added admin page tab `iOS UDID`:
  - list UDID, model/iOS, account email/user ID, registration/build state
  - Map action prompts for account email and calls the admin API
- Tests:
  - focused UDID/admin tests: 12 pass / 0 fail
  - full control-plane suite: 174 pass / 0 fail

## NOT DONE / NEEDS MAIN AGENT REVIEW

- No commit/deploy performed yet.
- Production endpoint was not modified.
- Need review diff, decide whether mapping should require active subscription, and add a richer invite/account-token flow if required.
- Need manually verify the served admin HTML after deploy.
