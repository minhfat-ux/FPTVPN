# PRIVATEVPN iOS MVP — Architecture v0.1

- **Version:** v0.1
- **Baseline:** RS-20260819-01
- **Date:** 2026-08-19
- **Status:** APPROVED (GATE 0)
- **Source:** `docs/spec/...MASTER_SPEC.md` §16, §19, §20, §21, §22, §26, §27, §117
- **As-built delta (2026-08-23):** see Appendix B — Tailscale-style mesh,
  VPS coordinator + exit node, macOS target, NetworkExtension data plane.

## 1. Goals

- Minimum viable VPN client that is buildable and honest about state.
- Separation of app, VPN extension, and control plane.
- Real VPN state model; no fake "connected".
- On-device key generation and secure storage.

## 2. System context

```text
 iPhone / Mac
   │
   ├── PrivateVPN App (SwiftUI: iOS + macOS)
   │        │
   │        ├── VPNManager / VPNManagerMac (NEVPNManager / NETunnelProviderManager)
   │        ├── KeychainStore / WireGuardKeychain (private key)
   │        └── ControlAPIClient (register + fetch nodes)
   │
   └── Packet Tunnel Provider (NEPacketTunnelProvider, WireGuardKit)
         │
         ▼
  Coordinator + exit node (VPS) → Internet (Vietnam)
```

## 3. Module / target layout (GATE 1)

- `PrivateVPN` — iOS app target (SwiftUI). Contains UI, VPNManager abstraction,
  state model.
- `PrivateVPNPacketTunnel` — Network Extension / Packet Tunnel Provider target.
  `NEPacketTunnelProvider` subclass with a real (skeleton) tunnel setup path.
- Future targets (GATE 2+): shared WireGuard core (mature implementation),
  control API client, backend.

## 4. VPN state model

Derived from actual NEVPNStatus / tunnel session; never from button taps alone.

```text
Disconnected → Connecting → Connected
     ↑            │             │
     │            ▼             ▼
     └────── Disconnecting ←────┘
                        ↘
                       Failed
```

Transitions considered: process restart, background/foreground, Wi-Fi↔cellular,
tunnel reconnect. For MVP only required transitions are implemented; failure maps
to `Failed` and is surfaced.

## 5. Data flow (control path)

```text
App → VPNManager → NEVPNManager.saveAndLoad → Packet Tunnel Provider
                                                     │
                          (startTunnel(with:))       ▼
                                             setup tunnel (WireGuard config)
                                                     │
                                                     ▼
                                              applyNetworkSettings
```

## 6. Data flow (future provisioning, GATE 2+)

```text
Device generates WireGuard keypair
   → public key → Control API (TLS)
   → server allocates IP, provisions peer on Vietnam node
   → returns client config
   → config stored; private key stays in Keychain
```

## 7. Security architecture

See `docs/SECURITY.md`. Key rules: private key only on-device in Keychain,
TLS everywhere, secrets never in repo, authorization server-side.

## 8. Key ADRs

- ADR-0001: Native Apple APIs + xcodegen (no third-party Xcode project toolchain)
- ADR-0002: Packet Tunnel Provider (NEPacketTunnelProvider) as VPN mechanism
- ADR-0003: Separate app + extension targets
- ADR-0004: Real VPN state model, evidence-gated verification

## 9. Routing & DNS design (future, GATE 2+)

- `AllowedIPs = 0.0.0.0/0`
- Explicit DNS server assignment in tunnel network settings
- IPv6: assess leakage; if unsupported, mitigate/document (RULE-VPN-005)

## 10. Open questions (architecture-level)

- Mature WireGuard user-space implementation choice for iOS (WGKit/wireguard-apple).
- Control plane stack (backend) and auth mechanism (Sign in with Apple / magic link / token).
- Vietnam node specifics (IP, OS) — none provided yet.

## 11. Verified facts (architecture-relevant)

See `.privatevpn/memory/VERIFIED_FACTS.md`. Only evidence-backed entries.

## Appendix B — As-built delta (2026-08-21)

The GATE 0 baseline above described an iOS-only app with an Express control
plane. During GATE 2/3 the as-built architecture moved to a **Tailscale-style
WireGuard mesh**; this appendix records the current reality.

### B1. Targets

- `PrivateVPN` — iOS app (SwiftUI), `PrivateVPNPacketTunnel` extension.
- `PrivateVPNMac` — macOS app (SwiftUI, branded as FlowVPN),
  `PrivateVPNMacPacketTunnel`
  extension. macOS data plane uses **NetworkExtension + WireGuardKit**
  (NEPacketTunnelProvider + WireGuardAdapter), reusing iOS tunnel code; no
  `wg-quick`/sudo.
- `PrivateVPNTests` — iOS unit tests (36/36 pass).

### B2. Coordinator + exit node

