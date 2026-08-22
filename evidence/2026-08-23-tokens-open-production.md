# Evidence — Production `POST /v1/tokens` is open without auth (H1 CONFIRMED)

- **Date:** 2026-08-23
- **Verifier:** DSH secondary reviewer (session)
- **Requirement:** FR-AUTH-001 (NOT_STARTED), NFR-SEC-004 / AC-018, SRS Appendix A2
- **Bug:** BUG-20260823-001
- **Result:** **CONFIRMED — production coordinator issues join tokens with no authentication**

## 1. Static inspection (server-side, VPS 103.173.155.50)

Coordinator: `/root/privatevpn/dist/server.js` (production service `privatevpn.service`):

```js
// --- Issue a one-time join token (auto-provisioning) ---
// Protected by ADMIN_TOKEN when set; open (dev only) otherwise.
app.post('/v1/tokens', (req, res) => {
    const admin = process.env.ADMIN_TOKEN;
    if (admin) {
        // Bearer check...
    }
    const created = coordinator.createJoinToken();
    return res.status(201).json({ token: created.token, expires_at: created.expires_at });
});
```

Token issuance only requires `ADMIN_TOKEN` **when it is set**; otherwise open.

## 2. Runtime environment check (server-side)

- Active service: `systemctl show privatevpn.service -p ExecStart` →
  `/usr/bin/node /root/privatevpn/dist/cli.js coordinator start --bind 0.0.0.0 --port 7777`
- Running process (PID 70990) `/proc/<pid>/environ`: `NODE_ENV=production` only.
  **`ADMIN_TOKEN` is NOT set** (no ADMIN_TOKEN entry present).
- `wg show wg0 peers` → **13 peers** (real devices connected).

## 3. External black-box test (from developer Mac, no auth)

```text
curl -s -X POST https://api.meetflowai.site/v1/tokens
HTTP_STATUS=201
HAS_TOKEN: YES, len=42, prefix=PVPN-JOI..., suffix=...zlds
expires_at: 2026-08-22T18:25:53.424Z   (30-min expiry)
```

Also: `GET /v1/nodes` → HTTP 200 (public, by design).

Token value deliberately masked (RULE-EVID-005).

## 4. Impact

- **Paywall bypass:** anyone can mint join tokens and use the Vietnam exit node for free.
- **Revocation bypass:** a revoked device can mint a new token + new name and re-register
  (FR-REVOKE-002 at risk; "revoked device reconnects" = HIGH per `docs/SECURITY.md` §6).
- NFR-SEC-004 / AC-018 evidence in repo covers the old `control-plane/` codebase;
  it does **not** cover this production coordinator's auth model.

## 5. Fix options (owner decision)

1. Set `ADMIN_TOKEN` in the systemd unit and require `Authorization: Bearer` on `/v1/tokens`.
2. Bind tokens to a registered user with an active subscription (SRS A2 / FR-AUTH-001).
3. Restrict `/v1/tokens` to localhost/internal clients only (Caddy ACL).
4. Re-verify after fix: external POST without auth must return 401/403.
