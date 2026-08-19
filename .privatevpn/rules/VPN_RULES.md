# VPN RULES (RULE-VPN-*)

Baseline RULESET-0001. Source: master spec §54, §26.

- RULE-VPN-001: WireGuard handshake != working VPN.
- RULE-VPN-002: VPN acceptance must independently verify public IP.
- RULE-VPN-003: DNS must be independently tested.
- RULE-VPN-004: Disconnect must restore normal routing.
- RULE-VPN-005: IPv6 behavior/leakage must be explicitly assessed.
- RULE-VPN-006: Do not replace existing VPN peers/config wholesale.
- RULE-VPN-007: Do not disable unrelated VPN/Tailscale services.
- RULE-VPN-008: Routing/NAT changes must preserve unrelated workloads.
