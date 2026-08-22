# Control Plane — PrivateVPN

Simple Node.js control plane that registers devices, allocates an IP from a pool,
and provisions the peer on the WireGuard node (Tailscale-style).

## Requirements

- Node.js >= 18
- Runs on (or has access to) the WireGuard node so it can call `wg set`.

## Config (env vars)

| Var | Default | Description |
|-----|---------|-------------|
| `PORT` | `8080` | HTTP port |
| `WG_INTERFACE` | `wg0` | WireGuard interface to manage |
| `WG_SERVER_PUBKEY` | `""` | Server's WireGuard public key (returned to clients) |
| `WG_PUBLIC_ENDPOINT` | `""` | Public endpoint returned to clients (e.g. `host:port`) |
| `IP_POOL_CIDR` | `10.77.0.0/24` | Pool subnet; server uses .1, clients get .2–.254 |
| `WG_BIN` | `wg` | path to `wg` binary |
| `WG_CMD` | `` | if set, all wg calls go through `wg set` via this wrapper command |
| `AUTH_TOKEN` | (empty) | if set, `Authorization: Bearer *** required |
| `ADMIN_ALLOWED_IPS` | `127.0.0.1,::1` | comma-separated client IPs allowed to access `/admin` and admin node APIs |
| `DATA_FILE` | `./data/devices.json` | persistence for device registry |
| `NODES_FILE` | `./data/nodes.json` | persistence for exit-node registry |
| `TLS_CERT_FILE` | (empty) | path to TLS certificate (PEM); together with `TLS_KEY_FILE` enables HTTPS (NFR-SEC-002) |
| `TLS_KEY_FILE` | (empty) | path to TLS private key (PEM); enables HTTPS when both files are set |
| `NODE_NAME` | (hostname) | node name reported by `GET /status` |

## Endpoints

All JSON. If `AUTH_TOKEN` is set, include `Authorization: Bearer <token>`.

### `GET /v1/nodes`

Public list of active exit nodes for the app location picker:

```json
{
  "nodes": [
    {
      "id": "vietnam-1",
      "name": "Vietnam 1",
      "country": "VN",
      "city": "Hanoi",
      "endpoint": "103.173.155.50:443",
      "public_key": "...",
      "serverPublicKey": "..."
    }
  ]
}
```

`GET /nodes` is kept as a compatibility alias.

### `GET /admin`

Browser admin page for managing exit nodes. Access is allowed only when the
client IP is present in `ADMIN_ALLOWED_IPS`; otherwise the backend returns
`403`. The page asks for `AUTH_TOKEN` and calls the admin APIs below.

When running behind Caddy/Nginx, keep Node bound to localhost and let the proxy
send `X-Forwarded-For`; the app trusts the proxy to identify the original
client IP.

For a dynamic home IP, do not expose admin by IP. Leave `ADMIN_ALLOWED_IPS`
unset so only localhost is allowed, then open it through an SSH tunnel:

```bash
ssh -i .tmp/flowvpn_support_page_ed25519 \
  -L 9000:127.0.0.1:7777 \
  root@103.173.155.50
```

Then open this in the browser:

```text
http://127.0.0.1:9000/admin
```

The browser traffic reaches the backend as `127.0.0.1`, so the admin page works
through the SSH key while public requests to `https://api.meetflowai.site/admin`
remain blocked.

### `GET /v1/admin/nodes` (admin)

Lists all exit nodes, including disabled ones. Requires both:

- Client IP in `ADMIN_ALLOWED_IPS`
- `Authorization: Bearer <AUTH_TOKEN>`

### `POST /v1/admin/nodes` (admin)

Adds an exit node:

```bash
curl -X POST https://api.flowvpn.example/v1/admin/nodes \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "vietnam-2",
    "name": "Vietnam 2",
    "country": "VN",
    "city": "Ho Chi Minh City",
    "endpoint": "203.0.113.10:443",
    "public_key": "base64-wireguard-public-key",
    "priority": 200,
    "active": true
  }'
```

### `PATCH /v1/admin/nodes/:id` (admin)

