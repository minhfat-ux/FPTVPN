# Control-plane smoke test — 2026-08-19 (independent verification)

Run: `DRY_RUN=1 PORT=18080 DATA_FILE=/tmp/pvpn-cp-test/devices.json AUTH_TOKEN=devtoken node src/index.js`
Node: v26.6.0. WireGuard calls go through the DRY_RUN path (wg binary not invoked).

| Step | Result |
|------|--------|
| GET /health without auth | 401 Unauthorized (auth middleware active) |
| POST /device without auth | 401 |
| POST /device (pubkey1, "iPhone 15") | 201 — device id 9ecc23e1..., assignedIP 10.77.0.2, active true |
| POST /device (pubkey2, "iPhone 16") | 201 — assignedIP 10.77.0.3 (pool increments) |
| POST /device (pubkey1 again) | 200 — same device id, same IP 10.77.0.2 (idempotent re-register) |
| POST /device with empty body | 400 publicKey is required |
| DELETE /device/:id | 200 — active=false (deactivated) |
| wg dry-run calls (server log) | `wg set wg0 peer <pubkey1> allowed-ips 10.77.0.2/32`, `... peer <pubkey2> allowed-ips 10.77.0.3/32`, `wg set wg0 peer <pubkey1> remove` on DELETE |

Conclusion: device registration, IP allocation (10.77.0.0/24 pool), idempotency,
auth, validation, and peer provisioning/removal all behave as specified
(FR-DEVICE-001, FR-PROVISION-001, FR-PROVISION-002 code paths).
