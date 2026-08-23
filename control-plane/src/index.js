import express from "express";
import cors from "cors";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { IPPool } from "./ip-pool.js";
import { WireGuardManager } from "./wireguard.js";
import { DeviceStore } from "./device-store.js";
import { AuthStore } from "./auth-store.js";
import { NodeStore, adminNode, publicNode } from "./node-store.js";
import { adminPageHTML } from "./admin-page.js";
import { sendOtpEmail } from "./mailer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = parseInt(process.env.PORT ?? "8080", 10);
const NODE_ENV = process.env.NODE_ENV ?? "development";
const IS_PRODUCTION = NODE_ENV === "production";
const WG_INTERFACE = process.env.WG_INTERFACE ?? "wg0";
const WG_SERVER_PUBKEY = process.env.WG_SERVER_PUBKEY ?? "";
const WG_PUBLIC_ENDPOINT = process.env.WG_PUBLIC_ENDPOINT ?? "";
const IP_POOL_CIDR = process.env.IP_POOL_CIDR ?? "10.77.0.0/24";
const WG_BIN = process.env.WG_BIN ?? "wg";
const DRY_RUN = process.env.DRY_RUN === "1";
const AUTH_TOKEN = process.env.AUTH_TOKEN ?? "";
const ADMIN_ALLOWED_IPS = parseAllowedIPs(process.env.ADMIN_ALLOWED_IPS ?? "");
const DATA_FILE = process.env.DATA_FILE ?? path.join(__dirname, "..", "data", "devices.json");
const AUTH_FILE = process.env.AUTH_FILE ?? path.join(__dirname, "..", "data", "auth.json");
const NODES_FILE = process.env.NODES_FILE ?? path.join(__dirname, "..", "data", "nodes.json");
const ALLOW_DEV_TOKEN_BOOTSTRAP = process.env.ALLOW_DEV_TOKEN_BOOTSTRAP === "1" && !IS_PRODUCTION;
// LEGACY_MODE=1 keeps the pre-auth join-token + unauthenticated /v1/peers/register
// flow working so a build that is already submitted to App Store review can still
// connect after this server is deployed. Set LEGACY_MODE=0 (or unset -> default "1"
// until the new authenticated app is released) to fail closed.
// TODO(owner): set LEGACY_MODE=0 in production once the authenticated app build
// (email login + enrollment tokens) is released and App Store approved.
const LEGACY_MODE = process.env.LEGACY_MODE ?? "1";
const ALLOW_LEGACY_DEVICE_REGISTRATION = process.env.ALLOW_LEGACY_DEVICE_REGISTRATION === "1" && !IS_PRODUCTION;
const AUTH_DEV_GRANT_SUBSCRIPTION = process.env.AUTH_DEV_GRANT_SUBSCRIPTION === "1" && !IS_PRODUCTION;
// Test-only allowlists that DO apply in production (owner/dev testing without
// waiting for Resend + App Store product review). Comma-separated emails.
// DEBUG_CODE_EMAILS: return debug_code in /v1/auth/email/start for these emails
//   even in production (so the dev can see the OTP in the app without a mailer).
// GRANT_SUB_EMAILS: grant a test subscription on email verify for these emails
//   (so /v1/enrollment-tokens stops returning 403 for the test account).
const DEBUG_CODE_EMAILS = parseEmailList(process.env.DEBUG_CODE_EMAILS);
const GRANT_SUB_EMAILS = parseEmailList(process.env.GRANT_SUB_EMAILS);
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
const authStore = new AuthStore(AUTH_FILE);
const nodeStore = new NodeStore(NODES_FILE, buildFallbackExitNode());

const app = express();
app.set("trust proxy", true);
app.use(cors());
app.use(express.json());

