# PRIVATEVPN — REQUIREMENTS REGISTRY

- **Baseline:** RS-20260819-01 (SRS v0.1)
- **Date:** 2026-08-20 (impl states synced with `.privatevpn/status/requirements.json`)
- **Authoritative source:** `docs/SRS.md`
- **State model:** DRAFT → PROPOSED → APPROVED → ACTIVE → SUPERSEDED → DEPRECATED → REJECTED (spec §9)
- **Implementation state:** NOT_STARTED / PARTIAL / IMPLEMENTED / VERIFYING / VERIFIED / FAILED / BLOCKED / NEEDS_REVERIFY

## Requirement summary

| ID | Title | Version | Approval | Impl. state | Gate |
|----|-------|---------|----------|-------------|------|
| FR-AUTH-001 | Sign-in flow for authorized user | v1 | APPROVED | IMPLEMENTED (email-OTP login via SMTP — verified production 2026-08-23; subscription source pending) | 4 |
| FR-DEVICE-001 | Device registration | v1 | APPROVED | IMPLEMENTED (GATE 3) | 3 |
| FR-DEVICE-002 | On-device WireGuard keygen, private key local | v1 | APPROVED | IMPLEMENTED (GATE 3) | 3 |
| FR-PROVISION-001 | Tunnel IP allocation + client config | v1 | APPROVED | IMPLEMENTED (GATE 3) | 3 |
| FR-PROVISION-002 | Vietnam node assignment + server peer | v1 | APPROVED | IMPLEMENTED (GATE 3) | 3 |
| FR-VPN-001 | Establish WireGuard tunnel to VN node | v1 | APPROVED | VERIFIED (iPhone E2E 2026-08-23) | 2 |
| FR-VPN-002 | Route Internet via tunnel (0.0.0.0/0) | v1 | APPROVED | VERIFIED (iPhone E2E 2026-08-23) | 2 |
| FR-VPN-003 | Disconnect restores normal routing | v1 | APPROVED | VERIFIED (iPhone E2E 2026-08-23) | 2 |
| FR-VPN-004 | Reconnect after disconnect | v1 | APPROVED | VERIFIED (iPhone E2E 2026-08-23) | 2 |
| FR-VPN-005 | Real VPN state model, no fake connected | v1 | APPROVED | IMPLEMENTED (GATE 1) | 1 |
| FR-REVOKE-001 | Owner can revoke device | v1 | APPROVED | PARTIAL (GATE 4) | 4 |
| FR-REVOKE-002 | Revoked device cannot connect | v1 | APPROVED | PARTIAL (GATE 4) | 4 |
| FR-ADMIN-001 | Device/node status visibility for owner | v1 | APPROVED | IMPLEMENTED (GATE 5) | 5 |
| FR-DIAG-001 | Basic on-device diagnostics | v1 | APPROVED | IMPLEMENTED (GATE 5) | 5 |
| NFR-SEC-001 | Private key on-device only | v1 | APPROVED | IMPLEMENTED (Keychain + tests 37/37 PASS 2026-08-20) | 3 |
| NFR-SEC-002 | Control API TLS | v1 | APPROVED | IMPLEMENTED (GATE 3) | 3 |
| NFR-SEC-003 | No secrets committed | v1 | APPROVED | IMPLEMENTED (baseline hygiene) | 0 |
| NFR-SEC-004 | Server-side authorization | v1 | APPROVED | IMPLEMENTED (AC-018 — admin endpoints fail closed 2026-08-20) | 4 |
| NFR-PRIV-001 | Minimal data collection/logging | v1 | APPROVED | IMPLEMENTED (3 low issues fixed 2026-08-20) | 6 |
| NFR-PERF-001 | Responsive connect feedback | v1 | APPROVED | PARTIAL (GATE 1) | 1 |
| NFR-REL-001 | Restore sane state after restart/network change | v1 | APPROVED | PARTIAL (GATE 1) | 1 |
| NFR-UX-001 | One-tap connect/disconnect | v1 | APPROVED | IMPLEMENTED (GATE 1) | 1 |
| NFR-OBS-001 | Owner dashboard reflects authoritative state | v1 | APPROVED | PARTIAL (GATE 0 bootstrap) | 0 |

