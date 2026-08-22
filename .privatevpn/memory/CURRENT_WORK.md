# CURRENT_WORK.md

Current task tracked here (schema per spec §31). Structured state also in
`.privatevpn/status/project.json`.

| Field | Value |
|-------|-------|
| Task ID | TASK-IOS-PROD-PUBLISH-PREP (active) / TASK-G3-ACCOUNT-MULTIDEVICE (next) |
| Objective | Prepare FlowVPN iOS production build for App Store submission: StoreKit paywall, privacy/support/legal links, localization, install/device fixes, and Apple review checklist. NEXT after iOS publish: account login + add device (Tailscale-style). |
| Requirement IDs | FR-VPN-001..005, FR-DEVICE-001/002, FR-PROVISION-001/002, FR-AUTH-001, NFR-SEC-001, NFR-UX-001, NFR-PERF-001, NFR-REL-001 |
| Requirement baseline | RS-20260819-01 |
| Rule baseline | RULESET-0001 |
| Expert consultations | none yet; mesh/coordinator integration done (2026-08-21) |
| Assigned agent/runtime | Culi (orchestrator) |
| Status | iOS app is in App Store publish-prep. Real-device install blocker was fixed by giving the packet tunnel extension a non-empty `CFBundleVersion`. StoreKit paywall is enabled for Release/App Store; Debug builds bypass premium for local VPN testing only. Apple checklist pass is local/config-only; Archive/Validate/Upload are not yet verified. macOS build/runtime fixes are in progress: embedded packet tunnel, stale profile cleanup, IPv4-only tunnel route, iPhone-sized window, duplicate Connect-tap guard, and paywall close button. |
| Files in scope | iOS/, mac/PrivateVPNMac/, mac/PrivateVPNMacPacketTunnel/, project.yml, Vendor/WireGuardKit/, control-plane/ (superseded), scripts/mac-test.sh, docs/, .privatevpn/, evidence/ |
| Dependencies | xcodegen 2.46.0, Go 1.26.6 (currently suspicious: `go list fmt` failed locally), Node 24 (VPS coordinator), Xcode, StoreKit products in App Store Connect, Network Extension-capable signing/provisioning |
| Acceptance criteria | iOS Archive + Validate + Upload pass; App Store Connect build processing succeeds; reviewer can access live backend, privacy/support URLs, subscription products, and VPN flow. |
| Expected evidence | Xcode Organizer archive, App Store Connect upload success, `/v1/nodes` live, iOS device install/run, Review Notes submitted |
| Start commit | fafbf5b (GATE 0) |
| End commit | af972a9 (exit-node registry + server list + macOS toggle); NE refactor pending commit |

## Latest iOS publish-prep state (2026-08-22)

- App Store metadata was completed by the user in App Store Connect.
- iOS `Info.plist` app version maps to `MARKETING_VERSION = 1.0` and build `CURRENT_PROJECT_VERSION = 1`.
- iOS packet tunnel extension uses literal `CFBundleShortVersionString = 1.0` and `CFBundleVersion = 1`; this fixed the device install popup:
  `MissingBundleVersion` for `PrivateVPNPacketTunnel.appex`.
- `SubscriptionStore.isSubscribed` returns `true` only under `#if DEBUG` so the user can test VPN on device without completing a StoreKit purchase. Release/App Store still requires verified StoreKit entitlements.
- StoreKit product IDs in code: `Monthly_Premium`, `Yearly_Premium`.
- Paywall includes price rows from StoreKit, restore purchases, privacy/support/EULA links, and an auto-renew/free-trial/cancel disclosure.
- Settings includes language picker, subscription status, choose plan, restore purchases, manage subscription, support, privacy policy, and Apple Standard EULA.
- Privacy/support pages are live:
  - `https://meetflowai.site/FlowVPNPrivacy.html`
  - `https://meetflowai.site/SupportPrivateVPN.html`
- Local validations passed:
  - `plutil -lint` for iOS app plist, packet tunnel plist, and both entitlements.
  - `xcrun --sdk iphoneos swiftc -parse ...` for iOS app Swift files.
  - `curl -I` privacy/support pages returned HTTP/2 200.
- Not verified yet:
  - Xcode Archive, Validate App, Upload to App Store Connect.
  - App Store Connect processing/review.
  - Production StoreKit free trial behavior from App Store Connect.

## Latest macOS state (2026-08-23)