Updates node fields such as `name`, `endpoint`, `public_key`, `priority`, or
`active`.

### `DELETE /v1/admin/nodes/:id` (admin)

Disables the exit node. Records are not physically removed so existing device
history remains meaningful.

### `POST /device`

Register a device. Body: `{ "publicKey": "<base64>", "deviceName": "iPhone 15" }`

- Assigns the next free IP from the pool (or reuses the IP if the public key is already registered).
- Adds the peer to the WireGuard node:
  `wg set <iface> peer <pubkey> allowed-ips <ip>/32`
- Returns the client WireGuard config.

Response:
```json
{
  "device": {
    "id": "uuid",
    "publicKey": "...",
    "deviceName": "iPhone 15",
    "assignedIP": "10.77.0.2",
    "createdAt": "2026-08-19T...",
    "active": true
  },
  "config": {
    "exitNodeId": "vietnam-1",
    "serverPublicKey": "...",
    "endpoint": "103.173.155.50:22",
    "address": "10.77.0.2/32",
    "dns": ["1.1.1.1"],
    "allowedIPs": ["0.0.0.0/0", "::/0"],
    "persistentKeepalive": 25
  }
}
```

### `GET /device/:id`

Returns the device record.

### `DELETE /device/:id`

Deactivate a device and remove the peer from the node.

### `GET /devices` (owner visibility — FR-ADMIN-001)

Lists all registered devices:

```json
{
  "count": 1,
  "devices": [
    {
      "device_id": "uuid",
      "name": "iPhone 15",
      "platform": "ios",
      "status": "active",
      "created_at": "2026-08-19T...",
      "assigned_ip": "10.77.0.2",
      "public_key": "..."
    }
  ]
}
```

### `GET /status` (owner visibility — FR-ADMIN-001)

Node status: node name/endpoint, peer count, dry-run flag, uptime:

```json
{
  "node": { "name": "vietnam-1", "endpoint": "103.173.155.50:22", "interface": "wg0" },
  "peers": 1,
  "peer_source": "registry",
  "dryRun": true,
  "tls": false,
  "uptime_seconds": 42,
  "started_at": "2026-08-19T..."
}
```

`peer_source` is `"wg"` when the count comes from `wg show <iface> peers`
(production), otherwise `"registry"` (active registered devices — used in
DRY_RUN / when `wg` is unavailable).

### TLS (NFR-SEC-002)

Set `TLS_CERT_FILE` and `TLS_KEY_FILE` to serve HTTPS (uses
`https.createServer`). Without them the API falls back to plain HTTP for
local development and logs a prominent warning — never run production
without TLS.

Production should use a real DNS hostname with a publicly trusted certificate
so iOS App Transport Security accepts the coordinator. Do not use a bare IP or
self-signed certificate for release builds.

Direct Node TLS:

```bash
PORT=443 \
TLS_CERT_FILE=/etc/letsencrypt/live/api.flowvpn.example/fullchain.pem \
TLS_KEY_FILE=/etc/letsencrypt/live/api.flowvpn.example/privkey.pem \
WG_PUBLIC_ENDPOINT=103.173.155.50:443 \
WG_SERVER_PUBKEY=<server-public-key> \
AUTH_TOKEN=<admin-token> \
npm start
```

Reverse-proxy TLS is usually cleaner. Keep Node bound to localhost and let
Caddy/Nginx terminate HTTPS:

```caddyfile
api.flowvpn.example {
  reverse_proxy 127.0.0.1:7777
}
```

Then set the app coordinator URL to:

```text
https://api.flowvpn.example
```

## Local run (dev)

```bash
cd control-plane
npm install
WG_SERVER_PUBKEY=d1DhSaDqyrWW+eGuQq/qVjEj5KseklNRvscoREq2qyo= \
WG_PUBLIC_ENDPOINT=103.173.155.50:22 \
AUTH_TOKEN=devtoken \
ADMIN_ALLOWED_IPS=127.0.0.1,::1 \
npm start
```

For development without a real WireGuard node, set `WG_CMD` to a wrapper that
echoes (see `scripts/` for a dry-run helper), or run with `DRY_RUN=1`.
