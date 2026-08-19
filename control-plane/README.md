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
| `AUTH_TOKEN` | (empty) | if set, `Authorization: Bearer <token>` required |
| `DATA_FILE` | `./data/devices.json` | persistence for device registry |

## Endpoints

All JSON. If `AUTH_TOKEN` is set, include `Authorization: Bearer <token>`.

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
    "serverPublicKey": "...",
    "endpoint": "63.140.14.154:64044",
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

## Local run (dev)

```bash
cd control-plane
npm install
WG_SERVER_PUBKEY=hPuZYfu/lvnaSkGcO61Ks99rqVIdrL/ilOjw3+ip5BQ= \
WG_PUBLIC_ENDPOINT=63.140.14.154:64044 \
AUTH_TOKEN=devtoken \
npm start
```

For development without a real WireGuard node, set `WG_CMD` to a wrapper that
echoes (see `scripts/` for a dry-run helper), or run with `DRY_RUN=1`.