- macOS app is branded FlowVPN and uses NetworkExtension + WireGuardKit through
  `PrivateVPNMacPacketTunnel.appex`; no `wg-quick`, sudo, or Homebrew `wg`
  runtime path should be used for production.
- `project.yml` must keep the macOS extension embedded under
  `FlowVPN.app/Contents/PlugIns/PrivateVPNMacPacketTunnel.appex`; the app icon
  copy script must not remove it.
- `VPNManagerMac` removes stale `FlowVPN` / `FPT PrivateVPN` profiles, creates a
  fresh `NETunnelProviderManager`, saves it, reloads it from preferences, then
  starts the tunnel to avoid stale-configuration errors.
- macOS WireGuard config is IPv4-only full tunnel for now:
  `AllowedIPs = 0.0.0.0/0`. Do not add `::/0` until IPv6 overlay support is
  provisioned and verified.
- macOS UI uses an iPhone-sized fixed content window, shows
  `Preparing VPN permission...` while connecting, disables duplicate Connect
  taps during connecting/disconnecting, surfaces safe errors, and the paywall
  includes a close (`X`) button.
- macOS Premium is temporarily unlocked for normal use while Mac App Store
  product IDs are deferred. This is implemented only in `MacSubscriptionStore`;
  iOS StoreKit gating remains unchanged for App Store publish.
- Local-only admin exit-node guide/config were created under ignored `secrets/`:
  `ADMIN_EXIT_NODE_GUIDE.md` and `flowvpn-vps-root-access.env`. These files are
  intentionally not for GitHub and contain only placeholders unless the owner
  fills secrets locally.
- Build verification passed after these changes. macOS end-to-end public exit IP
  remains to be verified with the correct Network Extension signing profile.

## Clone prompt state (2026-08-23)

- `docs/FLOWVPN_ANDROID_WINDOWS_PROMPT.md` is the handoff prompt for Android and
  Windows clones.
- Android/Windows scope is client-only: reuse
  `https://api.meetflowai.site`, `GET /v1/nodes`, `POST /v1/tokens`, and
  `POST /v1/peers/register`; do not rebuild backend.
- Android clone must preserve current iOS/macOS UI style, language picker with
  full language names + flags, Store/Billing paywall with close button, VPN
  permission consent flow, and dynamic exit-node selection.

## Next task (continuation rule §103)

- **Design + build account login & add-device (Tailscale-style)**: users table,
  auth (email+password or token), user→devices ownership, device list UI, revoke.
- Production device onboarding: keep registration idempotent by stable device
  identity/public key so any newly installed app instance can join without peer-name
  collisions. Current iOS client now generates a stable `ios-<device-id>` name and
  fetches a fresh one-time join token for every provisioning attempt. Production
  backend must issue enrollment tokens for a registered user ID with an active
  subscription and consume them to attach the device record to that user; the
  current public dev `/v1/tokens` bootstrap endpoint must be disabled outside
  local/internal builds.
- iOS production key handling: WireGuard private key and control-plane credentials
  are stored in shared iOS Keychain. VPN provider configuration must not contain
  private keys; the Packet Tunnel extension loads the private key from the shared
  Keychain access group at tunnel start.
- Coordinator TLS is enabled at `https://api.meetflowai.site` via Caddy reverse
  proxy to local Node `127.0.0.1:7777`; Caddy HTTP/3 is disabled because
  WireGuard uses UDP 443 on the same VPS.
- Sign macOS app with an NE-capable Mac App Development profile; verify end-to-end tunnel via NetworkExtension (confirm exit IP = 103.173.155.50).
- TODO production macOS distribution: decide App Store vs direct distribution. Current
  macOS packet tunnel is packaged as an app extension, which is App Store-only
  for packet tunnel providers. For Developer ID/direct distribution, migrate the
  macOS tunnel provider to a Network Extension System Extension and use the
  `packet-tunnel-provider-systemextension` entitlement.
- Update SRS/ARCHITECTURE for Tailscale model + macOS target.
- Keep Android/Windows clone prompt current with frontend/client-only scope and
  current iOS/macOS UI behavior.
- Push iOS app to FPTVPN repo.
- iOS App Store publish continuation: Clean Build Folder → Archive → Validate →
  Upload. If archive fails with WireGuard/Go (`package fmt is not in std`), fix
  local Go toolchain before retrying. If upload fails, inspect signing/profile
  for both `com.privatevpn.app` and `com.privatevpn.app.packet-tunnel`.
- iOS real-device E2E: verify public IP, DNS, HTTPS, reconnect, and disconnect
  with production coordinator URL after publish build is stable.
