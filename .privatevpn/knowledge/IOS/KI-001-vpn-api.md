# KI-001 — iOS VPN API surface

- **Status:** ACTIVE | **Confidence:** HIGH | **Date:** 2026-08-19
- **Summary:** App uses NEVPNManager (load/prepare/save, protocol = NETunnelProviderProtocol, providerBundleIdentifier = extension). Extension = NEPacketTunnelProvider.startTunnel(with:), stopTunnel, NEVPNStatusDidChange drives real state. No fake connected.
- **Provenance:** Apple NetworkExtension docs; ADR-0002; ADR-0004.
- **Why it matters:** correct wiring of capability and state.
- **Applies to:** GATE 1-2.
