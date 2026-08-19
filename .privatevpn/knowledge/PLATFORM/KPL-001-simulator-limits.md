# KPL-001 — Simulator limits for Network Extension

- **Status:** ACTIVE | **Confidence:** HIGH | **Date:** 2026-08-19
- **Summary:** iOS Simulator cannot run a real Packet Tunnel (no kernel/extension support). Compilation works; runtime VPN needs a physical iPhone. Never claim E2E from a simulator build.
- **Provenance:** RULE-IOS-007; environment audit (iOS 26.5 sims).
- **Applies to:** GATE 1 vs GATE 2 boundary.
