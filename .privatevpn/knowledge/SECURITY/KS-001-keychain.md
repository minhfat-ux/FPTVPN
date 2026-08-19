# KS-001 — Device secret handling on iOS (Keychain)

- **Status:** ACTIVE | **Confidence:** HIGH | **Date:** 2026-08-19
- **Summary:** WireGuard private key and credentials stored via Security framework (Keychain). Never log, never transmit private key (RULE-SEC-001/002/003).
- **Provenance:** master spec §20; Apple Security docs.
- **Applies to:** GATE 3+.
