# SECURITY RULES (RULE-SEC-*)

Baseline RULESET-0001. Source: master spec §52, §20.

- RULE-SEC-001: WireGuard private keys remain on-device.
- RULE-SEC-002: Private keys must never be logged.
- RULE-SEC-003: Secrets must not be committed.
- RULE-SEC-004: Authorization must be enforced server-side.
- RULE-SEC-005: Revocation must be validated against real VPN access.
- RULE-SEC-006: Do not expose production credentials to external agents.
- RULE-SEC-007: Security-sensitive config/shell operations must validate inputs.
- RULE-SEC-008: Critical/high security findings block relevant gate verification.
