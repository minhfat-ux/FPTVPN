# PRIVATEVPN — SECURITY

- **Version:** v0.1
- **Date:** 2026-08-19
- **Baseline:** RS-20260819-01
- **Source:** master spec §20, §38, §109, §77

## 1. Threat model (MVP focus)

- Attacker on same network / ISP cannot read tunneled traffic (WireGuard).
- Attacker with device access cannot extract the WireGuard private key.
- A compromised/revoked device cannot keep connecting.
- Secrets never end up in the repository or logs.
- Control API requests without authorization are rejected.

## 2. Mandatory security baseline (spec §20)

- Private key generated on-device
- Private key never sent to backend
- Private key never logged
- Secrets never committed
- TLS for control API
- Server-side authorization
- Device revocation
- Safe peer provisioning
- Input validation
- No shell injection
- Least privilege
- Audit events
- Sensitive evidence sanitized

## 3. Client security design (iOS)

- **Keychain**: WireGuard private key and credentials stored in iOS Keychain
  (kSecClassGenericPassword, app + extension access groups). No plaintext files.
- **Key generation**: on-device (GATE 3) using a mature WireGuard implementation.
- **No logging of secrets**: debug logs only metadata; `RULE-SEC-002`.
- **Least privilege**: extension runs only tunnel operations.

## 4. Network Extension / App Store constraints (spec §109)

- Packet Tunnel Provider requires the `com.apple.developer.networking.networkextension`
  entitlement (development). Real-device run requires an Apple development team
  signing identity (available: `minhnb2@me.com`).
- Development builds on simulator work for compilation only; VPN runtime requires
  a physical iPhone (RULE-IOS-007).
- App Store approval is a separate, evidence-required process — never claim
  readiness without evidence (spec §109).

## 5. Repository hygiene

- `.gitignore` excludes derived data, secrets, generated `.xcodeproj`, `*.p12`,
  `.env`, `*.mobileprovision`, `*.xcconfig` with secrets.
- Secret scan runs at GATE 0 (evidence in `evidence/security/`).
- Pre-commit check: no `PRIVATE KEY`, `xoxb-`, `AKIA`, password patterns.

## 6. Severity definitions (spec §77)

- CRITICAL: private key exposure, auth bypass, catastrophic privacy/data issue.
- HIGH: cannot connect, revoked device reconnects, DNS broken, major privacy leak.
- MEDIUM: unreliable reconnect, wrong state under transitions, important UX.
- LOW: cosmetic, minor copy, non-blocking diagnostics.

Unresolved CRITICAL / blocking HIGH findings block gate verification (RULE-SEC-008).

## 7. Audit & evidence

- Sensitive evidence sanitized before storage (RULE-EVID-005).
- Security-relevant claims require evidence; no narrative-only "secure".