## Implementation counts (synced 2026-08-20, from `.privatevpn/status/requirements.json`)

| Impl. state | Count | Requirements |
|-------------|-------|--------------|
| IMPLEMENTED | 18 | FR-AUTH-001, FR-DEVICE-001/002, FR-PROVISION-001/002, FR-VPN-001..005, FR-ADMIN-001, FR-DIAG-001, NFR-SEC-001/002/003/004, NFR-UX-001, NFR-PRIV-001 |
| PARTIAL | 4 | FR-REVOKE-001/002, NFR-PERF-001, NFR-REL-001, NFR-OBS-001 |
| NOT_STARTED | 0 | — |
| **Total** | **23** | |

## Acceptance criteria

| AC | Requirement | Criterion (abbrev) |
|----|-------------|---------------------|
| AC-001 | FR-AUTH-001 | User authenticates; identity distinct from device identity. |
| AC-002 | FR-DEVICE-001 | Device registered; backend record. |
| AC-003 | FR-DEVICE-002 | Public key available; private key only in Keychain. |
| AC-004 | FR-PROVISION-001 | Unique persistent IP; non-duplicate allocation. |
| AC-005 | FR-PROVISION-002 | Server peer provisioned. |
| AC-006 | FR-VPN-001 | Real-device tunnel; exit IP == VN node IP. |
| AC-007 | FR-VPN-002 | Traffic from VN IP; DNS + HTTPS work. |
| AC-008 | FR-VPN-003 | After disconnect, normal ISP IP restored. |
| AC-009 | FR-VPN-004 | Reconnect succeeds; exit IP again VN IP. |
| AC-010 | FR-VPN-005 | State derives from real tunnel state; no fake connected. |
| AC-011 | FR-REVOKE-001 | Revoke disables/removes server peer. |
| AC-012 | FR-REVOKE-002 | Revoked device cannot connect (verified). |
| AC-013 | FR-ADMIN-001 | Owner can query device + node status. |
| AC-014 | FR-DIAG-001 | Diagnostics visible without leaking secrets. |
| AC-015 | NFR-SEC-001 | No code path transmits/logs private key. |
| AC-016 | NFR-SEC-002 | Control API TLS-only in production. |
| AC-017 | NFR-SEC-003 | Secret scan passes. |
| AC-018 | NFR-SEC-004 | Unauthorized requests rejected. |
| AC-019 | NFR-PRIV-001 | Review evidence of minimal data. |
| AC-020 | NFR-PERF-001 | State transitions observable, no unbounded waits. |
| AC-021 | NFR-REL-001 | Critical transitions handled without false connected. |
| AC-022 | NFR-UX-001 | Single action transitions state correctly. |
| AC-023 | NFR-OBS-001 | Dashboard rebuilds from durable state after restart. |

## Gate mapping

- GATE 0 (bootstrap): NFR-SEC-003, NFR-OBS-001 (docs/state only)
- GATE 1 (skeleton): FR-VPN-005, FR-DIAG-001 (partial), NFR-PERF-001 (partial), NFR-REL-001 (partial), NFR-UX-001
- GATE 2 (static tunnel): FR-VPN-001/002/003/004
- GATE 3 (dynamic provisioning): FR-DEVICE-001/002, FR-PROVISION-001/002, NFR-SEC-001/002
- GATE 4 (auth & revocation): FR-AUTH-001, FR-REVOKE-001/002, NFR-SEC-004
- GATE 5 (UX & diagnostics): FR-ADMIN-001, FR-DIAG-001 (full)
- GATE 6 (security review): NFR-PRIV-001
