# REPORT — GATE 2/3 MESH + EXIT NODE + macOS APP (2026-08-21)

- **Timestamp:** 2026-08-21
- **Gate:** GATE 2/3 (mesh integration + macOS app)
- **SRS:** v0.1 | **Baseline:** RS-20260819-01 | **Rules:** RULESET-0001
- **Status:** macOS app RUNS + registers; coordinator mesh verified; iOS real-device blocked.

## Summary
Moved the iOS+macOS client onto a Tailscale-style WireGuard mesh driven by a VPS
coordinator + exit node, added a working macOS app, and updated all memory/state.
This is a checkpoint hand-off — next session starts on the **account login /
add-device** model and SRS baseline update.

## What changed
- **Coordinator (VPS 103.173.155.50)**: peer auto-provisioning into wg0 on
  register (`wg set`) and revoke (`wg set ... remove`); `/v1/tokens` issues
  one-time join tokens (30-min expiry).
- **ControlAPIClient**: rewritten for `/v1/peers/register`; added
  `fetchJoinToken()`.
- **macOS app `PrivateVPNMac`**: SwiftUI app that registers and drives wg-quick
  to the exit node; auto-fetches join token; unique peer name per register.
- **iOS app**: same client code; builds + 36/36 tests pass; device E2E blocked.
- **SRS**: added Appendix A documenting architecture drift + pending account
  requirements (no baseline promoted yet).

## Verified
- Coordinator `/v1/peers/register` returns `{peer_id, overlay_ip, network,
  peer_credential, peers[]}`; peer appears in `wg show wg0 peers` after register.
- macOS app builds + launches + registers. iOS + macOS tests 36/36 PASS.
- VF-012, VF-013, VF-014.

## Blocked / next
- macOS end-to-end egress: user runs `sudo wg-quick up`, verify exit IP.
- iOS real-device: reinstall/complete Xcode 26.6 (DeviceSupport/DDI).
- Next design: **account login + add device** (FR-AUTH-001, multi-device owner).
