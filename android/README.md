# VPNFlow — Android

Native Android client for VPNFlow, cloned from the iOS/macOS app. Kotlin +
Jetpack Compose, WireGuard via the official `com.wireguard.android:tunnel`
library (wireguard-go userspace), Google Play Billing.

## What's implemented (mirrors iOS/macOS)

- **Backend-first server selection**: `GET /v1/nodes` from
  `https://api.meetflowai.site`, cached locally, built-in fallback nodes when the
  coordinator is unreachable.
- **Email OTP login** (`/v1/auth/email/start` + `/v1/auth/email/verify`),
  session persisted in EncryptedSharedPreferences (Android Keystore).
- **Device registration**: stable per-install device id + Curve25519 keypair
  (generated locally, private key never leaves the device), registered via
  `POST /v1/peers/register` with a fresh enrollment token; duplicate-name retry
  with random suffix, mirroring iOS.
- **WireGuard tunnel**: `GoBackend` (wireguard-go) + `VpnService.prepare()`
  consent flow; persistent-keepalive 25s, DNS 1.1.1.1, AllowedIPs 0.0.0.0/0.
- **Paywall**: Google Play Billing, product IDs `Monthly_Premium` /
  `Yearly_Premium` (same IDs as iOS), restore purchases, backend entitlement
  (`subscription_status.is_active`) — `isSubscribed = backend || Play`.
- **5-language localization**: EN / VI / ZH / JA / KO + System, with an in-app
  language picker (same table as iOS `Theme.swift`).
- **Force-update gate**: `GET /v1/app-version` vs `BuildConfig.VERSION_NAME`.
- **Devices screen**: list + revoke signed-in user's devices
  (`GET/DELETE /v1/devices`).
- **Dark theme** matching iOS: gradient `#051525 → #0a1f3a`, accent `#33c773`,
  translucent cards, crown-style Premium badge on the logo.

## Build

Prerequisites: JDK 17, Android SDK (platform 35 + build-tools 35).

```bash
# one-time: set up local.properties
echo "sdk.dir=$HOME/Library/Android/sdk" > local.properties

./gradlew :app:assembleDebug        # debug APK
./gradlew :app:assembleRelease      # release APK (R8)
```

APK output: `~/.vpnflow-build/app/outputs/apk/<variant>/app-<variant>.apk`
(build outputs are kept off the BIWIN ExFAT volume — see `build.gradle.kts`).

## Notes

- Product IDs must exist in Play Console with type **Subscriptions**.
- Free-trial (1 month free) is configured in Play Console as an introductory
  offer, not in code.
- The `com.wireguard.android:tunnel` AAR declares the VPN service
  (`GoBackend$VpnService`) and ships native libs for all 4 ABIs.
- WireGuard private key + auth session live in EncryptedSharedPreferences
  (Keystore-backed), never in plain SharedPreferences.
- Debug builds unlock Premium (`BuildConfig.DEBUG`), matching iOS `#if DEBUG`.

## Known gaps vs iOS

- No Sign in with Apple (Android uses email OTP only — matches backend).
- Manage Subscription link opens the Google Play subscriptions page.
- Android system shows its own "VPN active" notification (required by Android).
