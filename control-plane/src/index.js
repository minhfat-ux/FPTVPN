import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { IPPool } from "./ip-pool.js";
import { WireGuardManager } from "./wireguard.js";
import { DeviceStore } from "./device-store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = parseInt(process.env.PORT ?? "8080", 10);
const WG_INTERFACE = process.env.WG_INTERFACE ?? "wg0";
const WG_SERVER_PUBKEY = process.env.WG_SERVER_PUBKEY ?? "";
const WG_PUBLIC_ENDPOINT = process.env.WG_PUBLIC_ENDPOINT ?? "";
const IP_POOL_CIDR = process.env.IP_POOL_CIDR ?? "10.77.0.0/24";
const WG_BIN = process.env.WG_BIN ?? "wg";
const DRY_RUN = process.env.DRY_RUN === "1";
const AUTH_TOKEN = process.env.AUTH_TOKEN ?? "";
const DATA_FILE = process.env.DATA_FILE ?? path.join(__dirname, "..", "data", "devices.json");

const pool = new IPPool(IP_POOL_CIDR);
const wg = new WireGuardManager({ interfaceName: WG_INTERFACE, wgBin: WG_BIN, dryRun: DRY_RUN });
const store = new DeviceStore(DATA_FILE);

const app = express();
app.use(cors());
app.use(express.json());

// Simple bearer-token auth (optional). Enable by setting AUTH_TOKEN.
// /health is always public so it can be used as a liveness probe.
app.use((req, res, next) => {
  if (!AUTH_TOKEN) return next();
  if (req.path === "/health") return next();
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (token !== AUTH_TOKEN) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
});

// Health check.
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Register a device: assign IP, provision peer, return client config.
app.post("/device", async (req, res) => {
  try {
    const { publicKey, deviceName } = req.body ?? {};
    if (!publicKey || typeof publicKey !== "string") {
      return res.status(400).json({ error: "publicKey is required" });
    }

    let device = await store.findByPublicKey(publicKey);
    let assignedIP = device?.assignedIP;

    if (!device) {
      const devices = await store.all();
      assignedIP = pool.nextFreeIP(devices);
      if (!assignedIP) {
        return res.status(503).json({ error: "No free IP available in the pool" });
      }
    }

    const result = await store.upsertByPublicKey({ publicKey, deviceName, assignedIP });
    device = result.device;

    // Provision the peer on the WireGuard node (idempotent).
    await wg.upsertPeer(publicKey, `${assignedIP}/32`);

    res.status(result.isNew ? 201 : 200).json({
      device,
      config: buildClientConfig(device),
    });
  } catch (err) {
    console.error("POST /device failed:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

// Fetch a device by id.
app.get("/device/:id", async (req, res) => {
  const device = await store.findById(req.params.id);
  if (!device) return res.status(404).json({ error: "Not found" });
  res.json({ device });
});

// Deactivate a device and remove its peer.
app.delete("/device/:id", async (req, res) => {
  const device = await store.deactivate(req.params.id);
  if (!device) return res.status(404).json({ error: "Not found" });
  await wg.removePeer(device.publicKey);
  res.json({ device });
});

function buildClientConfig(device) {
  return {
    serverPublicKey: WG_SERVER_PUBKEY,
    endpoint: WG_PUBLIC_ENDPOINT,
    address: `${device.assignedIP}/32`,
    dns: ["1.1.1.1"],
    allowedIPs: ["0.0.0.0/0", "::/0"],
    persistentKeepalive: 25,
  };
}

app.listen(PORT, () => {
  console.log(`PrivateVPN control plane listening on :${PORT}`);
  console.log(`  interface=${WG_INTERFACE} dryRun=${DRY_RUN} pool=${IP_POOL_CIDR}`);
  if (!WG_SERVER_PUBKEY) console.warn("  WARNING: WG_SERVER_PUBKEY not set");
  if (!WG_PUBLIC_ENDPOINT) console.warn("  WARNING: WG_PUBLIC_ENDPOINT not set");
});
