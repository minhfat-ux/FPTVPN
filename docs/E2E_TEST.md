# PRIVATEVPN — E2E TEST PLAN

- **Version:** v0.1
- **Date:** 2026-08-19
- **Gate:** applies to GATE 2 / GATE 7 (real E2E). GATE 1 uses build + state-model tests only.
- **Principle:** `VPN UI CONNECTED != WORKING VPN`; mocks do not count (RULE-TEST-002/006).

## 1. Preconditions

- Physical iPhone (simulator cannot run a real tunnel — RULE-IOS-007).
- App signed with a team that has the Network Extension entitlement.
- Vietnam VPN node reachable and WireGuard peer provisioned.
- Control API reachable over TLS.

## 2. End-to-end scenario (spec §7 GATE 7)

```text
Fresh/authorized install → Authenticate → Register → Provision → Connect →
VN node reached → External IP == expected VN VPN IP → DNS works → HTTPS works →
Disconnect → normal route restored → Reconnect → works again → Revoke → reconnect blocked
```

## 3. Independent network verification (spec §83)

Before VPN: record public IP (A). After VPN: record public IP (B). Expect
`B == Vietnam VPN node public IP`. Then disconnect: public IP returns to normal
ISP path. Also verify DNS, HTTPS, reconnect, IPv6 behavior/leakage.

## 4. Connection state verification (FR-VPN-005 / AC-010)

- Observe UI state vs `NEVPNStatus` across: connect, disconnect, background/
  foreground, lock/unlock, Wi-Fi↔cellular, process restart, tunnel reconnect.
- No fake "connected" allowed; `Failed` states surfaced.

## 5. Revocation verification (FR-REVOKE-001/002)

- Revoke device via owner flow → server peer removed/disabled.
- Attempt connect from revoked device → must fail (validated against real access, RULE-SEC-005).

## 6. Evidence capture

Per step, capture: timestamp, commit, screenshot or log, pass/fail, verifier.
Store in `evidence/e2e/`. Sanitize secrets (RULE-EVID-005).

## 7. Known GATE-1 boundary

GATE 1 does not execute this plan. It proves: targets build, capability wiring
exists, UI + real state model exist. This file is the executable plan for GATE 2+.