// Simple bearer-token auth (optional). Enable by setting AUTH_TOKEN.
// /health is always public so it can be used as a liveness probe.
app.use((req, res, next) => {
  if (!AUTH_TOKEN) return next();
  if (req.path === "/health" || req.path === "/nodes" || req.path === "/v1/nodes") return next();
  if (req.path.startsWith("/v1/auth/") || req.path === "/v1/enrollment-tokens" || req.path === "/v1/peers/register") return next();
  if (req.method === "GET" && (req.path === "/admin" || req.path === "/admin/")) return next();
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

const requireAdminIP = (req, res, next) => {
  const clientIP = clientIPAddress(req);
  if (!ADMIN_ALLOWED_IPS.has(clientIP)) {
    return res.status(403).json({
      error: "Admin access denied from this IP",
      client_ip: clientIP,
    });
  }
  next();
};

const requireUserAuth = async (req, res, next) => {
  try {
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
    const auth = await authStore.findSession(token);
    if (!auth) {
      return res.status(401).json({ error: "Unauthorized", message: "Valid user session required" });
    }
    req.userAuth = auth;
    next();
  } catch (err) {
    next(err);
  }
};

// Health check.
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Alias kept for compatibility with the previous production coordinator.
app.get("/v1/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get(["/admin", "/admin/"], requireAdminIP, (_req, res) => {
  res.type("html").send(adminPageHTML());
});

// Public list of active exit nodes (Tailscale-style). The app fetches this to
// present selectable locations instead of hardcoding them.
const listPublicNodes = async (_req, res) => {
  try {
    const nodes = await nodeStore.active();
    res.json({ nodes: nodes.map(publicNode) });
  } catch (err) {
    console.error("GET /nodes failed:", err);
    res.status(500).json({ error: "Internal error" });
  }
};

app.get("/nodes", listPublicNodes);
app.get("/v1/nodes", listPublicNodes);

app.post("/v1/auth/email/start", async (req, res) => {
  try {
    const login = await authStore.startEmailLogin(req.body?.email);
    const mail = await sendOtpEmail({ email: login.email, code: login.code });
    const body = { ok: true };
    if (!IS_PRODUCTION || DEBUG_CODE_EMAILS.has(login.email)) {
      body.debug_code = mail.devCode ?? login.code;
    }
    res.status(202).json(body);
  } catch (err) {
    res.status(err.statusCode ?? 500).json({ error: err.statusCode ? err.message : "Internal error" });
  }
});

app.post("/v1/auth/email/verify", async (req, res) => {
  try {
    const session = await authStore.verifyEmailLogin(req.body?.email, req.body?.code);
    if (AUTH_DEV_GRANT_SUBSCRIPTION || GRANT_SUB_EMAILS.has(session.user.email ?? "")) {
      await authStore.grantSubscriptionForTest(session.user.id);
    }
    res.status(201).json(session);
  } catch (err) {
    res.status(err.statusCode ?? 500).json({ error: err.statusCode ? err.message : "Internal error" });
  }
});

app.post("/v1/auth/apple", async (req, res) => {
  try {
    if (IS_PRODUCTION) {
      return res.status(501).json({
        error: "Apple identity verification not configured",
        message: "Production must verify Sign in with Apple JWTs before issuing sessions",
      });
    }
    const payload = parseUnsignedJWT(req.body?.identity_token);
    const appleUserId = payload?.sub;
    if (!appleUserId) {
      return res.status(401).json({ error: "Unauthorized", message: "Valid Apple identity token required" });
    }
    const session = await authStore.createAppleSession({
      appleUserId,
      email: typeof payload.email === "string" ? payload.email : null,
    });
    if (AUTH_DEV_GRANT_SUBSCRIPTION) {
      await authStore.grantSubscriptionForTest(session.user.id);
    }
    res.status(201).json(session);
  } catch (err) {
    res.status(err.statusCode ?? 500).json({ error: err.statusCode ? err.message : "Internal error" });
  }
});

// New app runtime enrollment path. This is deliberately user-authenticated and
// subscription-bound; the token is one-time and consumed by /v1/peers/register.
app.post("/v1/enrollment-tokens", requireUserAuth, async (req, res) => {
  try {
    const subscription = req.userAuth.subscription;
    if (!subscription) {
      return res.status(403).json({ error: "Forbidden", message: "Active subscription required" });
    }
    const token = await authStore.createEnrollmentToken(req.userAuth.user.id);
    res.status(201).json({ token, expires_in: 600 });
  } catch (err) {
    res.status(err.statusCode ?? 500).json({ error: err.statusCode ? err.message : "Internal error" });
  }
});

// Legacy bootstrap token issuance must fail closed in production. It may be
// enabled only for local/internal development by setting ALLOW_DEV_TOKEN_BOOTSTRAP=1.
app.post("/v1/tokens", async (_req, res) => {
  // LEGACY_MODE=1: keep issuing one-time join tokens so the App-Store-review build
  // (which calls this endpoint unauthenticated) keeps working after deploy.
  if (LEGACY_MODE === "1") {
    try {
      const created = await authStore.createJoinToken();
      return res.status(201).json({ token: created.token, expires_at: created.expiresAt });
    } catch (err) {
      return res.status(err.statusCode ?? 500).json({ error: err.statusCode ? err.message : "Internal error" });
    }
  }
  // Fail closed otherwise.
  if (!ALLOW_DEV_TOKEN_BOOTSTRAP) {
    return res.status(IS_PRODUCTION ? 410 : 403).json({
      error: "Legacy token bootstrap disabled",
      message: "Use authenticated /v1/enrollment-tokens",
    });
  }
  res.status(201).json({ token: `PVPN-DEV-${crypto.randomUUID()}` });
});

// Admin exit-node management. DELETE disables a node instead of physically
// removing it, so existing device records and audit history remain meaningful.
app.get(["/admin/nodes", "/v1/admin/nodes"], requireAdminIP, requireAdminAuth, async (_req, res) => {
  try {
    const nodes = await nodeStore.all();
    res.json({ count: nodes.length, nodes: nodes.map(adminNode) });
  } catch (err) {
    console.error("GET /admin/nodes failed:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

app.post(["/admin/nodes", "/v1/admin/nodes"], requireAdminIP, requireAdminAuth, async (req, res) => {
  try {
    const node = await nodeStore.create(req.body ?? {});
    res.status(201).json({ node: adminNode(node) });
  } catch (err) {
    res.status(err.statusCode ?? 500).json({ error: err.statusCode ? err.message : "Internal error" });
  }
});

app.get(["/admin/nodes/:id", "/v1/admin/nodes/:id"], requireAdminIP, requireAdminAuth, async (req, res) => {
  const node = await nodeStore.findById(req.params.id);
  if (!node) return res.status(404).json({ error: "Not found" });
  res.json({ node: adminNode(node) });
});

app.patch(["/admin/nodes/:id", "/v1/admin/nodes/:id"], requireAdminIP, requireAdminAuth, async (req, res) => {
  try {
    const node = await nodeStore.update(req.params.id, req.body ?? {});
    if (!node) return res.status(404).json({ error: "Not found" });
    res.json({ node: adminNode(node) });
  } catch (err) {
    res.status(err.statusCode ?? 500).json({ error: err.statusCode ? err.message : "Internal error" });
  }
});

app.delete(["/admin/nodes/:id", "/v1/admin/nodes/:id"], requireAdminIP, requireAdminAuth, async (req, res) => {
  try {
    const node = await nodeStore.disable(req.params.id);
    if (!node) return res.status(404).json({ error: "Not found" });
    res.json({ node: adminNode(node) });
  } catch (err) {
    res.status(err.statusCode ?? 500).json({ error: err.statusCode ? err.message : "Internal error" });
  }
});

app.post("/v1/peers/register", async (req, res) => {
  try {
    const { join_token } = req.body ?? {};
    const header = req.headers.authorization ?? "";
    const bearer = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";

    // New flow: authenticated user session + one-time enrollment token.
    if (bearer) {
      const auth = await authStore.findSession(bearer);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized", message: "Valid user session required" });
      }
      const enrollment = await authStore.consumeEnrollmentToken(join_token, auth.user.id);
      const result = await registerDeviceWithPayload({
        body: req.body,
        userId: enrollment.userId,
        apiShape: "v1",
      });
      return res.status(result.status).json(result.body);
    }

    // Legacy flow (App Store review compat, LEGACY_MODE=1 only): unauthenticated
    // register with a one-time join token from POST /v1/tokens.
    if (LEGACY_MODE !== "1") {
      return res.status(401).json({ error: "Unauthorized", message: "Valid user session required" });
    }
    await authStore.consumeJoinToken(join_token);
    const result = await registerDeviceWithPayload({
      body: req.body,
      userId: null,
      apiShape: "v1",
    });
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error("POST /v1/peers/register failed:", err);
    res.status(err.statusCode ?? 500).json({ error: err.statusCode ? err.message : "Internal error" });
  }
});

// Register a device: assign IP, provision peer, return client config.
app.post("/device", async (req, res) => {
  try {
    if (!ALLOW_LEGACY_DEVICE_REGISTRATION) {
      return res.status(IS_PRODUCTION ? 410 : 403).json({
        error: "Legacy device registration disabled",
        message: "Use authenticated /v1/peers/register",
      });
    }
    const result = await registerDeviceWithPayload({ body: req.body, userId: null, apiShape: "legacy" });
    res.status(result.status).json(result.body);
  } catch (err) {
    console.error("POST /device failed:", err);
    res.status(err.statusCode ?? 500).json({ error: err.statusCode ? err.message : "Internal error" });
  }
});

// Fetch a device by id.
app.get("/device/:id", requireAdminIP, requireAdminAuth, async (req, res) => {
  const device = await store.findById(req.params.id);
  if (!device) return res.status(404).json({ error: "Not found" });
  res.json({ device });
});

// Deactivate a device and remove its peer.
app.delete("/device/:id", requireAdminIP, requireAdminAuth, async (req, res) => {
  const device = await store.deactivate(req.params.id);
  if (!device) return res.status(404).json({ error: "Not found" });
  await wg.removePeer(device.publicKey);
  res.json({ device });
});

// Owner visibility (FR-ADMIN-001 / AC-013): list all registered devices.
app.get("/devices", requireAdminIP, requireAdminAuth, async (_req, res) => {
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
app.get("/status", requireAdminIP, requireAdminAuth, async (_req, res) => {
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
      exit_nodes: (await nodeStore.active()).map(publicNode),
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

async function selectExitNode(id) {
  if (id) return nodeStore.findActiveById(id);
  return nodeStore.firstActive();
}

async function registerDeviceWithPayload({ body, userId, apiShape }) {
  const publicKey = body?.wireguard_public_key ?? body?.publicKey;
  const deviceName = body?.name ?? body?.deviceName;
  const platform = body?.platform;
  const exitNodeId = body?.exit_node_id ?? body?.exitNodeId ?? body?.node_id;

  if (!publicKey || typeof publicKey !== "string") {
    const error = new Error("publicKey is required");
    error.statusCode = 400;
    throw error;
  }

  let device = await store.findByPublicKey(publicKey);
  let assignedIP = device?.assignedIP;

  if (!device) {
    const devices = await store.all();
    assignedIP = pool.nextFreeIP(devices);
    if (!assignedIP) {
      const error = new Error("No free IP available in the pool");
      error.statusCode = 503;
      throw error;
    }
  }

  const result = await store.upsertByPublicKey({ publicKey, deviceName, assignedIP, platform, userId });
  device = result.device;

  await wg.upsertPeer(publicKey, `${assignedIP}/32`);

  const selectedNode = await selectExitNode(exitNodeId);
  if (!selectedNode) {
    const error = new Error("No active exit node available");
    error.statusCode = 503;
    throw error;
  }

  if (apiShape === "v1") {
    return {
      status: result.isNew ? 201 : 200,
      body: {
        peer_id: device.id,
        overlay_ip: device.assignedIP,
        network: IP_POOL_CIDR,
        peer_credential: `PVPN-PEER-${crypto.randomUUID()}`,
        peers: [],
      },
    };
  }

  return {
    status: result.isNew ? 201 : 200,
    body: {
      device,
      config: buildClientConfig(device, selectedNode),
    },
  };
}

function buildClientConfig(device, node) {
  return {
    exitNodeId: node.id,
    serverPublicKey: node.public_key,
    endpoint: node.endpoint,
    address: `${device.assignedIP}/32`,
    dns: ["1.1.1.1"],
    allowedIPs: ["0.0.0.0/0", "::/0"],
    persistentKeepalive: 25,
  };
}

function buildFallbackExitNode() {
  if (!WG_PUBLIC_ENDPOINT && !WG_SERVER_PUBKEY) return null;
  return {
    id: NODE_ID || "node-1",
    name: NODE_NAME || os.hostname(),
    country: NODE_COUNTRY || "VN",
    city: NODE_CITY || "Hanoi",
    endpoint: WG_PUBLIC_ENDPOINT,
    public_key: WG_SERVER_PUBKEY,
    active: true,
    priority: 100,
  };
}

function parseEmailList(value) {
  return new Set(String(value ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean));
}

function parseAllowedIPs(value) {
  const configured = value
    .split(",")
    .map((ip) => normalizeIP(ip))
    .filter(Boolean);
  return new Set(configured.length > 0 ? configured : ["127.0.0.1", "::1"]);
}

function clientIPAddress(req) {
  const forwardedFor = String(req.headers["x-forwarded-for"] ?? "")
    .split(",")
    .map((part) => normalizeIP(part))
    .find(Boolean);
  return forwardedFor || normalizeIP(req.ip || req.socket.remoteAddress || "");
}

function normalizeIP(value) {
  return String(value)
    .trim()
    .replace(/^::ffff:/, "");
}

function parseUnsignedJWT(jwt) {
  const parts = String(jwt ?? "").split(".");
  if (parts.length < 2) return null;
  try {
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function onListen() {
  console.log(`PrivateVPN control plane listening on :${PORT} (${tlsReady ? "HTTPS" : "HTTP"})`);
  console.log(`  interface=${WG_INTERFACE} dryRun=${DRY_RUN} pool=${IP_POOL_CIDR}`);
  console.log(`  nodesFile=${NODES_FILE}`);
  console.log(`  adminAllowedIPs=${Array.from(ADMIN_ALLOWED_IPS).join(",")}`);
  if (!WG_SERVER_PUBKEY) console.warn("  WARNING: WG_SERVER_PUBKEY not set");
  if (!WG_PUBLIC_ENDPOINT) console.warn("  WARNING: WG_PUBLIC_ENDPOINT not set");
  if (LEGACY_MODE === "1") console.warn("  WARNING: LEGACY_MODE=1 — unauthenticated join tokens + register enabled (App Store review window). Set LEGACY_MODE=0 after the authenticated app is released.");
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
