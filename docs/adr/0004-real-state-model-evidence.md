# ADR-0004: Real VPN state model, evidence-gated verification

- **Status:** ACCEPTED
- **Date:** 2026-08-19

## Context

The master spec (§4, §27, §37, AP-VPN-001) explicitly forbids faking "connected":
VPN UI state must derive from underlying VPN state, and `VPN UI CONNECTED !=
WORKING VPN`. Gates must be marked VERIFIED only with evidence.

## Decision

1. The app exposes a `VPNState` enum (`disconnected`, `connecting`, `connected`,
   `disconnecting`, `failed`) whose value is driven by
   `NEVPNStatusDidChange` observations of the real `NEVPNManager` status — never
   set optimistically by the UI on button tap.
2. No gate is marked VERIFIED without stored evidence in `evidence/` mapped to a
   requirement (RULE-EVID-001/002, RULE-VERIFY-005). Simulator build success
   proves buildability only, not VPN E2E (RULE-IOS-007).

## Alternatives

- Optimistic UI state ("connected" on tap) — rejected: violates FR-VPN-005/AC-010.
- Marking GATE 1 VERIFIED based on a screenshot alone — rejected: needs build log
  + evidence mapping.

## Consequences

- Cleaner truth: the dashboard never shows fake green.
- Verification costs are explicit and reproducible.
