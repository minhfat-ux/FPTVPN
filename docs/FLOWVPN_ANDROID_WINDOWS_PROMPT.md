# FlowVPN Android And Windows Build Prompt

Build production-ready FlowVPN client apps for Android and Windows, matching the
current iOS/macOS product behavior, backend integration, branding, and security
model.

Important scope rule: do not rebuild or fork the backend. Android and Windows
must reuse the existing production coordinator at `https://api.meetflowai.site`.
Only build native client apps, platform VPN integration, billing integration,
secure local storage, localization, and UI.

## Product

- Product name: FlowVPN
- Privacy URL: https://meetflowai.site/FlowVPNPrivacy.html
- Support URL: https://meetflowai.site/SupportPrivateVPN.html
- Copyright: Copyright © Minh Nguyen

## Brand And Theme

- Use a dark VPN interface.
- Background gradient:
  - Top: `#051525`
  - Bottom: `#0a1f3a`
- Accent green: `#33c773`
- Disconnected/error red: `#ff3b30`
- Cards use translucent white background and subtle white border.
- App logo must be shown on the main screen and paywall.
- Main UX should be simple: open app, see status, tap one power button, connect or disconnect.
- UI must stay visually consistent with the current iOS and macOS apps. Treat
  the mobile/iPhone-sized layout as the primary reference even on desktop:
  centered narrow app surface, dark background, compact cards, large circular
  power button, no dashboard-style redesign.
- Desktop windows should default to an iPhone-like content size around 390 pt /
  dp wide and roughly 760 tall, while still respecting platform minimum sizes.

## Production Coordinator

- Base URL: `https://api.meetflowai.site`
- Fetch nodes:
  - `GET /v1/nodes`
- Fetch join token:
  - `POST /v1/tokens`
- Register device:
  - `POST /v1/peers/register`
- The app must never show coordinator URL, auth token, endpoint IP, WireGuard public key, or private key on the public UI.
- Diagnostics UI may show only safe state information: Connected, Disconnected, Connecting, Failed, Location, and user-friendly errors.
- There is no account sign-in in the current product. Do not add login screens
  unless the backend account model is added later.

## Exit Node Management Backend

- The backend supports multiple exit nodes.
- Public app endpoint:
  - `GET /v1/nodes`
- Admin browser page:
  - `GET /admin`
- Admin node APIs:
  - `GET /v1/admin/nodes`
  - `POST /v1/admin/nodes`
  - `PATCH /v1/admin/nodes/:id`
  - `DELETE /v1/admin/nodes/:id`
- Admin access is intentionally private:
  - Public access to `/admin` and `/v1/admin/nodes` must be blocked.
  - Admin APIs require `Authorization: Bearer <AUTH_TOKEN>`.
  - Admin page should be accessed through SSH tunnel only:

```bash
ssh -i .tmp/flowvpn_support_page_ed25519 \
  -L 9000:127.0.0.1:7777 \
  root@103.173.155.50
```

Then open:

```text
http://127.0.0.1:9000/admin
```

- Android and Windows clients must treat `/v1/nodes` as dynamic data.
- Do not hardcode a single exit node in UI.
- Default selected node should be the first active node returned by priority/order, preferring Vietnam / Hanoi / `vietnam-1` when present.
- Store selected exit node locally and refresh node list on app launch.

## VPN Node

- Current exit endpoint: `103.173.155.50:443`
- Current node public key is returned by coordinator from `/v1/nodes`.
- VPN protocol: WireGuard.
- Allowed IPs:
  - `0.0.0.0/0`
- Do not add `::/0` unless the backend returns an IPv6 overlay address and the
  platform tunnel implementation is explicitly verified for IPv6.
- DNS:
  - `1.1.1.1`
- Persistent keepalive:
  - `25` seconds

## Device Identity And Key Management

- Generate a unique stable device identity per install.
- Generate a WireGuard private key locally on device.
- Store private key securely:
  - Android: Android Keystore / EncryptedSharedPreferences.
  - Windows: Windows Credential Locker / DPAPI-protected storage.
- Only send WireGuard public key to coordinator.
- Never send or log private key.
- Never store join token permanently.
- Join token should be fetched fresh when provisioning/registering device.
- Device registration name format:
  - Android: `android-<stable-short-id>`
  - Windows: `windows-<stable-short-id>`
- If coordinator rejects duplicate name, retry with random suffix.

## Main App Flow

1. App launches.
2. Load stored device identity and WireGuard keypair, or create them.
3. Fetch node list from `https://api.meetflowai.site/v1/nodes`.
4. Select default node from the backend list: prefer Vietnam / Hanoi / `vietnam-1`; otherwise use the first active node.
5. Show main screen:
   - Logo
   - App title: FlowVPN
   - Subtitle: Private, encrypted internet from Vietnam
   - Premium status card
   - VPN state card
   - Location card
   - Large circular power button
6. If user taps Connect:
   - If user is not Premium, show paywall.
   - If user is Premium:
     - Immediately show `Connecting` state and disable duplicate Connect taps.
     - Fetch join token from `POST /v1/tokens`.
     - Register device using public key.
     - Receive overlay IP.
     - Build WireGuard config.
     - Request platform VPN permission/consent if not already granted.
     - Start VPN tunnel.
     - While provisioning or waiting for VPN permission, show a short status such
       as `Preparing VPN permission...` so the app does not feel frozen.
7. If connected, power button disconnects VPN.
8. If failed, show safe error message only.

