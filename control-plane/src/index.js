import express from "express";
import cors from "cors";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import os from "node:os";
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
const TLS_CERT_FILE = process.env.TLS_CERT_FILE ?? "";
const TLS_KEY_FILE = process.env.TLS_KEY_FILE ?? "";
const NODE_NAME = process.env.NODE_NAME ?? "";
const NODE_ID = process.env.NODE_ID ?? "";
const NODE_COUNTRY = process.env.NODE_COUNTRY ?? "VN";
const NODE_CITY = process.env.NODE_CITY ?? "Hanoi";
const STARTED_AT = new Date().toISOString();

// TLS (NFR-SEC-002 / AC-016): HTTPS when both cert + key are provided.
// Plain HTTP is a LOCAL-DEV-ONLY fallback and logs a prominent warning.
let tlsReady = false;
if (TLS_CERT_FILE && TLS_KEY_FILE) {
  try {
    const tlsCert = fs.readFileSync(TLS_CERT_FILE, "utf8");
    const tlsKey = fs.readFileSync(TLS_KEY_FILE, "utf8");
    if (tlsCert && tlsKey) tlsReady = { cert: tlsCert, key: tlsKey };
  } catch (err) {
    console.error(`ERROR: could not read TLS files (TLS_CERT_FILE=${TLS_CERT_FILE}, TLS_KEY_FILE=${TLS_KEY_FILE}):`, err.message);
  }
} else if (TLS_CERT_FILE || TLS_KEY_FILE) {
  console.error("ERROR: TLS_CERT_FILE and TLS_KEY_FILE must BOTH be set to enable TLS — falling back to plain HTTP.");
}

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

// Admin/owner surface (NFR-SEC-004 / AC-018): device listing, status and
// revocation FAIL CLOSED. When AUTH_TOKEN is not configured these endpoints
// are disabled (503) instead of being left public — the device registry
// (public keys, assigned IPs) must never be exposed without authorization.
// POST /device (registration) stays reachable in dev so the app can
// provision; when AUTH_TOKEN IS set, the global middleware above already
// guards it too.
const requireAdminAuth = (req, res, next) => {
  if (!AUTH_TOKEN) {
    return res.status(503).json({ error: "AUTH_TOKEN not configured — admin endpoints disabled" });
  }
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (token !== AUTH_TOKEN) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
};

// Health check.
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Public list of exit nodes (Tailscale-style). The app fetches this to present
// selectable locations instead of hardcoding them.
app.get("/nodes", (_req, res) => {
  res.json({
    nodes: [
      {
        id: NODE_ID || "node-1",
        name: NODE_NAME || os.hostname(),
        country: NODE_COUNTRY || "VN",
        city: NODE_CITY || "Hanoi",
        endpoint: WG_PUBLIC_ENDPOINT || null,
        serverPublicKey: WG_SERVER_PUBKEY || null,
      },
    ],
  });
});

// Register a device: assign IP, provision peer, return client config.
app.post("/device", async (req, res) => {
  try {
    const { publicKey, deviceName, platform } = req.body ?? {};
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

    const result = await store.upsertByPublicKey({ publicKey, deviceName, assignedIP, platform });
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
app.get("/device/:id", requireAdminAuth, async (req, res) => {
  const device = await store.findById(req.params.id);
  if (!device) return res.status(404).json({ error: "Not found" });
  res.json({ device });
});

// Deactivate a device and remove its peer.
app.delete("/device/:id", requireAdminAuth, async (req, res) => {
  const device = await store.deactivate(req.params.id);
  if (!device) return res.status(404).json({ error: "Not found" });
  await wg.removePeer(device.publicKey);
  res.json({ device });
});

// Owner visibility (FR-ADMIN-001 / AC-013): list all registered devices.
app.get("/devices", requireAdminAuth, async (_req, res) => {
  try {
    const devices = await store.all();
    res.json({
      count: devices.length,
      devices: devices.map((d) => ({
        device_id: d.id,
        name: d.deviceName,
        platform: d.platform ?? null,
        status: d.active ? "active" : "revoked",
        created_at: d.createdAt,
        assigned_ip: d.assignedIP,
        public_key: d.publicKey,
      })),
    });
  } catch (err) {
    console.error("GET /devices failed:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

// Owner visibility (FR-ADMIN-001 / AC-013): node status.
app.get("/status", requireAdminAuth, async (_req, res) => {
  try {
    const devices = await store.all();
    const activeCount = devices.filter((d) => d.active).length;
    const wgPeers = await wg.listPeers();
    res.json({
      node: {
        name: NODE_NAME || os.hostname(),
        endpoint: WG_PUBLIC_ENDPOINT || null,
        interface: WG_INTERFACE,
      },
      peers: wgPeers ? wgPeers.length : activeCount,
      peer_source: wgPeers ? "wg" : "registry",
      dryRun: DRY_RUN,
      tls: tlsReady ? true : false,
      uptime_seconds: Math.floor(process.uptime()),
      started_at: STARTED_AT,
    });
  } catch (err) {
    console.error("GET /status failed:", err);
    res.status(500).json({ error: "Internal error" });
  }
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

function onListen() {
  console.log(`PrivateVPN control plane listening on :${PORT} (${tlsReady ? "HTTPS" : "HTTP"})`);
  console.log(`  interface=${WG_INTERFACE} dryRun=${DRY_RUN} pool=${IP_POOL_CIDR}`);
  if (!WG_SERVER_PUBKEY) console.warn("  WARNING: WG_SERVER_PUBKEY not set");
  if (!WG_PUBLIC_ENDPOINT) console.warn("  WARNING: WG_PUBLIC_ENDPOINT not set");
}

if (tlsReady) {
  // NFR-SEC-002 / AC-016: TLS enforced when TLS_CERT_FILE + TLS_KEY_FILE are provided.
  https.createServer({ cert: tlsReady.cert, key: tlsReady.key }, app).listen(PORT, onListen);
} else {
  // LOCAL-DEV-ONLY fallback: plain HTTP. Never expose this to the public Internet.
  console.warn("============================================================");
  console.warn("  WARNING: Control API running WITHOUT TLS (plain HTTP).");
  console.warn("  This is for LOCAL DEVELOPMENT ONLY (NFR-SEC-002 / AC-016).");
  console.warn("  Set TLS_CERT_FILE and TLS_KEY_FILE to enable HTTPS.");
  console.warn("============================================================");
  http.createServer(app).listen(PORT, onListen);
}
