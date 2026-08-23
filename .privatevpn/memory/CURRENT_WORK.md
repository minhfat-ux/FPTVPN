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
- macOS now loads exit nodes from `GET /v1/nodes` on launch/main-screen task,
  shows a server selector in the main window and menu bar, disables Connect
  until a backend node is available, and `connect()` fails with
  `No exit node available from the coordinator.` when the coordinator returns
  no nodes.
- macOS Premium is temporarily unlocked for normal use while Mac App Store
  product IDs are deferred. This is implemented only in `MacSubscriptionStore`;
  iOS StoreKit gating remains unchanged for App Store publish.
- Local-only admin exit-node guide/config were created under ignored `secrets/`:
  `ADMIN_EXIT_NODE_GUIDE.md` and `flowvpn-vps-root-access.env`. These files are
  intentionally not for GitHub and contain only placeholders unless the owner
  fills secrets locally.
- Build verification passed after these changes. macOS end-to-end public exit IP
  remains to be verified with the correct Network Extension signing profile.
- macOS server-selection upgrade verification:
  `.privatevpn/reports/2026-08-23-macos-server-selection.md`.

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

- **🟡 BUG-20260823-001 (release blocker; repo fix DONE `afa7c7c` — deploy WAIT App Store approval):** production
  `POST /v1/tokens` is open without auth (confirmed 2026-08-23 — evidence
  `evidence/2026-08-23-tokens-open-production.md`). Anyone can mint join tokens -> free VPN
  (paywall bypass) and revoked devices can re-register (FR-REVOKE-002 at risk). Fix direction
  (owner): build the **account model** — users table, auth, user->devices ownership
  (FR-AUTH-001); issue tokens only for a registered user with active subscription; disable
  public dev bootstrap `/v1/tokens` outside local/internal builds; re-verify external
  unauthenticated POST -> 401/403. Current repo work adds Keychain auth sessions,
  email-code login UI, `/v1/enrollment-tokens`, Bearer-bound `/v1/peers/register`,
  and fail-closed legacy `/v1/tokens` / `/device` behavior in `control-plane/`.
  **Deploy timing (owner, 2026-08-23): DO NOT deploy to production yet** — the current
  app build (depends on open `/v1/tokens`) is submitted for App Store review; deploying the
  fail-closed fix now would break the reviewer's connect test. Deploy the coordinator fix +
  the authenticated app build **together AFTER App Store approval**, then:
  1. Deploy coordinator fix to VPS; verify unauthenticated `/v1/tokens` -> 401/403/410.
  2. Close remaining production gaps first (fix is NOT usable in production without these):
     (a) subscription source: only `AUTH_DEV_GRANT_SUBSCRIPTION` test grant exists — need
         StoreKit receipt verification server-side (or owner-defined manual grant policy),
     (b) login: email-OTP needs a mailer — **SOLUTION DECIDED: Resend**
         (see `docs/MAILER_RESEND.md`; free 3k/mo + 100/day; implement `sendOtpEmail`
         in `control-plane/src/mailer.js`, wire into `/v1/auth/email/start`, add
         `RESEND_API_KEY`/`FROM_EMAIL` env, verify domain SPF/DKIM, add resend+verify
         rate limits); **login = email-only (owner decision)** — do NOT implement
         Sign in with Apple JWT verification and do NOT add Firebase Auth; keep
         `/v1/auth/apple` dev-only / 501 in production,
     (c) re-verify: signed-in subscribed user can mint enrollment token; unsubscribed /
         revoked cannot; revoked device cannot re-register (FR-REVOKE-002).
- **Next-version server selection upgrade (iOS remaining; macOS code/build verified)**:
  remove the production dependency on hardcoded `VPNLocation.presets` / local
  fallback nodes. On app launch, clients must load exit nodes from
  `GET /v1/nodes`, show the user a server/location selector, require a selected
  active backend node before Connect, then build the WireGuard config from that
  selected node. Keep any static node seed only as a DEBUG/internal fallback,
  not as the normal production UI path. macOS code/build verification is
  recorded in `.privatevpn/reports/2026-08-23-macos-server-selection.md`;
  real macOS egress remains pending signed NE profile.
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