- Production coordinator URL: `https://api.meetflowai.site`.
- VPS exit node: `103.173.155.50` with WireGuard UDP `443`.

- Node 24 + `node:sqlite`; endpoints under `/v1/...`
  (`/v1/peers/register`, `/v1/peers/heartbeat`, `/v1/peers/me`,
  `/v1/peers/revoke`, `/v1/enrollment-tokens`, `/v1/nodes`, `/v1/health`).
- Auto-provisions peers into the exit node's `wg0` (`wg set`) on register/revoke;
  IP pool 10.77.0.2–254, WireGuard UDP 443.
- **Exit-node registry**: stored in **SQLite** (`nodes.db`, `node:sqlite`); `GET /v1/nodes`
  public, admin `GET/POST/PATCH/DELETE /v1/admin/nodes` (Bearer AUTH_TOKEN, fail-closed 503).
  Seed: `vietnam-1` (103.173.155.50:443).
- **Admin page**: `https://meetflowai.site/PrivateVPN/Admin` (public page, token-protected
  API; list + separate edit views). **Per-node health**: `GET /v1/admin/nodes/:id/health`
  (ping latency, `wg show transfer` bandwidth, capability peers/uptime/load).

### B3. Provisioning flow (two modes; login = email-only, owner decision)

```
NEW (authenticated, post-release):
  User signs in (email OTP via Resend) → session (Keychain, 30d)
  → Device generates keypair (Keychain)
  → POST /v1/enrollment-tokens (Bearer session, active subscription required)
  → POST /v1/peers/register (one-time enrollment token + Bearer session)
      → {overlay_ip, peer_credential, peers[]}
  → coordinator adds peer to wg0
  → app builds WireGuardConfig with IPv4 full-tunnel AllowedIPs 0.0.0.0/0
  → NEVPNManager / NETunnelProviderManager
  → startVPNTunnel → packet-tunnel provider → WireGuardAdapter

LEGACY (App-Store-review build, LEGACY_MODE=1 only):
  POST /v1/tokens (no auth) → one-time join token (30 min)
  → POST /v1/peers/register (join token, no auth) → {overlay_ip, peers[]}
  → same provisioning as above
```

Note: Sign in with Apple and Firebase Auth are explicitly NOT used (owner decision
2026-08-23); production login is email-OTP only, delivered by the owner SMTP mail server
(Postfix 465; SPF pass + DMARC p=none verified 2026-08-23 — iCloud/Gmail receive OTP).
Session TTL 30 days, persisted in Keychain. Admin user management: `GET /v1/admin/users`,
grant/revoke subscription, revoke user (see `control-plane/README.md`).

### B4. Key differences from GATE 0 baseline

- Full-tunnel `AllowedIPs = 0.0.0.0/0` to the exit node for Vietnam egress.
- Dev join token is single-use, 30-minute expiry; app auto-fetches from
  `/v1/tokens` only for local/internal builds. Production app clients must not
  call this endpoint.
- Production enrollment tokens must be issued for a signed-in user ID and active
  subscription, then consumed by `/v1/peers/register` to attach the device
  identity/public key to that user.
- `ControlAPIClient` is shared verbatim across iOS and macOS targets.
- Account login / multi-device ownership (Tailscale model) now has the first
  client contract and control-plane reference implementation; production VPS
  coordinator must deploy the same fail-closed policy before release.

### B5. macOS runtime packaging notes

- The macOS app must embed `PrivateVPNMacPacketTunnel.appex` under
  `FlowVPN.app/Contents/PlugIns/`; build scripts must not delete the embedded
  extension after Xcode copies it.
- `VPNManagerMac` should remove stale profiles for old app names, save a fresh
  `NETunnelProviderManager`, reload it from preferences, then start the tunnel.
  Starting an unsaved/stale manager can produce `NEVPNErrorDomain Code=4`.
- macOS connect UX should set `Connecting` immediately, show a short
  provisioning/permission message, and ignore duplicate Connect taps while the
  VPN profile is being saved or system permission is pending.
- macOS end-to-end exit-IP verification remains separate from build success and
  requires a Network Extension-capable signing profile on a real Mac.

### B6. Android / Windows client clone target

- Android and Windows clients reuse the production coordinator and exit-node
  registry. They should not duplicate backend functionality.
- Android UI should be Kotlin + Jetpack Compose and match the current iOS/macOS
  app style: narrow mobile-first dark layout, premium card, status card,
  dynamic location selector, and one large circular power button.
- Android VPN should use `VpnService.prepare()` for user consent, secure local
  key storage, WireGuard tunnel integration, and IPv4-only full-tunnel routing
  unless IPv6 overlay support is added later.
- Windows UI should match the same product style using WinUI 3 or an equivalent
  native stack, with WireGuardNT/official WireGuard tunnel service integration.
