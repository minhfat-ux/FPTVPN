# PRIVATEVPN iOS MVP — Architecture v0.1

- **Version:** v0.1
- **Baseline:** RS-20260819-01
- **Date:** 2026-08-19
- **Status:** APPROVED (GATE 0)
- **Source:** `docs/spec/...MASTER_SPEC.md` §16, §19, §20, §21, §22, §26, §27, §117

## 1. Goals

- Minimum viable VPN client that is buildable and honest about state.
- Separation of app, VPN extension, and (future) control plane.
- Real VPN state model; no fake "connected".
- On-device key generation and secure storage.

## 2. System context

```text
 iPhone
   │
   ├── PrivateVPN iOS App (SwiftUI)
   │        │
   │        ├── VPNManager (NEVPNManager + PacketTunnelProvider)
   │        ├── KeychainStore (private key, credentials)
   │        └── ControlAPIClient (TLS; future)
   │
   └── Packet Tunnel Provider (NEPacketTunnelProvider, WireGuard)
         │
         ▼
  WireGuard tunnel → Vietnam VPN node → Internet
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
