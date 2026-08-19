# ADR-0003: Separate app target and Network Extension target

- **Status:** ACCEPTED
- **Date:** 2026-08-19

## Context

iOS requires a Network Extension to live in its own app extension target,
embedded into the containing app. Mixing code across the process boundary can
also cause compile-time and privacy issues.

## Decision

Two targets:

1. `PrivateVPN` — containing iOS app (SwiftUI). Owns UI, VPNManager (NEVPNManager
   wrapper), Keychain storage, state model.
2. `PrivateVPNPacketTunnel` — Packet Tunnel Provider extension, embedded in the app.

A shared source folder is used only for the pieces both need (e.g. tunnel config
model), kept minimal to avoid binary bloat and coupling.

## Alternatives

- Single target with conditional compilation — rejected: App Store/Network
  Extension packaging requires separate extension bundles.
- Third-party VPN framework with own extension target — evaluated later (GATE 2).

## Consequences

- Two schemes/products to build; extension must be code-signed/embedded on device.
- Cleaner security boundary: tunnel code has least privilege (RULE-SEC-001).
