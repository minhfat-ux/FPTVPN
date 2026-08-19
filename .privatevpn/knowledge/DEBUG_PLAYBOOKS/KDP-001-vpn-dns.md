# KDP-001 — VPN connects but DNS fails

- **Status:** ACTIVE | **Confidence:** MED | **Date:** 2026-08-19
- **Symptom:** tunnel up, DNS fails.
- **Procedure:** 1) confirm tunnel state 2) test direct IP 3) test DNS 4) inspect tunnel DNS settings 5) inspect server forwarding/NAT 6) check route overlap 7) check IPv6 8) runtime logs.
- **Provenance:** master spec §42.
- **Applies to:** GATE 2+.
