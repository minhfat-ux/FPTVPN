# PRIVATEVPN iOS MVP — SRS v0.1

- **Version:** v0.1
- **Baseline ID:** RS-20260819-01
- **Status:** APPROVED (owner directive = master spec; GATE 0 bootstrap)
- **Date:** 2026-08-19
- **Author:** Culi (engineering orchestrator) / MinhNb2 (owner)
- **Source of truth for scope:** `docs/spec/CULI_PRIVATEVPN_IOS_MASTER_SPEC.md` §1–§8, §27, §37, §19

> This SRS converts the product objective into testable requirements. Requirement
> IDs follow §8. Requirements are versioned (§13). Verification state is tracked
> in `docs/REQUIREMENTS_REGISTRY.md` and `.privatevpn/status/requirements.json`.

---

## 1. Product Purpose

PrivateVPN is an iOS private VPN application that lets an authorized user route
their iPhone's Internet traffic through a Vietnam VPN node operated by us, so
that the public Internet IP observed by external servers is the Vietnam VPN
node's public IP, protected by a WireGuard tunnel.

## 2. Scope (MVP)

In scope (per §3.1):

- iOS client (Swift/SwiftUI)
- Packet Tunnel Provider (Network Extension)
- WireGuard data plane (mature Apple WireGuard-compatible implementation)
- One Vietnam VPN node
- Basic user authentication
- Device identity, registration, and revocation
- Local WireGuard key generation; peer provisioning
- Connect / disconnect with a real VPN state model
- Basic diagnostics and owner visibility
- Real-device E2E, external public-IP / DNS / HTTPS verification, disconnect
  restoration, reconnect

## 3. Out of Scope (§3.2 — deferred)

Mesh networking, DERP/relays, NAT traversal platform, device-to-device VPN,
subnet routers, advanced ACLs, org/team management, billing/subscriptions,
App Store commercial flow, multi-region auto-routing, non-iOS clients,
traffic analytics platform, ad blocker, threat protection, split-tunnel UI,
advanced enterprise administration.

## 4. Personas

| ID | Persona | Notes |
|----|---------|-------|
| P-01 | Authorized user (own device) | Installs app, signs in, registers device, connects to Vietnam. |
| P-02 | Owner / operator (MinhNb2) | Manages control plane, can revoke devices, sees node status. |

## 5. User Stories

- US-01: As an authorized user I can install the app and reach the sign-in screen.
- US-02: As an authorized user I can authenticate and register this iPhone.
- US-03: As an authorized user I can select the Vietnam VPN location.
- US-04: As an authorized user I can press Connect and observe real connection states.
- US-05: As an authorized user I can verify my public IP is the Vietnam node IP.
- US-06: As an authorized user I can disconnect and have normal routing restored.
- US-07: As an authorized user I can reconnect.
- US-08: As an owner I can revoke a device so it can no longer connect.

## 6. Functional Requirements

### 6.1 Authentication

| ID | Version | Requirement | Acceptance criteria |
|----|---------|-------------|---------------------|
| FR-AUTH-001 | v1 | The app SHALL provide a sign-in flow for an authorized user. | AC-001: user can authenticate and reach a signed-in state; auth identity is separate from device identity. |

### 6.2 Device identity & registration

| ID | Version | Requirement | Acceptance criteria |
|----|---------|-------------|---------------------|
| FR-DEVICE-001 | v1 | The app SHALL generate a stable device identity and register the device with the control plane. | AC-002: device registers successfully; backend records device_id, name, platform, status, created_at. |
| FR-DEVICE-002 | v1 | The app SHALL generate a WireGuard keypair locally. | AC-003: public key available; private key present only in secure local storage (Keychain) — never logged, never transmitted. |

### 6.3 Provisioning

| ID | Version | Requirement | Acceptance criteria |
|----|---------|-------------|---------------------|
| FR-PROVISION-001 | v1 | The control plane SHALL allocate a unique persistent tunnel IP for the device and return a client VPN config. | AC-004: device receives config with assigned IP in the designated subnet; allocation visible and non-duplicate. |
| FR-PROVISION-002 | v1 | The control plane SHALL assign the Vietnam VPN node and provision the server-side peer. | AC-005: server peer exists for the device's public key. |

### 6.4 VPN connect / disconnect