## Localization And Language Settings

- Support these UI languages:
  - English
  - Vietnamese
  - Chinese
  - Japanese
  - Korean
- On first launch, detect the user's system/regional language and use it when supported.
- If the system language is not supported, fall back to English.
- Add a Language picker in Settings.
- Picker options must use full names and flag emoji, never short codes:
  - `🌐 System Setting`
  - `🇺🇸 English`
  - `🇻🇳 Vietnamese`
  - `🇨🇳 Chinese`
  - `🇯🇵 Japanese`
  - `🇰🇷 Korean`
- Save the user's language override locally.
- Changing language in Settings should update visible UI without requiring account sign-in.
- Localize at minimum:
  - Main screen subtitle
  - Premium status card
  - VPN state labels
  - Location labels
  - Settings sections and rows
  - Paywall title, subtitle, benefits, buttons, legal links
  - Safe error messages
- Do not localize product IDs, backend endpoints, WireGuard keys, or internal API fields.
- Do not show language abbreviations such as `en`, `vi`, `zh`, `ja`, or `ko` on user-facing UI.

## Paywall Flow

- Product IDs:
  - `Monthly_Premium`
  - `Yearly_Premium`
- Android:
  - Use Google Play Billing.
  - Fetch product details from Play Console.
  - Verify purchase entitlement locally first, but design for server-side validation later.
- Windows:
  - If distributed via Microsoft Store, use Microsoft Store purchase APIs.
  - If distributed outside Store, design abstraction so Stripe/license backend can be plugged in later.
- Paywall UI:
  - Must include an obvious close button (`X`) and a secondary `Not Now` action.
  - Logo
  - Title: FlowVPN Premium
  - Benefits:
    - Secure VPN tunnel
    - Protection on public Wi-Fi
    - Fast one-tap connection
  - Show Monthly and Yearly plans from the platform billing API.
  - Buttons:
    - Purchase
    - Restore Purchases
    - Privacy
    - Support
    - EULA
    - Not Now
- Free trial / introductory offer copy may say that the first month is free if
  configured in the store console. The client must not implement a local
  reinstall-based free month. Store free-trial eligibility is controlled by the
  user's platform store account and subscription group/base plan.

## Subscription Behavior

- App must check active entitlement on launch.
- App must refresh entitlement after purchase/restore.
- VPN connect must be blocked if Premium is inactive.
- Existing active VPN can be disconnected even if Premium check fails.
- Do not hardcode paid state for production.
- Keep a debug/test override only if it is clearly disabled in release builds.

## Android Technical Requirements

- Language: Kotlin.
- UI: Jetpack Compose.
- VPN implementation:
  - Use WireGuard Android tunnel library if practical, or integrate official WireGuard backend.
  - Use Android `VpnService`.
- Required permissions:
  - `INTERNET`
  - Foreground VPN service permissions required by the target SDK
  - VPN user consent flow
- Store private key securely.
- App must handle VPN permission request before starting tunnel.
- Connect button must be disabled while preparing, requesting VPN permission, or
  starting/stopping the tunnel.
- Show persistent notification while VPN is connected if required by Android.
- Use the system `VpnService.prepare()` consent flow and continue tunnel startup
  only after the user grants consent.

## Windows Technical Requirements

- Language: C#/.NET or native Windows stack.
- UI: WinUI 3 preferred.
- VPN implementation:
  - Prefer WireGuardNT / official WireGuard tunnel service integration.
  - App controls tunnel lifecycle without exposing raw config to user.
- Store private key using DPAPI/Credential Locker.
- App should support install/start/stop tunnel service flow.
- Use system tray behavior similar to macOS menu bar if practical:
  - Status
  - Connect/Disconnect
  - Open App
  - Quit

## Error Handling

- Coordinator unreachable:
  - `Cannot reach FlowVPN service. Please try again.`
- Token failed:
  - `Cannot prepare secure access. Please try again.`
- Device rejected:
  - `This device could not be registered. Please contact support.`
- VPN permission denied:
  - `VPN permission is required to connect.`
- No Premium:
  - `Premium is required to start VPN protection.`
- No plans available:
  - `No plans available. Please try again later.`
- Tunnel preparation in progress:
  - `Preparing VPN permission...`

## Security Rules

- Never print tokens, private keys, public keys, endpoint IPs, or coordinator internals in normal UI.
- Logs must redact tokens and private keys.
- Use HTTPS only for coordinator.
- No App Transport Security bypass equivalent.
- No plaintext secrets in app bundle.
- Validate server responses strictly.
- Keep backend URLs centralized in config constants.

## Deliverables

- Android app source.
- Windows app source.
- Shared protocol documentation for coordinator API.
- Secure key storage implementation.
- Paywall implementation with `Monthly_Premium` and `Yearly_Premium`.
- Language pack and Settings picker for English, Vietnamese, Chinese, Japanese, and Korean.
- Dynamic exit-node selection based on `GET /v1/nodes`.
- Production config using `https://api.meetflowai.site`.
- Build/run instructions.
- Test checklist for:
  - First launch
  - Billing product fetch
  - Purchase restore
  - Paywall close / Not Now behavior
  - Device registration
  - VPN permission prompt appears once and duplicate Connect taps are ignored
  - VPN connect
  - VPN disconnect
  - App restart
  - Network unavailable
  - Coordinator unavailable
  - Language follows system setting
  - Language override persists after restart
  - Node list refreshes and selected node persists
