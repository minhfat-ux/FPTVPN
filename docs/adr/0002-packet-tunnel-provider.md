# ADR-0002: VPN mechanism — Packet Tunnel Provider (NEPacketTunnelProvider)

- **Status:** ACCEPTED
- **Date:** 2026-08-19

## Context

The MVP must run WireGuard on iOS. Options: `NEVPNProtocolIPSec`/`IKEv2`
(built-in protocol, no WireGuard), or a custom `NEPacketTunnelProvider` that
carries a WireGuard user-space tunnel.

## Decision

Use a Network Extension **Packet Tunnel Provider** (`NEPacketTunnelProvider`
subclass) as the VPN mechanism, driven by `NEVPNManager` from the app.

## Alternatives

- NEVPNProtocolIKEv2 — rejected: not WireGuard; we need our own Vietnam node + WireGuard.
- Direct socket/rooted VPN — rejected: not supported on iOS.

## Consequences

- Requires Network Extension entitlement; real-device signing needed for runtime.
- Simulator builds the extension but cannot run a real tunnel (documented blocker).
- WireGuard transport is provided by a mature user-space implementation (GATE 2+);
  we do not implement WireGuard crypto ourselves.

## Related requirements

FR-VPN-001, FR-VPN-005, NFR-REL-001. See SRS §8 platform constraints.