| ID | Version | Requirement | Acceptance criteria |
|----|---------|-------------|---------------------|
| FR-VPN-001 | v1 | The iOS app SHALL establish a WireGuard VPN tunnel to the assigned Vietnam VPN node. | AC-006: tunnel establishes on a real device; public exit IP == Vietnam node public IP. |
| FR-VPN-002 | v1 | The app SHALL route Internet traffic through the tunnel with AllowedIPs 0.0.0.0/0. | AC-007: external service sees traffic from Vietnam node IP; DNS and HTTPS work. |
| FR-VPN-003 | v1 | The app SHALL disconnect and restore normal routing. | AC-008: after disconnect, public IP returns to normal ISP path. |
| FR-VPN-004 | v1 | The app SHALL support reconnect after a disconnect. | AC-009: reconnect succeeds and exit IP is again the Vietnam node IP. |

### 6.5 Connection state model

| ID | Version | Requirement | Acceptance criteria |
|----|---------|-------------|---------------------|
| FR-VPN-005 | v1 | The app SHALL maintain a real VPN state model: disconnected / connecting / connected / disconnecting / failed. | AC-010: state derives from actual tunnel/session state, not only UI button events; no fake "connected". |

### 6.6 Revocation

| ID | Version | Requirement | Acceptance criteria |
|----|---------|-------------|---------------------|
| FR-REVOKE-001 | v1 | The owner SHALL be able to revoke a device. | AC-011: revoke disables/removes the server peer. |
| FR-REVOKE-002 | v1 | A revoked device SHALL NOT be able to connect. | AC-012: connect attempt by revoked device fails (verified against real VPN access). |

### 6.7 Diagnostics & visibility

| ID | Version | Requirement | Acceptance criteria |
|----|---------|-------------|---------------------|
| FR-ADMIN-001 | v1 | The control plane SHALL expose device and node status to the owner. | AC-013: owner can query device status and node status. |
| FR-DIAG-001 | v1 | The app SHALL expose basic diagnostics (assigned VPN IP, node, last error, state). | AC-014: diagnostics visible on-device without leaking secrets. |

## 7. Non-Functional Requirements

| ID | Version | Requirement | Acceptance criteria |
|----|---------|-------------|---------------------|
| NFR-SEC-001 | v1 | WireGuard private key MUST be generated on-device and never leave the device. | AC-015: no code path transmits/logs the private key; Keychain storage. |
| NFR-SEC-002 | v1 | Control API MUST use TLS. | AC-016: API endpoints TLS-only in production. |
| NFR-SEC-003 | v1 | Secrets MUST NOT be committed to the repository. | AC-017: secret-scan passes on commit/repo. |
| NFR-SEC-004 | v1 | Server-side authorization MUST be enforced. | AC-018: unauthorized requests are rejected. |
| NFR-PRIV-001 | v1 | The app MUST NOT log or transmit personal data beyond what is required for the VPN service. | AC-019: evidence from review. |
| NFR-PERF-001 | v1 | Connect action responds with state feedback within reasonable time on real hardware. | AC-020: state transitions observable; no unbounded waits. |
| NFR-REL-001 | v1 | The app SHALL restore sane VPN state after process restart / network change (Wi-Fi↔cellular). | AC-021: critical transitions handled without false "connected". |
| NFR-UX-001 | v1 | One-tap Connect and one-tap Disconnect for MVP. | AC-022: single action transitions state correctly. |
| NFR-OBS-001 | v1 | Owner-visible dashboard reflects authoritative project state. | AC-023: dashboard rebuilds from durable state after restart. |

## 8. Platform constraints (known)

- Network Extension entitlement is required for Packet Tunnel Provider; development
  entitlement needs an Apple team (available as identity `minhnb2@me.com`), but
  simulator builds can use `CODE_SIGNING_ALLOWED=NO`.
- **Simulator cannot run a real Packet Tunnel**: building succeeds, but VPN E2E
  (GATE 2+) requires a physical iPhone. This is a documented blocker, not a gate-1 failure.
- Prefer native Apple APIs: SwiftUI, NetworkExtension, NEVPNManager, Keychain,
  mature WireGuard-compatible implementation (§19). Do not implement WireGuard crypto ourselves.

## 9. Dependencies

- xcodegen 2.46.0 (build generation)
- Xcode 26.6 / Swift 6.3.3 / iOS SDK 26.5
- Packet Tunnel Provider target (app extension)
- Vietnam WireGuard node + control plane (backend, GATE 2+)
- Mature WireGuard user-space implementation for iOS (GATE 2+)

## 10. Security requirements (summary)

See `docs/SECURITY.md`. Mandatory baseline: on-device keygen, private key never
leaves device, TLS control API, server-side authorization, device revocation,
input validation, no shell injection, least privilege, audit events, sanitized
evidence.

## 11. Verification requirements

Verification is evidence-based. Acceptance requires: iOS app builds (GATE 1),
real-device tunnel + public IP = Vietnam node IP (GATE 2), DNS/HTTPS/reconnect/
disconnect/revoke (GATE 2–4, 7), security review (GATE 6). Evidence stored in
`evidence/`. Rules in `.privatevpn/rules/` (RULE-TEST-*, RULE-EVID-*, RULE-VERIFY-*).

## 12. Requirement versioning & baseline

- Each requirement carries a version (v1 = this baseline).
- Baseline **RS-20260819-01** is the active baseline for GATE 0/GATE 1.
- Changes are tracked via `docs/REQUIREMENTS_CHANGELOG.md` (CR-xxxx) and
  `docs/REQUIREMENTS_TRACEABILITY.md`.

## 13. Requirement state (approval vs implementation)

Approval: all requirements above are APPROVED (derived from owner-approved master spec).
Implementation state is separate and tracked per requirement in the registry:
NOT_STARTED / PARTIAL / IMPLEMENTED / VERIFYING / VERIFIED / FAILED / BLOCKED / NEEDS_REVERIFY.

## 14. Current SRS baseline

```text
SRS: v0.1
Requirement baseline: RS-20260819-01
Gate: GATE 1 (iOS VPN Skeleton) — in progress
```

---

## Appendix A — Architecture drift & pending baseline update (2026-08-21)

This SRS (v0.1, RS-20260819-01) was written for the original **iOS-only,
Express control-plane** design. During GATE 2/3 execution the architecture
moved to a **Tailscale-style WireGuard mesh** with a **VPS coordinator + exit
node**, and a **macOS target** was added. This appendix records that drift so
the SRS can be updated in the next baseline revision. **No requirement IDs were
deleted or re-scoped here; this is a documented delta pending owner approval.**

### A1. What changed in the implementation

1. **Coordinator (VPS `103.173.155.50:7777`)** replaces the in-repo Express
   `control-plane/`. It is Node 24 + `node:sqlite`, endpoints under `/v1/...`
   (`/v1/peers/register`, `/v1/peers/heartbeat`, `/v1/peers/revoke`,
   `/v1/tokens`, `/v1/health`, ...). It auto-provisions peers into the exit
   node's `wg0` (`wg set`) on register/revoke.
2. **Exit-node model**: the app connects to the VPS exit node
   (`103.173.155.50:443`) with full-tunnel `AllowedIPs = 0.0.0.0/0` for Internet
   egress through Vietnam. This supersedes the earlier "one central VPN server
   provisions a server-side peer" framing while keeping the same user outcome.
3. **macOS target** `PrivateVPNMac` added (SwiftUI app that registers and runs
   `wg-quick`), reusing `ControlAPIClient`. iOS remains the primary client.
4. **Join token** is single-use with 30-minute expiry; the app auto-fetches a
   fresh token via `POST /v1/tokens` when the field is empty.

### A2. Pending requirements for next baseline (Tailscale account model)

- **FR-AUTH-001 (account login)**: user signs in (email+password / magic link /
  token). Currently only one-time join tokens exist; account ownership is not
  yet implemented.
- **FR-DEVICE multi-device ownership**: one user owns many devices (Tailscale
  model); device registration tied to the signed-in user rather than a join token.
- **Device list + revoke UI** in the app (server-side `/v1/peers/revoke` exists).

### A3. Not changed

- On-device WireGuard keygen; private key never leaves the device.
- Real state model; evidence-gated verification; no fake "connected".
- iOS Packet Tunnel Provider as the data plane (when running on device).

> **Action (owner/next session):** update §1–§8, §14 and the requirements registry
> to reflect the mesh + coordinator + account model, and open a CR against
> RS-20260819-01 before promoting the next baseline.

