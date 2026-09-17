import express from "express";
import cors from "cors";
import crypto from "node:crypto";
import dns from "node:dns";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { IPPool } from "./ip-pool.js";
import { WireGuardManager } from "./wireguard.js";
import { DeviceStore } from "./device-store.js";
import { deviceLimitDecision } from "./device-limit.js";
import { applyDeviceReplace } from "./device-replace.js";
import { createGeoLookup, isPublicIp } from "./geoip.js";
import { versionPayloadFor, wantsLegacyApk, iosInstallManifest } from "./app-version.js";
import {
  amountCovers,
  extractOrderRef,
  isIncomingTransfer,
  verifySepayApiKey,
  verifySepaySignature,
  verifySepayUrlToken,
  accountMatches,
  clientIpAllowed,
} from "./sepay.js";
import { AuthStore, setPlanLabelResolver } from "./auth-store.js";
import { AppConfigStore } from "./app-config-store.js";
import { NodeStore, adminNode, publicNode } from "./node-store.js";
import { PlanStore } from "./plan-store.js";
import {
  aggregateConnections,
  clientIPFromEndpoint,
  createPTRLookup,
} from "./connection-stats.js";
import { adminPageHTML } from "./admin-page.js";
import { provisionEverywhere, revokeEverywhere } from "./peer-mirror.js";
import { alertChannels, deviceRegisteredAlert, invoiceConfirmedAlert, sendAlert } from "./alerts.js";
import { GfwWatcher, parseGfwHosts } from "./gfw-watch.js";
import { formatStatusReport, parseReportTimes, reportDue } from "./reports.js";
import {
  sendOtpEmail,
  sendPaymentAlert,
  sendRenewalReminder,
  sendInvoiceEmail,
  sendAiInvoiceEmail,
  sendVerifyEmail,
  pickMailLang,
  mailTransportName,
  sendPaidAlert,
  sendUnmatchedTransferAlert,
  sendIosInstallReadyEmail,
  sendPaymentReminderEmail,
} from "./mailer.js";
import { runPaymentReminders } from "./payment-reminders.js";
import { AiAccessStore } from "./ai-access-store.js";
import { AiUsersStore } from "./ai-users-store.js";
import { AiStorePurchaseStore } from "./ai-store-purchases.js";
import {
  verifyPurchase as verifyPlayPurchase,
  playCredentialStatus,
  savePlayCredential,
  clearPlayCredential,
  playPackageName,
} from "./play-store.js";
import { buildUserRows, filterRows, computeStats, rowsToCsv, entitlementState } from "./ai-users.js";
import {
  credentialStatus as firebaseCredentialStatus,
  listFirebaseUsers,
  saveCredential as saveFirebaseCredential,
  clearCredential as clearFirebaseCredential,
  setUserDisabled as setFirebaseUserDisabled,
  deleteFirebaseUser,
  sendPasswordReset as sendFirebasePasswordReset,
  generateEmailVerificationLink,
} from "./firebase-users.js";
import { guidePageHTML } from "./guide-page.js";
import { IosDeviceStore, buildDeviceProfile, decodeDevicePayload } from "./ios-devices.js";
import { AppleCredentialStore, registerDeviceWithApple, listAppleDevices } from "./apple-devices.js";
import { supportPageHTML } from "./support-page.js";
import {
  buyPageHTML,
  AI_PLANS,
  DEFAULT_PLANS,
  applyPlans,
  paymentSuccessPageHTML,
  paymentCancelPageHTML,
  createPayosPaymentLink,
  createBankQrDataUrl,
  bankQrConfig,
  bankQrImageUrl,
  verifyPayosWebhook,
  pickBuyLang,
  momoQrConfig,
  PLANS_PUBLIC,
  vndPerCny,
  vndPerUsd,
  cnyFromVnd,
  planNameFor,
  transferNote,
  orderStatusPageHTML,
  resolveQrFile,
  qrAmountsFor,
  downloadQrPng,
} from "./payments.js";

const execFileAsync = promisify(execFile);
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
const DATA_DIR = path.dirname(AUTH_FILE);
/** Nhật ký webhook SePay (JSON lines) — SePay khuyến nghị lưu payload gốc để đối soát/audit. */
const SEPAY_LOG_FILE = process.env.SEPAY_LOG_FILE ?? path.join(DATA_DIR, "sepay-webhooks.log");
const APP_CONFIG_DB = process.env.APP_CONFIG_DB ?? path.join(__dirname, "..", "data", "app-config.db");
const DEFAULT_MIN_VERSION = process.env.MIN_IOS_VERSION ?? "1.0";
const DEFAULT_LATEST_VERSION = process.env.LATEST_IOS_VERSION ?? "1.0";
const DEFAULT_STORE_URL = process.env.APP_STORE_URL ?? "https://apps.apple.com/app/flowvpn";
const NODES_FILE = process.env.NODES_FILE ?? path.join(__dirname, "..", "data", "nodes.json"); // legacy JSON (imported once into SQLite)
const NODES_DB_FILE = process.env.NODES_DB_FILE ?? path.join(__dirname, "..", "data", "nodes.db");
// Bảng gói bán (giá/thời hạn) sửa được từ admin — xem plan-store.js.
const PLANS_FILE = process.env.PLANS_FILE ?? path.join(__dirname, "..", "data", "plans.json");
// Lịch sử health-watch chống chặn theo tên (SNI) — xem gfw-watch.js.
const GFW_HISTORY_FILE = process.env.GFW_HISTORY_FILE ?? path.join(__dirname, "..", "data", "gfw-history.json");
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
// DEV_LOGIN_CODE: pin the email login code for the DEBUG_CODE_EMAILS accounts
// (e.g. the App Review demo account `review@meetflowai.site`). App Review cannot
// read email, so the reviewer needs a code that is always the same — it is
// quoted in the App Store Connect review notes. Leave unset to disable.
const DEV_LOGIN_CODE = (process.env.DEV_LOGIN_CODE ?? "").trim();
// Public support address shown on the support page (App Store Support URL)
// and in the mail footers.
const SUPPORT_EMAIL = (process.env.SUPPORT_EMAIL ?? "support@meetflowai.site").trim();
// Registry of MeetFlow AI accounts seen by the control plane (admin dashboard).
const AI_USERS_FILE = process.env.AI_USERS_FILE ?? path.join(__dirname, "..", "data", "ai-users.json");
const AI_STORE_PURCHASES_FILE = process.env.AI_STORE_PURCHASES_FILE ?? path.join(__dirname, "..", "data", "ai-store-purchases.json");
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
// MeetFlow AI web purchases (separate product + account system).
const aiStore = new AiAccessStore(process.env.AI_ACCESS_FILE ?? path.join(__dirname, "..", "data", "ai-access.json"));
// Our own record of MeetFlow AI accounts we have seen (Firebase is the real
// account system, but it needs a service-account key — see firebase-users.js).
const aiUsersStore = new AiUsersStore(AI_USERS_FILE);
// Google Play / App Store purchases reported by the apps (see
// ai-store-purchases.js) — the platform stores never tell us about these.
const aiStorePurchaseStore = new AiStorePurchaseStore(AI_STORE_PURCHASES_FILE);
const nodeStore = new NodeStore(NODES_DB_FILE, buildFallbackExitNode(), { legacyJsonPath: NODES_FILE });
// Bảng gói bán: seed từ DEFAULT_PLANS lần đầu (deployment cũ chạy y như trước),
// và onChange nạp lại bảng đang chạy mỗi khi admin sửa -> trang /buy, tạo order
// và hoá đơn dùng ngay giá mới, không cần deploy.
const planStore = new PlanStore(PLANS_FILE, DEFAULT_PLANS, { onChange: applyPlans });
// App hiển thị tên gói khách đã mua ⇒ backend trả `plan_badge` để 3 app không phải tự dịch tên gói.
setPlanLabelResolver((productId) => {
  if (!productId) return null;
  const plan = planStore.get(productId);
  return plan?.badge || plan?.label || null;
});
const appConfig = new AppConfigStore(APP_CONFIG_DB, {
  minimum_ios_version: DEFAULT_MIN_VERSION,
  latest_ios_version: DEFAULT_LATEST_VERSION,
  app_store_url: DEFAULT_STORE_URL,
  // MeetFlow AI Android (APK sideload) release channel — drives the in-app
  // required-update gate. 0 disables the gate.
  ai_android_latest_version_code: Number(process.env.AI_ANDROID_LATEST_CODE ?? 0),
  ai_android_minimum_version_code: Number(process.env.AI_ANDROID_MIN_CODE ?? 0),
  ai_android_latest_version_name: process.env.AI_ANDROID_LATEST_NAME ?? "",
  ai_android_apk_url: process.env.AI_ANDROID_APK_URL ?? "",
  ai_android_notes: process.env.AI_ANDROID_NOTES ?? "",
});
// health-watch chống chặn theo tên: đo DNS/TCP/TLS(SNI) định kỳ, giữ lịch sử và
// alert khi trạng thái ổn định đổi. Bật/tắt bằng GFW_WATCH, chu kỳ GFW_WATCH_MS.
const gfwWatcher = new GfwWatcher({
  filePath: GFW_HISTORY_FILE,
  hosts: parseGfwHosts(process.env.GFW_HOSTS),
  timeoutMs: Number(process.env.GFW_PROBE_TIMEOUT_MS) || undefined,
});

// Reverse-DNS (PTR) cho IP client hiển thị trên dashboard: cache 6h + timeout
// 1.5s, best-effort. Không gọi API bên thứ ba nên IP người dùng không rời server.
const ptrLookup = createPTRLookup({ resolve: (ip) => dns.promises.reverse(ip) });

// Vị trí/ISP cho IP client: tra OFFLINE bằng bảng DB-IP Lite trên VPS (`scripts/geoip-update.sh`
// cập nhật định kỳ) — IP khách không bị gửi sang API bên thứ ba. Cache 7 ngày ở
// `data/geoip-cache.json` nên mỗi IP chỉ tra một lần.
const geoLookup = createGeoLookup({
  cityDb: process.env.GEOIP_CITY_DB,
  asnDb: process.env.GEOIP_ASN_DB,
  cacheFile: path.join(DATA_DIR, "geoip-cache.json"),
});

const app = express();
app.set("trust proxy", true);
app.use(cors());
// `verify` giữ lại raw body: webhook (SePay/PayOS) ký trên bytes gốc, JSON.stringify lại là lệch chữ ký.
app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));

// Chẩn đoán luồng thu UDID: ghi lại MỌI request vào endpoint callback/hồ sơ — kể cả request
// không parse được. Không có log này thì "khách cài hồ sơ mà server không thấy gì" là bó tay.
app.use((req, res, next) => {
  if (!req.path.includes("ios/udid") && !req.path.includes("register.mobileconfig")) return next();
  const started = Date.now();
  res.on("finish", () => {
    console.log(
      `ios-trace: ${req.method} ${req.path} -> ${res.statusCode} ${Date.now() - started}ms ` +
        `bytes=${req.headers["content-length"] ?? 0} ua="${String(req.headers["user-agent"] ?? "").slice(0, 70)}" ip=${clientIPAddress(req)}`,
    );
  });
  next();
});

// Simple bearer-token auth (optional). Enable by setting AUTH_TOKEN.
// /health is always public so it can be used as a liveness probe.
app.use((req, res, next) => {
  if (!AUTH_TOKEN) return next();
  if (req.path === "/health" || req.path === "/v1/health" || req.path === "/nodes" || req.path === "/v1/nodes" || req.path === "/v1/app-version") return next();
  // Node self-report (own secret) + client health reports (see /v1/nodes handlers).
  if (req.path === "/v1/nodes/self" || /^\/v1\/nodes\/[^/]+\/report$/.test(req.path)) return next();
  if (req.path.startsWith("/v1/auth/") || req.path === "/v1/enrollment-tokens" || req.path === "/v1/peers/register" || req.path === "/v1/account" || req.path === "/v1/devices" || req.path.startsWith("/v1/devices/")) return next();
  // Public payment flow: buy page + create order + PayOS webhook.
  if (req.path === "/buy" || req.path.startsWith("/buy/") || req.path.startsWith("/v1/payments/")) return next();
  // Public MeetFlow AI purchase flow (buy page, create/status/qr/confirm,
  // entitlement lookup used by the apps).
  if (req.path === "/ai/buy" || req.path.startsWith("/ai/buy/") || req.path.startsWith("/v1/ai/")) return next();
  // Activation guides.
  if (req.path === "/guide" || req.path.startsWith("/guide/") || req.path.startsWith("/ai/guide")) return next();
  // Support pages — the App Store "Support URL" must load without a token.
  if (req.path === "/support" || req.path.startsWith("/support/") || req.path.startsWith("/ai/support")) return next();
  // Brand logos referenced by the buy pages.
  if (req.path.startsWith("/assets/")) return next();
  // Public app downloads (APK host): the regular build and the Android 7+ build
  // for Fire TV / older devices.
  if (req.path === "/v1/downloads/android" || req.path === "/v1/downloads/android-legacy" || req.path === "/v1/downloads/ios" || req.path === "/v1/bootstrap" || req.path === "/v1/nodes" || req.path === "/v1/app-version" || req.path === "/v1/downloads/mac") return next();
  if (req.path.startsWith("/install/ios")) return next();
  // Trang cài macOS phát trực tiếp (giống iOS) — công khai, không cần token.
  if (req.path.startsWith("/install/mac") || req.path.startsWith("/v1/install/mac")) return next();
  if (req.path.startsWith("/v1/ios/")) return next();
  if (req.path === "/v1/downloads/qr") return next();
  // LEGACY_MODE=1 keeps POST /v1/tokens working for the App-Store-review build
  // (it is authenticated inside the route: 410/403 when LEGACY_MODE != 1).
  if (req.path === "/v1/tokens" && LEGACY_MODE === "1") return next();
  if (req.method === "GET" && /^\/admin\/?$/i.test(req.path)) return next();
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

// Admin page is reachable from the internet at /PrivateVPN/Admin (owner decision
// 2026-08-23); it only serves the form HTML. Data access requires AUTH_TOKEN (below).
app.get(["/admin", "/admin/"], (_req, res) => {
  res.type("html").send(adminPageHTML());
});

/**
 * Node health bookkeeping — two independent signals, both needed:
 *
 *  - self-report: every exit node posts its CURRENT public IP on a timer, so a
 *    provider IP change propagates by itself. Without this an IP swap needs a
 *    manual edit here (and every client keeps dialling the dead address).
 *  - client reports: an app that cannot reach a node tags it, and /v1/nodes then
 *    serves healthier nodes first. This is the only truthful signal for "can users
 *    actually reach it": the GFW blocks node IPs for Chinese networks while the
 *    node still answers happily from Vietnam, so a check run from here sees
 *    nothing wrong.
 */
const NODE_SELF_SECRET = process.env.NODE_SELF_SECRET ?? "";
const NODE_FAILURE_WINDOW_MS = 30 * 60 * 1000;
const NODE_FAILURES_TO_DEPRIORITISE = 3;
const nodeHealth = new Map();

function healthEntry(id) {
  let entry = nodeHealth.get(id);
  if (!entry) {
    entry = { failures: [], lastOkAt: 0, lastFailAt: 0, lastReason: null };
    nodeHealth.set(id, entry);
  }
  return entry;
}

function noteNodeFailure(id, reason) {
  const entry = healthEntry(id);
  const now = Date.now();
  entry.failures = entry.failures.filter((at) => now - at < NODE_FAILURE_WINDOW_MS);
  entry.failures.push(now);
  entry.lastFailAt = now;
  entry.lastReason = reason ?? null;
}

function noteNodeSuccess(id) {
  const entry = healthEntry(id);
  entry.lastOkAt = Date.now();
  entry.failures = [];
}

/** true when reports say the node is currently unreachable for real users. */
function nodeLooksDown(id) {
  const entry = nodeHealth.get(id);
  if (!entry) return false;
  const now = Date.now();
  const recent = entry.failures.filter((at) => now - at < NODE_FAILURE_WINDOW_MS);
  if (recent.length < NODE_FAILURES_TO_DEPRIORITISE) return false;
  // A success reported after the failures clears the flag.
  return entry.lastOkAt < Math.max(...recent);
}

function healthSnapshot(id) {
  const entry = nodeHealth.get(id);
  if (!entry) return { reported: false, failures: 0, last_ok_at: null, last_fail_at: null, reason: null };
  const now = Date.now();
  return {
    reported: true,
    failures: entry.failures.filter((at) => now - at < NODE_FAILURE_WINDOW_MS).length,
    last_ok_at: entry.lastOkAt ? new Date(entry.lastOkAt).toISOString() : null,
    last_fail_at: entry.lastFailAt ? new Date(entry.lastFailAt).toISOString() : null,
    reason: entry.lastReason,
  };
}

// Public list of active exit nodes (Tailscale-style). The app fetches this to
// present selectable locations instead of hardcoding them.
const listPublicNodes = async (_req, res) => {
  try {
    const nodes = await nodeStore.active();
    // Unhealthy nodes stay listed (a user may still reach them from another
    // network) but sink below the ones that answered recently.
    const ordered = [...nodes].sort((left, right) => {
      const rank = (node) => (nodeLooksDown(node.id) ? 1 : 0);
      return rank(left) - rank(right) || left.priority - right.priority || left.name.localeCompare(right.name);
    });
    res.json({ nodes: ordered.map(publicNode) });
  } catch (err) {
    console.error("GET /nodes failed:", err);
    res.status(500).json({ error: "Internal error" });
  }
};

app.get("/nodes", listPublicNodes);
app.get("/v1/nodes", listPublicNodes);

/**
 * GET /v1/bootstrap — danh sách "cửa vào" để client tự né chặn mà KHÔNG cần build lại app.
 *
 * Vì sao cần: GFW chặn theo TÊN MIỀN (SNI) và chặn theo kiểu bật/tắt. Khi một host bị chặn,
 * chỉ cần server đổi pool ở đây là mọi client tự chuyển sang host/transport khác — thay vì
 * phải phát hành bản app mới. Endpoint này KHÔNG chứa secret: chỉ hostname công khai,
 * thứ tự transport, và version tối thiểu.
 */
app.get("/v1/bootstrap", async (_req, res) => {
  try {
    const apiHosts = String(process.env.API_HOSTS || "https://api.meetflowai.site,https://t1.meetflowai.site")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const transportOrder = String(process.env.TRANSPORT_ORDER || "hysteria,ws,udp")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    // Relay lấy từ chính nguồn mà /v1/nodes đang trả (gọi nội bộ, timeout ngắn).
    // Không lấy được thì trả rỗng — client vẫn dùng host mặc định, không được lỗi ở đây.
    let relayHosts = [];
    try {
      const port = process.env.PORT || 7778;
      const r = await fetch(`http://127.0.0.1:${port}/v1/nodes`, { signal: AbortSignal.timeout(2500) });
      const d = await r.json();
      const nodes = Array.isArray(d?.nodes) ? d.nodes : [];
      relayHosts = nodes.map((n) => ({
        node: n.id ?? null,
        wg: n.wg_relay_url ?? n.ws_relay_url ?? null,
        hy: n.hy_relay_url ?? null,
      }));
    } catch {
      relayHosts = [];
    }
    res.set("Cache-Control", "public, max-age=60");
    res.json({
      api_hosts: apiHosts,
      relay_hosts: relayHosts,
      transport_order: transportOrder,
      min_app_version: appConfig.get("min_app_version") || process.env.MIN_APP_VERSION || null,
      update_url: process.env.UPDATE_URL || `${apiHosts[0]}/install/ios`,
      poll_after_seconds: Number(process.env.BOOTSTRAP_POLL_SECONDS || 900),
    });
  } catch (err) {
    res.status(500).json({ error: "Internal error" });
  }
});


/**
 * An exit node reports its own current public IP (systemd timer on the node).
 * This is what makes an IP swap self-healing: the provider changes the address,
 * the node tells us, and clients are pointed at the new one automatically.
 */
app.post("/v1/nodes/self", async (req, res) => {
  try {
    if (!NODE_SELF_SECRET || req.get("x-node-secret") !== NODE_SELF_SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const id = String(req.body?.id ?? "").trim();
    const ip = String(req.body?.ip ?? "").trim();
    if (!id || !/^[0-9a-fA-F.:]+$/.test(ip)) {
      return res.status(400).json({ error: "invalid_id_or_ip" });
    }
    const node = await nodeStore.findById(id);
    if (!node) return res.status(404).json({ error: "unknown_node" });
    const endpoint = ip.includes(":") ? `[${ip}]:443` : `${ip}:443`;
    if (node.endpoint === endpoint && node.active) {
      noteNodeSuccess(id);
      return res.json({ ok: true, endpoint, changed: false });
    }
    await nodeStore.update(id, { endpoint });
    noteNodeSuccess(id);
    console.log(`[nodes] ${id} endpoint updated ${node.endpoint} -> ${endpoint}`);
    res.json({ ok: true, endpoint, changed: true });
  } catch (err) {
    console.error("POST /v1/nodes/self failed:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

/**
 * Client-side health report: an app that failed (or succeeded) to reach a node
 * tells us, so the next /v1/nodes call can put a reachable node first. Public on
 * purpose (apps are unauthenticated when this matters) and deliberately cheap.
 */
app.post("/v1/nodes/:id/report", async (req, res) => {
  try {
    const id = String(req.params.id ?? "");
    const node = await nodeStore.findById(id);
    if (!node) return res.status(404).json({ error: "unknown_node" });
    const ok = req.body?.ok === true;
    const reason = typeof req.body?.reason === "string" ? req.body.reason.slice(0, 120) : null;
    if (ok) noteNodeSuccess(id);
    else noteNodeFailure(id, reason);
    res.json({ ok: true, health: healthSnapshot(id) });
  } catch (err) {
    console.error("POST /v1/nodes/:id/report failed:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

// ---------------- Web payments (PayOS: MoMo wallet + Bank QR VietQR) ----------------
/**
 * Store / APK download links per product. App Store URLs come from env so they
 * can be filled in the moment each app is published (no code change):
 *   APP_STORE_URL_IOS            → VPNFlow iOS
 *   APP_STORE_URL_MAC            → VPNFlow macOS
 *   APP_STORE_URL_MEETFLOW_AI    → MeetFlow AI iOS
 *   APP_STORE_URL_MEETFLOW_MAC   → MeetFlow AI macOS
 * The Android link always works — the APK is served by this control plane.
 */
/**
 * Payment methods that can actually be used right now: bank QR needs the
 * account, the wallet methods need their collection QR uploaded, PayOS needs
 * gateway credentials. Keeps dead buttons off the buy page.
 */
function availablePaymentMethods() {
  const methods = [];
  if (bankQrConfig()) methods.push("bankqr");
  const qrDir = process.env.PAY_QR_DIR || "/root/flowvpn-pay";
  for (const name of ["wechat", "alipay"]) {
    if (fs.existsSync(path.join(qrDir, `${name}.png`))) methods.push(name);
  }
  // MoMo: either the dynamic VietQR config or the static collection image.
  if (momoQrConfig() || fs.existsSync(path.join(qrDir, "momo.png"))) methods.push("momo");
  if (process.env.PAYOS_CLIENT_ID && process.env.PAYOS_API_KEY && process.env.PAYOS_CHECKSUM_KEY) {
    methods.push("payos");
  }
  return methods;
}

/**
 * Link tải trên trang buy. Thứ tự ưu tiên: cấu hình trong dashboard (appConfig) → biến môi
 * trường → file do server mình phát. Nhờ vậy đổi sang Diawi chỉ cần PATCH /v1/admin/app-version
 * (không phải sửa env rồi restart), mà link tự phát vẫn là đường lùi khi link ngoài hết hạn.
 */
function storeLinks(product) {
  const base = publicBaseUrl();
  return product === "ai"
    ? {
        ios: process.env.APP_STORE_URL_MEETFLOW_AI || null,
        mac: process.env.APP_STORE_URL_MEETFLOW_MAC || null,
        android: appConfig.get("ai_android_apk_url") || `${base}/v1/ai/downloads/android`,
      }
    : {
        // Chủ dự án đã bỏ kênh App Store (14/09/2026): bản iOS phát trực tiếp từ server
        // của mình (IPA) — cùng kiểu với APK Android ở dưới.
        ios: appConfig.get("ios_ipa_url") || process.env.IOS_IPA_URL || `${base}/v1/downloads/ios`,
        mac: process.env.APP_STORE_URL_MAC || null,
        android: appConfig.get("android_apk_url") || `${base}/v1/downloads/android`,
        // Android 7.0+ build for Fire TV / older devices (see the route below).
        androidLegacy: appConfig.get("android_apk_url_legacy") || process.env.ANDROID_LEGACY_APK_URL || `${base}/v1/downloads/android-legacy`,
        // Bộ cài Windows 1-click (Inno Setup) — sinh bởi windows/installer/build.ps1 rồi
        // upload-windows-release.sh đặt vào /dl/. Link cố định "-latest" để trang /buy
        // không phải sửa mỗi lần ra bản mới.
        // PHẢI dùng siteBaseUrl() (meetflowai.site): /dl/* là thư mục tĩnh của Caddy trên
        // domain chính. publicBaseUrl() là api.meetflowai.site — không có route /dl/* nên
        // trả 401, nút tải Windows trên trang /buy chết (đã kiểm chứng trên production).
        windows: appConfig.get("windows_installer_url") || process.env.WINDOWS_INSTALLER_URL || `${siteBaseUrl()}/dl/VPNFlow-Setup-latest.exe`,
      };
}

// Trang mua hàng (Android sideload + iOS web-account flow). Ngưới dùng nhập
// email tài khoản, chọn gói, thanh toán; webhook kích hoạt premium.
// ?lang=en|vi|zh|ja|ko maps the paywall to the app language.

/**
 * Ngôn ngữ cho MỌI trang công khai: `?lang=` → `Accept-Language` của máy khách → mặc định vi.
 * Trước đây chỉ `?lang=` nên khách mở /guide, /support… từ email/link ngoài luôn thấy tiếng Việt.
 */
function requestLang(req) {
  if (req?.query?.lang) return pickBuyLang(String(req.query.lang).slice(0, 8));
  // Theo NGÔN NGỮ CỦA MÁY: lấy thẻ ngôn ngữ ưu tiên cao nhất trong Accept-Language
  // ("vi-VN,vi;q=0.9,en;q=0.8" ⇒ vi), không quét cả chuỗi — quét cả chuỗi sẽ chọn sai khi
  // ngôn ngữ ưu tiên thấp lại đứng trước trong danh sách cần tìm (vd máy en nhưng có vi;q=0.8).
  const first = String(req?.headers?.["accept-language"] ?? "").split(",")[0]?.split(";")[0]?.trim().toLowerCase() ?? "";
  const base = first.split("-")[0];
  for (const code of ["vi", "zh", "ja", "ko", "en"]) {
    if (base === code) return code;
  }
  return "en";
}

function buyLang(req) {
  return requestLang(req);
}

/** Trang buy mở từ TRONG app (paywall) ⇒ ẩn mọi thứ về tải/cài app. */
function isInAppRequest(req) {
  const flag = String(req?.query?.inapp ?? req?.query?.in_app ?? "").toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes";
}

app.get(["/buy", "/buy/"], async (req, res) => {
  // baseUrl is absolute so the page works from any host/path that proxies to
  // this control plane (api.meetflowai.site/buy, meetflowai.site/buy, or any
  // prefixed route). Relative fetch to "" breaks under prefixed mounts
  // (e.g. /PrivateVPN/buy) because the browser would call /v1/... at the root
  // of the outer host, which is a 404 → "Không kết nối được máy chủ".
  res.type("html").send(
    buyPageHTML({
      baseUrl: publicBaseUrl(),
      lang: buyLang(req),
      product: "vpn",
      links: storeLinks("vpn"),
      prefillEmail: String(req.query?.email ?? "").slice(0, 120),
      prefillPlan: String(req.query?.plan ?? "").slice(0, 20),
      methods: availablePaymentMethods(),
      cny: await vndPerCny(),
      usd: await vndPerUsd(),
      cur: String(req.query?.cur ?? "").slice(0, 8),
      // Mở từ TRONG app (paywall) ⇒ chỉ hiện đăng ký tài khoản + thanh toán, bỏ khối tải app.
      inApp: isInAppRequest(req),
    }),
  );
});

app.get(["/buy/success", "/buy/success/"], (req, res) => {
  res.type("html").send(paymentSuccessPageHTML(buyLang(req)));
});

app.get(["/buy/cancel", "/buy/cancel/"], (req, res) => {
  res.type("html").send(paymentCancelPageHTML(buyLang(req)));
});

/* =====================================================================
 * MeetFlow AI — Pro web purchase (QR / WeChat / Alipay), same UX as VPNFlow.
 * Pages:  /ai/buy  (+ /ai/buy/success, /ai/buy/cancel)
 * API:    /v1/ai/payments/create | /status/:orderCode | /qr/:name
 *         /v1/ai/payments/confirm/:orderCode  (signed link in owner alert)
 *         /v1/ai/entitlement?email=…          (read by the AI apps)
 * ================================================================== */

// Brand logos used by the buy pages (served locally so the pages work on any
// host that proxies to this control plane).
app.get("/assets/:file", async (req, res) => {
  try {
    // Legacy/alternate file names used by the static pages (/privacy, /terms,
    // support pages) must resolve to the files that actually exist here —
    // otherwise those pages render without their logo.
    const allowed = {
      "vpnflow-logo.png": "image/png",
      "flowvpn-logo.png": "image/png", // legacy name used by the static pages
      "meetflow-logo.png": "image/png",
      "meetflowai-icon.png": "image/png", // legacy name used by the static pages
    };
    const type = allowed[req.params.file];
    if (!type) return res.status(404).send("Not found");
    const fileAlias = {
      "flowvpn-logo.png": "vpnflow-logo.png",
      "meetflowai-icon.png": "meetflow-logo.png",
    };
    const assetName = fileAlias[req.params.file] ?? req.params.file;
    const file = path.join(process.env.ASSETS_DIR || path.join(__dirname, "..", "assets"), assetName);
    if (!fs.existsSync(file)) return res.status(404).send("Not found");
    res.type(type).sendFile(file);
  } catch {
    res.status(500).send("Internal error");
  }
});

// Activation guides — linked from the buy pages and the invoice emails.
app.get(["/guide", "/guide/"], (req, res) => {
  res.type("html").send(
    guidePageHTML({
      lang: buyLang(req),
      product: "vpn",
      buyUrl: `${publicBaseUrl()}/buy`,
      supportEmail: SUPPORT_EMAIL,
    }),
  );
});

app.get(["/ai/guide", "/ai/guide/"], (req, res) => {
  res.type("html").send(
    guidePageHTML({
      lang: buyLang(req),
      product: "ai",
      buyUrl: `${publicBaseUrl()}/ai/buy`,
      supportEmail: SUPPORT_EMAIL,
    }),
  );
});

// Support pages — the App Store "Support URL" for both apps (and a real help
// page for web customers). Localized, with the contact address and FAQs.
app.get(["/support", "/support/"], (req, res) => {
  res.type("html").send(
    supportPageHTML({
      lang: buyLang(req),
      product: "vpn",
      supportEmail: SUPPORT_EMAIL,
      links: {
        guide: `${publicBaseUrl()}/guide`,
        buy: `${publicBaseUrl()}/buy`,
        privacy: `${siteBaseUrl()}/FlowVPNPrivacy.html`,
        terms: `${siteBaseUrl()}/terms`,
      },
    }),
  );
});

app.get(["/ai/support", "/ai/support/"], (req, res) => {
  res.type("html").send(
    supportPageHTML({
      lang: buyLang(req),
      product: "ai",
      supportEmail: SUPPORT_EMAIL,
      links: {
        guide: `${publicBaseUrl()}/ai/guide`,
        buy: `${publicBaseUrl()}/ai/buy`,
        privacy: `${siteBaseUrl()}/privacy`,
        terms: `${siteBaseUrl()}/terms`,
      },
    }),
  );
});

app.get(["/ai/buy", "/ai/buy/"], async (req, res) => {
  res.type("html").send(
    buyPageHTML({
      baseUrl: publicBaseUrl(),
      lang: buyLang(req),
      product: "ai",
      links: storeLinks("ai"),
      prefillEmail: String(req.query?.email ?? "").slice(0, 120),
      prefillPlan: String(req.query?.plan ?? "").slice(0, 20),
      methods: availablePaymentMethods(),
      cny: await vndPerCny(),
      usd: await vndPerUsd(),
      cur: String(req.query?.cur ?? "").slice(0, 8),
      inApp: isInAppRequest(req),
    }),
  );
});

app.get(["/ai/buy/success", "/ai/buy/success/"], (req, res) => {
  res.type("html").send(paymentSuccessPageHTML(buyLang(req), "ai"));
});

app.get(["/ai/buy/cancel", "/ai/buy/cancel/"], (req, res) => {
  res.type("html").send(paymentCancelPageHTML(buyLang(req), "ai"));
});

// Duplicate-order protection: a customer who double-taps (or reloads) must not
// end up with two orders — and never with two activations. Admins confirm one
// payment per order, so two orders = 2x the days for one payment.
const AI_DUP_WINDOW_MS = Number(process.env.AI_DUP_WINDOW_MS || 30 * 60 * 1000);
const AI_DUP_MESSAGES = {
  en: "This email already has an activated pass. Check your inbox, or contact support if you need help.",
  vi: "Email này đã được kích hoạt gói trước đó. Vui lòng kiểm tra hộp thư, hoặc liên hệ hỗ trợ nếu cần.",
  zh: "该邮箱已激活通行证，请查看邮箱；如需帮助请联系客服。",
  ja: "このメールアドレスはすでに有効化済みです。受信トレイをご確認ください。",
  ko: "이 이메일은 이미 활성화되었습니다. 받은편지함을 확인해 주세요.",
};

// Creates a MeetFlow Pro order and returns the payment QR (bank / WeChat / Alipay).
app.post("/v1/ai/payments/create", async (req, res) => {
  try {
    const { email, plan, method, lang } = req.body ?? {};
    if (!email || !/\S+@\S+/.test(email)) {
      return res.status(400).json({ code: "invalid_email", error: "Email không hợp lệ." });
    }
    const planCfg = AI_PLANS[plan];
    if (!planCfg || planCfg.retired) return res.status(400).json({ code: "invalid_plan", error: "Gói không hợp lệ." });

    const emailKey = String(email).trim().toLowerCase();
    let orderCode = null;
    // 1) Reuse a recent pending order for the same email+plan (reload / double-tap)
    //    so the customer pays once for one orderCode.
    // 2) Refuse to create a new order when that email+plan was already paid
    //    recently — one payment must never stack twice.
    try {
      const recent = (await aiStore.listAllPayments()).filter((p) =>
        String(p.email ?? "").trim().toLowerCase() === emailKey &&
        p.plan === plan &&
        Date.now() - Date.parse(p.createdAt ?? 0) < AI_DUP_WINDOW_MS
      );
      const pendingDup = recent
        .filter((p) => !p.paidAt)
        .sort((a, b) => b.orderCode - a.orderCode)[0];
      const paidDup = recent
        .filter((p) => p.paidAt)
        .sort((a, b) => Date.parse(b.paidAt) - Date.parse(a.paidAt))[0];
      if (pendingDup) {
        orderCode = pendingDup.orderCode;
        console.log(`ai-payments: reuse pending order ${orderCode} for ${emailKey} plan=${plan}`);
      } else if (paidDup) {
        console.log(`ai-payments: duplicate create blocked for ${emailKey} plan=${plan} (paid order ${paidDup.orderCode})`);
        return res.status(200).json({
          code: "already_paid",
          error: AI_DUP_MESSAGES[pickMailLang(lang)] || AI_DUP_MESSAGES.en,
          alreadyPaid: true,
          orderCode: paidDup.orderCode,
        });
      }
    } catch (err) {
      console.error("ai-payments: duplicate check failed:", err?.message ?? err);
    }

    if (orderCode == null) {
      orderCode = await createPendingOrder({
        product: "ai",
        email,
        plan,
        method,
        lang: pickMailLang(lang),
        amount: planCfg.amount,
      });
      await aiUsersStore
        .touch(email, { source: "purchase", note: `${plan} via ${method ?? "bankqr"}` })
        .catch((err) => console.error("ai user touch failed:", err?.message ?? err));
      // Như VPN: mặc định không gửi email lúc tạo đơn, chỉ gửi khi tiền về.
      if (shouldAlertOnCreate(method)) {
        fireAiPaymentAlert(orderCode, email, plan, planCfg.amount, method);
      }
    }

    if (method === "momo") {
      const cfg = momoQrConfig();
      if (cfg) {
        const qrDataUrl = await createBankQrDataUrl({
          prefix: "MEETFLOW",
          product: "ai",
          plan,
          accountNumber: cfg.accountNumber,
          accountName: cfg.accountName,
          bin: cfg.bin,
          amount: planCfg.amount,
          orderCode,
        });
        return res.json({ qrDataUrl, orderCode, amount: planCfg.amount, method: "momo", selfContained: true });
      }
      return res.json({ qrImageUrl: "/v1/ai/payments/qr/momo", orderCode, amount: planCfg.amount, method: "momo" });
    }

    if (method === "wechat" || method === "alipay") {
      // Ask for the amount-specific QR when the owner uploaded one — then the
      // amount is already filled in when the customer scans it.
      const cnyInfo = await cnyAmountForMethod(planCfg.amount, method);
      const qrQuery = `plan=${encodeURIComponent(plan)}${cnyInfo ? `&cny=${cnyInfo.amount}` : ""}`;
      const { resolved, qrCny } = qrForOrder({ method, product: "ai", plan, cny: cnyInfo?.amount });
      return res.json({
        qrImageUrl: `/v1/ai/payments/qr/${method}?${qrQuery}`,
        orderCode,
        amount: planCfg.amount,
        cny: cnyInfo?.amount ?? null,
        amountPrefilled: !resolved.missing && resolved.prefilled,
        qrVariant: resolved.missing ? null : resolved.variant,
        // Số ¥ in sẵn trong ảnh (nếu có) — trang buy hiện đúng con số này.
        qrCny,
        method,
      });
    }

    // Default: direct bank transfer via VietQR (same TPBank account).
    const bank = bankQrConfig();
    if (!bank) {
      return res.status(502).json({ code: "bank_not_configured", error: "Bank QR chưa được cấu hình (BANK_QR_ACCOUNT)." });
    }
    const qrDataUrl = await createBankQrDataUrl({
      prefix: "MEETFLOW",
      product: "ai",
      plan,
      accountNumber: bank.accountNumber,
      accountName: bank.accountName,
      amount: planCfg.amount,
      orderCode,
    });
    const qrImageUrl = bankQrImageUrl({
      amount: planCfg.amount,
      note: `MEETFLOW-${transferNote({ orderCode, plan, product: "ai" })}`,
      account: bank.accountNumber,
      holder: bank.accountName,
      store: process.env.BANK_QR_STORE_AI || "MeetFlow AI",
    });
    return res.json({ qrDataUrl, qrImageUrl, orderCode, amount: planCfg.amount, method: "bankqr", selfContained: true });
  } catch (err) {
    console.error("POST /v1/ai/payments/create failed:", err);
    res.status(500).json({ code: "internal", error: "Internal error" });
  }
});

// MeetFlow AI APK for direct download (sideload distribution).
app.get("/v1/ai/downloads/android", async (_req, res) => {
  try {
    const apkDir = process.env.APK_DIR || "/root/flowvpn-apk";
    const apkPath = path.join(apkDir, "MeetFlowAI-latest.apk");
    if (!fs.existsSync(apkPath)) {
      return res.status(404).send("APK not found. Contact support@meetflowai.site");
    }
    res.download(apkPath, "MeetFlowAI.apk");
  } catch (err) {
    res.status(500).json({ error: "Internal error" });
  }
});

// Personal WeChat / Alipay collection QR images (shared with VPNFlow assets).
app.get("/v1/ai/payments/qr/:name", async (req, res) => {
  try {
    const name = ["wechat", "alipay", "momo"].includes(req.params.name) ? req.params.name : null;
    if (!name) return res.status(404).send("Not found");
    const resolved = resolveQrFile(process.env.PAY_QR_DIR || "/root/flowvpn-pay", name, {
      cny: req.query?.cny,
      plan: req.query?.plan,
      product: "ai",
    });
    if (resolved.missing) return res.status(404).json({ error: "QR image not uploaded yet" });
    res.set("X-QR-Variant", resolved.variant);
    res.set("X-QR-Amount-Prefilled", resolved.prefilled ? "1" : "0");
    res.sendFile(resolved.file);
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

app.get("/v1/ai/payments/status/:orderCode", async (req, res) => {
  try {
    const order = await aiStore.pendingPayment(req.params.orderCode);
    if (!order) return res.status(404).json({ error: "Order not found" });
    const elapsedSec = Math.max(0, Math.round((Date.now() - Date.parse(order.createdAt)) / 1000));
    res.json({ paid: Boolean(order.paidAt), orderCode: order.orderCode, elapsed_sec: elapsedSec });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

// Signed one-click confirm link (owner email alert) — grants Pro + invoice.
app.get("/v1/ai/payments/confirm/:orderCode", async (req, res) => {
  try {
    const orderCode = req.params.orderCode;
    if ((req.query.t || "") !== paymentConfirmSignature("ai:" + orderCode)) {
      return res.status(403).send("Link không hợp lệ hoặc đã hết hạn.");
    }
    const order = await aiStore.markPendingPaymentPaid(orderCode);
    if (!order) return res.status(404).send("Đơn không tồn tại hoặc đã xác nhận.");
    const activated = await activateAiProAndInvoice({
      orderCode: order.orderCode,
      email: order.email,
      plan: order.plan,
      method: order.method,
      lang: order.lang,
      confirmedBy: "manual",
    });
    res.type("html").send(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Đã xác nhận</title><style>body{min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:-apple-system,Segoe UI,sans-serif;color:#fff;background:linear-gradient(180deg,#051525,#0a1f3a)}.c{max-width:420px;padding:32px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:18px;text-align:center}.ok{font-size:48px;color:#33c773}h1{font-size:20px;margin:10px 0}p{color:rgba(255,255,255,.6);font-size:14px}</style></head><body><div class="c"><div class="ok">✅</div><h1>Đã xác nhận thanh toán</h1><p>MeetFlow Pro đã kích hoạt cho <b>${order.email}</b>.</p><p>${activated?.mailSent ? "📧 Hoá đơn / xác nhận đã gửi tới email khách." : "⚠️ Chưa gửi được email hoá đơn — kiểm tra SMTP."}</p></div></body></html>`);
  } catch (err) {
    console.error("ai confirm-link failed:", err);
    res.status(500).send("Lỗi xác nhận. Liên hệ support@meetflowai.site");
  }
});

// ---------------------------------------------------------------------------
// Store purchases (Google Play / App Store) reported by the apps
//
// In-app purchases never touch our server: Play Billing and StoreKit resolve
// the entitlement on the device. The app therefore reports the purchase token
// here, we verify it with Google (when the Play service account is configured)
// and only a verified purchase may grant Pro. Unverified reports are still
// shown to the admin so nothing is silently lost.
// ---------------------------------------------------------------------------

/** Play product id -> plan id used everywhere else in the dashboard. */
function planFromProductId(productId) {
  const id = String(productId ?? "").toLowerCase();
  if (id.includes("year") || id.includes("annual")) return "yearly";
  if (id.includes("month")) return "monthly";
  if (id.includes("pass") || id.includes("30")) return "pass30";
  return null;
}

// Cheap per-IP cap: the endpoint is public (apps call it), but it can grant Pro
// for a verified token, so it must not be a free-for-all.
const STORE_REPORT_WINDOW_MS = 60 * 60 * 1000;
const STORE_REPORT_MAX = 40;
const storeReportHits = new Map();

function storeReportAllowed(ip) {
  const now = Date.now();
  const hits = (storeReportHits.get(ip) ?? []).filter((t) => now - t < STORE_REPORT_WINDOW_MS);
  if (hits.length >= STORE_REPORT_MAX) {
    storeReportHits.set(ip, hits);
    return false;
  }
  hits.push(now);
  storeReportHits.set(ip, hits);
  if (storeReportHits.size > 5000) storeReportHits.clear();
  return true;
}

/** Verifies one stored row and, when it is real and active, grants Pro. */
async function verifyStorePurchaseRow(row) {
  const token = row?.purchaseToken;
  if (!token) return { row, verified: false, error: "Không có purchase token" };
  const status = await playCredentialStatus();
  if (!status.configured) {
    const message = "Chưa cấu hình Google Play service account — chưa xác thực được";
    await aiStorePurchaseStore.markVerified(row.tokenId, null, message);
    return { row: await aiStorePurchaseStore.get(row.tokenId), verified: false, error: message };
  }
  try {
    const result = await verifyPlayPurchase({
      purchaseToken: token,
      productId: row.productId,
      kind: row.kind ?? "subs",
    });
    const updated = await aiStorePurchaseStore.markVerified(row.tokenId, result);
    console.log(
      `play-verify tokenId=${row.tokenId} product=${result.productId} state=${result.state} ` +
        `active=${result.active} expires=${result.expiresAt ?? "-"}`,
    );
    // Grant Pro only for a verified, still-valid purchase that we can attach to
    // an email (anonymous Play buyers have no email to key an entitlement on).
    if (result.active && updated?.email) {
      const plan = updated.plan ?? planFromProductId(result.productId) ?? "monthly";
      // Absolute expiry from Google, not "days from now": the app reports the
      // same purchase on every launch, and adding days each time would extend
      // the subscription indefinitely.
      await aiStore.grantProUntil(updated.email, {
        plan,
        expiresAt: result.expiresAt,
        productId: `play.${result.productId}`,
        orderCode: result.orderId ?? null,
        note: `Google Play ${result.productId}`,
      });
      await aiUsersStore
        .touch(updated.email, { source: "store", note: `Google Play ${result.productId}` })
        .catch(() => {});
    }
    return { row: updated, verified: true, error: null };
  } catch (err) {
    const message = String(err?.message ?? err).slice(0, 300);
    await aiStorePurchaseStore.markVerified(row.tokenId, null, message);
    console.error(`play-verify failed tokenId=${row.tokenId}: ${message}`);
    return { row: await aiStorePurchaseStore.get(row.tokenId), verified: false, error: message };
  }
}

/** POST /v1/ai/store/purchase — the app reports a Play/App Store purchase. */
app.post("/v1/ai/store/purchase", async (req, res) => {
  try {
    if (!storeReportAllowed(req.ip ?? "unknown")) {
      return res.status(429).json({ error: "Quá nhiều yêu cầu, thử lại sau." });
    }
    const body = req.body ?? {};
    const purchaseToken = String(body.purchaseToken ?? "").trim();
    const productId = String(body.productId ?? "").trim();
    if (!purchaseToken || purchaseToken.length < 10) {
      return res.status(400).json({ error: "purchaseToken không hợp lệ" });
    }
    if (!productId) return res.status(400).json({ error: "Thiếu productId" });

    const platformRaw = String(body.platform ?? "android").toLowerCase();
    // `windows` phải tách riêng: trước đây mọi nền tảng không phải iOS đều bị ghi là
    // "android", nên thiết bị/billing của bản Windows lẫn vào nhóm Android.
    const platform = platformRaw.includes("windows") || platformRaw.includes("win32")
      ? "windows"
      : platformRaw.includes("ios") || platformRaw.includes("apple")
        ? "ios"
        : "android";
    const email = String(body.email ?? "").trim();

    let row = await aiStorePurchaseStore.record({
      purchaseToken,
      productId,
      platform,
      packageName: String(body.packageName ?? playPackageName()).slice(0, 80),
      kind: platform === "android" ? "subs" : "subs",
      uid: String(body.uid ?? "").slice(0, 128) || null,
      email: email || null,
      orderId: body.orderId ? String(body.orderId).slice(0, 80) : null,
      plan: body.plan ? String(body.plan).slice(0, 20) : planFromProductId(productId),
      expiresAt: body.expiresAt ? String(body.expiresAt).slice(0, 40) : null,
      autoRenewing: typeof body.autoRenewing === "boolean" ? body.autoRenewing : null,
      priceMicros: Number.isFinite(Number(body.priceMicros)) ? Number(body.priceMicros) : null,
      currency: body.currency ? String(body.currency).slice(0, 8) : null,
      appVersion: body.appVersion ? String(body.appVersion).slice(0, 24) : null,
    });

    if (email) {
      await aiUsersStore
        .touch(email, { source: "store", note: `Google Play ${productId}` })
        .catch(() => {});
    }
    console.log(
      `ai-store-report tokenId=${row.tokenId} platform=${platform} product=${productId} ` +
        `uid=${row.uid ?? "-"} email=${email || "-"}`,
    );

    // Verify right away when we can; otherwise the admin can re-run it later.
    let verified = false;
    let error = null;
    if (platform === "android") {
      const outcome = await verifyStorePurchaseRow(row);
      row = outcome.row ?? row;
      verified = outcome.verified;
      error = outcome.error;
    }
    res.json({
      ok: true,
      tokenId: row.tokenId,
      verified: Boolean(row.verified),
      active: Boolean(row.active),
      plan: row.plan ?? null,
      expiresAt: row.expiresAt ?? null,
      checked: verified,
      error,
    });
  } catch (err) {
    console.error("ai store purchase report failed:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

/** GET /v1/admin/ai/store/purchases — Play/App Store purchases + Play status. */
app.get("/v1/admin/ai/store/purchases", requireAdminAuth, async (_req, res) => {
  try {
    const purchases = await aiStorePurchaseStore.list();
    const credentials = await playCredentialStatus();
    res.json({
      purchases,
      summary: AiStorePurchaseStore.summarize(purchases),
      play: {
        configured: credentials.configured,
        source: credentials.source,
        projectId: credentials.projectId,
        packageName: credentials.packageName,
      },
    });
  } catch (err) {
    console.error("admin store purchases failed:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

/** POST /v1/admin/ai/store/purchases/:tokenId/verify — re-check with Google. */
app.post("/v1/admin/ai/store/purchases/:tokenId/verify", requireAdminAuth, async (req, res) => {
  try {
    const row = await aiStorePurchaseStore.get(req.params.tokenId);
    if (!row) return res.status(404).json({ error: "Không tìm thấy giao dịch" });
    const outcome = await verifyStorePurchaseRow(row);
    res.json({ ok: true, verified: outcome.verified, error: outcome.error, purchase: outcome.row });
  } catch (err) {
    res.status(500).json({ error: String(err?.message ?? err).slice(0, 300) });
  }
});

/** POST /v1/admin/ai/store/purchases/:tokenId/forget — drop a bogus report. */
app.post("/v1/admin/ai/store/purchases/:tokenId/forget", requireAdminAuth, async (req, res) => {
  try {
    res.json({ ok: true, removed: await aiStorePurchaseStore.forget(req.params.tokenId) });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

/** POST /v1/admin/ai/store/credentials — paste the Play service-account JSON. */
app.post("/v1/admin/ai/store/credentials", requireAdminAuth, async (req, res) => {
  try {
    const raw = typeof req.body?.json === "string" ? req.body.json : JSON.stringify(req.body?.json ?? {});
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return res.status(400).json({ error: "JSON không hợp lệ — dán đúng nội dung file service account của Google Cloud" });
    }
    const saved = await savePlayCredential(parsed);
    res.json({ ok: true, ...saved, packageName: playPackageName() });
  } catch (err) {
    res.status(400).json({ error: String(err?.message ?? err).slice(0, 300) });
  }
});

/** DELETE /v1/admin/ai/store/credentials — remove the stored Play key. */
app.delete("/v1/admin/ai/store/credentials", requireAdminAuth, async (_req, res) => {
  try {
    await clearPlayCredential();
    const status = await playCredentialStatus();
    res.json({ ok: true, configured: status.configured, source: status.source });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

// ---------------------------------------------------------------------------
// Email verification reminders
//
// Firebase password sign-ups start unverified: those users have no way back
// into their account if they forget the password, and they cannot be reached by
// password reset. The apps sign in anonymously, so the control plane is the
// only place that can notice and nudge them.
//
// The emailed link is OURS and valid for 30 days; clicking it asks Firebase for
// a fresh verification link and redirects there, which sidesteps both the
// authorized-domain allowlist and Firebase's short link lifetime.
// ---------------------------------------------------------------------------

const VERIFY_LINK_TTL_DAYS = Number(process.env.VERIFY_LINK_TTL_DAYS ?? 30);
const VERIFY_REMINDERS_ENABLED = process.env.VERIFY_REMINDERS !== "0";
const VERIFY_REMINDER_INTERVAL_MS = Number(process.env.VERIFY_REMINDER_INTERVAL_MS ?? 6 * 60 * 60 * 1000);
const VERIFY_REMINDER_MIN_AGE_MS = Number(process.env.VERIFY_REMINDER_MIN_AGE_MS ?? 24 * 60 * 60 * 1000);
const VERIFY_REMINDER_SPACING_MS = Number(process.env.VERIFY_REMINDER_SPACING_MS ?? 7 * 24 * 60 * 60 * 1000);
const VERIFY_REMINDER_MAX = Number(process.env.VERIFY_REMINDER_MAX ?? 3);

function verifyLinkSecret() {
  return process.env.VERIFY_LINK_SECRET || AUTH_TOKEN || "flowvpn-verify-link";
}

/** Signed, long-lived token for our own verification link. */
function signVerifyToken(email) {
  const payload = `${String(email).trim().toLowerCase()}.${Date.now()}`;
  const signature = crypto.createHmac("sha256", verifyLinkSecret()).update(payload).digest("base64url");
  return `${Buffer.from(payload).toString("base64url")}.${signature}`;
}

function readVerifyToken(token) {
  const raw = String(token ?? "").trim();
  const [payloadPart, signature] = raw.split(".");
  if (!payloadPart || !signature) return null;
  let payload;
  try {
    payload = Buffer.from(payloadPart, "base64url").toString("utf8");
  } catch {
    return null;
  }
  // Emails contain dots, so split on the LAST one: the payload is
  // "<email>.<issuedAt>" and an email like a@b.com would otherwise be cut in half.
  const separator = payload.lastIndexOf(".");
  if (separator <= 0) return null;
  const email = payload.slice(0, separator);
  const issuedAt = payload.slice(separator + 1);
  if (!email || !issuedAt) return null;
  const expected = crypto.createHmac("sha256", verifyLinkSecret()).update(payload).digest("base64url");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const ageMs = Date.now() - Number(issuedAt);
  if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > VERIFY_LINK_TTL_DAYS * 24 * 60 * 60 * 1000) return null;
  return { email, issuedAt: Number(issuedAt) };
}

function verifyLinkFor(email) {
  const base = publicBaseUrl();
  return `${base}/v1/ai/verify-email/confirm?t=${encodeURIComponent(signVerifyToken(email))}`;
}

/**
 * Guesses the email language: what the customer used before, then the domain
 * (Chinese providers are a real share of MeetFlow AI users), then Vietnamese,
 * our primary market.
 */
async function verifyMailLang(email) {
  const remembered = await authStore.langForEmail(email).catch(() => null);
  if (remembered) return pickMailLang(remembered);
  const domain = String(email).split("@")[1]?.toLowerCase() ?? "";
  if (/(qq\.com|163\.com|126\.com|sina\.com|foxmail\.com|aliyun\.com|yeah\.net)$/.test(domain)) return "zh";
  return "vi";
}

/** Sends one verification email. Never throws. */
async function sendVerificationEmailTo(email, { force = false, reason = "manual" } = {}) {
  const key = String(email ?? "").trim().toLowerCase();
  if (!key.includes("@")) return { sent: false, reason: "invalid-email" };
  const info = await aiUsersStore.verifyReminderInfo(key).catch(() => ({ count: 0, lastAt: null }));
  if (!force) {
    if (info.count >= VERIFY_REMINDER_MAX) return { sent: false, reason: "max-reminders", count: info.count };
    if (info.lastAt && Date.now() - Date.parse(info.lastAt) < VERIFY_REMINDER_SPACING_MS) {
      return { sent: false, reason: "too-soon", lastAt: info.lastAt, count: info.count };
    }
  }
  const lang = await verifyMailLang(key);
  try {
    const result = await sendVerifyEmail({ to: key, lang, link: verifyLinkFor(key), reminders: info.count + 1 });
    const sent = result?.sent === true;
    await aiUsersStore.markVerifyReminded(key, { ok: sent });
    console.log(`verify-email: to=${key} lang=${lang} reason=${reason} sent=${sent} reminder#${info.count + 1}`);
    return { sent, lang, count: info.count + 1, reason: sent ? null : "delivery-failed" };
  } catch (err) {
    console.error(`verify-email failed for ${key}:`, err?.message ?? err);
    await aiUsersStore.markVerifyReminded(key, { ok: false }).catch(() => {});
    return { sent: false, reason: "error", error: String(err?.message ?? err).slice(0, 200) };
  }
}

/**
 * Scheduled job: nudge unverified accounts that are old enough, spacing the
 * reminders out and stopping after VERIFY_REMINDER_MAX.
 */
async function runVerifyEmailReminders() {
  if (!VERIFY_REMINDERS_ENABLED) return;
  try {
    const status = await firebaseCredentialStatus();
    if (!status.configured) return;
    const list = await listFirebaseUsers({ max: 3000 });
    if (list.error) {
      console.error("verify-reminder: cannot read Firebase:", list.error);
      return;
    }
    const now = Date.now();
    let sent = 0;
    let skipped = 0;
    for (const user of list.users ?? []) {
      if (!user.email || user.emailVerified || user.disabled) continue;
      const created = user.created ? Date.parse(user.created) : NaN;
      if (Number.isFinite(created) && now - created < VERIFY_REMINDER_MIN_AGE_MS) continue;
      const result = await sendVerificationEmailTo(user.email, { reason: "scheduled" });
      if (result.sent) sent += 1;
      else skipped += 1;
    }
    if (sent || skipped) console.log(`verify-reminder run: sent=${sent} skipped=${skipped}`);
  } catch (err) {
    console.error("runVerifyEmailReminders failed:", err?.message ?? err);
  }
}

/** GET /v1/ai/verify-email/confirm?t=… — our link, forwarded to Firebase. */
app.get(["/v1/ai/verify-email/confirm", "/v1/ai/verify-email/confirm/"], async (req, res) => {
  const parsed = readVerifyToken(req.query?.t);
  const page = (title, body) =>
    `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>` +
    `<style>body{min-height:100vh;display:flex;align-items:center;justify-content:center;margin:0;font-family:-apple-system,Segoe UI,sans-serif;color:#fff;background:linear-gradient(180deg,#051525,#0a1f3a)}` +
    `.c{max-width:420px;padding:32px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:18px;text-align:center}` +
    `h1{font-size:19px;margin:10px 0}p{color:rgba(255,255,255,.65);font-size:14px;line-height:1.6}</style></head>` +
    `<body><div class="c">${body}</div></body></html>`;

  if (!parsed) {
    return res.status(400).type("html").send(
      page("Link không hợp lệ", '<div style="font-size:44px">⚠️</div><h1>Link đã hết hạn hoặc không hợp lệ</h1><p>Vui lòng mở lại email xác thực mới nhất, hoặc liên hệ support@meetflowai.site.</p>'),
    );
  }
  try {
    const link = await generateEmailVerificationLink(parsed.email);
    console.log(`verify-email clicked email=${parsed.email} -> redirect Firebase`);
    res.redirect(302, link);
  } catch (err) {
    const message = String(err?.message ?? err);
    console.error(`verify-email confirm failed for ${parsed.email}:`, message);
    const already = /user-not-found/i.test(message);
    res.status(already ? 404 : 500).type("html").send(
      page("Không xác thực được", `<div style="font-size:44px">${already ? "🤔" : "⚠️"}</div><h1>${already ? "Không tìm thấy tài khoản" : "Chưa xác thực được"}</h1><p>${already ? "Tài khoản này không còn tồn tại trong hệ thống." : "Vui lòng thử lại sau, hoặc liên hệ support@meetflowai.site."}</p>`),
    );
  }
});

/** POST /v1/admin/ai/firebase/users/:uid/verify-email — send one reminder. */
app.post("/v1/admin/ai/firebase/users/:uid/verify-email", requireAdminAuth, async (req, res) => {
  try {
    const email = String(req.body?.email ?? "").trim();
    if (!email.includes("@")) return res.status(400).json({ error: "Thiếu email của tài khoản" });
    const result = await sendVerificationEmailTo(email, { force: req.body?.force === true, reason: "admin" });
    res.json({ ok: result.sent, ...result });
  } catch (err) {
    res.status(500).json({ error: String(err?.message ?? err).slice(0, 200) });
  }
});

/** POST /v1/admin/ai/verify-email/remind — all unverified accounts. */
app.post("/v1/admin/ai/verify-email/remind", requireAdminAuth, async (req, res) => {
  try {
    const status = await firebaseCredentialStatus();
    if (!status.configured) return res.status(400).json({ error: "Chưa cấu hình Firebase service account" });
    const list = await listFirebaseUsers({ max: 3000, force: true });
    if (list.error) return res.status(400).json({ error: list.error });
    const force = req.body?.force === true;
    const targets = [];
    const results = [];
    for (const user of list.users ?? []) {
      if (!user.email || user.emailVerified || user.disabled) continue;
      targets.push(user.email);
      results.push({ email: user.email, ...(await sendVerificationEmailTo(user.email, { force, reason: "admin-bulk" })) });
    }
    res.json({
      ok: true,
      unverified: targets.length,
      sent: results.filter((r) => r.sent).length,
      skipped: results.filter((r) => !r.sent).length,
      results,
    });
  } catch (err) {
    console.error("bulk verify reminder failed:", err);
    res.status(500).json({ error: String(err?.message ?? err).slice(0, 200) });
  }
});

// Admin: list pending MeetFlow Pro orders / confirm one manually.
app.get("/v1/admin/ai/payments/pending", requireAdminAuth, async (_req, res) => {
  try {
    res.json({ orders: await aiStore.listPendingPayments() });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

app.post("/v1/admin/ai/payments/:orderCode/confirm", requireAdminAuth, async (req, res) => {
  try {
    const order = await aiStore.markPendingPaymentPaid(req.params.orderCode);
    if (!order) return res.status(404).json({ error: "Order not found or already paid" });
    const activated = await activateAiProAndInvoice({
      orderCode: order.orderCode,
      email: order.email,
      plan: order.plan,
      method: order.method,
      lang: order.lang,
      confirmedBy: "manual",
    });
    res.json({ ok: true, email: order.email, mailSent: activated?.mailSent === true, mailError: activated?.mailError ?? null });
  } catch (err) {
    console.error("ai admin confirm failed:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

// Admin: all MeetFlow Pro entitlements (support / expiry questions).
app.get("/v1/admin/ai/entitlements", requireAdminAuth, async (_req, res) => {
  try {
    res.json({ entitlements: await aiStore.listEntitlements() });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

// ---------------------------------------------------------------------------
// MeetFlow AI user management (admin dashboard)
//
// MeetFlow AI accounts are Firebase accounts; the control plane additionally
// keeps its own registry of every email it has seen. These endpoints merge the
// two with the entitlement + order history into one user view, so support can
// answer "who is this, is Pro active, when does it expire, what did they pay"
// without touching Firebase or SSHing into the VPS.
// ---------------------------------------------------------------------------

/** Builds the merged dashboard payload (rows + stats) from all four sources. */
async function aiUsersSnapshot({ withFirebase = true } = {}) {
  const [registry, entitlements, orders, firebase, storePurchases] = await Promise.all([
    aiUsersStore.listUsers(),
    aiStore.listEntitlements(),
    aiStore.listAllPayments(),
    withFirebase
      ? listFirebaseUsers({ max: 2000 })
      : Promise.resolve({ configured: false, users: [], count: 0, error: null }),
    aiStorePurchaseStore.list(),
  ]);
  const rows = buildUserRows({
    registry,
    entitlements,
    orders,
    firebaseUsers: firebase.users ?? [],
    storePurchases,
    prices: AI_PLANS,
  });
  const store = AiStorePurchaseStore.summarize(storePurchases);
  const stats = computeStats({ rows, orders, prices: AI_PLANS, firebase, store });
  return { rows, stats, registry, entitlements, orders, firebase, storePurchases, store };
}

function aiUserQuery(req) {
  return {
    q: String(req.query?.q ?? "").slice(0, 120),
    status: String(req.query?.status ?? "all").slice(0, 20),
    source: String(req.query?.source ?? "all").slice(0, 20),
    sort: String(req.query?.sort ?? "recent").slice(0, 20),
    limit: Math.min(1000, Math.max(1, Number(req.query?.limit) || 200)),
    offset: Math.max(0, Number(req.query?.offset) || 0),
  };
}

/** GET /v1/admin/ai/users — the AI Users tab (rows + dashboard stats). */
app.get("/v1/admin/ai/users", requireAdminAuth, async (req, res) => {
  try {
    const query = aiUserQuery(req);
    const { rows, stats, firebase } = await aiUsersSnapshot();
    const filtered = filterRows(rows, query);
    res.json({
      users: filtered.slice(query.offset, query.offset + query.limit),
      total: filtered.length,
      totalKnown: rows.length,
      offset: query.offset,
      limit: query.limit,
      stats,
      firebase: {
        configured: Boolean(firebase.configured),
        error: firebase.error ?? null,
        count: firebase.count ?? 0,
        projectId: firebase.projectId ?? null,
      },
      play: await playCredentialStatus(),
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("admin ai users failed:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

/** GET /v1/admin/ai/users.csv — export of the filtered view. */
app.get("/v1/admin/ai/users.csv", requireAdminAuth, async (req, res) => {
  try {
    const query = aiUserQuery(req);
    const { rows } = await aiUsersSnapshot({ withFirebase: false });
    const csv = rowsToCsv(filterRows(rows, query));
    res.type("text/csv").set("Content-Disposition", 'attachment; filename="meetflow-ai-users.csv"').send(csv);
  } catch (err) {
    console.error("admin ai users csv failed:", err);
    res.status(500).send("Internal error");
  }
});

/** GET /v1/admin/ai/users/:email — one user in full (grants + orders). */
app.get("/v1/admin/ai/users/:email", requireAdminAuth, async (req, res) => {
  try {
    const email = String(req.params.email ?? "").trim().toLowerCase();
    if (!email.includes("@")) return res.status(400).json({ error: "Email không hợp lệ" });
    const { rows, orders } = await aiUsersSnapshot();
    const row = rows.find((r) => r.email === email);
    if (!row) return res.status(404).json({ error: "Không tìm thấy user này trong dữ liệu" });
    res.json({
      user: row,
      orders: orders.filter((o) => String(o.email ?? "").toLowerCase() === email),
    });
  } catch (err) {
    console.error("admin ai user detail failed:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

/**
 * POST /v1/admin/ai/users/:email/grant — grant or extend Pro by hand
 * (support case: customer paid outside the QR flow, goodwill, testing).
 * Body: { plan?, days?, note?, notify? }
 */
app.post("/v1/admin/ai/users/:email/grant", requireAdminAuth, async (req, res) => {
  try {
    const email = String(req.params.email ?? "").trim();
    if (!email.includes("@")) return res.status(400).json({ error: "Email không hợp lệ" });
    const plan = AI_PLANS[req.body?.plan] ? req.body.plan : "monthly";
    const requestedDays = Number(req.body?.days);
    const days = Number.isFinite(requestedDays) && requestedDays > 0 ? Math.min(3650, Math.floor(requestedDays)) : AI_PLANS[plan].days;
    const note = String(req.body?.note ?? "").slice(0, 200) || null;
    const lang = pickMailLang(req.body?.lang);

    const entitlement = await aiStore.grantPro(email, {
      plan,
      days,
      productId: `meetflow.admin.${plan}`,
      lang,
    });
    await aiUsersStore.touch(email, { source: "admin", note: note ?? `admin grant ${days}d` });
    console.log(`admin ai grant email=${email} plan=${plan} days=${days} by=admin`);

    let notified = false;
    if (req.body?.notify === true) {
      try {
        await sendAiInvoiceEmail({
          to: email,
          orderCode: `ADMIN-${Date.now().toString().slice(-6)}`,
          planLabel: planNameFor(lang, "ai", plan),
          amount: 0,
          days,
          activatedAt: new Date().toISOString(),
          expiresAt: entitlement?.expires_at ?? null,
          guideUrl: `${siteBaseUrl()}/ai/guide`,
          lang,
          oneTime: AI_PLANS[plan]?.oneTime === true,
        });
        notified = true;
      } catch (err) {
        console.error("admin ai grant notify failed:", err?.message ?? err);
      }
    }
    res.json({ ok: true, email: email.toLowerCase(), plan, days, entitlement, notified });
  } catch (err) {
    console.error("admin ai grant failed:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

/** POST /v1/admin/ai/users/:email/revoke — end Pro now (keeps history). */
app.post("/v1/admin/ai/users/:email/revoke", requireAdminAuth, async (req, res) => {
  try {
    const email = String(req.params.email ?? "").trim();
    if (!email.includes("@")) return res.status(400).json({ error: "Email không hợp lệ" });
    const entitlement = await aiStore.revokePro(email, {
      reason: String(req.body?.reason ?? "admin revoke").slice(0, 120),
    });
    if (!entitlement) return res.status(404).json({ error: "User này chưa có Pro" });
    await aiUsersStore.touch(email, { source: "admin", note: "admin revoke" });
    console.log(`admin ai revoke email=${email}`);
    res.json({ ok: true, email: email.toLowerCase(), entitlement });
  } catch (err) {
    console.error("admin ai revoke failed:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

/** POST /v1/admin/ai/users/:email/forget — drop our registry row only. */
app.post("/v1/admin/ai/users/:email/forget", requireAdminAuth, async (req, res) => {
  try {
    const removed = await aiUsersStore.forget(req.params.email);
    res.json({ ok: true, removed });
  } catch (err) {
    console.error("admin ai forget failed:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

/** GET /v1/admin/ai/firebase — credential status + the Firebase user list. */
app.get("/v1/admin/ai/firebase", requireAdminAuth, async (req, res) => {
  try {
    const status = await firebaseCredentialStatus();
    const users = status.configured ? await listFirebaseUsers({ max: 2000 }) : { users: [], count: 0, error: null };
    res.json({
      configured: status.configured,
      source: status.source,
      projectId: status.projectId ?? users.projectId ?? null,
      count: users.count ?? 0,
      error: users.error ?? null,
      truncated: Boolean(users.truncated),
      users: users.users ?? [],
    });
  } catch (err) {
    console.error("admin firebase list failed:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

/** POST /v1/admin/ai/firebase/credentials — paste a service-account JSON. */
app.post("/v1/admin/ai/firebase/credentials", requireAdminAuth, async (req, res) => {
  try {
    const raw = typeof req.body?.json === "string" ? req.body.json : JSON.stringify(req.body?.json ?? {});
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return res.status(400).json({ error: "JSON không hợp lệ — dán đúng nội dung file service account" });
    }
    const saved = await saveFirebaseCredential(parsed);
    const check = await listFirebaseUsers({ max: 5, force: true });
    res.json({ ok: true, ...saved, reachable: !check.error, count: check.count ?? 0, error: check.error ?? null });
  } catch (err) {
    res.status(400).json({ error: String(err?.message ?? err).slice(0, 300) });
  }
});

/** DELETE /v1/admin/ai/firebase/credentials — remove the stored key. */
app.delete("/v1/admin/ai/firebase/credentials", requireAdminAuth, async (_req, res) => {
  try {
    await clearFirebaseCredential();
    const status = await firebaseCredentialStatus();
    res.json({ ok: true, configured: status.configured, source: status.source });
  } catch (err) {
    res.status(500).json({ error: "Internal error" });
  }
});

/** POST /v1/admin/ai/firebase/users/:uid/disable — lock / unlock an account. */
app.post("/v1/admin/ai/firebase/users/:uid/disable", requireAdminAuth, async (req, res) => {
  try {
    await setFirebaseUserDisabled(req.params.uid, req.body?.disabled !== false);
    res.json({ ok: true, uid: req.params.uid, disabled: req.body?.disabled !== false });
  } catch (err) {
    res.status(400).json({ error: String(err?.message ?? err).slice(0, 300) });
  }
});

/** DELETE /v1/admin/ai/firebase/users/:uid — delete the Firebase account. */
app.delete("/v1/admin/ai/firebase/users/:uid", requireAdminAuth, async (req, res) => {
  try {
    await deleteFirebaseUser(req.params.uid);
    res.json({ ok: true, uid: req.params.uid });
  } catch (err) {
    res.status(400).json({ error: String(err?.message ?? err).slice(0, 300) });
  }
});

/** POST /v1/admin/ai/firebase/users/:uid/password-reset — return a reset link. */
app.post("/v1/admin/ai/firebase/users/:uid/password-reset", requireAdminAuth, async (req, res) => {
  try {
    const email = String(req.body?.email ?? "").trim();
    if (!email.includes("@")) return res.status(400).json({ error: "Thiếu email để tạo link" });
    const result = await sendFirebasePasswordReset(email);
    res.json({ ok: true, email, link: result.link });
  } catch (err) {
    res.status(400).json({ error: String(err?.message ?? err).slice(0, 300) });
  }
});

// Apps read Pro status here after sign-in (email = Firebase account email).
app.get("/v1/ai/entitlement", async (req, res) => {
  try {
    const email = String(req.query?.email ?? "").trim();
    // Diagnostic: confirms whether the app actually reaches this endpoint.
    console.log(
      `ai-entitlement lookup email=${email || "(none)"} ip=${req.ip} ua=${String(req.get("user-agent") || "-").slice(0, 40)}`,
    );
    if (!email || !/\S+@\S+/.test(email)) {
      return res.status(400).json({ error: "Valid email required" });
    }
    // Registry touch: tells the dashboard this account exists (even without Pro).
    aiUsersStore
      .touch(email, {
        source: "app",
        platform: String(req.query?.platform ?? "").slice(0, 24) || null,
        appVersion: String(req.query?.version ?? "").slice(0, 24) || null,
      })
      .catch((err) => console.error("ai user touch failed:", err?.message ?? err));
    res.json(await aiStore.entitlementForEmail(email));
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

/** Grants MeetFlow Pro for a paid order and emails the invoice. */
async function activateAiProAndInvoice({ orderCode, email, plan, method = "bankqr", lang, confirmedBy = "sepay" }) {
  const planCfg = AI_PLANS[plan] ?? AI_PLANS.monthly;
  const ent = await aiStore.grantPro(email, {
    plan,
    days: planCfg.days,
    orderCode,
    productId: `meetflow.${method}.${plan}`,
    lang: pickMailLang(lang),
  });

  // Confirmation + invoice mail goes out automatically right after the payment
  // is confirmed. Retry once so a transient SMTP hiccup does not silently leave
  // the customer without a receipt; the outcome is returned to the admin.
  let mailSent = false;
  let mailError = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const invoiceResult = await sendAiInvoiceEmail({
        to: email,
        orderCode,
        planLabel: planNameFor(pickMailLang(lang), "ai", plan),
        amount: planCfg.amount,
        days: planCfg.days,
        activatedAt: new Date().toISOString(),
        expiresAt: ent?.expires_at ?? null,
        guideUrl: `${siteBaseUrl()}/ai/guide`,
        lang,
        oneTime: AI_PLANS[plan]?.oneTime === true,
      });
      if (invoiceResult?.sent === true) {
        mailSent = true;
        break;
      }
      mailError = "mailer returned sent=false";
    } catch (err) {
      mailError = err?.message ?? String(err);
      console.error(`ai-invoice: attempt ${attempt} failed for ${email} (order ${orderCode}):`, mailError);
    }
    if (attempt === 1) await new Promise((r) => setTimeout(r, 2000));
  }
  console.log(
    `ai-invoice: ${method}.${plan} granted to ${email} (order ${orderCode}) mailSent=${mailSent}${mailError ? ` err=${mailError}` : ""}`,
  );
  await firePaidAlert(orderCode, email, plan, planCfg.amount, method, "MeetFlow AI Pro", confirmedBy);
  return { entitlement: ent, mailSent, mailError };
}

/** Owner alert for a new MeetFlow Pro order (confirm link is product-scoped). */
async function fireAiPaymentAlert(orderCode, email, plan, amount, method = null) {
  const owner = process.env.OWNER_ALERT_EMAIL || "minhnb2@me.com";
  const base = process.env.PUBLIC_BASE_URL || "https://api.meetflowai.site";
  const sig = paymentConfirmSignature("ai:" + orderCode);
  const confirmUrl = `${base}/v1/ai/payments/confirm/${orderCode}?t=${sig}`;
  const cny = await cnyAmountForMethod(amount, method).catch(() => null);
  const methodInfo = paymentMethodInfo(method, { amountVnd: amount, cny });
  try {
    const r = await sendPaymentAlert({
      to: owner,
      orderCode,
      buyerEmail: email,
      plan,
      amount,
      confirmUrl,
      product: "MeetFlow AI Pro",
      cny,
      method,
      methodInfo,
    });
    console.log(`ai-payment-alert order ${orderCode} to ${owner}: sent=${r?.sent}`);
  } catch (err) {
    console.error("fireAiPaymentAlert failed:", err);
  }
}

/**
 * Cấp mã đơn + ghi đơn chờ thanh toán, CHẮC CHẮN không trùng và không bị ghi đè.
 *
 * Mã đơn = epoch giây, nên hai khách bấm "Thanh toán" trong cùng một giây sẽ ra cùng mã; mà
 * SePay có thể trả mã đơn ở trường `code` (không kèm tiền tố sản phẩm) nên mã trùng giữa VPN và
 * MeetFlow AI sẽ khiến tiền của sản phẩm này kích hoạt đơn của sản phẩm kia. Ngoài ra file JSON
 * là đọc-sửa-ghi, hai request chạy xen kẽ có thể cùng đọc một trạng thái rồi ghi đè nhau (mất
 * đơn). Vì vậy: một hàng đợi chung cho cả hai kho, kiểm tra trùng rồi mới ghi.
 */
let orderCodeChain = Promise.resolve();
function withOrderCodeLock(fn) {
  const run = orderCodeChain.then(fn, fn);
  orderCodeChain = run.then(() => {}, () => {});
  return run;
}

async function createPendingOrder({ product, email, plan, method, lang, amount }) {
  return withOrderCodeLock(async () => {
    let orderCode = Math.floor(Date.now() / 1000);
    // Giữ 10 chữ số để khớp normalizeOrderCode của webhook SePay.
    while (orderCode < 9_999_999_999) {
      const [vpn, ai] = await Promise.all([
        authStore.pendingPaymentByCode(orderCode),
        aiStore.pendingPayment(orderCode),
      ]);
      if (!vpn && !ai) break;
      orderCode += 1;
    }
    const entry = { email, plan, method, lang, amount };
    if (product === "ai") await aiStore.recordPendingPayment(orderCode, entry);
    else await authStore.recordPendingPayment(orderCode, entry);
    return orderCode;
  });
}

/**
 * Ảnh QR cho một đơn + số ¥ thật in trong ảnh (nếu chủ shop đã khai ở qr-amounts.json).
 * Trang buy cần con số này để hiện ĐÚNG số tiền khách nhìn thấy trong ví.
 */
function qrForOrder({ method, product, plan, cny }) {
  const dir = process.env.PAY_QR_DIR || "/root/flowvpn-pay";
  const resolved = resolveQrFile(dir, method, { cny, plan, product });
  const amounts = qrAmountsFor(dir);
  const declared = Number(amounts[resolved.variant]);
  return { resolved, qrCny: Number.isFinite(declared) && declared > 0 ? declared : null };
}

app.post("/v1/payments/create", async (req, res) => {
  try {
    const { email, plan, method, lang } = req.body ?? {};
    if (!email || !/\S+@\S+/.test(email)) return res.status(400).json({ code: "invalid_email", error: "Email không hợp lệ." });
    const planCfg = PLANS_PUBLIC[plan];
    // Retired plans (e.g. lifetime) must not be orderable any more.
    if (!planCfg || planCfg.retired) return res.status(400).json({ code: "invalid_plan", error: "Gói không hợp lệ." });

    // Freeze the price with the order: a later price change must not re-price an
    // order the customer already saw (and may already have transferred).
    const orderCode = await createPendingOrder({
      product: "vpn",
      email,
      plan,
      method,
      lang: pickMailLang(lang),
      amount: planCfg.amount,
    });

    // Từ khi SePay tự xác nhận tiền về, email lúc TẠO đơn mặc định không gửi nữa (chủ shop chỉ cần
    // biết đơn đã thanh toán) — xem shouldAlertOnCreate().
    if (shouldAlertOnCreate(method)) {
      firePaymentAlert(orderCode, email, plan, planCfg.amount, method);
    }

    if (method === "bankqr") {
      const bank = bankQrConfig();
      if (!bank) return res.status(502).json({ code: "bank_not_configured", error: "Bank QR chưa được cấu hình (BANK_QR_ACCOUNT)." });
      const qrDataUrl = await createBankQrDataUrl({
        prefix: "VPNFLOW",
        product: "vpn",
        plan,
        accountNumber: bank.accountNumber,
        accountName: bank.accountName,
        amount: planCfg.amount,
        orderCode,
      });
      // Ảnh QR của SePay/vietqr.app (số tiền + nội dung điền sẵn) — trang buy ưu tiên ảnh này,
      // tự rơi về `qrDataUrl` sinh tại chỗ nếu ảnh không tải được (mạng TQ hay chặn dịch vụ ngoài).
      const qrImageUrl = bankQrImageUrl({
        amount: planCfg.amount,
        // Kèm tiền tố sản phẩm như QR tự sinh (vietqr.app bỏ dấu gạch):
        // "VPNFLOW-1789318130-THANG" → nội dung CK "VPNFLOW1789318130THANG".
        note: `VPNFLOW-${transferNote({ orderCode, plan, product: "vpn" })}`,
        account: bank.accountNumber,
        holder: bank.accountName,
      });
      return res.json({ qrDataUrl, qrImageUrl, orderCode, amount: planCfg.amount, method: "bankqr", selfContained: true });
    }

    if (method === "momo") {
      // MoMo speaks VietQR, so mint a per-order QR with the amount pre-filled.
      const cfg = momoQrConfig();
      if (cfg) {
        const qrDataUrl = await createBankQrDataUrl({
          prefix: "VPNFLOW",
          product: "vpn",
          plan,
          accountNumber: cfg.accountNumber,
          accountName: cfg.accountName,
          bin: cfg.bin,
          amount: planCfg.amount,
          orderCode,
        });
        return res.json({ qrDataUrl, orderCode, amount: planCfg.amount, method: "momo", selfContained: true });
      }
      // Fallback: static collection image (customer types the amount).
      return res.json({ qrImageUrl: "/v1/payments/qr/momo", orderCode, amount: planCfg.amount, method: "momo" });
    }

    if (method === "wechat" || method === "alipay") {
      // Personal collection QR. When the owner generated it with "设置金额"
      // (fixed amount) we serve that image, so the amount is pre-filled in
      // WeChat/Alipay and the customer only confirms. Otherwise the customer
      // types the amount shown on screen.
      const cnyInfo = await cnyAmountForMethod(planCfg.amount, method);
      const qrQuery = `plan=${encodeURIComponent(plan)}${cnyInfo ? `&cny=${cnyInfo.amount}` : ""}`;
      const { resolved, qrCny } = qrForOrder({ method, product: "vpn", plan, cny: cnyInfo?.amount });
      return res.json({
        qrImageUrl: `/v1/payments/qr/${method}?${qrQuery}`,
        orderCode,
        amount: planCfg.amount,
        cny: cnyInfo?.amount ?? null,
        amountPrefilled: !resolved.missing && resolved.prefilled,
        qrVariant: resolved.missing ? null : resolved.variant,
        qrCny,
        method,
      });
    }

    const result = await createPayosPaymentLink({
      orderCode,
      amount: planCfg.amount,
      description: `VPNFlow ${plan} ${email}`.slice(0, 25),
      cancelUrl: `${publicBaseUrl()}/buy/cancel`,
      returnUrl: `${publicBaseUrl()}/buy/success`,
      buyerEmail: email,
    });
    if (result.error) return res.status(502).json({ code: "payos_not_configured", error: result.error });
    res.json({ checkoutUrl: result.checkoutUrl, qrCode: result.qrCode });
  } catch (err) {
    console.error("POST /v1/payments/create failed:", err);
    res.status(500).json({ code: "internal", error: "Internal error" });
  }
});

// Serve the static personal WeChat/Alipay collection QR images.

app.get("/v1/payments/qr/:name", async (req, res) => {
  try {
    const name = ["wechat", "alipay", "momo"].includes(req.params.name) ? req.params.name : null;
    if (!name) return res.status(404).send("Not found");
    const resolved = resolveQrFile(process.env.PAY_QR_DIR || "/root/flowvpn-pay", name, {
      cny: req.query?.cny,
      plan: req.query?.plan,
      product: "vpn",
    });
    if (resolved.missing) return res.status(404).json({ error: "QR image not uploaded yet" });
    res.set("X-QR-Variant", resolved.variant);
    res.set("X-QR-Amount-Prefilled", resolved.prefilled ? "1" : "0");
    res.sendFile(resolved.file);
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

// Serve the Android APK for direct download (sideload distribution).
// Máy Android 7.0/7.1 và Fire OS KHÔNG cài được APK thường (minSdk 26) — chúng báo
// "There was a problem parsing the package". Trình duyệt/DownloadManager của máy đó gửi kèm
// phiên bản Android hoặc mã model AFT*/Silk, nên chọn bản legacy ngay tại đây để cả những
// máy chưa có code mới (bản ≤ 1.2.4 chỉ mở `store_url`) vẫn tải được bản cài được.
app.get("/v1/downloads/android", async (req, res) => {
  try {
    const apkDir = process.env.APK_DIR || "/root/flowvpn-apk";
    const legacy = wantsLegacyApk(req.get("user-agent"));
    const apkPath = path.join(apkDir, legacy ? "VPNFlow-android7.apk" : "VPNFlow-latest.apk");
    if (!fs.existsSync(apkPath)) {
      return res.status(404).send("APK not found. Contact support@meetflowai.site");
    }
    res.download(apkPath, legacy ? "VPNFlow-android7.apk" : "VPNFlow.apk");
  } catch (err) {
    res.status(500).json({ error: "Internal error" });
  }
});

/**
 * Legacy Android build for devices the regular APK cannot serve: that APK declares
 * minSdk 26 (Android 8), so Fire OS 5/6 (Fire TV Stick 4K, older Android 7 phones
 * and TVs) fail with "There was a problem parsing the package". The legacy variant
 * is built with minSdk 24 from the same source and the same signing key, so it
 * installs over — and can be upgraded to — the regular one. It lives at its own URL
 * on purpose: the working download path is never touched by compatibility work.
 */
/**
 * Bản iOS (IPA) phát trực tiếp từ server của mình — chủ dự án đã bỏ kênh App Store
 * (14/09/2026) nên đây là đường tải chính thức cho iPhone/iPad, giống APK của Android.
 *
 * LƯU Ý CÀI ĐẶT: IPA phải được ký bằng profile có UDID thiết bị (ad-hoc / enterprise /
 * development có đăng ký máy). Tải file trên Safari rồi bấm là KHÔNG cài được —
 * iOS cần OTA (`itms-services://`) kèm manifest, mà OTA chỉ chạy với ad-hoc/enterprise.
 * Vì vậy link này là để TẢI FILE (máy tính, hoặc đưa lên Diawi/tool OTA); nếu muốn
 * cài thẳng từ trang buy thì phải thêm manifest OTA và ký ad-hoc/enterprise.
 */
/**
 * Trang cài iOS tự phát: iOS KHÔNG cài được từ link .ipa trực tiếp (Safari chỉ tải file về),
 * muốn "bấm là cài" phải đi qua `itms-services://` + một manifest.plist — đó là việc Diawi làm.
 * Vì link Diawi có hạn (gói của chủ shop: 15 ngày / 50 lượt tải), ta tự phát luôn để màn ép cập
 * nhật trong app không bao giờ trỏ vào link đã chết.
 *
 * Apple yêu cầu manifest phải nằm trên HTTPS có chứng chỉ hợp lệ (domain mình đã có Let's Encrypt).
 */
/**
 * Ảnh QR cho link tải (khách mở trang buy trên máy tính → quét mã là điện thoại mở đúng link cài).
 * Sinh tại chỗ, không phụ thuộc ảnh QR của dịch vụ ngoài ⇒ link ngoài hết hạn cũng không ảnh hưởng.
 * `target`: ios | mac | android | android-legacy | ai-android (mặc định ios).
 */
app.get("/v1/downloads/qr", async (req, res) => {
  try {
    const target = String(req.query?.target ?? "ios").trim();
    const links = storeLinks("vpn");
    const aiLinks = storeLinks("ai");
    const url = {
      ios: appConfig.get("ios_ipa_url") || links.ios,
      // Bản Mac phát trực tiếp ⇒ QR trỏ về chính trang hướng dẫn cài macOS.
      mac: `${siteBaseUrl()}/install/mac`,
      android: links.android,
      "android-legacy": links.androidLegacy,
      "ai-android": aiLinks.android,
    }[target];
    if (!url) return res.status(404).json({ error: "unknown target" });
    const png = await downloadQrPng(url, { size: Number(req.query?.size) > 0 ? Math.min(Number(req.query.size), 1024) : 320 });
    res.type("png").set("Cache-Control", "public, max-age=3600");
    res.send(png);
  } catch (err) {
    console.error("download qr failed:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

/**
 * Đăng ký thiết bị iOS — "identify device" kiểu Diawi nhưng trên hệ thống mình.
 *
 * Bản IPA phát cho khách là ad-hoc ⇒ iOS chỉ cài được lên máy có UDID trong provisioning profile.
 * Khách bấm "Đăng ký thiết bị" ở trang /install/ios → tải profile nhỏ dưới đây → iOS tự POST UDID về
 * `/install/ios/udid` → server xếp hàng + báo chủ shop → máy Mac thêm UDID, ký lại IPA, upload Diawi.
 * Trang chờ poll `/install/ios/status` và tự hiện nút "Cài đặt" khi xong.
 *
 * Đường dẫn nằm dưới `/install/ios/*` là cố ý: Caddy của host meetflowai.site chỉ route các path có
 * `handle` — dùng lại prefix đã có thì không phải sửa Caddy (bài học từ /guide, /v1/downloads/qr).
 */
/** Trang cài iOS dùng chung hàm chọn ngôn ngữ với các trang khác. */
const iosLang = requestLang;

/**
 * Chuỗi hiển thị của trang cài + màn hình chờ (5 ngôn ngữ như trang buy: vi/en/zh/ja/ko).
 * Ngôn ngữ đi theo đường dẫn: profile đăng ký được phát kèm `?lang=` nên màn hình chờ cũng đúng thứ tiếng.
 */
const IOS_TEXTS = {
  vi: {
    pageTitle: "Cài VPNFlow lên iPhone / iPad",
    intro: (v) => `Bản ${v} · mở trang này bằng <b>Safari</b> và làm theo 2 bước.`,
    step1: "Đăng ký thiết bị (chỉ 1 lần)",
    step1Items: ["Bấm nút xanh bên dưới → iOS báo <b>“Hồ sơ đã tải về”</b>.", "<b>Quan trọng:</b> iOS KHÔNG tự cài. Bạn phải mở <b>Cài đặt</b> và cài hồ sơ (xem hướng dẫn hiện ra ở dưới).", "Cài xong quay lại đây — trang tự chuyển sang bước 2."],
    regBtn: "📝 Đăng ký thiết bị này",
    step2: "Cài ứng dụng",
    waitLocked: "Hoàn thành bước 1 để mở bước này…",
    waitReady: "Máy đã đăng ký — đang chuẩn bị bản cài (thường dưới 2 phút)…",
    readyMsg: "✅ Bản cài cho máy này đã sẵn sàng",
    installBtn: "📲 Cài đặt VPNFlow",
    warnTitle: "Không cài được?",
    warnItems: [
      "Phải mở bằng <b>Safari</b> (Chrome, Cốc Cốc, trình duyệt trong app chat đều không cài được).",
      "Bước 2 chỉ mở sau khi máy đã đăng ký và shop chuẩn bị xong bản cài (thường 1–2 phút).",
      "Cần iOS <b>17.0</b> trở lên.",
      "Cài xong nếu báo \"Untrusted Developer\": <b>Cài đặt → Cài đặt chung → VPN &amp; Quản lý thiết bị</b> → <b>Tin cậy</b>.",
    ],
    support: "Hỗ trợ",
    fallback: "kênh dự phòng",
    diawiTitle: "Vẫn không cài được?",
    diawiBtn: "📥 Cài qua Diawi (kênh dự phòng)",
    diawiNote: "Chỉ dùng khi nút cài phía trên báo lỗi. Bản này đã ký sẵn cho máy bạn — bấm là cài, và vẫn phải mở bằng Safari.",
    qrTitle: "📱 Đang xem trên máy tính? Quét mã này bằng điện thoại",
    waitPageTitle: "Đang chuẩn bị bản cài…",
    waitHeading: "Đã nhận đăng ký thiết bị",
    waitNew: "Hệ thống đang chuẩn bị bản cài riêng cho máy này — thường dưới 2 phút. Giữ nguyên màn hình này, trang tự cập nhật.",
    waitKnown: "Máy này đã đăng ký trước đó. Đang kiểm tra bản cài…",
    waitReadyHeading: "Bản cài đã sẵn sàng",
    waitReadyMsg: "Máy này đã được cấp bản cài riêng. Bấm nút dưới để cài (nhớ mở bằng Safari).",
    device: "Thiết bị",
    elapsed: (n) => `Đã chờ ${n} giây…`,
    guideTitle: "Cách cài hồ sơ trong Cài đặt",
    guideIntro: "iOS không tự cài hồ sơ. Làm đúng 4 bước sau:",
    guideSteps: ["Mở app <b>Cài đặt</b> (biểu tượng bánh răng).", "Ở ngay trên cùng sẽ có dòng <b>“Đã tải hồ sơ”</b> → bấm vào.<br><span style=\"opacity:.75\">Không thấy? Vào <b>Cài đặt chung → VPN &amp; Quản lý thiết bị</b>.</span>", "Bấm dòng <b>VPNFlow — Đăng ký thiết bị</b> → bấm <b>Cài đặt</b> (góc phải trên).", "Nhập <b>mật khẩu máy</b>. Nếu iOS hiện <b>“Không ký”</b> thì bấm <b>Cài đặt</b> thêm một lần nữa."],
    guideNote: "Hồ sơ chỉ gửi <b>mã thiết bị (UDID)</b>, model và phiên bản iOS — gỡ được bất cứ lúc nào.",
    guideClose: "Đã hiểu, tôi mở Cài đặt",
    guideBtn: "❓ Xem lại cách cài hồ sơ",
    guideAfter: "Cài xong, quay lại Safari — trang này tự chuyển sang bước 2.",
    step2After: "Bước 2 · sau khi cài hồ sơ xong",
    downloadBtn: "📲 Tải &amp; cài VPNFlow",
    guideInvalid: "<b>Nếu iOS báo “Hồ sơ không hợp lệ / Invalid Profile”: máy bạn ĐÃ đăng ký xong</b> — bấm OK rồi quay lại trang này.",
    regDone: "✅ Đã đăng ký thiết bị này",
    installLocked: "Hoàn thành bước 1 để mở nút này",
    autoOpen: "✅ Bản cài cho máy bạn đã sẵn sàng — đang mở… Nếu iOS không hiện hộp thoại, bấm nút bên dưới.",
    unlock: "Tôi đã cài hồ sơ rồi — mở nút tải & cài",
    unlockWarn: "Nếu iOS báo “Unable to Install” thì bản cài chưa ký cho máy này — nhắn shop để được ký.",
    dmTitle: "⚠️ iOS yêu cầu bật Chế độ nhà phát triển (chỉ 1 lần)",
    dmBody: "iOS 16 trở lên BẮT BUỘC bật <b>Chế độ nhà phát triển</b> cho app cài ngoài App Store. Cách làm: <b>Cài đặt → Quyền riêng tư &amp; Bảo mật → Chế độ nhà phát triển → Bật</b> → máy hỏi khởi động lại → bấm <b>Khởi động lại</b>. Nếu chưa thấy mục đó: mở app VPNFlow một lần rồi vào lại Cài đặt.",
    profileName: "VPNFlow — Đăng ký thiết bị",
    profileDesc: "Gửi mã thiết bị (UDID) cho VPNFlow để cấp bản cài phù hợp. Không thu thập dữ liệu khác.",
  },
  en: {
    pageTitle: "Install VPNFlow on your iPhone / iPad",
    intro: (v) => `Version ${v} · open this page in <b>Safari</b> and follow 2 steps.`,
    step1: "Register this device (once)",
    step1Items: ["Tap the green button below → iOS shows <b>“Profile Downloaded”</b>.", "<b>Important:</b> iOS does NOT install it automatically. Open <b>Settings</b> and install the profile (guide below).", "Then come back here — this page moves to step 2 by itself."],
    regBtn: "📝 Register this device",
    step2: "Install the app",
    waitLocked: "Finish step 1 to unlock this step…",
    waitReady: "Device registered — preparing your build (usually under 2 minutes)…",
    readyMsg: "✅ Your build is ready",
    installBtn: "📲 Install VPNFlow",
    warnTitle: "Can't install?",
    warnItems: [
      "Must be opened in <b>Safari</b> (Chrome or in-app browsers cannot install).",
      "Step 2 unlocks only after your device is registered and the shop has prepared the build (usually 1–2 minutes).",
      "Requires iOS <b>17.0</b> or newer.",
      "If iOS says \"Untrusted Developer\" after install: <b>Settings → General → VPN &amp; Device Management</b> → <b>Trust</b>.",
    ],
    support: "Support",
    fallback: "backup link",
    diawiTitle: "Still can't install?",
    diawiBtn: "📥 Install via Diawi (backup link)",
    diawiNote: "Use this only if the button above fails. This build is already signed for your device — tap to install, and use Safari.",
    qrTitle: "📱 On a computer? Scan this code with your phone",
    waitPageTitle: "Preparing your build…",
    waitHeading: "Device registration received",
    waitNew: "We are preparing a build for this device — usually under 2 minutes. Keep this screen open, it refreshes itself.",
    waitKnown: "This device was registered before. Checking the build…",
    waitReadyHeading: "Your build is ready",
    waitReadyMsg: "This device now has its own build. Tap the button below to install (use Safari).",
    device: "Device",
    elapsed: (n) => `Waiting ${n}s…`,
    guideTitle: "How to install the profile in Settings",
    guideIntro: "iOS does not install the profile by itself. Follow these 4 steps:",
    guideSteps: ["Open the <b>Settings</b> app (gear icon).", "At the very top you will see <b>“Profile Downloaded”</b> → tap it.<br><span style=\"opacity:.75\">Don’t see it? Go to <b>General → VPN &amp; Device Management</b>.</span>", "Tap <b>VPNFlow — Device registration</b> → tap <b>Install</b> (top right).", "Enter your <b>passcode</b>. If iOS says <b>“Not Signed”</b>, tap <b>Install</b> once more."],
    guideNote: "The profile only reports the <b>device ID (UDID)</b>, model and iOS version — you can remove it anytime.",
    guideClose: "Got it, open Settings",
    guideBtn: "❓ Show the install guide again",
    guideAfter: "When the profile is installed, come back to Safari — this page moves to step 2 by itself.",
    step2After: "Step 2 · after the profile is installed",
    downloadBtn: "📲 Download &amp; install VPNFlow",
    guideInvalid: "<b>If iOS says “Invalid Profile”: your device was ALREADY registered</b> — tap OK and come back to this page.",
    regDone: "✅ This device is registered",
    installLocked: "Finish step 1 to unlock this button",
    autoOpen: "✅ Your build is ready — opening… If iOS shows nothing, tap the button below.",
    unlock: "I already installed the profile — unlock the download",
    unlockWarn: "If iOS says “Unable to Install”, this build is not signed for your device yet — message the shop.",
    dmTitle: "⚠️ iOS requires Developer Mode (one time only)",
    dmBody: "iOS 16+ REQUIRES <b>Developer Mode</b> for apps installed outside the App Store. How: <b>Settings → Privacy &amp; Security → Developer Mode → On</b> → the phone asks to restart → tap <b>Restart</b>. Don’t see the menu? Open the VPNFlow app once, then check Settings again.",
    profileName: "VPNFlow — Device registration",
    profileDesc: "Reports the device ID (UDID) to VPNFlow so we can issue a matching build. No other data is collected.",
  },
  zh: {
    pageTitle: "在 iPhone / iPad 上安装 VPNFlow",
    intro: (v) => `版本 ${v} · 请用 <b>Safari</b> 打开本页并完成两步。`,
    step1: "注册设备（仅需一次）",
    step1Items: ["点击下面的绿色按钮 → iOS 提示<b>“已下载描述文件”</b>。", "<b>重要：</b>iOS 不会自动安装。请打开<b>设置</b>安装该描述文件（见下方指引）。", "安装完成后返回本页 —— 自动进入第 2 步。"],
    regBtn: "📝 注册此设备",
    step2: "安装应用",
    waitLocked: "完成第 1 步后即可解锁…",
    waitReady: "设备已注册 —— 正在准备安装包（通常 2 分钟内）…",
    readyMsg: "✅ 该设备的安装包已就绪",
    installBtn: "📲 安装 VPNFlow",
    warnTitle: "无法安装？",
    warnItems: [
      "必须在 <b>Safari</b> 中打开（Chrome、应用内浏览器无法安装）。",
      "第 2 步需等设备注册且商家准备好安装包后才会解锁（通常 1–2 分钟）。",
      "需要 iOS <b>17.0</b> 以上。",
      "安装后提示“不受信任的开发者”：<b>设置 → 通用 → VPN 与设备管理</b> → <b>信任</b>。",
    ],
    support: "客服",
    fallback: "备用链接",
    diawiTitle: "还是无法安装？",
    diawiBtn: "📥 通过 Diawi 安装（备用）",
    diawiNote: "仅在页面上方按钮失败时使用。此安装包已为你的设备签名 —— 点击即可安装，请用 Safari 打开。",
    qrTitle: "📱 在电脑上？用手机扫描此二维码",
    waitPageTitle: "正在准备安装包…",
    waitHeading: "已收到设备注册",
    waitNew: "正在为该设备准备安装包 —— 通常 2 分钟内完成。请保持本页打开，会自动刷新。",
    waitKnown: "该设备此前已注册，正在检查安装包…",
    waitReadyHeading: "安装包已就绪",
    waitReadyMsg: "该设备已获得专属安装包，点击下方按钮安装（请用 Safari）。",
    device: "设备",
    elapsed: (n) => `已等待 ${n} 秒…`,
    guideTitle: "如何在“设置”中安装描述文件",
    guideIntro: "iOS 不会自动安装描述文件。请按以下 4 步操作：",
    guideSteps: ["打开<b>设置</b>（齿轮图标）。", "页面最上方会出现<b>“已下载描述文件”</b> → 点击它。<br><span style=\"opacity:.75\">没看到？请进入<b>通用 → VPN 与设备管理</b>。</span>", "点击<b>VPNFlow — 设备注册</b> → 点击右上角<b>安装</b>。", "输入<b>锁屏密码</b>。若提示<b>“未签名”</b>，请再点一次<b>安装</b>。"],
    guideNote: "该描述文件只上报<b>设备码 (UDID)</b>、机型和 iOS 版本 —— 可随时删除。",
    guideClose: "知道了，打开设置",
    guideBtn: "❓ 再看一次安装指引",
    guideAfter: "安装完成后返回 Safari —— 本页会自动进入第 2 步。",
    step2After: "第 2 步 · 描述文件安装完成后",
    downloadBtn: "📲 下载并安装 VPNFlow",
    guideInvalid: "<b>若 iOS 提示“描述文件无效”：说明设备已注册成功</b> —— 点击“好”，然后返回本页。",
    regDone: "✅ 此设备已注册",
    installLocked: "完成第 1 步即可解锁此按钮",
    autoOpen: "✅ 该设备的安装包已就绪 —— 正在打开… 若 iOS 没有弹出提示，请点下方按钮。",
    unlock: "我已安装描述文件 —— 解锁下载按钮",
    unlockWarn: "若 iOS 提示“无法安装”，说明该安装包尚未为您的设备签名 —— 请联系商家。",
    dmTitle: "⚠️ iOS 需要开启开发者模式（仅需一次）",
    dmBody: "iOS 16 及以上安装非 App Store 应用<b>必须开启开发者模式</b>。操作：<b>设置 → 隐私与安全性 → 开发者模式 → 打开</b> → 系统提示重启 → 点<b>重新启动</b>。若找不到该菜单：先打开一次 VPNFlow 应用，再回到设置查看。",
    profileName: "VPNFlow — 设备注册",
    profileDesc: "将设备码 (UDID) 上报给 VPNFlow，以便发放对应的安装包。不采集其他数据。",
  },
  ja: {
    pageTitle: "iPhone / iPad に VPNFlow をインストール",
    intro: (v) => `バージョン ${v} · <b>Safari</b> で開いて 2 ステップで完了します。`,
    step1: "端末を登録（1 回だけ）",
    step1Items: ["下の緑のボタンをタップ → iOS が<b>「プロファイルをダウンロードしました」</b>と表示。", "<b>重要：</b>iOS は自動ではインストールしません。<b>設定</b>を開いてインストールしてください（下の手順）。", "完了したらこのページに戻ってください —— 自動でステップ 2 に進みます。"],
    regBtn: "📝 この端末を登録",
    step2: "アプリをインストール",
    waitLocked: "ステップ 1 を完了すると解除されます…",
    waitReady: "登録済み —— ビルドを準備中（通常 2 分以内）…",
    readyMsg: "✅ この端末用ビルドの準備ができました",
    installBtn: "📲 VPNFlow をインストール",
    warnTitle: "インストールできない場合",
    warnItems: [
      "<b>Safari</b> で開く必要があります（Chrome やアプリ内ブラウザは不可）。",
      "ステップ 2 は端末登録とビルド準備が完了してから解除されます（通常 1〜2 分）。",
      "iOS <b>17.0</b> 以上が必要です。",
      "「信頼されていないデベロッパ」と出たら: <b>設定 → 一般 → VPN とデバイス管理</b> → <b>信頼</b>。",
    ],
    support: "サポート",
    fallback: "予備リンク",
    diawiTitle: "それでもインストールできない場合",
    diawiBtn: "📥 Diawi からインストール（予備）",
    diawiNote: "上のボタンで失敗した場合のみお使いください。このビルドはお使いの端末用に署名済みです。Safari で開いてください。",
    qrTitle: "📱 パソコンで見ていますか？スマホでこのコードを読み取ってください",
    waitPageTitle: "ビルドを準備中…",
    waitHeading: "端末登録を受け付けました",
    waitNew: "この端末用のビルドを準備しています（通常 2 分以内）。この画面を開いたままお待ちください。",
    waitKnown: "この端末は登録済みです。ビルドを確認しています…",
    waitReadyHeading: "ビルドの準備ができました",
    waitReadyMsg: "この端末用のビルドが用意できました。下のボタンでインストール（Safari で開いてください）。",
    device: "端末",
    elapsed: (n) => `待機中 ${n} 秒…`,
    guideTitle: "「設定」でのプロファイルのインストール手順",
    guideIntro: "iOS は自動でインストールしません。次の 4 ステップを行ってください：",
    guideSteps: ["<b>設定</b>アプリを開きます（歯車アイコン）。", "一番上に<b>「ダウンロード済みプロファイル」</b>が表示されます → タップ。<br><span style=\"opacity:.75\">見つからない場合は<b>一般 → VPN とデバイス管理</b>へ。</span>", "<b>VPNFlow — 端末登録</b>をタップ → 右上の<b>インストール</b>をタップ。", "<b>パスコード</b>を入力。<b>「署名なし」</b>と表示されたら、もう一度<b>インストール</b>をタップ。"],
    guideNote: "このプロファイルが送信するのは<b>端末 ID (UDID)</b>・機種・iOS バージョンのみ。いつでも削除できます。",
    guideClose: "了解、設定を開きます",
    guideBtn: "❓ インストール手順をもう一度見る",
    guideAfter: "インストール後、Safari に戻ってください —— 自動でステップ 2 に進みます。",
    step2After: "ステップ 2 · プロファイルのインストール後",
    downloadBtn: "📲 VPNFlow をダウンロードしてインストール",
    guideInvalid: "<b>iOS が「プロファイルが無効です」と表示しても端末は登録済みです</b> —— OK を押してこのページに戻ってください。",
    regDone: "✅ この端末は登録済みです",
    installLocked: "ステップ 1 を完了するとこのボタンが使えます",
    autoOpen: "✅ 端末用ビルドの準備ができました —— 開いています… 何も表示されない場合は下のボタンを押してください。",
    unlock: "プロファイルをインストール済み —— ダウンロードを有効にする",
    unlockWarn: "iOS が「インストールできません」と表示する場合、この端末用に署名されていません —— ショップにご連絡ください。",
    dmTitle: "⚠️ iOS はデベロッパモードが必要です（1 回だけ）",
    dmBody: "iOS 16 以降、App Store 以外からインストールしたアプリは<b>デベロッパモード</b>が必要です。手順：<b>設定 → プライバシーとセキュリティ → デベロッパモード → オン</b> → 再起動を求められるので<b>再起動</b>。メニューが出ない場合は、VPNFlow アプリを一度起動してから設定を開き直してください。",
    profileName: "VPNFlow — 端末登録",
    profileDesc: "端末 ID (UDID) を VPNFlow に送信し、対応するビルドを発行するためのプロファイルです。他のデータは収集しません。",
  },
  ko: {
    pageTitle: "iPhone / iPad에 VPNFlow 설치",
    intro: (v) => `버전 ${v} · <b>Safari</b>로 열고 2단계만 진행하세요.`,
    step1: "기기 등록 (1회만)",
    step1Items: ["아래 초록색 버튼을 누르세요 → iOS가 <b>“프로파일 다운로드됨”</b>을 표시합니다.", "<b>중요:</b> iOS는 자동으로 설치하지 않습니다. <b>설정</b>을 열어 프로파일을 설치하세요(아래 안내).", "완료 후 이 페이지로 돌아오세요 — 자동으로 2단계로 넘어갑니다."],
    regBtn: "📝 이 기기 등록",
    step2: "앱 설치",
    waitLocked: "1단계를 완료하면 잠금이 풀립니다…",
    waitReady: "등록됨 — 빌드를 준비 중입니다 (보통 2분 이내)…",
    readyMsg: "✅ 이 기기용 빌드가 준비되었습니다",
    installBtn: "📲 VPNFlow 설치",
    warnTitle: "설치가 안 되나요?",
    warnItems: [
      "반드시 <b>Safari</b>로 열어야 합니다 (Chrome, 앱 내 브라우저 불가).",
      "2단계는 기기 등록과 빌드 준비가 끝난 뒤 열립니다 (보통 1~2분).",
      "iOS <b>17.0</b> 이상 필요.",
      "설치 후 “신뢰할 수 없는 개발자”가 뜨면: <b>설정 → 일반 → VPN 및 기기 관리</b> → <b>신뢰</b>.",
    ],
    support: "지원",
    fallback: "예비 링크",
    diawiTitle: "그래도 설치가 안 되나요?",
    diawiBtn: "📥 Diawi로 설치 (예비)",
    diawiNote: "위 버튼이 실패할 때만 사용하세요. 이 빌드는 이미 기기용으로 서명되어 있습니다. Safari에서 열어 주세요.",
    qrTitle: "📱 컴퓨터로 보고 있나요? 휴대폰으로 이 코드를 스캔하세요",
    waitPageTitle: "빌드 준비 중…",
    waitHeading: "기기 등록이 접수되었습니다",
    waitNew: "이 기기용 빌드를 준비하고 있습니다 (보통 2분 이내). 이 화면을 열어 두세요.",
    waitKnown: "이미 등록된 기기입니다. 빌드를 확인하는 중…",
    waitReadyHeading: "빌드가 준비되었습니다",
    waitReadyMsg: "이 기기 전용 빌드가 준비되었습니다. 아래 버튼으로 설치하세요 (Safari).",
    device: "기기",
    elapsed: (n) => `${n}초 대기 중…`,
    guideTitle: "설정에서 프로파일 설치하는 방법",
    guideIntro: "iOS는 프로파일을 자동으로 설치하지 않습니다. 다음 4단계를 따라 하세요:",
    guideSteps: ["<b>설정</b> 앱을 엽니다(톱니바퀴 아이콘).", "맨 위에 <b>“프로파일 다운로드됨”</b>이 표시됩니다 → 누르세요.<br><span style=\"opacity:.75\">안 보이면 <b>일반 → VPN 및 기기 관리</b>로 이동하세요.</span>", "<b>VPNFlow — 기기 등록</b>을 누르고 → 오른쪽 위 <b>설치</b>를 누르세요.", "<b>암호</b>를 입력하세요. <b>“서명되지 않음”</b>이 뜨면 <b>설치</b>를 한 번 더 누르세요."],
    guideNote: "이 프로파일은 <b>기기 ID (UDID)</b>, 모델, iOS 버전만 전송하며 언제든 삭제할 수 있습니다.",
    guideClose: "확인, 설정 열기",
    guideBtn: "❓ 설치 안내 다시 보기",
    guideAfter: "설치 후 Safari로 돌아오세요 — 자동으로 2단계로 넘어갑니다.",
    step2After: "2단계 · 프로파일 설치 후",
    downloadBtn: "📲 VPNFlow 다운로드 및 설치",
    guideInvalid: "<b>iOS가 “유효하지 않은 프로파일”을 표시해도 기기는 이미 등록되었습니다</b> — 확인을 누르고 이 페이지로 돌아오세요.",
    regDone: "✅ 이 기기는 등록되었습니다",
    installLocked: "1단계를 완료하면 이 버튼이 활성화됩니다",
    autoOpen: "✅ 기기용 빌드가 준비되었습니다 — 여는 중… 아무 반응이 없으면 아래 버튼을 누르세요.",
    unlock: "프로파일을 이미 설치했습니다 — 다운로드 잠금 해제",
    unlockWarn: "iOS가 “설치할 수 없음”을 표시하면 이 기기용으로 서명되지 않은 빌드입니다 — 판매자에게 문의하세요.",
    dmTitle: "⚠️ iOS는 개발자 모드가 필요합니다 (1회만)",
    dmBody: "iOS 16 이상은 App Store 외부에서 설치한 앱에 <b>개발자 모드</b>가 필요합니다. 방법: <b>설정 → 개인정보 보호 및 보안 → 개발자 모드 → 켜기</b> → 재시동 요청 → <b>재시동</b>. 메뉴가 안 보이면 VPNFlow 앱을 한 번 실행한 뒤 설정을 다시 확인하세요.",
    profileName: "VPNFlow — 기기 등록",
    profileDesc: "기기 ID (UDID)를 VPNFlow로 전송해 해당 빌드를 발급받기 위한 프로파일입니다. 다른 데이터는 수집하지 않습니다.",
  },
};

/** Dropdown chọn ngôn ngữ ở ĐẦU trang (thay cho hàng link chữ ở cuối trang trước đây). */
function iosLangSelectHTML(lang = "vi") {
  const names = { vi: "Tiếng Việt", en: "English", zh: "中文", ja: "日本語", ko: "한국어" };
  const options = ["vi", "en", "zh", "ja", "ko"]
    .map((c) => `<option value="${c}"${c === lang ? " selected" : ""}>${names[c]}</option>`)
    .join("");
  // Phải là `window.URL`, KHÔNG được là `new URL(...)`: scope chain của inline handler là
  // element → form → document → global, mà `document.URL` là một string nên nó che `URL`
  // toàn cục ⇒ ném "URL is not a constructor" ⇒ dropdown chọn ngôn ngữ không chạy.
  return `<div class="langbar"><span aria-hidden="true">🌐</span>
  <select aria-label="Language" onchange="var u=new window.URL(location.href);u.searchParams.set('lang',this.value);location.href=u.toString()">${options}</select>
</div>`;
}

const iosDevices = new IosDeviceStore(path.join(DATA_DIR, "ios-devices.json"));
const appleAsc = new AppleCredentialStore(path.join(DATA_DIR, "apple-asc.json"));

app.get(["/install/ios/register.mobileconfig", "/v1/ios/register.mobileconfig"], (req, res) => {
  const lang = iosLang(req);
  console.log(`ios-install: KHÁCH BẤM ĐĂNG KÝ (tải hồ sơ) lang=${lang}`);
  const t = IOS_TEXTS[lang] ?? IOS_TEXTS.vi;
  const profile = buildDeviceProfile({
    // `?lang=` đi theo callback để màn hình chờ của khách hiện đúng thứ tiếng đang xem.
    callbackUrl: `${siteBaseUrl()}/install/ios/udid?lang=${lang}` +
      (String(req.query?.token ?? "").trim() ? `&token=${encodeURIComponent(String(req.query.token).trim())}` : "") +
      // Mã phiên: iOS gửi UDID NGẦM sau khi cài hồ sơ, khách không thấy trang callback ⇒
      // trang cài phải nhận ra máy mình qua mã này mới chuyển được sang nút tải app.
      (String(req.query?.s ?? "").trim() ? `&s=${encodeURIComponent(String(req.query.s).trim().slice(0, 64))}` : ""),
    displayName: t.profileName,
    payloadName: t.profileName,
    description: t.profileDesc,
  });
  // KHÔNG để Safari/Caddy cache hồ sơ: bản cũ bị cache làm khách cài lại đúng file hỏng
  // (đã xảy ra thật: sửa XML xong nhưng máy vẫn tải bản cache ⇒ cài không gửi UDID).
  res.set("Cache-Control", "no-store, must-revalidate");
  // KHÔNG đặt Content-Disposition: với iOS, "attachment" làm Safari coi hồ sơ là file tải về
  // (File app) thay vì mở luồng cài ⇒ khách thấy "Invalid Profile". Đã thử và phải bỏ.
  res.type("application/x-apple-aspen-config").send(profile);
});

// Body của iOS có thể là form-urlencoded, plist thẳng hoặc JSON tuỳ phiên bản ⇒ nhận RAW rồi tự
// nhận dạng (trước đây chỉ nhận form-urlencoded nên iOS gửi plist thẳng là trả 400).
app.post(["/install/ios/udid", "/v1/ios/udid"], express.raw({ type: () => true, limit: "64kb" }), async (req, res) => {
  try {
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body ?? "");
    // Lưu body cuối cùng để chẩn đoán đúng định dạng iOS gửi (file 0600, tối đa 8KB).
    try {
      fs.writeFileSync(
        path.join(DATA_DIR, "last-ios-callback.txt"),
        `content-type: ${req.headers["content-type"] ?? ""}\nua: ${req.headers["user-agent"] ?? ""}\nlen: ${rawBody.length}\n\n${rawBody.slice(0, 8000)}`,
        { mode: 0o600 },
      );
    } catch { /* chẩn đoán lỗi không được làm hỏng luồng chính */ }
    const info = decodeDevicePayload(rawBody, { contentType: String(req.headers["content-type"] ?? "") });
    if (!info) {
      console.warn("ios-udid: payload không có UDID");
      return res.status(400).type("html").send("<p>Không đọc được mã thiết bị. Vui lòng thử lại.</p>");
    }
    // `?token=` đi từ trang cài (Buy → /install/ios?token=…) vào callback: token hợp lệ
    // ⇒ tự gắn UDID với ĐÚNG account đã mua, không phải map tay ở admin. Token sai/hết
    // hạn chỉ là "chưa map" (không chặn khách đăng ký), chủ shop map sau.
    const enrollmentToken = String(req.query?.token ?? "").trim();
    const sessionId = String(req.query?.s ?? "").trim().slice(0, 64);
    let mapped = null;
    if (enrollmentToken) {
      try {
        mapped = await authStore.lookupEnrollmentToken(enrollmentToken);
      } catch (err) {
        console.warn(`ios-udid: token không dùng được (${err?.message ?? err}) — để admin map tay`);
      }
    }
    const { device, isNew } = await iosDevices.register({
      ...info,
      token: enrollmentToken || null,
      sessionId: sessionId || null,
      userId: mapped?.userId ?? null,
      email: mapped?.email ?? null,
    });
    if (mapped) console.log(`ios-udid: tự map ${device.udid} → ${mapped.email ?? mapped.userId}`);
    // Có khoá App Store Connect thì đăng ký UDID lên Apple ngay; lỗi ở đây KHÔNG được
    // làm khách thấy thất bại — chỉ ghi lại để dashboard báo chủ shop.
    // Máy CŨ nhưng chưa có trên Apple cũng phải đẩy lại: khách đăng ký lại hồ sơ là cách
    // tự nhiên để đồng bộ lại trạng thái (gọi lại là idempotent — Apple trả 409 thì coi như đã có).
    if (isNew || !device.appleRegisteredAt) {
      registerIosDeviceWithApple(device.udid, { name: mapped?.email ?? null })
        .then((r) => console.log(`ios-udid: Apple → ${r.skipped ? "chưa cấu hình khoá" : r.ok ? "OK" : `lỗi: ${r.error}`}`))
        .catch((err) => console.error("ios-udid apple register failed:", err?.message ?? err));
    }
    console.log(`ios-udid: ${isNew ? "MỚI" : "đã có"} ${device.udid} (${device.model ?? "?"} · iOS ${device.iosVersion ?? "?"})`);
    if (isNew) {
      const owner = process.env.OWNER_ALERT_EMAIL || "minhnb2@me.com";
      await sendUnmatchedTransferAlert({
        to: owner,
        amount: 0,
        content: `UDID ${device.udid} · ${device.model ?? "?"} · iOS ${device.iosVersion ?? "?"}`,
        reason: "có thiết bị iOS MỚI đăng ký — cần thêm UDID rồi ký lại IPA (chạy scripts/ios-add-udid.sh trên máy Mac)",
        dashboardUrl: `${siteBaseUrl()}/admin`,
      }).catch((err) => console.error("ios-udid alert failed:", err?.message ?? err));
    }
    res.type("html").send(iosRegisteredHTML({ udid: device.udid, isNew, lang: iosLang(req) }));
  } catch (err) {
    console.error("ios-udid failed:", err);
    res.status(500).type("html").send("<p>Lỗi hệ thống. Liên hệ support@meetflowai.site</p>");
  }
});

/** Trang khách thấy ngay sau khi cài profile — tự hỏi lại server để biết khi nào cài được. */
/**
 * Màn hình chờ sau khi khách cài hồ sơ đăng ký: spinner + đếm thời gian, tự hỏi lại server mỗi 5 giây,
 * chỉ hiện nút "Cài đặt" khi bản ký lại cho máy này đã xong. UDID lưu vào localStorage để lần sau mở
 * /install/ios vẫn biết máy đã sẵn sàng hay chưa.
 */
function iosRegisteredHTML({ udid, isNew, lang = "vi" }) {
  const t = IOS_TEXTS[lang] ?? IOS_TEXTS.vi;
  const short = String(udid).slice(-8);
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${t.waitPageTitle}</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(180deg,#051525,#0a1f3a);color:#fff;font-family:-apple-system,Segoe UI,Roboto,sans-serif}.c{max-width:440px;margin:20px;padding:26px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:18px;text-align:center}.t{font-size:20px;font-weight:700;margin:10px 0 6px}p{color:rgba(255,255,255,.7);font-size:14px;line-height:1.6}.spin{width:34px;height:34px;border:3px solid rgba(255,255,255,.2);border-top-color:#33c773;border-radius:50%;animation:sp .9s linear infinite;margin:6px auto 12px}@keyframes sp{to{transform:rotate(360deg)}}a.b{display:block;text-align:center;background:#33c773;color:#06160d;text-decoration:none;font-weight:700;padding:14px;border-radius:10px;margin-top:14px}code{background:rgba(255,255,255,.1);padding:2px 6px;border-radius:5px;font-size:12.5px}.eta{font-size:12.5px;color:rgba(255,255,255,.45);margin-top:10px}</style>
</head><body><div class="c">
<div class="spin" id="spin"></div>
<div class="t" id="title">${t.waitHeading}</div>
<p id="msg">${isNew ? t.waitNew : t.waitKnown}</p>
<a class="b" id="btn" href="/install/ios?lang=${lang}" style="display:none">${t.installBtn}</a>
<div class="eta" id="eta"></div>
<p style="font-size:12.5px;color:rgba(255,255,255,.45)">${t.device} …<code>${short}</code> · ${t.support}: support@meetflowai.site</p>
</div>
<script>
var udid = ${JSON.stringify(udid)};
try { localStorage.setItem("vpnflow_udid", udid); } catch (e) {}
var T = ${JSON.stringify({ readyHeading: t.waitReadyHeading, readyMsg: t.waitReadyMsg, elapsed: null })};
var started = Date.now();
function check() {
  fetch("/install/ios/status?udid=" + encodeURIComponent(udid)).then(function (r) { return r.json(); }).then(function (d) {
    if (d.ready) {
      document.getElementById("spin").style.display = "none";
      document.getElementById("title").textContent = T.readyHeading;
      document.getElementById("msg").textContent = T.readyMsg;
      document.getElementById("btn").style.display = "block";
      document.getElementById("eta").textContent = "";
      return;
    }
    document.getElementById("eta").textContent = ${JSON.stringify(t.elapsed(0)).replace("0", '" + Math.round((Date.now() - started) / 1000) + "')};
    setTimeout(check, 5000);
  }).catch(function () { setTimeout(check, 8000); });
}
check();
</script></body></html>`;
}

app.get(["/install/ios/status", "/v1/ios/status"], async (req, res) => {
  try {
    let udid = String(req.query?.udid ?? "").trim();
    const session = String(req.query?.session ?? "").trim();
    // Trang cài hỏi theo MÃ PHIÊN (khách không thấy được UDID) — có máy rồi thì trả luôn udid
    // để trang lưu lại và lần sau hỏi nhanh hơn.
    if (!udid && session) {
      const device = await iosDevices.findBySession(session);
      if (device) udid = device.udid;
    }
    if (!udid) return res.json({ registered: false, ready: false, udid: null });
    res.json({ ...(await iosDevices.statusFor(udid)), udid });
  } catch (err) {
    console.error("ios status failed:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

/** Máy Mac gọi sau khi ký lại + upload Diawi xong. */
/**
 * Báo khách "bản cài đã sẵn sàng" qua email (chỉ máy đã map email và chưa được báo).
 * Gọi sau khi máy Mac ký lại IPA; `udids` để gửi lại cho một/nhiều máy cụ thể.
 */
async function notifyIosBuildReady({ udids = null, force = false } = {}) {
  const { devices } = await iosDevices.list();
  const wanted = Array.isArray(udids) && udids.length ? new Set(udids) : null;
  const targets = devices.filter((d) => {
    if (!d.email) return false;
    if (wanted) return wanted.has(d.udid);
    return force ? true : !d.notifiedAt;
  });
  const sent = [];
  for (const device of targets) {
    try {
      const lang = (await authStore.langForEmail(device.email)) || "vi";
      const installUrl = `${siteBaseUrl()}/install/ios?lang=${lang}&udid=${encodeURIComponent(device.udid)}`;
      const result = await sendIosInstallReadyEmail({ to: device.email, lang, udid: device.udid, installUrl });
      // Chỉ đánh dấu "đã báo" khi mail THẬT SỰ gửi được — sai cấu hình mailer thì để lần sau gửi lại,
      // tránh việc khách không bao giờ nhận được link mà hệ thống tưởng đã báo.
      if (result?.sent !== true) {
        console.warn(`ios notify: chưa gửi được cho ${device.email} (${result?.error ?? "no mail transport"})`);
        continue;
      }
      sent.push(device.udid);
    } catch (err) {
      console.error(`ios notify failed for ${device.udid}:`, err?.message ?? err);
    }
  }
  if (sent.length) await iosDevices.markNotified(sent);
  if (sent.length) {
    await sendAlert({
      title: "Bản iOS đã ký xong",
      level: "ok",
      lines: [
        `Đã báo ${sent.length} khách có link cài`,
        udids ? `Theo yêu cầu cho: ${udids.join(", ")}` : "Danh sách chờ (auto)",
      ],
    });
  }
  return { sent, remaining: devices.filter((d) => d.email && !d.notifiedAt).length };
}

/**
 * Đăng ký UDID lên Apple (App Store Connect API). Chưa cấu hình khoá ⇒ trả {skipped:true}
 * để luồng khách vẫn chạy và dashboard nhắc chủ shop cấu hình.
 */
async function registerIosDeviceWithApple(udid, { name = null } = {}) {
  const token = await appleAsc.token();
  if (!token) return { skipped: true, reason: "Chưa cấu hình App Store Connect API key" };
  try {
    const result = await registerDeviceWithApple({
      token,
      udid,
      name: name || `VPNFlow ${String(udid).slice(-6)}`,
    });
    if (result.ok) {
      await iosDevices.markAppleRegistered(udid, { deviceId: result.deviceId }).catch((err) => {
        console.error("ios apple: không ghi được trạng thái đăng ký:", err?.message ?? err);
      });
      return { ok: true, deviceId: result.deviceId };
    }
    if (result.alreadyRegistered) {
      await iosDevices.markAppleRegistered(udid, { alreadyRegistered: true }).catch(() => {});
      return { ok: true, alreadyRegistered: true };
    }
    // Lỗi của Apple phải được trả NGUYÊN VĂN: trước đây lỗi ghi trạng thái ("Không tìm thấy UDID")
    // che mất lý do thật khiến chủ shop không biết vì sao Apple từ chối.
    await iosDevices.markAppleError(udid, result.error).catch((err) => {
      console.error("ios apple: không ghi được lỗi:", err?.message ?? err);
    });
    return { ok: false, error: result.error, status: result.status };
  } catch (err) {
    await iosDevices.markAppleError(udid, err?.message ?? err).catch(() => {});
    return { ok: false, error: err?.message ?? "Apple request failed" };
  }
}

/** Trạng thái khoá App Store Connect + danh sách thiết bị bên Apple (nếu đã cấu hình). */
app.get(["/v1/admin/ios/apple", "/admin/ios/apple"], requireAdminAuth, async (_req, res) => {
  try {
    const status = await appleAsc.status();
    const token = status.configured ? await appleAsc.token() : null;
    const list = token ? await listAppleDevices({ token }) : { ok: false, devices: [], error: "Chưa cấu hình API key" };
    res.json({ credentials: status, apple: { ok: list.ok, error: list.error ?? null, devices: list.devices ?? [] } });
  } catch (err) {
    console.error("ios apple status failed:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

/** Nạp khoá App Store Connect (.p8). Khoá chỉ lưu trên server, không bao giờ trả lại. */
app.post(["/v1/admin/ios/apple/credentials", "/admin/ios/apple/credentials"], requireAdminAuth, async (req, res) => {
  try {
    const keyId = String(req.body?.keyId ?? "").trim();
    const issuerId = String(req.body?.issuerId ?? "").trim();
    const teamId = String(req.body?.teamId ?? "").trim() || null;
    const privateKey = String(req.body?.privateKey ?? "");
    if (!keyId || !issuerId || !privateKey) {
      return res.status(400).json({ error: "Cần keyId, issuerId và nội dung file .p8" });
    }
    await appleAsc.save({ keyId, issuerId, teamId, privateKey });
    // Kiểm tra ngay: sai khoá thì báo lỗi luôn chứ không để dashboard hiện "đã cấu hình" mà gọi API nào cũng 401.
    const probe = await listAppleDevices({ token: await appleAsc.token() });
    res.json({ ok: true, credentials: await appleAsc.status(), verified: probe.ok, verify_error: probe.ok ? null : probe.error });
  } catch (err) {
    res.status(400).json({ error: err?.message ?? "Không lưu được khoá" });
  }
});

app.delete(["/v1/admin/ios/apple/credentials", "/admin/ios/apple/credentials"], requireAdminAuth, async (_req, res) => {
  try {
    await appleAsc.clear();
    res.json({ ok: true, credentials: await appleAsc.status() });
  } catch (err) {
    res.status(500).json({ error: "Internal error" });
  }
});

/** Đăng ký MỘT UDID lên Apple. */
app.post(["/v1/admin/ios/devices/:udid/register-apple", "/admin/ios/devices/:udid/register-apple"], requireAdminAuth, async (req, res) => {
  try {
    const udid = String(req.params.udid ?? "").trim();
    const { devices } = await iosDevices.list();
    if (!devices.some((entry) => entry.udid === udid)) {
      return res.status(404).json({ error: "UDID này chưa đăng ký trong hệ thống" });
    }
    const result = await registerIosDeviceWithApple(udid, { name: req.body?.name ?? null });
    if (result.skipped) return res.status(503).json({ error: result.reason, code: "asc_not_configured" });
    res.status(result.ok ? 200 : 502).json({ ok: result.ok, ...result });
  } catch (err) {
    res.status(500).json({ error: "Internal error" });
  }
});

/** Đăng ký TẤT CẢ UDID chưa có trên Apple (chủ shop bấm một nút sau khi nạp khoá). */
app.post(["/v1/admin/ios/apple/register-pending", "/admin/ios/apple/register-pending"], requireAdminAuth, async (_req, res) => {
  try {
    const { devices } = await iosDevices.list();
    const pending = devices.filter((d) => !d.appleRegisteredAt);
    const registered = [];
    const failed = [];
    for (const device of pending) {
      const result = await registerIosDeviceWithApple(device.udid, { name: device.email ?? null });
      if (result.skipped) return res.status(503).json({ error: result.reason, code: "asc_not_configured" });
      if (result.ok) registered.push(device.udid);
      else failed.push({ udid: device.udid, error: result.error });
    }
    res.json({ ok: true, registered, failed, pending_before: pending.length });
  } catch (err) {
    console.error("ios apple register-pending failed:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

app.post(["/v1/admin/ios/devices/built", "/admin/ios/devices/built"], requireAdminAuth, async (req, res) => {
  try {
    const serial = await iosDevices.markBuilt({ note: req.body?.note ?? null });
    const notify = await notifyIosBuildReady();
    res.json({ ok: true, buildSerial: serial, notified: notify.sent.length, notify_pending: notify.remaining });
  } catch (err) {
    console.error("ios markBuilt failed:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

/** Gửi lại email "bản cài sẵn sàng": ?udid=<UDID> hoặc toàn bộ máy chưa báo. */
app.post(["/v1/admin/ios/devices/notify", "/admin/ios/devices/notify"], requireAdminAuth, async (req, res) => {
  try {
    const udid = String(req.body?.udid ?? req.query?.udid ?? "").trim();
    const notify = await notifyIosBuildReady({
      udids: udid ? [udid] : null,
      force: req.body?.force === true || Boolean(udid),
    });
    res.json({ ok: true, notified: notify.sent, remaining: notify.remaining });
  } catch (err) {
    console.error("ios notify failed:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

app.get(["/v1/admin/ios/devices", "/admin/ios/devices"], requireAdminAuth, async (_req, res) => {
  try {
    res.json(await iosDevices.list());
  } catch (err) {
    res.status(500).json({ error: "Internal error" });
  }
});

app.post(["/v1/admin/ios/devices/:udid/account", "/admin/ios/devices/:udid/account"], requireAdminAuth, async (req, res) => {
  try {
    const udid = String(req.params.udid ?? "").trim();
    const userId = String(req.body?.userId ?? "").trim() || null;
    const email = String(req.body?.email ?? "").trim().toLowerCase() || null;
    if (!userId && !email) return res.status(400).json({ error: "userId hoặc email là bắt buộc" });
    const users = await authStore.listUsersWithExpiry();
    const user = userId ? users.find((entry) => entry.id === userId) : users.find((entry) => entry.email === email);
    if (!user) return res.status(404).json({ error: "Không tìm thấy account" });
    const device = await iosDevices.mapAccount(udid, { userId: user.id, email: user.email ?? email });
    res.json({ ok: true, device });
  } catch (err) {
    if (err?.message === "Không tìm thấy UDID") return res.status(404).json({ error: err.message });
    console.error("admin ios device account map failed:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

/** Định dạng UDID hợp lệ: máy mới (8-16 hex), máy cũ 40 hex, iPad cũ 24 hex. */
const UDID_RE = /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{16}$|^[0-9A-Fa-f]{40}$|^[0-9A-Fa-f]{24}$/;

/**
 * Admin thêm UDID bằng tay — dùng cho ca khách **gửi email** cho shop (khách không phải dán gì).
 * Máy Mac (watcher) sẽ tự ký lại rồi khách cài được; khách cũng thấy trạng thái trên trang chờ.
 */
app.post(["/v1/admin/ios/devices", "/admin/ios/devices"], requireAdminAuth, async (req, res) => {
  try {
    const udid = String(req.body?.udid ?? "").trim().toUpperCase();
    if (!UDID_RE.test(udid)) {
      return res.status(400).json({ error: "UDID không đúng định dạng", example: "00008120-0008299A26D80032" });
    }
    const { device, isNew } = await iosDevices.register({ udid, model: req.body?.model ?? "khách gửi email" });
    res.json({ ok: true, isNew, device });
  } catch (err) {
    console.error("admin ios device add failed:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

app.get(["/install/ios/manifest.plist", "/v1/downloads/ios/manifest.plist"], (_req, res) => {
  // Tài liệu OTA của Apple dùng `text/xml`; iOS nhận cả hai nhưng để đúng loại cho chắc.
  res.type("text/xml; charset=utf-8").send(iosInstallManifest({
    baseUrl: siteBaseUrl(),
    bundleId: process.env.IOS_BUNDLE_ID || "com.privatevpn.app",
    version: appConfig.get("latest_ios_version") || "1.0",
    build: appConfig.get("ios_ipa_build") || process.env.IOS_IPA_BUILD || null,
  }));
});

app.get(["/install/ios", "/install/ios/"], async (req, res) => {
  // Ghi lại lượt xem để chủ shop biết khách có thực sự vào trang hay không (không log IP).
  console.log(`ios-install: page view lang=${iosLang(req)} ua="${String(req.get("user-agent") ?? "-").slice(0, 50)}"`);
  const base = siteBaseUrl();
  const manifest = `${base}/install/ios/manifest.plist`;
  const itms = `itms-services://?action=download-manifest&amp;url=${encodeURIComponent(manifest)}`;
  const version = appConfig.get("latest_ios_version") || "1.0";
  // Có ?s= (link hỗ trợ/recovery) thì DÙNG LUÔN mã đó — href render ra đã đúng mã phiên,
  // không phụ thuộc JS chạy xong mới sửa lại.
  const sid = String(req.query?.s ?? "").trim().slice(0, 64) || crypto.randomUUID();
  // Tra máy theo mã phiên NGAY lúc render: nút Đăng ký / Tải & cài hiện ĐÚNG trạng thái ngay từ
  // HTML đầu tiên — khách không phải chờ JS poll ~1s, và vẫn đúng khi JS bị chặn.
  let known = null;
  try {
    known = await iosDevices.findBySession(sid);
  } catch { /* lỗi đọc store không được làm trang trắng */ }
  res.type("html").send(iosInstallPageHTML({
    base, itms, version,
    lang: iosLang(req),
    token: String(req.query?.token ?? "").slice(0, 200),
    sid,
    registered: Boolean(known),
    ready: Boolean(known?.built),
    // Kênh dự phòng Diawi: bản cài trên Diawi đã ký kèm UDID của các máy đã đăng ký, nên chỉ
    // hiện cho máy đã có bản ký (ready) — khách chưa đăng ký bấm vào là chắc chắn lỗi.
    diawi: String(appConfig.get("ios_diawi_url") ?? ""),
  }));
});

/**
 * CSS dùng chung cho trang hướng dẫn cài (iOS + macOS) — một khung giao diện duy nhất
 * để hai trang luôn khớp nhau, không bị lệch khi chỉ sửa một bên.
 */
const INSTALL_PAGE_CSS = `
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(180deg,#051525,#0a1f3a);color:#fff;font-family:-apple-system,Segoe UI,Roboto,sans-serif}
.c{max-width:480px;margin:22px;padding:26px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:18px}
.t{font-size:21px;font-weight:700;margin:0 0 4px}.s{color:rgba(255,255,255,.6);font-size:13.5px;margin:0 0 16px}
.step{border:1px solid rgba(51,199,115,.3);border-radius:14px;padding:14px;margin:0 0 12px;background:rgba(255,255,255,.04)}
.step.off{opacity:.55}
.stephead{display:flex;align-items:center;gap:12px;margin:0 0 8px}
.n{flex:0 0 auto;width:36px;height:36px;line-height:36px;text-align:center;border-radius:50%;background:#33c773;color:#06160d;font-weight:800;font-size:19px;box-shadow:0 0 0 4px rgba(51,199,115,.18)}
.h{font-weight:700;font-size:16.5px;line-height:1.3}
a.b{display:block;text-align:center;text-decoration:none;font-weight:700;padding:13px;border-radius:10px;margin:10px 0 6px}
a.b1{background:rgba(255,255,255,.14);color:#fff}a.b2{background:#33c773;color:#06160d}
a.b.disabled{opacity:.4;pointer-events:none;filter:grayscale(.35)}
a.b.pulse{animation:pulse 1.5s ease-in-out infinite}
@keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(51,199,115,.45)}50%{box-shadow:0 0 0 8px rgba(51,199,115,0)}}
.devmode{margin-top:12px;padding:11px 12px;background:rgba(255,180,0,.08);border:1px solid rgba(255,180,0,.3);border-radius:11px}
.dm-title{font-size:13.5px;font-weight:700;color:#ffd166;margin-bottom:4px}
.dm-body{font-size:12.5px;color:rgba(255,255,255,.85);line-height:1.55}
.hintlock{font-size:12.5px;color:rgba(255,255,255,.5);text-align:center;margin:2px 0 0}
ul{color:rgba(255,255,255,.72);font-size:13px;line-height:1.6;padding-left:18px;margin:6px 0}
code{background:rgba(255,255,255,.1);padding:2px 6px;border-radius:5px;font-size:12.5px}
.warn{margin-top:12px;padding:12px;background:rgba(255,180,0,.08);border:1px solid rgba(255,180,0,.3);border-radius:12px;font-size:13px}
.diawifb{margin-top:11px;padding-top:11px;border-top:1px solid rgba(255,255,255,.14)}
.wait{display:flex;align-items:center;gap:9px;color:rgba(255,255,255,.75);font-size:13.5px;padding:6px 0}
.spin{width:15px;height:15px;border:2px solid rgba(255,255,255,.25);border-top-color:#33c773;border-radius:50%;animation:sp .9s linear infinite;display:inline-block}
@keyframes sp{to{transform:rotate(360deg)}}.okmsg{color:#33c773;font-weight:600;font-size:13.5px;padding:4px 0}
.langbar{display:flex;align-items:center;justify-content:flex-end;gap:6px;margin:-6px 0 12px}.langbar select{background:rgba(255,255,255,.08);color:#fff;border:1px solid rgba(255,255,255,.2);border-radius:8px;padding:5px 8px;font-size:12.5px;font-family:inherit}
.modal{position:fixed;inset:0;background:rgba(3,10,20,.82);backdrop-filter:blur(3px);display:none;align-items:center;justify-content:center;padding:16px;z-index:99}
.mbox{max-width:460px;width:100%;max-height:88vh;overflow:auto;background:#0d2036;border:1px solid rgba(255,255,255,.18);border-radius:18px;padding:20px}
.mtitle{font-size:17px;font-weight:700;margin:0 0 6px;color:#fff}
.mintro{font-size:13.5px;color:rgba(255,255,255,.8);margin:0 0 10px}
ol.msteps{color:rgba(255,255,255,.9);font-size:13.5px;line-height:1.65;padding-left:20px;margin:0 0 10px}
ol.msteps li{margin-bottom:7px}
.mnote{font-size:12.5px;color:rgba(255,255,255,.6);background:rgba(255,255,255,.05);padding:9px 11px;border-radius:9px;margin:8px 0}
.mafter{font-size:12.5px;color:#33c773;margin:8px 0 12px}
.mbtn{width:100%;background:#33c773;color:#06160d;border:0;font-weight:700;font-size:15px;padding:14px;border-radius:11px;font-family:inherit}
a.guidebtn{display:block;text-align:center;color:#8fd0ff;font-size:13px;margin:4px 0 8px;text-decoration:none}`;

/**
 * Trang cài iOS — 2 bước, đa ngôn ngữ (vi/en/zh/ja/ko như trang buy), bước 2 chỉ mở khi máy đã có bản cài.
 * Ngôn ngữ chọn theo `?lang=` → `Accept-Language` của máy khách → mặc định tiếng Việt.
 */
function iosInstallPageHTML({ base, itms, version, lang = "vi", token = "", sid = "", registered = false, ready = false, diawi = "" }) {
  // Token account (nếu khách mở link riêng /install/ios?token=…) phải đi tiếp sang hồ sơ đăng ký,
  // nếu không UDID gửi về sẽ không tự map được vào account.
  const tokenQS = token ? "&token=" + encodeURIComponent(token) : "";
  // Mỗi lần mở trang là một URL hồ sơ khác nhau: iOS/Safari không thể dùng lại file cũ
  // đã tải (từng gây "Invalid Profile" vì cài lại bản tải dở), và tránh cache của CDN.
  const freshQS = "&ts=" + Date.now();
  const t = IOS_TEXTS[lang] ?? IOS_TEXTS.vi;
  const li = (items) => items.map((x) => `<li>${x}</li>`).join("");
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${t.pageTitle}</title>
<style>${INSTALL_PAGE_CSS}</style>
</head><body><div class="c">
${iosLangSelectHTML(lang)}
<p class="t">${t.pageTitle}</p>
<p class="s">${t.intro(version)}</p>

<div class="step">
  <div class="stephead"><span class="n">1</span><span class="h">${t.step1}</span></div>
  <ul>${li(t.step1Items)}</ul>
  <a class="b b1${registered ? " disabled" : ""}" id="cta" href="/install/ios/register.mobileconfig?lang=${lang}${tokenQS}${freshQS}&s=${encodeURIComponent(sid)}">${registered ? t.regDone : t.regBtn}</a>
  <div id="statusline" class="wait" style="${registered && !ready ? "" : "display:none"}"><span class="spin"></span><span id="statustxt">${t.waitReady}</span></div>
</div>

<div class="step">
  <div class="stephead"><span class="n">2</span><span class="h">${t.step2}</span></div>
  <a class="b b2${registered ? "" : " disabled"}${registered && ready ? " pulse" : ""}" id="installLink" href="${itms}">${t.downloadBtn}</a>
  <div class="hintlock" id="installHint" style="${registered ? "display:none" : ""}">${t.installLocked}</div>
  <div class="devmode">
    <div class="dm-title">${t.dmTitle}</div>
    <div class="dm-body">${t.dmBody}</div>
  </div>
  <a class="hintlock" id="unlockLink" href="#" onclick="unlockInstall();return false;" style="${registered ? "display:none" : ""};color:#8fd0ff;text-decoration:underline">${t.unlock}</a>
</div>

<div class="warn">
  <b>${t.warnTitle}</b>
  <ul>${li(t.warnItems)}</ul>
${diawi ? `  <div class="diawifb" id="diawiFallback" style="${ready ? "" : "display:none"}">
    <div class="dm-title">${t.diawiTitle}</div>
    <a class="b b1" id="diawiBtn" href="${diawi}" rel="noopener">${t.diawiBtn}</a>
    <div class="hintlock" style="text-align:left">${t.diawiNote}</div>
  </div>
` : ""}</div>


<div style="margin-top:14px;padding-top:14px;border-top:1px solid rgba(255,255,255,.12);text-align:center">
  <div style="font-size:13.5px;font-weight:600;margin-bottom:8px">${t.qrTitle}</div>
  <img src="/v1/downloads/qr?target=ios&size=260" alt="QR" width="150" height="150" style="background:#fff;padding:6px;border-radius:10px">
  <div style="font-size:12.5px;color:rgba(255,255,255,.6);margin-top:8px">${base}/install/ios</div>
  <div style="font-size:12.5px;color:rgba(255,255,255,.5);margin-top:6px">${t.support}: support@meetflowai.site</div>
</div>
</div>

<div class="modal" id="guide">
  <div class="mbox">
    <div class="mtitle">📲 ${t.guideTitle}</div>
    <div class="mintro">${t.guideIntro}</div>
    <ol class="msteps">${li(t.guideSteps)}</ol>
    <div class="mnote">${t.guideNote}</div>
    <div class="mnote" style="background:rgba(255,180,0,.1);border:1px solid rgba(255,180,0,.3)">${t.guideInvalid}</div>
    <div class="mafter">✅ ${t.guideAfter}</div>
    <button class="mbtn" onclick="hideGuide()">${t.guideClose}</button>
  </div>
</div>
</div>
<script>
// Mã phiên: iOS gửi UDID NGẦM sau khi cài hồ sơ (khách không thấy trang callback), nên trang phải
// nhận ra "máy này" qua mã phiên — nếu không thì sau khi cài hồ sơ trang vẫn không biết và không
// hiện được nút tải app.
// Mã phiên — thứ tự ưu tiên: (1) ?s= trên URL (link hỗ trợ/recovery), (2) localStorage,
// (3) mã server sinh cho lần mở này. Link hồ sơ cũng đã mang sẵn mã này từ server nên khách
// bấm nút là mã chắc chắn đi theo, không phụ thuộc JS đã chạy hay chưa.
var SID = "";
try { SID = new URLSearchParams(window.location.search).get("s") || ""; } catch (e) {}
if (!SID) { try { SID = localStorage.getItem("vpnflow_sid") || ""; } catch (e) {} }
if (!SID) { SID = ${JSON.stringify(sid)}; }
try { localStorage.setItem("vpnflow_sid", SID); } catch (e) {}
var udid = ""; try { udid = localStorage.getItem("vpnflow_udid") || ""; } catch (e) {}
var ITMS = ${JSON.stringify(itms.replace(/&amp;/g, "&"))};
var REG_BASE = ${JSON.stringify(`/install/ios/register.mobileconfig?lang=${lang}${tokenQS}${freshQS}`)};
// Thay mã phiên trong href (href đã có &s= do server render) — tránh 2 tham số s= trùng nhau.
function withSession(url, sid) {
  if (!sid) return url;
  return /[?&]s=/.test(url)
    ? url.replace(/([?&])s=[^&]*/, "$1s=" + encodeURIComponent(sid))
    : url + "&s=" + encodeURIComponent(sid);
}
var REG_HREF = withSession(REG_BASE, SID);
var LBL = ${JSON.stringify({ reg: t.regBtn, install: t.installBtn, wait: t.waitReady, locked: t.waitLocked, regDone: t.regDone, installLocked: t.installLocked, autoOpen: t.autoOpen, unlock: t.unlock, unlockWarn: t.unlockWarn })};
var cta = document.getElementById("cta");
var statusline = document.getElementById("statusline"), statustxt = document.getElementById("statustxt");
function showGuide() { document.getElementById("guide").style.display = "flex"; }
function hideGuide() { document.getElementById("guide").style.display = "none"; }
var installLink = document.getElementById("installLink");
var unlockLink = document.getElementById("unlockLink");
var installHint = document.getElementById("installHint");
// Trạng thái nút theo tình trạng máy:
//  · chưa đăng ký  ⇒ nút Đăng ký BẬT, nút Tải & cài KHÓA (cài trước khi đăng ký là chắc chắn lỗi)
//  · đã đăng ký    ⇒ nút Đăng ký KHÓA (không cho bấm lại) và nút Tải & cài BẬT
function setNotRegistered() {
  cta.classList.remove("disabled");
  cta.textContent = LBL.reg;
  installLink.classList.add("disabled");
  installLink.classList.remove("pulse");
  if (installHint) { installHint.textContent = LBL.locked; installHint.style.display = "block"; }
  // Không bao giờ để khách bị tắc: trang có thể không nhận ra máy (khách cài hồ sơ từ link cũ,
  // xoá dữ liệu Safari, mở trên trình duyệt khác…) nên luôn có đường mở khoá thủ công.
  if (unlockLink) unlockLink.style.display = "block";
}
function unlockInstall() {
  installLink.classList.remove("disabled");
  installLink.classList.add("pulse");
  if (installHint) { installHint.textContent = LBL.unlockWarn; installHint.style.display = "block"; }
  if (unlockLink) unlockLink.style.display = "none";
  statusline.style.display = "none";
  revealDiawi();
}
// Diawi là kênh dự phòng: chỉ hé ra khi máy ĐÃ có bản ký (nút chính chạy được nhưng có thể lỗi
// trên máy khoá cứng cài đặt), hoặc khi khách tự bấm mở khoá thủ công.
function revealDiawi() {
  var df = document.getElementById("diawiFallback");
  if (df) df.style.display = "block";
}
function setRegistered(ready) {
  cta.classList.add("disabled");
  cta.textContent = LBL.regDone;
  installLink.classList.remove("disabled");
  if (ready) installLink.classList.add("pulse");
  if (installHint) installHint.style.display = "none";
  if (unlockLink) unlockLink.style.display = "none";
}
// Khách KHÔNG phải tự bấm tải: bản ký xong là trang tự mở hộp thoại cài (itms-services).
// iOS bắt buộc người dùng bấm "Install" một lần — không có cách nào cài im lặng trên máy chưa jailbreak.
var autoOpened = false;
function showReady() {
  setRegistered(true);
  revealDiawi();
  statusline.style.display = "flex";
  statustxt.textContent = LBL.autoOpen;
  if (!autoOpened) {
    autoOpened = true;
    setTimeout(function () { try { window.location.href = ITMS; } catch (e) {} }, 700);
  }
}
function showWaiting(msg) {
  setRegistered(false);
  statusline.style.display = "flex";
  statustxt.textContent = msg;
}
setNotRegistered();
cta.addEventListener("click", function () { setTimeout(showGuide, 250); });
function poll() {
  var q = udid ? "udid=" + encodeURIComponent(udid) : "session=" + encodeURIComponent(SID);
  fetch("/install/ios/status?" + q).then(function (r) { return r.json(); }).then(function (d) {
    if (d && d.udid) { udid = d.udid; try { localStorage.setItem("vpnflow_udid", udid); } catch (e) {} }
    if (d && d.registered) { if (d.ready) { showReady(); } else { showWaiting(LBL.wait); } }
    else { setNotRegistered(); statusline.style.display = "none"; }
    setTimeout(poll, 5000);
  }).catch(function () { setTimeout(poll, 8000); });
}
if (SID || udid) poll();
</script></body></html>`;
}

/**
 * Link cũ của trang hướng dẫn TestFlight (tính năng đã bỏ 2026-09): chuyển khách về trang cài
 * chuẩn thay vì để 404 — link này từng nằm trong box "không cần đăng ký thiết bị" và trong email cũ.
 */
app.get(["/install/ios/testflight", "/v1/ios/testflight"], (req, res) => {
  res.redirect(302, `/install/ios?lang=${iosLang(req)}`);
});

app.get("/v1/downloads/ios", async (_req, res) => {
  try {
    const ipaDir = process.env.IOS_IPA_DIR || "/root/flowvpn-ipa";
    const ipaPath = process.env.IOS_IPA_PATH || path.join(ipaDir, "VPNFlow-latest.ipa");
    if (!fs.existsSync(ipaPath)) {
      return res.status(404).send("IPA not found. Contact support@meetflowai.site");
    }
    res.download(ipaPath, "VPNFlow.ipa");
  } catch (err) {
    res.status(500).json({ error: "Internal error" });
  }
});

/**
 * Chuỗi hiển thị của trang cài macOS (5 ngôn ngữ như trang iOS).
 * Bản Mac phát trực tiếp từ shop (file .zip chứa VPNFlow.app) và CHƯA notarize qua Apple,
 * nên bước 2 phải hướng dẫn đúng cách macOS chặn app: chuột phải → Open / Open Anyway.
 */
const MAC_TEXTS = {
  vi: {
    pageTitle: "Cài VPNFlow lên máy Mac",
    intro: (v) => `Bản ${v} · tải file cài và làm theo 3 bước.`,
    step1: "Tải file cài",
    step1Items: [
      "Bấm nút xanh bên dưới để tải file cài (.zip chứa <b>VPNFlow.app</b>).",
      "File tải về thường nằm trong thư mục <b>Downloads</b>.",
    ],
    downloadBtn: "⬇️ Tải VPNFlow cho Mac",
    directNote: "Bản Mac cài trực tiếp từ shop — không qua App Store.",
    step2: "Cài ứng dụng",
    step2Items: [
      "Mở file .zip vừa tải → kéo <b>VPNFlow</b> vào thư mục <b>Applications</b> (Ứng dụng).",
      "Nếu macOS báo “không mở được vì không xác minh được nhà phát triển”: mở <b>Applications</b>, <b>chuột phải</b> vào VPNFlow → <b>Open</b> → bấm <b>Open</b> lần nữa.<br><span style=\"opacity:.75\">Hoặc vào <b>System Settings → Privacy &amp; Security</b> → bấm <b>Open Anyway</b>.</span>",
    ],
    step3: "Đăng nhập &amp; bật VPN",
    step3Items: [
      "Mở <b>VPNFlow</b> từ Applications.",
      "Đăng nhập bằng <b>email bạn đã mua</b>.",
      "macOS hỏi cho phép cấu hình VPN → bấm <b>Allow</b> (bật trong <b>System Settings → Privacy &amp; Security → VPN</b>).",
      "Bấm <b>Connect</b> để kết nối.",
    ],
    warnTitle: "Không cài được thì làm gì?",
    warnItems: [
      "Gỡ bản VPNFlow cũ trước khi cài bản mới: kéo app cũ vào <b>Trash</b> rồi cài lại.",
      "Đóng app VPNFlow đang chạy trước khi cài hoặc cập nhật.",
      "Bản Mac cài trực tiếp từ shop, <b>không qua App Store</b>.",
    ],
    qrTitle: "💻 Đang xem trên điện thoại? Quét mã này bằng máy Mac",
    support: "Hỗ trợ",
  },
  en: {
    pageTitle: "Install VPNFlow on your Mac",
    intro: (v) => `Version ${v} · download the installer and follow 3 steps.`,
    step1: "Download the installer",
    step1Items: [
      "Tap the green button below to download the installer (.zip with <b>VPNFlow.app</b>).",
      "The file usually lands in your <b>Downloads</b> folder.",
    ],
    downloadBtn: "⬇️ Download VPNFlow for Mac",
    directNote: "The Mac build is installed directly from the shop — not via the App Store.",
    step2: "Install the app",
    step2Items: [
      "Open the .zip → drag <b>VPNFlow</b> into the <b>Applications</b> folder.",
      "If macOS says it can't verify the developer: open <b>Applications</b>, <b>right-click</b> VPNFlow → <b>Open</b> → click <b>Open</b> again.<br><span style=\"opacity:.75\">Or go to <b>System Settings → Privacy &amp; Security</b> and click <b>Open Anyway</b>.</span>",
    ],
    step3: "Sign in &amp; turn on the VPN",
    step3Items: [
      "Open <b>VPNFlow</b> from Applications.",
      "Sign in with the <b>email you bought with</b>.",
      "When macOS asks to allow VPN configuration, click <b>Allow</b> (in <b>System Settings → Privacy &amp; Security → VPN</b>).",
      "Click <b>Connect</b>.",
    ],
    warnTitle: "Can't install?",
    warnItems: [
      "Remove the old VPNFlow first: drag the old app to <b>Trash</b>, then install again.",
      "Quit any running VPNFlow before installing or updating.",
      "The Mac build is installed directly from the shop, <b>not via the App Store</b>.",
    ],
    qrTitle: "💻 On your phone? Scan this code with your Mac",
    support: "Support",
  },
  zh: {
    pageTitle: "在 Mac 上安装 VPNFlow",
    intro: (v) => `版本 ${v} · 下载安装包并完成 3 步。`,
    step1: "下载安装包",
    step1Items: [
      "点击下方绿色按钮下载安装包（.zip，内含 <b>VPNFlow.app</b>）。",
      "文件通常保存在 <b>下载</b> 文件夹中。",
    ],
    downloadBtn: "⬇️ 下载 Mac 版 VPNFlow",
    directNote: "Mac 版由商店直接安装 — 不通过 App Store。",
    step2: "安装应用",
    step2Items: [
      "打开 .zip → 将 <b>VPNFlow</b> 拖入 <b>Applications（应用程序）</b>文件夹。",
      "若 macOS 提示“无法验证开发者”：打开 <b>Applications</b>，<b>右键</b>点击 VPNFlow → <b>Open</b> → 再点一次 <b>Open</b>。<br><span style=\"opacity:.75\">或进入 <b>System Settings → Privacy &amp; Security</b> 点击 <b>Open Anyway</b>。</span>",
    ],
    step3: "登录并连接 VPN",
    step3Items: [
      "从 Applications 打开 <b>VPNFlow</b>。",
      "使用<b>购买时的邮箱</b>登录。",
      "macOS 询问是否允许配置 VPN → 点击 <b>Allow</b>（可在 <b>System Settings → Privacy &amp; Security → VPN</b> 中开启）。",
      "点击 <b>Connect</b> 连接。",
    ],
    warnTitle: "安装不了怎么办？",
    warnItems: [
      "先卸载旧版 VPNFlow：把旧应用拖入 <b>Trash（废纸篓）</b>，再重新安装。",
      "安装或更新前请先退出正在运行的 VPNFlow。",
      "Mac 版由商店直接安装，<b>不通过 App Store</b>。",
    ],
    qrTitle: "💻 在手机上？用 Mac 扫描此二维码",
    support: "客服",
  },
  ja: {
    pageTitle: "Mac に VPNFlow をインストール",
    intro: (v) => `バージョン ${v} · インストーラをダウンロードして 3 ステップ。`,
    step1: "インストーラをダウンロード",
    step1Items: [
      "下の緑のボタンでインストーラ（<b>VPNFlow.app</b> 入り .zip）をダウンロードします。",
      "ファイルは通常 <b>ダウンロード</b> フォルダに保存されます。",
    ],
    downloadBtn: "⬇️ Mac 版 VPNFlow をダウンロード",
    directNote: "Mac 版はショップから直接インストール — App Store は使いません。",
    step2: "アプリをインストール",
    step2Items: [
      ".zip を開く → <b>VPNFlow</b> を <b>Applications（アプリケーション）</b>フォルダへドラッグ。",
      "「開発元を確認できないため開けません」と出たら：<b>Applications</b> を開き、VPNFlow を<b>右クリック</b> → <b>Open</b> → もう一度 <b>Open</b>。<br><span style=\"opacity:.75\">または <b>System Settings → Privacy &amp; Security</b> で <b>Open Anyway</b> をクリック。</span>",
    ],
    step3: "サインインして VPN を接続",
    step3Items: [
      "Applications から <b>VPNFlow</b> を開きます。",
      "<b>購入時のメール</b>でサインインします。",
      "macOS が VPN 構成の許可を求めたら <b>Allow</b> をクリック（<b>System Settings → Privacy &amp; Security → VPN</b> で有効化）。",
      "<b>Connect</b> をクリックして接続。",
    ],
    warnTitle: "インストールできない場合",
    warnItems: [
      "古い VPNFlow を先に削除：旧アプリを <b>Trash（ゴミ箱）</b>へドラッグしてから再インストール。",
      "インストール・更新の前に起動中の VPNFlow を終了してください。",
      "Mac 版はショップから直接インストールし、<b>App Store は使いません</b>。",
    ],
    qrTitle: "💻 スマホで見ていますか？Mac でこのコードを読み取ってください",
    support: "サポート",
  },
  ko: {
    pageTitle: "Mac에 VPNFlow 설치",
    intro: (v) => `버전 ${v} · 설치 파일을 내려받고 3단계만 진행하세요.`,
    step1: "설치 파일 다운로드",
    step1Items: [
      "아래 초록색 버튼을 눌러 설치 파일(.zip, <b>VPNFlow.app</b> 포함)을 내려받으세요.",
      "파일은 보통 <b>다운로드</b> 폴더에 저장됩니다.",
    ],
    downloadBtn: "⬇️ Mac용 VPNFlow 다운로드",
    directNote: "Mac 버전은 쇼핑몰에서 직접 설치 — App Store를 거치지 않습니다.",
    step2: "앱 설치",
    step2Items: [
      ".zip 파일을 열고 <b>VPNFlow</b>를 <b>Applications(응용 프로그램)</b> 폴더로 드래그하세요.",
      "“개발자를 확인할 수 없어 열 수 없습니다”가 뜨면: <b>Applications</b>를 열고 VPNFlow를 <b>오른쪽 클릭</b> → <b>Open</b> → 다시 <b>Open</b>을 누르세요.<br><span style=\"opacity:.75\">또는 <b>System Settings → Privacy &amp; Security</b>에서 <b>Open Anyway</b>를 누르세요.</span>",
    ],
    step3: "로그인 및 VPN 연결",
    step3Items: [
      "Applications에서 <b>VPNFlow</b>를 엽니다.",
      "<b>구매에 사용한 이메일</b>로 로그인합니다.",
      "macOS가 VPN 구성 허용을 물으면 <b>Allow</b>를 누르세요 (<b>System Settings → Privacy &amp; Security → VPN</b>에서 켤 수 있습니다).",
      "<b>Connect</b>를 눌러 연결합니다.",
    ],
    warnTitle: "설치가 안 되나요?",
    warnItems: [
      "먼저 이전 VPNFlow를 삭제하세요: 이전 앱을 <b>Trash(휴지통)</b>로 드래그한 뒤 다시 설치합니다.",
      "설치 또는 업데이트 전에 실행 중인 VPNFlow를 종료하세요.",
      "Mac 버전은 쇼핑몰에서 직접 설치하며 <b>App Store를 거치지 않습니다</b>.",
    ],
    qrTitle: "💻 휴대폰으로 보고 있나요? Mac으로 이 코드를 스캔하세요",
    support: "지원",
  },
};

/**
 * Trang cài macOS — 3 bước tĩnh, dùng CHUNG khung CSS + dropdown ngôn ngữ với trang iOS.
 * Không có bước đăng ký UDID/ký lại như iOS: file .zip được phát trực tiếp từ shop.
 */
function macInstallPageHTML({ base, version, lang = "vi" }) {
  const t = MAC_TEXTS[lang] ?? MAC_TEXTS.vi;
  const li = (items) => items.map((x) => `<li>${x}</li>`).join("");
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${t.pageTitle}</title>
<style>${INSTALL_PAGE_CSS}</style>
</head><body><div class="c">
${iosLangSelectHTML(lang)}
<p class="t">${t.pageTitle}</p>
<p class="s">${t.intro(version)}</p>

<div class="step">
  <div class="stephead"><span class="n">1</span><span class="h">${t.step1}</span></div>
  <ul>${li(t.step1Items)}</ul>
  <a class="b b2" href="/v1/downloads/mac">${t.downloadBtn}</a>
  <div class="hintlock">${t.directNote}</div>
</div>

<div class="step">
  <div class="stephead"><span class="n">2</span><span class="h">${t.step2}</span></div>
  <ul>${li(t.step2Items)}</ul>
</div>

<div class="step">
  <div class="stephead"><span class="n">3</span><span class="h">${t.step3}</span></div>
  <ul>${li(t.step3Items)}</ul>
</div>

<div class="warn">
  <b>${t.warnTitle}</b>
  <ul>${li(t.warnItems)}</ul>
</div>

<div style="margin-top:14px;padding-top:14px;border-top:1px solid rgba(255,255,255,.12);text-align:center">
  <div style="font-size:13.5px;font-weight:600;margin-bottom:8px">${t.qrTitle}</div>
  <img src="/v1/downloads/qr?target=mac&size=260" alt="QR" width="150" height="150" style="background:#fff;padding:6px;border-radius:10px">
  <div style="font-size:12.5px;color:rgba(255,255,255,.6);margin-top:8px">${base}/install/mac</div>
  <div style="font-size:12.5px;color:rgba(255,255,255,.5);margin-top:6px">${t.support}: support@meetflowai.site</div>
</div>
</div>
</body></html>`;
}

app.get(["/install/mac", "/install/mac/", "/v1/install/mac"], (req, res) => {
  // Ghi lại lượt xem giống trang iOS (không log IP).
  console.log(`mac-install: page view lang=${requestLang(req)} ua="${String(req.get("user-agent") ?? "-").slice(0, 50)}"`);
  res.type("html").send(macInstallPageHTML({
    base: siteBaseUrl(),
    version: appConfig.get("latest_mac_version") || process.env.MAC_APP_VERSION || "1.0",
    lang: requestLang(req),
  }));
});

app.get("/v1/downloads/mac", async (_req, res) => {
  try {
    // Bản Mac phát trực tiếp: file .zip (mặc định) hoặc .dmg nếu chủ shop đổi env.
    const macPath = process.env.MAC_APP_ZIP_PATH || process.env.MAC_DMG_PATH || "/root/flowvpn-mac/VPNFlow-mac.zip";
    if (!fs.existsSync(macPath)) {
      return res.status(404).send("Mac installer not found. Contact support@meetflowai.site");
    }
    res.download(macPath, path.basename(macPath));
  } catch (err) {
    res.status(500).json({ error: "Internal error" });
  }
});

app.get("/v1/downloads/android-legacy", async (_req, res) => {
  try {
    const apkDir = process.env.APK_DIR || "/root/flowvpn-apk";
    const apkPath = process.env.LEGACY_APK_PATH || path.join(apkDir, "VPNFlow-android7.apk");
    if (!fs.existsSync(apkPath)) {
      return res.status(404).send("Legacy APK not found. Contact support@meetflowai.site");
    }
    res.download(apkPath, "VPNFlow-android7.apk");
  } catch (err) {
    res.status(500).json({ error: "Internal error" });
  }
});

// PayOS IPN/webhook — auto-activate premium for the buyer's email.
app.post(["/v1/payments/webhook", "/v1/payments/payos-webhook"], async (req, res) => {
  try {
    const sig = req.get("x-webhook-signature") || req.get("signature") || "";
    const raw = JSON.stringify(req.body);
    const evt = verifyPayosWebhook(raw, sig);
    if (!evt) return res.status(400).json({ error: "Invalid webhook signature" });
    if (!evt.success) return res.json({ ok: true });

    // markPendingPaymentPaid (KHÔNG phải takePendingPayment): giữ lại đơn đã đánh dấu paid để
    // trang trạng thái và khách còn xem được — takePendingPayment xoá đơn nên khách cứ thấy "chờ".
    const pending = await authStore.markPendingPaymentPaid(evt.orderCode);
    if (!pending?.email) {
      console.warn("webhook: no pending payment for order", evt.orderCode);
      return res.json({ ok: true });
    }
    // Find/create the user by email, grant premium AND email an invoice.
    await activatePaymentAndInvoice({
      orderCode: evt.orderCode,
      email: pending.email,
      plan: pending.plan,
      prefix: "payos",
      amount: pending.amount ?? null,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("webhook failed:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

/**
 * SePay (IPN) — ngân hàng báo có tiền ⇒ tự xác nhận đơn.
 *
 * Nội dung chuyển khoản do VietQR sinh ra có tiền tố sản phẩm (`VPNFLOW-…` / `MEETFLOW-…`,
 * xem vietqr.js), nên ở đây khớp được đúng đơn. Chỉ tự kích hoạt khi tiền ĐỦ; thiếu tiền thì
 * để chủ shop xác nhận tay (alert cũ vẫn gửi) — thà chậm còn hơn cấp sai.
 */
/** Mã đơn có tồn tại trong hệ thống không (kể cả đã thanh toán) — để phân biệt "đã xử lý" với "lạc". */
async function orderKnown(orderCode, product) {
  if (!orderCode) return false;
  if (product !== "ai" && (await authStore.pendingPaymentByCode(orderCode))) return true;
  if (product !== "vpn" && (await aiStore.pendingPayment(orderCode))) return true;
  return false;
}

async function findPendingOrder({ orderCode, product }) {
  const wants = (p) => !product || product === p;
  if (wants("vpn")) {
    const order = await authStore.pendingPaymentByCode(orderCode);
    if (order && !order.paidAt) {
      return {
        product: "vpn",
        order,
        email: order.email,
        expectedAmount: order.amount ?? PLANS_PUBLIC[order.plan]?.amount ?? null,
      };
    }
  }
  if (wants("ai")) {
    const order = await aiStore.pendingPayment(orderCode);
    if (order && !order.paidAt) {
      return {
        product: "ai",
        order,
        email: order.email,
        expectedAmount: order.amount ?? AI_PLANS[order.plan]?.amount ?? null,
      };
    }
  }
  return null;
}

async function confirmPendingOrder(found, { method, txId }) {
  if (found.product === "ai") {
    const order = await aiStore.markPendingPaymentPaid(found.order.orderCode);
    if (!order) return null;
    return activateAiProAndInvoice({
      orderCode: order.orderCode,
      email: order.email,
      plan: order.plan,
      method: order.method ?? method,
      lang: order.lang,
    });
  }
  // Giữ lại đơn (đánh dấu paidAt) thay vì xoá: khách/chủ shop còn tra được tình trạng,
  // và webhook lặp sẽ thấy paidAt nên không cấp lần hai.
  const order = await authStore.markPendingPaymentPaid(found.order.orderCode);
  if (!order?.email) return null;
  console.log(`sepay: đơn ${order.orderCode} khớp giao dịch ${txId}`);
  return activatePaymentAndInvoice({
    orderCode: order.orderCode,
    email: order.email,
    plan: order.plan,
    prefix: method,
    amount: order.amount ?? null,
    lang: order.lang ?? null,
  });
}

/**
 * Ghi lại từng webhook ĐÃ XÁC THỰC kèm quyết định xử lý (JSON lines). Dùng để đối soát khi
 * webhook mất, và để biết tiền vào đã được kích hoạt hay chưa mà không phải dò journal.
 */
async function logSepayWebhook(payload, decision, extra = {}) {
  const line = JSON.stringify({
    at: new Date().toISOString(),
    decision,
    id: payload?.id ?? null,
    content: payload?.content ?? payload?.description ?? null,
    transferType: payload?.transferType ?? null,
    transferAmount: payload?.transferAmount ?? null,
    accountNumber: payload?.accountNumber ?? null,
    referenceCode: payload?.referenceCode ?? null,
    ...extra,
  });
  try {
    await fs.promises.appendFile(SEPAY_LOG_FILE, `${line}\n`, "utf8");
  } catch (err) {
    console.error("sepay log append failed:", err?.message ?? err);
  }
}

app.post(["/v1/payments/sepay-webhook", "/v1/payments/webhook/sepay"], async (req, res) => {
  try {
    const secret = process.env.SEPAY_WEBHOOK_SECRET || "";
    const apiKey = process.env.SEPAY_API_KEY || "";
    if (!secret && !apiKey) {
      console.warn("sepay: chưa cấu hình SEPAY_WEBHOOK_SECRET/SEPAY_API_KEY — từ chối webhook");
      return res.status(503).json({ success: false, error: "SePay chưa được cấu hình" });
    }

    const rawBody = req.rawBody ? req.rawBody.toString("utf8") : "";
    const signatureHeader = req.get("x-sepay-signature");
    const timestampHeader = req.get("x-sepay-timestamp");
    const signatureOk = secret
      ? verifySepaySignature({
        rawBody,
        signature: signatureHeader,
        timestamp: timestampHeader,
        secret,
      })
      : false;
    // Nếu request CÓ chữ ký thì chỉ chấp nhận chữ ký, không cho hạ cấp sang API Key/token URL:
    // token trong URL có thể lọt vào log, nếu vẫn nhận khi chữ ký sai thì HMAC coi như vô hiệu.
    const signedRequest = Boolean(signatureHeader ?? timestampHeader);
    const apiKeyOk = !signatureOk && !signedRequest && apiKey
      ? verifySepayApiKey({ authorization: req.get("authorization"), apiKey })
      : false;
    // Dự phòng cho chế độ "không xác thực" của SePay: token bí mật trong URL.
    const urlTokenOk = !signatureOk && !apiKeyOk && !signedRequest && process.env.SEPAY_URL_TOKEN
      ? verifySepayUrlToken({ token: req.query?.token, urlToken: process.env.SEPAY_URL_TOKEN })
      : false;
    if (!signatureOk && !apiKeyOk && !urlTokenOk) {
      console.warn(
        `sepay: xác thực thất bại (signature=${Boolean(signatureHeader)}, ` +
          `apiKey=${Boolean(req.get("authorization"))}, urlToken=${Boolean(req.query?.token)}, ` +
          `secretConfigured=${Boolean(secret)}, ` +
          (signedRequest && !secret ? "LÝ DO: request có chữ ký nhưng SEPAY_WEBHOOK_SECRET trống; " : "") +
          (signedRequest && secret ? "LÝ DO: chữ ký/timestamp không hợp lệ — KHÔNG hạ cấp sang token URL; " : "") +
          `ua="${String(req.get("user-agent") ?? "-").slice(0, 60)}")`,
      );
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const payload = req.body ?? {};
    const txId = payload.id ?? payload.referenceCode ?? "?";

    // Whitelist IP (tuỳ chọn): chỉ nhận request từ IP của SePay khi đã cấu hình SEPAY_IP_ALLOWLIST.
    const ipAllowed = clientIpAllowed({ ip: clientIPAddress(req), allowlist: process.env.SEPAY_IP_ALLOWLIST });
    if (!ipAllowed) {
      console.warn(`sepay: từ chối IP ${clientIPAddress(req)} (ngoài SEPAY_IP_ALLOWLIST) — tx ${txId}`);
      await logSepayWebhook(payload, "rejected-ip", { ip: clientIPAddress(req) });
      return res.status(403).json({ success: false, error: "Forbidden" });
    }

    if (!isIncomingTransfer(payload)) {
      console.log(`sepay: bỏ qua giao dịch ${txId} (transferType=${payload.transferType ?? "?"})`);
      await logSepayWebhook(payload, "skipped-not-incoming");
      return res.json({ success: true });
    }

    // Tiền phải vào ĐÚNG tài khoản nhận (SePay có thể theo dõi nhiều tài khoản).
    const ourAccounts = [bankQrConfig()?.accountNumber, momoQrConfig()?.accountNumber].filter(Boolean);
    if (!accountMatches({ payloadAccount: payload.accountNumber, expectedAccounts: ourAccounts })) {
      console.warn(
        `sepay: tx ${txId} tiền vào tài khoản ${payload.accountNumber} KHÔNG phải tài khoản nhận ` +
          `(${ourAccounts.join(", ") || "chưa cấu hình"}) — không tự kích hoạt`,
      );
      await fireUnmatchedAlert({
        amount: Number(payload.transferAmount ?? 0),
        content: payload.content ?? payload.description ?? "",
        txId,
        accountNumber: payload.accountNumber,
        reason: `tiền vào tài khoản ${payload.accountNumber}, không phải tài khoản nhận của shop`,
      });
      await logSepayWebhook(payload, "wrong-account", { ourAccounts });
      return res.json({ success: true });
    }

    const paid = Number(payload.transferAmount ?? 0);
    const ref = extractOrderRef({
      code: payload.code,
      content: payload.content ?? payload.description,
      // Số tài khoản nhận có thể nằm trong nội dung và trùng dạng 10 chữ số của mã đơn.
      ignoreCodes: [bankQrConfig()?.accountNumber, momoQrConfig()?.accountNumber].filter(Boolean),
    });
    if (!ref.orderCode) {
      console.warn(
        `sepay: giao dịch ${txId} ${paid}đ không có mã đơn trong nội dung ` +
          `"${String(payload.content ?? payload.description ?? "").slice(0, 80)}" — cần xác nhận tay`,
      );
      await fireUnmatchedAlert({
        amount: paid,
        content: payload.content ?? payload.description ?? "",
        txId,
        accountNumber: payload.accountNumber,
        reason: "không có mã đơn trong nội dung chuyển khoản",
      });
      await logSepayWebhook(payload, "no-order-code");
      return res.json({ success: true });
    }

    const found = await findPendingOrder(ref);
    if (!found) {
      // Đã xử lý rồi (webhook lặp) thì im lặng; còn mã đơn KHÔNG tồn tại trong hệ thống nghĩa là
      // tiền vào mà không gắn được với đơn nào (khách ghi sai/thiếu nội dung) ⇒ phải BÁO chủ shop,
      // nếu không thì tiền vào mà không ai biết (đã gặp thật 14/09: 5.000đ, nội dung chỉ có số TK).
      if (await orderKnown(ref.orderCode, ref.product)) {
        console.log(`sepay: đơn ${ref.orderCode} không còn chờ xác nhận (đã xử lý hoặc hết hạn)`);
        await logSepayWebhook(payload, "order-not-pending", { orderCode: ref.orderCode });
        return res.json({ success: true });
      }
      console.warn(
        `sepay: giao dịch ${txId} ${paid}đ không khớp đơn nào (mã đọc được: ${ref.orderCode}, ` +
          `qua ${ref.via ?? "?"}) — báo chủ shop xác nhận tay`,
      );
      await fireUnmatchedAlert({
        amount: paid,
        content: payload.content ?? payload.description ?? "",
        txId,
        accountNumber: payload.accountNumber,
        reason: `không khớp đơn nào trong hệ thống (mã đọc được: ${ref.orderCode})`,
      });
      await logSepayWebhook(payload, "no-order-code", { orderCode: ref.orderCode, via: ref.via });
      return res.json({ success: true });
    }

    if (!amountCovers(paid, found.expectedAmount)) {
      console.warn(
        `sepay: đơn ${ref.orderCode} chuyển ${paid}đ < cần ${found.expectedAmount}đ ` +
          `— KHÔNG tự kích hoạt, chờ chủ shop (tx ${txId})`,
      );
      await fireUnmatchedAlert({
        amount: paid,
        content: payload.content ?? payload.description ?? "",
        txId,
        accountNumber: payload.accountNumber,
        reason: `chuyển thiếu: đơn ${ref.orderCode} cần ${found.expectedAmount}đ`,
      });
      await logSepayWebhook(payload, "underpaid", { orderCode: ref.orderCode, expectedAmount: found.expectedAmount });
      return res.json({ success: true });
    }

    const activated = await confirmPendingOrder(found, { method: "sepay", txId });
    if (!activated) {
      console.warn(`sepay: đơn ${ref.orderCode} vừa được xử lý ở request khác (tx ${txId})`);
      await logSepayWebhook(payload, "duplicate", { orderCode: ref.orderCode });
      return res.json({ success: true });
    }
    console.log(
      `sepay: TỰ KÍCH HOẠT đơn ${ref.orderCode} (${found.product}, ${paid}đ, tx ${txId}, ` +
        `email ${found.email})`,
    );
    await logSepayWebhook(payload, "activated", {
      orderCode: ref.orderCode,
      product: found.product,
      email: found.email,
    });
    return res.json({ success: true, orderCode: ref.orderCode, product: found.product });
  } catch (err) {
    console.error("sepay webhook failed:", err);
    return res.status(500).json({ success: false, error: "Internal error" });
  }
});

/** Che bớt email khi hiển thị công khai: "minhfat@gmail.com" → "mi*****@gmail.com". */
function maskEmail(email) {
  const raw = String(email ?? "");
  const at = raw.indexOf("@");
  if (at <= 0) return "";
  const name = raw.slice(0, at);
  const keep = name.slice(0, Math.min(2, name.length));
  return `${keep}${"*".repeat(Math.max(3, name.length - keep.length))}${raw.slice(at)}`;
}

/**
 * Trang xem TÌNH TRẠNG CHUYỂN KHOẢN cho khách/chủ shop: /buy/status/<mã đơn>.
 * Không lộ email đầy đủ; tự cập nhật 10 giây một lần khi còn chờ tiền.
 */
app.get(["/buy/status/:orderCode", "/buy/check/:orderCode"], async (req, res) => {
  try {
    res.type("html");
    const order = await authStore.pendingPaymentByCode(req.params.orderCode);
    if (!order) {
      return res.status(404).send(orderStatusPageHTML({
        lang: pickBuyLang(req.query?.lang), orderCode: req.params.orderCode, found: false,
        product: "vpn", supportEmail: SUPPORT_EMAIL, buyUrl: `${publicBaseUrl()}/buy`,
      }));
    }
    res.send(orderStatusPageHTML({
      lang: pickBuyLang(req.query?.lang ?? order.lang),
      orderCode: order.orderCode,
      planLabel: planNameFor(pickBuyLang(req.query?.lang ?? order.lang), "vpn", order.plan),
      amount: order.amount ?? PLANS_PUBLIC[order.plan]?.amount ?? 0,
      paid: Boolean(order.paidAt),
      emailMasked: maskEmail(order.email),
      product: "vpn",
      supportEmail: SUPPORT_EMAIL,
      buyUrl: `${publicBaseUrl()}/buy`,
    }));
  } catch (err) {
    console.error("buy status page failed:", err);
    res.status(500).send("Internal error");
  }
});

app.get(["/ai/buy/status/:orderCode", "/ai/buy/check/:orderCode"], async (req, res) => {
  try {
    res.type("html");
    const order = await aiStore.pendingPayment(req.params.orderCode);
    if (!order) {
      return res.status(404).send(orderStatusPageHTML({
        lang: pickBuyLang(req.query?.lang), orderCode: req.params.orderCode, found: false,
        product: "ai", supportEmail: SUPPORT_EMAIL, buyUrl: `${publicBaseUrl()}/ai/buy`,
      }));
    }
    res.send(orderStatusPageHTML({
      lang: pickBuyLang(req.query?.lang ?? order.lang),
      orderCode: order.orderCode,
      planLabel: planNameFor(pickBuyLang(req.query?.lang ?? order.lang), "ai", order.plan),
      amount: order.amount ?? AI_PLANS[order.plan]?.amount ?? 0,
      paid: Boolean(order.paidAt),
      emailMasked: maskEmail(order.email),
      product: "ai",
      supportEmail: SUPPORT_EMAIL,
      buyUrl: `${publicBaseUrl()}/ai/buy`,
    }));
  } catch (err) {
    console.error("ai buy status page failed:", err);
    res.status(500).send("Internal error");
  }
});

// Payment status (public poll) — tells the buy page whether the order was paid.
app.get("/v1/payments/status/:orderCode", async (req, res) => {
  try {
    const order = await authStore.pendingPaymentByCode(req.params.orderCode);
    if (!order) return res.json({ paid: false, elapsed_sec: 0 });
    if (order.paidAt) return res.json({ paid: true, orderCode: order.orderCode });
    const elapsed = Math.max(0, Math.floor((Date.now() - Date.parse(order.createdAt)) / 1000));
    res.json({ paid: false, elapsed_sec: elapsed });
  } catch {
    res.json({ paid: false, elapsed_sec: 0 });
  }
});

// Admin: list pending (unpaid) payment orders, for manual bank-QR confirmation.
app.get("/v1/admin/payments/pending", requireAdminAuth, async (_req, res) => {
  try {
    const orders = await authStore.listPendingPayments();
    const enriched = [];
    for (const o of orders) {
      const planCfg = PLANS_PUBLIC[o.plan] ?? null;
      let activatedAt = null;
      let expiresAt = null;
      if (o.paidAt) {
        activatedAt = o.paidAt;
        const sub = await authStore.subscriptionForUserEmail(o.email);
        if (sub) expiresAt = sub.expiresAt;
      }
      enriched.push({
        orderCode: o.orderCode,
        email: o.email,
        plan: o.plan,
        plan_label: planCfg ? planCfg.label : o.plan,
        amount: planCfg ? planCfg.amount : null,
        days: planCfg ? planCfg.days : null,
        method: o.method ?? "payos",
        createdAt: o.createdAt,
        paid: Boolean(o.paidAt),
        activatedAt,
        expiresAt,
      });
    }
    res.json({ orders: enriched });
  } catch (err) {
    res.status(500).json({ error: "Internal error" });
  }
});

// Admin: mark a bank-QR order as paid (manual confirmation after checking
// the bank app for the matching transfer note). Grants premium immediately.
app.post("/v1/admin/payments/:orderCode/confirm", requireAdminAuth, async (req, res) => {
  try {
    // Mark paid (keeps the order so /status can report paid=true), then grant.
    const order = await authStore.markPendingPaymentPaid(req.params.orderCode);
    if (!order) return res.status(404).json({ error: "Order not found or already paid" });
    await activatePaymentAndInvoice({
      orderCode: order.orderCode,
      email: order.email,
      plan: order.plan,
      // Giữ đúng kênh khách đã dùng (wechat/alipay/momo/bankqr) để bản ghi gói nói đúng sự thật.
      prefix: order.method || "bankqr",
      confirmedBy: "manual",
      lang: order.lang ?? (await authStore.langForEmail(order.email)),
      amount: order.amount ?? null,
    });
    res.json({ ok: true, email: order.email });
  } catch (err) {
    res.status(500).json({ error: "Internal error" });
  }
});

// Admin: xoá một đơn CHƯA thanh toán (dọn đơn rác/khách bỏ ngang). Đơn đã trả
// tiền KHÔNG xoá được (409) — còn phải đối soát và trang trạng thái phải tiếp
// tục báo "đã trả tiền" cho khách. 404 khi không có đơn; 401 do requireAdminAuth.
app.delete("/v1/admin/payments/:orderCode", requireAdminAuth, async (req, res) => {
  try {
    const result = await authStore.deletePendingPayment(req.params.orderCode);
    if (!result.ok) {
      if (result.reason === "not_found") {
        return res.status(404).json({ error: "Không tìm thấy đơn" });
      }
      return res.status(409).json({ error: "Đơn đã thanh toán/kích hoạt nên không thể xoá" });
    }
    // Chỉ log mã đơn + trạng thái; KHÔNG log email/token/secret.
    console.log(`admin payments: deleted order ${result.order.orderCode} (status=unpaid)`);
    res.json({ ok: true, orderCode: result.order.orderCode });
  } catch (err) {
    console.error("DELETE /v1/admin/payments/:orderCode failed:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

// Admin: xoá TẤT CẢ đơn chưa thanh toán (nút dọn nhanh trên dashboard).
app.delete("/v1/admin/payments", requireAdminAuth, async (_req, res) => {
  try {
    const { removed } = await authStore.deleteUnpaidPendingPayments();
    console.log(`admin payments: deleted ${removed} unpaid order(s)`);
    res.json({ ok: true, removed });
  } catch (err) {
    console.error("DELETE /v1/admin/payments failed:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

// Admin: gửi email nhắc chuyển tiền cho đơn CHƯA thanh toán. Cooldown 24h/đơn,
// tối đa 50 đơn/lần. `?dry=1` (hoặc body {dry:true}) = chạy thử, KHÔNG gửi thật.
// body {orderCode} = chỉ nhắc đúng một đơn (nút nhắc riêng từng dòng).
app.post("/v1/admin/payments/remind", requireAdminAuth, async (req, res) => {
  try {
    const dry = req.query?.dry === "1" || req.query?.dry === "true" || req.body?.dry === true;
    const onlyOrderCode = req.body?.orderCode ?? null;
    const result = await runPaymentReminders({
      store: authStore,
      dry,
      onlyOrderCode,
      sendReminder: async ({ email, lang, orderCode, plan, amount, buyUrl }) =>
        sendPaymentReminderEmail({
          to: email,
          lang,
          orderCode,
          planLabel: planNameFor(pickMailLang(lang), "vpn", plan),
          amount,
          buyUrl,
        }),
      buildBuyUrl: ({ email, plan, lang }) =>
        `${(process.env.EMAIL_SITE_URL || "https://t1.meetflowai.site")}/buy?lang=${lang}&email=${encodeURIComponent(email)}&plan=${encodeURIComponent(plan ?? "monthly")}`,
      langForEmail: (email) => authStore.langForEmail(email),
    });
    console.log(
      `admin payments: remind${dry ? " (dry-run)" : ""} sent=${result.sent} skipped=${result.skipped} failed=${result.failed}`,
    );
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("POST /v1/admin/payments/remind failed:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

/* =====================================================================
 * Admin — bảng gói bán (giá / thời hạn / nhãn), sửa không cần deploy.
 * Mọi thay đổi đi qua PlanStore (data/plans.json) và được nạp lại vào bảng
 * đang chạy qua onChange -> trang /buy và tạo order dùng ngay giá mới.
 *
 * Retire chứ KHÔNG xoá: đơn cũ, hoá đơn và danh sách chờ xác nhận vẫn phải tra
 * ra tên gói (xem comment của gói lifetime trong payments.js).
 * ================================================================== */

app.get("/v1/admin/plans", requireAdminAuth, (_req, res) => {
  res.json({ plans: planStore.all() });
});

app.post("/v1/admin/plans", requireAdminAuth, (req, res) => {
  try {
    const plan = planStore.create(req.body ?? {});
    console.log(`admin plans: created ${plan.id} (${plan.amount} VND / ${plan.days ?? "lifetime"})`);
    res.status(201).json({ ok: true, plan });
  } catch (err) {
    res.status(err.statusCode ?? 500).json({ error: err.statusCode ? err.message : "Internal error" });
  }
});

app.patch("/v1/admin/plans/:id", requireAdminAuth, (req, res) => {
  try {
    const plan = planStore.update(req.params.id, req.body ?? {});
    console.log(`admin plans: updated ${plan.id} (${plan.amount} VND / ${plan.days ?? "lifetime"}, retired=${plan.retired === true})`);
    res.json({ ok: true, plan });
  } catch (err) {
    res.status(err.statusCode ?? 500).json({ error: err.statusCode ? err.message : "Internal error" });
  }
});

// Ngừng bán một gói (không xoá — xem khối comment phía trên).
app.post("/v1/admin/plans/:id/retire", requireAdminAuth, (req, res) => {
  try {
    const plan = planStore.retire(req.params.id);
    console.log(`admin plans: retired ${plan.id} (vẫn giữ tên gói cho đơn cũ)`);
    res.json({ ok: true, plan });
  } catch (err) {
    res.status(err.statusCode ?? 500).json({ error: err.statusCode ? err.message : "Internal error" });
  }
});

// Signed one-click confirm link for the owner's email alert. HMAC over the
// order code using AUTH_TOKEN as the secret (fallback: a static env secret).
app.get("/v1/payments/confirm/:orderCode", async (req, res) => {
  try {
    const orderCode = req.params.orderCode;
    const sig = req.query.t || "";
    const expected = paymentConfirmSignature(orderCode);
    if (sig !== expected) return res.status(403).send("Link không hợp lệ hoặc đã hết hạn.");
    const order = await authStore.markPendingPaymentPaid(orderCode);
    if (!order) return res.status(404).send("Đơn không tồn tại hoặc đã xác nhận.");
    await activatePaymentAndInvoice({
      orderCode: order.orderCode,
      email: order.email,
      plan: order.plan,
      // Giữ đúng kênh khách đã dùng (wechat/alipay/momo/bankqr) để bản ghi gói nói đúng sự thật.
      prefix: order.method || "bankqr",
      confirmedBy: "manual",
      lang: order.lang ?? (await authStore.langForEmail(order.email)),
      amount: order.amount ?? null,
    });
    res.type("html").send(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Đã xác nhận</title><style>body{min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:-apple-system,Segoe UI,sans-serif;color:#fff;background:linear-gradient(180deg,#051525,#0a1f3a)}.c{max-width:420px;padding:32px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:18px;text-align:center}.ok{font-size:48px;color:#33c773}h1{font-size:20px;margin:10px 0}p{color:rgba(255,255,255,.6);font-size:14px}</style></head><body><div class="c"><div class="ok">✅</div><h1>Đã xác nhận thanh toán</h1><p>Premium đã kích hoạt cho <b>${order.email}</b>.</p></div></body></html>`);
  } catch (err) {
    console.error("confirm-link failed:", err);
    res.status(500).send("Lỗi xác nhận. Liên hệ support@meetflowai.site");
  }
});

function paymentConfirmSignature(orderCode) {
  const secret = process.env.CONFIRM_SECRET || AUTH_TOKEN || "vpnflow-confirm";
  return crypto.createHmac("sha256", secret).update(String(orderCode)).digest("hex").slice(0, 32);
}

/**
 * Grants premium for a completed payment order and emails the customer an
 * invoice. Shared by all confirm paths (admin button, email confirm link,
 * PayOS webhook). `planCfg` = PLANS_PUBLIC entry (may be null -> monthly).
 */
async function activatePaymentAndInvoice({
  orderCode,
  email,
  plan,
  prefix = "bankqr",
  lang,
  amount = null,
  confirmedBy = "sepay",
}) {
  const planCfg = PLANS_PUBLIC[plan] ?? PLANS_PUBLIC.monthly;
  // The price recorded with the order wins (price changes must not silently
  // re-price an order the customer already paid against).
  const billedAmount = Number.isFinite(Number(amount)) && Number(amount) > 0 ? Number(amount) : planCfg.amount;
  if (Number(amount) > 0 && Number(amount) !== planCfg.amount) {
    console.log(
      `invoice: order ${orderCode} billed at the price frozen with the order ` +
        `(${billedAmount}) instead of the current ${planCfg.amount}`,
    );
  }
  const user = await authStore.ensureUserByEmail(email);
  await authStore.grantSubscription(user.id, { productId: `${prefix}.${plan}`, days: planCfg.days });
  // Fresh subscription record for accurate expiry (grant returns publicUser but
  // we can re-read via subscriptionForUserEmail to include expiresAt).
  const sub = await authStore.subscriptionForUserEmail(email);
  // Deep link: opens the installed VPNFlow app (universal/app link via
  // meetflowai.site/open); falls back to the web page when not installed.
  const appUrl = "https://meetflowai.site/open";
  const invoiceResult = await sendInvoiceEmail({
    to: email,
    orderCode,
    planLabel: planNameFor(pickMailLang(lang), "vpn", plan),
    amount: billedAmount,
    days: planCfg.days,
    activatedAt: new Date().toISOString(),
    expiresAt: sub?.expiresAt ?? null,
    appUrl,
    guideUrl: `${siteBaseUrl()}/guide`,
    lang,
  });
  console.log(
    `invoice: ${prefix}.${plan} granted to ${email} (order ${orderCode}) mailSent=${invoiceResult?.sent === true}`,
  );
  // Báo Telegram: hoá đơn đã xác nhận cho khách (kèm cảnh báo nếu email KHÔNG gửi được —
  // khách đã trả tiền mà không nhận được xác nhận là ca cần người xử lý).
  await sendAlert(invoiceConfirmedAlert({
    orderCode,
    email,
    plan: planNameFor(pickMailLang(lang), "vpn", plan),
    amount: billedAmount,
    days: planCfg.days,
    expiresAt: sub?.expiresAt ?? null,
    mailSent: invoiceResult?.sent === true,
    product: prefix === "ai" ? "MeetFlow AI Pro" : "VPNFlow Premium",
  }));
  // Chủ shop chỉ cần được BÁO là đơn đã trả tiền — không cần bấm gì.
  await firePaidAlert(orderCode, email, plan, billedAmount, prefix, "VPNFlow Premium", confirmedBy);
  return user;
}

/**
 * "Where did this customer actually pay?" — the owner's alert has to answer that
 * at a glance: opening the wrong app (or the wrong bank account) is how a real
 * transfer gets missed. Labels are Vietnamese because the alert goes to the shop
 * owner, with the Chinese app names kept for the two CN channels.
 */
function paymentMethodInfo(method, { amountVnd = 0, cny = null } = {}) {
  const bankAccount = process.env.BANK_QR_ACCOUNT || "57222538888";
  const bankName = process.env.BANK_QR_NAME || "TPBank";
  const momoAccount = process.env.MOMO_QR_ACCOUNT || "ví MoMo";
  const amountText = `${Number(amountVnd || 0).toLocaleString("vi-VN")} đ`;
  const cnyText = cny?.amount ? `¥${cny.amount} (≈ ${amountText})` : amountText;
  const map = {
    bankqr: {
      short: "Chuyển khoản ngân hàng",
      label: `🏦 Chuyển khoản ngân hàng (VietQR · ${bankName})`,
      where: `Mở app ngân hàng (${bankName}) → xem biến động số dư / lịch sử giao dịch của tài khoản nhận tiền`,
      account: `${bankName} · ${bankAccount}`,
      expected: amountText,
    },
    momo: {
      short: "MoMo",
      label: "📱 MoMo (QR động)",
      where: "Mở app MoMo → Lịch sử giao dịch (hoặc thông báo nhận tiền) của ví nhận",
      account: `MoMo · ${momoAccount}`,
      expected: amountText,
    },
    wechat: {
      short: "WeChat Pay",
      label: "💬 WeChat Pay (微信支付)",
      where: "Mở WeChat → 我 (Tôi) → 服务 → 钱包 → 账单 (Lịch sử giao dịch), lọc theo ngày hôm nay",
      account: "Ví WeChat nhận tiền (mã QR cá nhân)",
      expected: cnyText,
    },
    alipay: {
      short: "Alipay",
      label: "🅰️ Alipay (支付宝)",
      where: "Mở Alipay → 我的 (Của tôi) → 账单 (Lịch sử giao dịch), lọc theo ngày hôm nay",
      account: "Ví Alipay nhận tiền (mã QR cá nhân)",
      expected: cnyText,
    },
    payos: {
      short: "PayOS",
      label: "💳 Cổng thanh toán PayOS (MoMo/QR/thẻ)",
      where: "Mở dashboard PayOS → Giao dịch (đơn này thường tự xác nhận qua webhook)",
      account: "PayOS",
      expected: amountText,
    },
  };
  const key = String(method ?? "").toLowerCase();
  return map[key] ?? {
    short: key || "không rõ",
    label: `❔ Kênh thanh toán: ${key || "không rõ"}`,
    where: "Kiểm tra tất cả kênh nhận tiền (ngân hàng, MoMo, WeChat, Alipay)",
    account: null,
    expected: amountText,
  };
}

/** CNY figure for a WeChat/Alipay order (null for the other methods). */
async function cnyAmountForMethod(amount, method) {
  const m = String(method ?? "").toLowerCase();
  if (m !== "wechat" && m !== "alipay") return null;
  const { rate, source } = await vndPerCny();
  return { amount: cnyFromVnd(amount, rate), rate: Math.round(rate), source };
}

/**
 * Báo chủ shop là **đơn đã được thanh toán** (webhook tự xác nhận) — không kèm nút xác nhận.
 * Gửi cho cả 3 đường vào tiền: webhook SePay, webhook PayOS và xác nhận tay trên dashboard.
 */
async function firePaidAlert(orderCode, email, plan, amount, method = null, product = "VPNFlow Premium", confirmedBy = "sepay") {
  const owner = process.env.OWNER_ALERT_EMAIL || "minhnb2@me.com";
  const methodInfo = paymentMethodInfo(method, { amountVnd: amount });
  try {
    const r = await sendPaidAlert({
      to: owner,
      orderCode,
      buyerEmail: email,
      plan,
      amount,
      methodInfo,
      product,
      confirmedBy,
      paidAt: new Date().toISOString(),
      statusUrl: `${siteBaseUrl()}${product === "MeetFlow AI Pro" ? "/ai/buy/status/" : "/buy/status/"}${orderCode}`,
    });
    console.log(`paid-alert order ${orderCode} to ${owner}: sent=${r?.sent}`);
  } catch (err) {
    console.error("firePaidAlert failed:", err);
  }
  // Song song email: bắn Telegram để chủ shop biết ngay trên điện thoại. Không chờ kết quả
  // và không để lỗi alert ảnh hưởng luồng kích hoạt đơn (sendAlert tự bắt mọi lỗi).
  await sendAlert({
    title: "Đơn đã thanh toán",
    level: "ok",
    lines: [
      `Mã đơn: ${orderCode}`,
      `Khách: ${email || "(không có email)"}`,
      `Gói: ${plan}${amount ? ` — ${Number(amount).toLocaleString("vi-VN")}đ` : ""}`,
      `Kênh: ${product} (${confirmedBy})`,
    ],
  });
}

/** Báo chủ shop: tiền vào nhưng không khớp đơn (email duy nhất cần người xử lý). */
async function fireUnmatchedAlert({ amount, content, txId, accountNumber, reason }) {
  const owner = process.env.OWNER_ALERT_EMAIL || "minhnb2@me.com";
  try {
    const r = await sendUnmatchedTransferAlert({
      to: owner,
      amount,
      content,
      txId,
      accountNumber,
      reason,
      dashboardUrl: `${publicBaseUrl()}/admin`,
    });
    console.log(`unmatched-alert tx ${txId} to ${owner}: sent=${r?.sent}`);
  } catch (err) {
    console.error("fireUnmatchedAlert failed:", err);
  }  // Tiền vào mà không khớp đơn là ca DUY NHẤT cần người xử lý tay ⇒ báo cả Telegram.
  await sendAlert({
    title: "Tiền vào nhưng không khớp đơn",
    level: "warn",
    lines: [
      `Số tiền: ${amount ? `${Number(amount).toLocaleString("vi-VN")}đ` : "(không rõ)"}`,
      `Nội dung CK: ${content || "(trống)"}`,
      txId ? `Mã giao dịch: ${txId}` : null,
      accountNumber ? `TK nhận: ${accountNumber}` : null,
      `Lý do: ${reason || "không khớp đơn nào"}`,
    ],
  });
}

/**
 * Email "có đơn mới" lúc TẠO đơn: mặc định TẮT, vì SePay (chuyển khoản TPBank) và PayOS đều tự
 * xác nhận tiền về rồi báo "đã thanh toán" — chủ shop không cần đọc email xác nhận tay nữa.
 * Riêng WeChat/Alipay là QR cá nhân, KHÔNG có webhook nào theo dõi, nên vẫn phải báo để kịp
 * đối chiếu. Bật lại cho mọi kênh bằng OWNER_ALERT_ON_CREATE=1.
 */
const MANUAL_CHANNELS = new Set(["wechat", "alipay"]);
function shouldAlertOnCreate(method) {
  return process.env.OWNER_ALERT_ON_CREATE === "1" || MANUAL_CHANNELS.has(method);
}

async function firePaymentAlert(orderCode, email, plan, amount, method = null) {
  const owner = process.env.OWNER_ALERT_EMAIL || "minhnb2@me.com";
  const base = process.env.PUBLIC_BASE_URL || "https://api.meetflowai.site";
  const sig = paymentConfirmSignature(orderCode);
  const confirmUrl = `${base}/v1/payments/confirm/${orderCode}?t=${sig}`;
  // WeChat/Alipay are settled in CNY — tell the owner the figure to look for.
  const cny = await cnyAmountForMethod(amount, method).catch(() => null);
  const methodInfo = paymentMethodInfo(method, { amountVnd: amount, cny });
  try {
    // Chủ shop mở link này để biết tiền đã về chưa (trang tự cập nhật 10 giây/lần).
    const statusUrl = `${siteBaseUrl()}/buy/status/${orderCode}`;
    const r = await sendPaymentAlert({
      to: owner, orderCode, buyerEmail: email, plan, amount, confirmUrl, statusUrl, cny, method, methodInfo,
    });
    console.log(`payment-alert order ${orderCode} to ${owner}: sent=${r?.sent}`);
  } catch (err) {
    console.error("firePaymentAlert failed:", err);
  }
}

/**
 * Customer-facing site base (used for links inside emails: buy page, guides).
 * Points at the pretty domain, not the api subdomain — better deliverability
 * and more trustworthy for the customer.
 */
function siteBaseUrl() {
  return (process.env.PUBLIC_SITE_URL || "https://meetflowai.site").replace(/\/$/, "");
}

// Public base URL helper (for PayOS return/cancel URLs).
function publicBaseUrl() {
  return process.env.PUBLIC_BASE_URL || "https://api.meetflowai.site";
}

app.post("/v1/auth/email/start", async (req, res) => {
  try {
    // DEV_LOGIN_CODE pins the code for the dev/review allowlist so a reviewer
    // who cannot read the mailbox can still sign in with the documented code.
    const requestedEmail = String(req.body?.email ?? "").trim().toLowerCase();
    const isAllowlisted = DEBUG_CODE_EMAILS.has(requestedEmail);
    const login = await authStore.startEmailLogin(req.body?.email, {
      fixedCode: isAllowlisted ? DEV_LOGIN_CODE || undefined : undefined,
      skipRateLimit: isAllowlisted,
    });
    // The apps send their UI language so the code arrives localized.
    const lang = pickMailLang(req.body?.lang);
    await authStore.rememberLangForEmail(login.email, lang);
    const isDevCodeAccount = !IS_PRODUCTION || DEBUG_CODE_EMAILS.has(login.email);
    let mail = { sent: false };
    try {
      mail = await sendOtpEmail({ email: login.email, code: login.code, lang });
    } catch (err) {
      // A delivery failure must never lock out an account that gets the code
      // in-app (App Review demo account / owner): still return the code.
      // Real customers keep failing loudly so nobody is stuck without a code.
      if (!isDevCodeAccount) throw err;
      console.error(`OTP email delivery failed for dev-code account ${login.email}:`, err?.message ?? err);
    }
    const body = { ok: true };
    if (isDevCodeAccount) {
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
      // Re-read so the session the app stores already shows Premium active
      // (the payload above was built before the grant).
      const fresh = await authStore.sessionPayloadForToken(session.access_token);
      if (fresh) return res.status(201).json(fresh);
    }
    res.status(201).json(session);
  } catch (err) {
    res.status(err.statusCode ?? 500).json({ error: err.statusCode ? err.message : "Internal error" });
  }
});

/**
 * GET /v1/auth/session — đọc lại session của chính caller, để app thấy thay đổi
 * quyền Premium MÀ KHÔNG phải đăng xuất/đăng nhập lại.
 *
 * Vì sao cần route này: chỉ ba route đăng nhập (email/start, email/verify, apple)
 * trả về session, nên `subscription_status` tới client ĐÚNG MỘT LẦN lúc đăng nhập
 * và app buộc phải cache nó. Hệ quả thật: khách trả tiền trên web, admin xác nhận
 * cấp gói, nhưng app vẫn báo "chưa mua" cho tới khi họ đăng xuất rồi đăng nhập lại.
 * Với mô hình bán hoàn toàn qua backend thì đó là lỗ chặn bán hàng, không phải
 * chuyện tiện nghi.
 *
 * Helper `authStore.sessionPayloadForToken()` đã có sẵn (trước đây chỉ được gọi
 * trong /v1/auth/email/verify) và trả về ĐÚNG dạng payload như lúc đăng nhập, nên
 * client decode bằng đúng kiểu dữ liệu sẵn có, không cần thêm định dạng mới.
 */
app.get("/v1/auth/session", requireUserAuth, async (req, res) => {
  try {
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
    const payload = await authStore.sessionPayloadForToken(token);
    if (!payload) {
      return res.status(401).json({ error: "Unauthorized", message: "Valid user session required" });
    }
    res.json(payload);
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
app.get(["/admin/nodes", "/v1/admin/nodes"], requireAdminAuth, async (_req, res) => {
  try {
    const nodes = await nodeStore.all();
    res.json({ count: nodes.length, nodes: nodes.map(adminNode) });
  } catch (err) {
    console.error("GET /admin/nodes failed:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

app.post(["/admin/nodes", "/v1/admin/nodes"], requireAdminAuth, async (req, res) => {
  try {
    const node = await nodeStore.create(req.body ?? {});
    res.status(201).json({ node: adminNode(node) });
  } catch (err) {
    res.status(err.statusCode ?? 500).json({ error: err.statusCode ? err.message : "Internal error" });
  }
});

app.get(["/admin/nodes/:id", "/v1/admin/nodes/:id"], requireAdminAuth, async (req, res) => {
  const node = await nodeStore.findById(req.params.id);
  if (!node) return res.status(404).json({ error: "Not found" });
  res.json({ node: adminNode(node) });
});

app.patch(["/admin/nodes/:id", "/v1/admin/nodes/:id"], requireAdminAuth, async (req, res) => {
  try {
    const node = await nodeStore.update(req.params.id, req.body ?? {});
    if (!node) return res.status(404).json({ error: "Not found" });
    res.json({ node: adminNode(node) });
  } catch (err) {
    res.status(err.statusCode ?? 500).json({ error: err.statusCode ? err.message : "Internal error" });
  }
});

app.delete(["/admin/nodes/:id", "/v1/admin/nodes/:id"], requireAdminAuth, async (req, res) => {
  try {
    // ?hard=1 xóa hẳn record (dọn node test); mặc định disable (giữ lịch sử)
    const node = req.query.hard === "1"
      ? await nodeStore.delete(req.params.id)
      : await nodeStore.disable(req.params.id);
    if (!node) return res.status(404).json({ error: "Not found" });
    res.json({ node: adminNode(node), hard: req.query.hard === "1" });
  } catch (err) {
    res.status(err.statusCode ?? 500).json({ error: err.statusCode ? err.message : "Internal error" });
  }
});

// Health of a single exit node (admin): latency (ping), bandwidth (wg transfer,
// coordinator-local node only), capability (wg interface up, peer count, uptime, load).
app.get("/v1/admin/nodes/:id/health", requireAdminAuth, async (req, res) => {
  try {
    const node = await nodeStore.findById(req.params.id);
    if (!node) {
      return res.status(404).json({ error: "Not found" });
    }
    const host = String(node.endpoint).split(":").shift() || "";
    const [ping, wgTransfer, wgPeers] = await Promise.all([
      measureLatency(host),
      wgTransferBytes(),
      wgPeerCount(),
    ]);
    res.json({
      node_id: node.id,
      endpoint: node.endpoint,
      reachable: ping.ok,
      latency_ms: ping.ok ? ping.ms : null,
      bandwidth: wgTransfer, // { rx_bytes, tx_bytes } or null (coordinator-local wg0 only)
      capability: {
        wg_interface: WG_INTERFACE,
        wg_interface_up: wgTransfer !== null,
        peers: wgPeers,
        uptime_s: Math.floor(os.uptime()),
        load_avg: os.loadavg().map((v) => Number(v.toFixed(2))),
      },
    });
  } catch (err) {
    console.error("GET /v1/admin/nodes/:id/health failed:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

// User administration (admin, Bearer AUTH_TOKEN): list users + subscription
// status, grant a test subscription, revoke a user (kills their sessions).
// App version (force-update): public for the apps, admin GET/PATCH to manage.
// iOS (App Store) và Android (APK sideload) là hai kênh riêng — handler chọn kênh
// theo `?platform=` rồi tới User-Agent, xem `app-version.js`.
app.get("/v1/app-version", (req, res) => {
  res.json(versionPayloadFor(req, { read: (key) => appConfig.get(key), baseUrl: siteBaseUrl() }));
});

/** Kênh phát hành Android (APK sideload) — admin xem/sửa ngưỡng ép cập nhật. */
function vpnAndroidVersion() {
  return versionPayloadFor(
    { query: { platform: "android" } },
    { read: (key) => appConfig.get(key), baseUrl: siteBaseUrl() },
  );
}

app.get("/v1/admin/android-version", requireAdminAuth, (_req, res) => {
  res.json(vpnAndroidVersion());
});

app.patch("/v1/admin/android-version", requireAdminAuth, (req, res) => {
  const { latest_version, minimum_version, apk_url, apk_url_legacy } = req.body ?? {};
  if (latest_version !== undefined) appConfig.set("android_latest_version", latest_version);
  if (minimum_version !== undefined) appConfig.set("android_minimum_version", minimum_version);
  if (apk_url !== undefined) appConfig.set("android_apk_url", apk_url);
  if (apk_url_legacy !== undefined) appConfig.set("android_apk_url_legacy", apk_url_legacy);
  res.json(vpnAndroidVersion());
});

/** Kênh phát hành Windows (bộ cài Inno Setup) — admin xem/sửa ngưỡng ép cập nhật. */
function vpnWindowsVersion() {
  return versionPayloadFor(
    { query: { platform: "windows" } },
    { read: (key) => appConfig.get(key), baseUrl: siteBaseUrl() },
  );
}

app.get("/v1/admin/windows-version", requireAdminAuth, (_req, res) => {
  res.json(vpnWindowsVersion());
});

app.patch("/v1/admin/windows-version", requireAdminAuth, (req, res) => {
  const { latest_version, minimum_version, installer_url } = req.body ?? {};
  if (latest_version !== undefined) appConfig.set("windows_latest_version", latest_version);
  if (minimum_version !== undefined) appConfig.set("windows_minimum_version", minimum_version);
  if (installer_url !== undefined) appConfig.set("windows_installer_url", installer_url);
  res.json(vpnWindowsVersion());
});

/**
 * Alert tự động (Telegram) — admin xem kênh đang bật và bắn tin.
 *
 * GET  /v1/admin/alert         → { telegram, telegramChatId, email } (KHÔNG có token)
 * POST /v1/admin/alert {title, lines|message, level} → gửi 1 tin (dùng cho tin thử + cập nhật tiến độ)
 */
app.get("/v1/admin/alert", requireAdminAuth, (_req, res) => {
  const times = parseReportTimes(process.env.ALERT_REPORT_TIMES ?? "08:00,20:00");
  res.json({
    ...alertChannels(),
    reportTimes: times.map((t) => t.label),
    reportEnabled: process.env.ALERT_REPORT !== "0",
    lastReportAt: appConfig.get("alert_report_last_at") ?? null,
  });
});

/**
 * Đọc nội dung báo cáo mà KHÔNG gửi đi — bot Telegram dùng để trả lời /status, /devices
 * ngay trong chat (nếu gọi POST /v1/admin/alert/report thì tin sẽ bắn 2 lần).
 */
app.get("/v1/admin/report", requireAdminAuth, async (_req, res) => {
  try {
    const report = await buildStatusReport();
    res.json({ level: report.level, issues: report.issues, title: report.title, lines: report.lines });
  } catch (err) {
    console.error("GET /v1/admin/report failed:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

/** Bắn báo cáo ngay (không chờ mốc giờ) — dùng để kiểm tra đường gửi từ server. */
app.post("/v1/admin/alert/report", requireAdminAuth, async (_req, res) => {
  try {
    const result = await sendStatusReport({ reason: "admin" });
    res.status(result.sent ? 200 : 502).json({
      sent: result.sent,
      reason: result.reason ?? null,
      level: result.level,
      issues: result.issues,
      lines: result.lines,
      text: result.text,
    });
  } catch (err) {
    console.error("POST /v1/admin/alert/report failed:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

app.post("/v1/admin/alert", requireAdminAuth, async (req, res) => {
  const { title, lines, message, level } = req.body ?? {};
  const bodyLines = Array.isArray(lines)
    ? lines
    : (message ? String(message).split("\n") : []);
  const safeLevel = ["info", "ok", "warn", "error"].includes(level) ? level : "info";
  const result = await sendAlert({
    title: title || "Tin từ admin",
    lines: bodyLines,
    level: safeLevel,
  });
  res.status(result.sent ? 200 : 502).json({
    sent: result.sent,
    reason: result.reason ?? null,
    text: result.text,
    channels: alertChannels(),
  });
});

/**
 * GET /v1/admin/gfw — trạng thái health-watch chống chặn theo tên (SNI) cho admin page.
 *
 * Trả { hosts: [{host, state, lastChangeAt, lastProbe, samples}], updatedAt } để hiển thị
 * host nào đang bị chặn, từ lúc nào, và bằng chứng (DNS/TCP/TLS). Có requireAdminAuth như
 * mọi route admin khác; watcher có thể chưa chạy lần nào (server vừa bật) nên trả rỗng.
 */
app.get("/v1/admin/gfw", requireAdminAuth, (_req, res) => {
  res.json(gfwWatcher?.snapshot() ?? { hosts: [], updatedAt: null });
});

/** MeetFlow AI Android release channel (drives the in-app update gate). */
function aiAndroidVersion() {
  const base = siteBaseUrl();
  const apkUrl = appConfig.get("ai_android_apk_url") || `${base}/v1/ai/downloads/android`;
  return {
    platform: "android",
    latest_version_code: Number(appConfig.get("ai_android_latest_version_code") ?? 0),
    minimum_version_code: Number(appConfig.get("ai_android_minimum_version_code") ?? 0),
    latest_version_name: appConfig.get("ai_android_latest_version_name") || null,
    apk_url: apkUrl,
    notes: appConfig.get("ai_android_notes") || null,
  };
}

app.get("/v1/ai/app-version", (_req, res) => {
  res.json(aiAndroidVersion());
});

app.get("/v1/admin/ai/app-version", requireAdminAuth, (_req, res) => {
  res.json(aiAndroidVersion());
});

app.patch("/v1/admin/ai/app-version", requireAdminAuth, (req, res) => {
  const { latest_version_code, minimum_version_code, latest_version_name, apk_url, notes } = req.body ?? {};
  if (latest_version_code !== undefined) appConfig.set("ai_android_latest_version_code", latest_version_code);
  if (minimum_version_code !== undefined) appConfig.set("ai_android_minimum_version_code", minimum_version_code);
  if (latest_version_name !== undefined) appConfig.set("ai_android_latest_version_name", latest_version_name);
  if (apk_url !== undefined) appConfig.set("ai_android_apk_url", apk_url);
  if (notes !== undefined) appConfig.set("ai_android_notes", notes);
  res.json(aiAndroidVersion());
});

app.get("/v1/admin/app-version", requireAdminAuth, (_req, res) => {
  res.json({
    minimum_version: appConfig.get("minimum_ios_version"),
    latest_version: appConfig.get("latest_ios_version"),
    store_url: appConfig.get("app_store_url"),
    ipa_url: appConfig.get("ios_ipa_url"),
    ipa_build: appConfig.get("ios_ipa_build"),
    diawi_url: appConfig.get("ios_diawi_url"),
  });
});

app.patch("/v1/admin/app-version", requireAdminAuth, async (req, res) => {
  try {
    const { minimum_version, latest_version, store_url, ipa_url, ipa_build, diawi_url } = req.body ?? {};
    if (minimum_version !== undefined) appConfig.set("minimum_ios_version", minimum_version);
    if (latest_version !== undefined) appConfig.set("latest_ios_version", latest_version);
    if (store_url !== undefined) appConfig.set("app_store_url", store_url);
    // Link IPA phát cho khách (Diawi hoặc file của mình). Rỗng ⇒ quay về /v1/downloads/ios.
    if (ipa_url !== undefined) appConfig.set("ios_ipa_url", ipa_url);
    // Số build (CFBundleVersion) của IPA đang phát — manifest OTA phải ghi đúng số này.
    if (ipa_build !== undefined) appConfig.set("ios_ipa_build", ipa_build);
    // Link Diawi (kênh phụ, hiện trong khối "không cài được?" của trang /install/ios). Giữ riêng để
    // `ipa_url` luôn trỏ về trang đăng ký của mình — khách CHƯA đăng ký bấm thẳng Diawi sẽ lỗi.
    if (diawi_url !== undefined) appConfig.set("ios_diawi_url", diawi_url);
    res.json({
      minimum_version: appConfig.get("minimum_ios_version"),
      latest_version: appConfig.get("latest_ios_version"),
      store_url: appConfig.get("app_store_url"),
      ipa_url: appConfig.get("ios_ipa_url"),
      ipa_build: appConfig.get("ios_ipa_build"),
      diawi_url: appConfig.get("ios_diawi_url"),
    });
  } catch (err) {
    res.status(500).json({ error: "Internal error" });
  }
});

// Owner visibility (FR-ADMIN-001): dashboard statistics — device counts by
// platform/status, live wg peer count, thiết bị đang kết nối theo TỪNG exit node,
// và ISP/location hint của client (suy từ PTR của IP công khai trong wg endpoint).
app.get(["/v1/admin/stats", "/admin/stats"], requireAdminAuth, async (_req, res) => {
  try {
    const devices = await store.all();
    // Real devices only: those claimed by a real user account (devices with no
    // userId are probe/test/legacy registrations and are excluded from counts).
    const users = await authStore.listUsers();
    const emailById = new Map(users.map((u) => [u.id, u.email ?? u.id]));
    const realDevices = devices.filter((d) => d.userId);
    const testDevices = devices.filter((d) => !d.userId);

    const byPlatform = {};
    const byStatus = { active: 0, revoked: 0 };
    const byUser = {};        // userId -> { email, total, active, platforms:{} }
    for (const d of realDevices) {
      const plat = d.platform && d.platform !== "unknown" ? d.platform : "other";
      byPlatform[plat] = (byPlatform[plat] ?? 0) + 1;
      byStatus[d.active ? "active" : "revoked"] += 1;
      const uid = d.userId;
      if (!byUser[uid]) {
        byUser[uid] = { email: emailById.get(uid) ?? uid, total: 0, active: 0, platforms: {} };
      }
      byUser[uid].total += 1;
      if (d.active) byUser[uid].active += 1;
      byUser[uid].platforms[plat] = (byUser[uid].platforms[plat] ?? 0) + 1;
    }

    // Live peers: pull dump from every exit node (coordinator + remote nodes).
    // Giữ nguyên peer theo từng node (peersByNode) để dashboard vẽ được chart
    // "đang có bao nhiêu thiết bị kết nối vào mỗi server"; `peers` phẳng bên dưới
    // giữ nguyên cho các field cũ (dedup theo public key).
    const peers = [];
    const peersByNode = new Map();
    const nodeList = await nodeStore.all();
    const seen = new Set();
    for (const node of nodeList) {
      const mgr = wgForNode(node);
      const rows = await mgr.dump();
      peersByNode.set(node.id, rows);
      for (const row of rows) {
        if (seen.has(row.publicKey)) continue;
        seen.add(row.publicKey);
        peers.push(row);
      }
    }
    if (peers.length === 0) {
      const local = await wg.dump();
      // Fallback cũ: nodeStore không trả peer nào (vd node remote chưa cấu hình
      // SSH). Gắn dump local vào node coordinator (node không có ssh_target) để
      // chart theo server không bị trống.
      const coordinator = nodeList.find((n) => !n.ssh_target) ?? nodeList[0] ?? null;
      if (coordinator) peersByNode.set(coordinator.id, local);
      for (const row of local) {
        if (!seen.has(row.publicKey)) peers.push(row);
      }
    }

    const onlinePeers = peers.filter((p) => {
      if (!p.latestHandshakeSec) return false;
      return Date.now() / 1000 - p.latestHandshakeSec < 180; // < 3 min
    });

    // ISP/location hint cho IP công khai của client — tra PTR có cache, không
    // dùng API bên thứ ba. IP không có PTR sẽ hiện "unknown ISP" trên dashboard.
    const clientIPs = onlinePeers.map((p) => clientIPFromEndpoint(p.endpoint)).filter(Boolean);
    const ispByIP = await ptrLookup.lookupMany(clientIPs);
    const devicesByPublicKey = new Map(devices.map((d) => [d.publicKey, d]));
    const connections = aggregateConnections({ nodes: nodeList, peersByNode, devicesByPublicKey, ispByIP });
    const onlineDevicesLimit = 200;

    // Region buckets from the client endpoint's public IP (best-effort, no
    // external API — country code from IANA/ASN-lite mapping).
    const regionByIp = {};
    for (const p of onlinePeers) {
      const host = p.endpoint ? p.endpoint.split(":")[0] : null;
      if (!host) continue;
      regionByIp[host] = (regionByIp[host] ?? 0) + 1;
    }

    // ---- IP THẬT + VỊ TRÍ ---------------------------------------------------------------
    // `wg dump` chỉ cho endpoint của relay (thường là 127.0.0.1) nên IP thật lấy từ
    // `device.lastClientIp` — do chính app ghi lại mỗi lần kết nối (xem touchDeviceClientIp).
    // Vị trí/ISP tra offline từ bảng DB-IP Lite, có cache.
    const deviceById = new Map(devices.map((d) => [d.id, d]));
    const ipForDevice = new Map();
    const geoIps = new Set();
    for (const d of connections.online_devices) {
      const device = d.device_id ? deviceById.get(d.device_id) : null;
      const fromApi = device?.lastClientIp && isPublicIp(device.lastClientIp) ? device.lastClientIp : null;
      const fromWg = isPublicIp(d.client_ip) ? d.client_ip : null;
      const ip = fromApi ?? fromWg;
      if (!ip) continue;
      ipForDevice.set(d, {
        ip,
        source: fromApi ? "api" : "wg",
        at: fromApi ? device?.lastClientIpAt ?? device?.lastSeenAt ?? null : null,
      });
      geoIps.add(ip);
    }
    const geoByIp = await geoLookup.lookupMany([...geoIps]);
    const geoFor = (ip) => (ip ? geoByIp.get(ip) ?? null : null);

    const onlineDevices = connections.online_devices.slice(0, onlineDevicesLimit).map((d) => {
      const info = ipForDevice.get(d);
      const geo = geoFor(info?.ip);
      return {
        ...d,
        // `client_ip` = IP THẬT của máy khách; endpoint WireGuard giữ riêng để chẩn đoán.
        client_ip: info?.ip ?? null,
        client_ip_source: info?.source ?? null,
        client_ip_at: info?.at ?? null,
        wg_endpoint_ip: d.client_ip,
        isp: geo?.isp ?? d.isp,
        country: geo?.country ?? d.country,
        country_name: geo?.country_name ?? null,
        region: geo?.region ?? null,
        city: geo?.city ?? null,
        location: geo?.location ?? d.location ?? null,
        asn: geo?.asn ?? null,
        geo_source: geo?.source ?? null,
        user_email: d.user_id ? emailById.get(d.user_id) ?? d.user_id : null,
      };
    });

    // Chart "Online Devices by ISP" nay ưu tiên VỊ TRÍ (thành phố/quốc gia), chỉ rơi về ISP
    // khi bảng GeoIP không có dữ liệu cho IP đó.
    const byLocation = {};
    for (const d of onlineDevices) {
      const label = d.location || (d.isp ? `${d.isp}${d.country ? ` (${d.country})` : ""}` : "unknown ISP");
      byLocation[label] = (byLocation[label] ?? 0) + 1;
    }

    res.json({
      generated_at: new Date().toISOString(),
      totals: {
        devices: realDevices.length,
        test_devices: testDevices.length,
        users: users.length,
        active_devices: byStatus.active,
        revoked_devices: byStatus.revoked,
        online_peers: onlinePeers.length,
        total_peers: peers.length,
        exit_nodes: nodeList.length,
      },
      by_platform: byPlatform,
      by_status: byStatus,
      by_user: Object.values(byUser).sort((a, b) => b.total - a.total),
      // Live connections (dashboard): per-server + vị trí/ISP + chi tiết thiết bị.
      by_node: connections.by_node,
      by_location: byLocation,
      online_devices: onlineDevices,
      online_devices_truncated: connections.online_devices.length > onlineDevicesLimit,
      connections_totals: connections.totals,
      // Tình trạng bảng GeoIP (đường dẫn, ngày cập nhật) để biết dữ liệu có cũ không.
      geoip: geoLookup.info(),
      online_peer_endpoints: Object.entries(regionByIp)
        .map(([ip, count]) => ({ ip, count }))
        .sort((a, b) => b.count - a.count),
    });
  } catch (err) {
    console.error("GET /v1/admin/stats failed:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

// User-initiated account deletion (Apple 5.1.1(v)): deletes the user, their
// subscriptions/sessions, and their devices (including wg peer removal).
app.delete("/v1/account", requireUserAuth, async (req, res) => {
  try {
    const userId = req.userAuth.user.id;
    const devices = await store.devicesByUserId(userId);
    for (const device of devices) {
      try { await wg.removePeer(device.publicKey); } catch { /* best effort */ }
      await store.deleteByPublicKey(device.publicKey);
    }
    await authStore.deleteUser(userId);
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /v1/account failed:", err);
    res.status(err.statusCode ?? 500).json({ error: err.statusCode ? err.message : "Internal error" });
  }
});

app.get("/v1/admin/users", requireAdminAuth, async (_req, res) => {
  try {
    // Use expiry analytics so the admin dashboard can show days-left and
    // highlight customers about to expire / already expired.
    const users = await authStore.listUsersWithExpiry();
    const now = Date.now();
    const expiryBuckets = {
      active: 0,
      expiring_soon: 0,
      expired: 0,
      lifetime: 0,
      none: 0,
      revoked: 0,
    };
    for (const u of users) {
      const st = u.expiry_status ?? "none";
      expiryBuckets[st] = (expiryBuckets[st] ?? 0) + 1;
      if (st === "active" || st === "lifetime") {
        // nothing extra
      } else if (st === "expiring_soon" && u.days_left != null) {
        u.days_left = u.days_left; // keep raw for UI
      }
    }
    res.json({ count: users.length, expiry: expiryBuckets, users });
  } catch (err) {
    res.status(err.statusCode ?? 500).json({ error: err.statusCode ? err.message : "Internal error" });
  }
});

/**
 * POST /v1/admin/users — add an account by email and optionally activate it.
 * Body: { email, days?, productId?, grant? }
 * days: null or <= 0 means lifetime (same convention as the grant route).
 */
app.post("/v1/admin/users", requireAdminAuth, async (req, res) => {
  try {
    const email = String(req.body?.email ?? "").trim();
    if (!/\S+@\S+/.test(email)) return res.status(400).json({ error: "Email không hợp lệ" });
    const { user, created, userId } = await authStore.findOrCreateUserByEmail(email);

    let result = user;
    const wantsGrant = req.body?.grant === true || req.body?.days !== undefined;
    if (wantsGrant) {
      const rawDays = req.body?.days;
      const days = rawDays === null ? null : Number(rawDays ?? 365);
      result = await authStore.grantSubscription(userId, {
        productId: String(req.body?.productId ?? "admin.manual").slice(0, 60),
        days,
      });
      console.log(
        `admin users: ${created ? "created" : "found"} ${email} and granted ` +
          `${days == null || days <= 0 ? "lifetime" : `${days}d`} premium`,
      );
    } else {
      console.log(`admin users: ${created ? "created" : "found"} ${email} (no subscription change)`);
    }
    res.status(created ? 201 : 200).json({ ok: true, created, user: result });
  } catch (err) {
    console.error("admin create/find user failed:", err);
    res.status(err.statusCode ?? 500).json({ error: err.statusCode ? err.message : "Internal error" });
  }
});

app.post("/v1/admin/users/:id/subscription", requireAdminAuth, async (req, res) => {
  try {
    const user = await authStore.grantSubscription(req.params.id, req.body ?? {});
    res.json({ user });
  } catch (err) {
    res.status(err.statusCode ?? 500).json({ error: err.statusCode ? err.message : "Internal error" });
  }
});

app.post("/v1/admin/users/:id/revoke", requireAdminAuth, async (req, res) => {
  try {
    const user = await authStore.revokeUser(req.params.id);
    res.json({ user });
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
      await touchDeviceClientIp(result.body?.peer_id ?? result.body?.device?.id ?? null, req);
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
    await touchDeviceClientIp(result.body?.peer_id ?? null, req);
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error("POST /v1/peers/register failed:", err);
    res.status(err.statusCode ?? 500).json({
      error: err.statusCode ? (err.code ?? err.message) : "Internal error",
      message: err.statusCode ? err.message : undefined,
      devices: err.devices,
      max_devices: err.maxDevices,
    });
  }
});

// User-scoped device management (FR-REVOKE-001/002): the signed-in user lists
// and revokes their own devices. A revoked device keeps its record (status
// "revoked") but loses its wg peer, so it cannot connect anymore (AC-011/AC-012).
app.get("/v1/devices", requireUserAuth, async (req, res) => {
  try {
    const userId = req.userAuth.user.id;
    const devices = (await store.all())
      .filter((d) => d.userId === userId)
      .sort((a, b) => (a.active === b.active ? 0 : a.active ? -1 : 1));
    res.json({
      count: devices.length,
      devices: devices.map(userDevice),
    });
  } catch (err) {
    console.error("GET /v1/devices failed:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

// Claim this installation for the signed-in user (China/hysteria mode has no
// WireGuard peer, but the device limit must still apply). Called on every
// connect: creates the record once, then just refreshes last_seen_at.
app.post("/v1/devices/claim", requireUserAuth, async (req, res) => {
  try {
    const userId = req.userAuth.user.id;
    const deviceKey = String(req.body?.device_key ?? "").trim();
    const name = String(req.body?.name ?? "device").slice(0, 60);
    const platform = String(req.body?.platform ?? "android").slice(0, 24);
    if (!deviceKey) return res.status(400).json({ error: "device_key is required" });

    const all = await store.all();
    // Khách xoay khoá (cài lại/đổi cách lưu khoá) làm server thấy "thiết bị mới"; nếu client khai
    // `replace_device_id` là bản ghi CŨ của CHÍNH máy đó (cùng user + cùng platform) thì thu hồi bản
    // ghi cũ để nhả slot TRƯỚC khi áp hạn mức — xem device-replace.js.
    const replacedOnClaim = await applyDeviceReplace({
      body: req.body,
      userId,
      platform,
      publicKey: deviceKey,
      store,
      removePeer: removePeerForDevice,
      log: console,
    });
    const existing = all.find((d) => d.publicKey === deviceKey && d.userId === userId);
    const mine = all.filter((d) => d.userId === userId && d.active !== false);
    // Enforce the cap for EVERYONE, not just new devices: an account that is
    // already over the limit (e.g. devices added before this rule) must log out
    // the old ones before it can connect again.
    const isMine = Boolean(existing && existing.active !== false);
    const { blocked } = deviceLimitDecision({ activeCount: mine.length, isOwnDevice: isMine, max: MAX_DEVICES_PER_USER });
    if (blocked) {
      console.log(`device limit: user=${userId} has ${mine.length} active devices (this device known=${isMine}), claim rejected`);
      return res.status(403).json({
        error: "device_limit_reached",
        message: `You can use VPNFlow on up to ${MAX_DEVICES_PER_USER} devices. Log out the devices below to continue.`,
        devices: mine
          .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
          .map(userDevice),
        max_devices: MAX_DEVICES_PER_USER,
      });
    }
    if (existing) {
      if (existing.active === false) {
        return res.status(403).json({ error: "device_revoked", message: "This device was logged out. Please sign in again." });
      }
      const refreshed = await store.all();
      const rec = refreshed.find((d) => d.id === existing.id);
      if (rec) {
        rec.deviceName = name || rec.deviceName;
        rec.platform = platform || rec.platform;
        await store._save(refreshed);
      }
      await touchDeviceClientIp(existing.id, req);
      return res.json({ ok: true, device_id: existing.id, created: false });
    }

    const assignedIP = pool.nextFreeIP(all);
    const result = await store.upsertByPublicKey({
      publicKey: deviceKey,
      deviceName: name,
      platform,
      assignedIP: assignedIP ?? "0.0.0.0",
      userId,
      exitNodeId: null,
      // Authenticated claim (session + subscription): adopt a record left behind
      // by a previous account on this same device.
      allowTransfer: true,
    });
    const created = result.device;
    // Re-load before writing: upsertByPublicKey already saved, so saving the
    // snapshot loaded earlier in this handler would drop the new record.
    const latest = await store.all();
    const rec = latest.find((d) => d.id === created.id);
    if (rec) {
      rec.lastSeenAt = new Date().toISOString();
      await store._save(latest);
    }
    await touchDeviceClientIp(created.id, req);
    console.log(
      `device claim: user=${userId} ${result.transferred ? "adopted" : "new"} device ${created.id} (${platform}) ip=${created.assignedIP}`,
    );
    res.status(result.transferred ? 200 : 201).json({
      ok: true,
      device_id: created.id,
      created: !result.transferred,
      transferred: Boolean(result.transferred),
      replaced: replacedOnClaim.replaced,
    });
  } catch (err) {
    console.error("POST /v1/devices/claim failed:", err);
    res.status(err.statusCode ?? 500).json({ error: err.statusCode ? err.message : "Internal error" });
  }
});

app.delete("/v1/devices/:id", requireUserAuth, async (req, res) => {
  try {
    const userId = req.userAuth.user.id;
    const device = await store.findById(req.params.id);
    // 404 (not 403) so device existence is not leaked to other users.
    if (!device || device.userId !== userId) {
      return res.status(404).json({ error: "Not found" });
    }
    await removePeerForDevice(device);
    const updated = await store.deactivate(device.id);
    res.json({ ok: true, device: userDevice(updated) });
  } catch (err) {
    console.error("DELETE /v1/devices/:id failed:", err);
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
    await touchDeviceClientIp(result.body?.device?.id ?? null, req);
    res.status(result.status).json(result.body);
  } catch (err) {
    console.error("POST /device failed:", err);
    res.status(err.statusCode ?? 500).json({ error: err.statusCode ? err.message : "Internal error" });
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
  await removePeerForDevice(device);
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

function wgForNode(node) {
  if (node?.ssh_target) {
    return new WireGuardManager({
      interfaceName: node.wg_interface ?? "wg0",
      wgBin: "wg",
      dryRun: DRY_RUN,
      sshTarget: node.ssh_target,
      sshKey: process.env.SSH_KEY ?? "/root/.ssh/id_ed25519",
    });
  }
  return wg;
}

/// Removes the wg peer of a device from the exact node it was provisioned on
/// (kể cả khi node đã bị disable) — không fallback sang node khác để tránh
/// xóa nhầm peer trên node active. Best-effort: a missing node is ignored.
async function removePeerForDevice(device) {
  // Thu hồi phải quét MỌI node: peer mirror sang nhiều node, chỉ xoá ở một node thì
  // thiết bị đã bị thu hồi vẫn handshake được ở node còn lại.
  await revokeEverywhere({
    nodes: await nodeStore.active(),
    publicKey: device.publicKey,
    remove: (node, key) => wgForNode(node).removePeer(key),
  });
}

/// Public shape of a device as seen by its owner (user-scoped endpoints).
function userDevice(device) {
  return {
    device_id: device.id,
    name: device.deviceName,
    platform: device.platform ?? null,
    status: device.active ? "active" : "revoked",
    created_at: device.createdAt,
    assigned_ip: device.assignedIP,
    public_key: device.publicKey,
  };
}

async function provisionPeer(node, publicKey, allowedIPs) {
  return wgForNode(node).upsertPeer(publicKey, allowedIPs);
}

async function selectExitNode(id) {
  if (id) return nodeStore.findActiveById(id);
  return nodeStore.firstActive();
}

// Every account may use at most this many ACTIVE devices. Revoked devices are
// freed immediately, which is how a user "logs out" an old phone/tablet/PC.
const MAX_DEVICES_PER_USER = Number(process.env.MAX_DEVICES_PER_USER || 3);

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

  // Nhường slot: cùng user + cùng platform ⇒ thu hồi bản ghi cũ (chính máy đó, xoay khoá nên
  // thành "thiết bị mới") trước khi áp hạn mức — xem device-replace.js.
  const { replaced } = await applyDeviceReplace({
    body,
    userId,
    platform,
    publicKey,
    store,
    removePeer: removePeerForDevice,
    log: console,
  });
  // Device limit (FR: max N active devices per account). A device that already
  // belongs to this user (or is being re-registered after a revoke) is exempt —
  // only a genuinely NEW device can push the account over the limit.
  if (userId) {
    const ownedActive = device && device.userId === userId && device.active !== false;
    const mine = (await store.devicesByUserId(userId)).filter((d) => d.active !== false);
    const { blocked, code } = deviceLimitDecision({ activeCount: mine.length, isOwnDevice: ownedActive, max: MAX_DEVICES_PER_USER });
    if (blocked) {
      const error = new Error(
        `You can use VPNFlow on up to ${MAX_DEVICES_PER_USER} devices. Log out the devices below to continue.`,
      );
      error.statusCode = 403;
      error.code = "device_limit_reached";
      error.devices = mine
        .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
        .map(userDevice);
      error.maxDevices = MAX_DEVICES_PER_USER;
      throw error;
    }
  }

  const selectedNode = await selectExitNode(exitNodeId);
  if (!selectedNode) {
    const error = new Error("No active exit node available");
    error.statusCode = 503;
    throw error;
  }

  const result = await store.upsertByPublicKey({
    publicKey,
    deviceName,
    assignedIP,
    platform,
    userId,
    exitNodeId: selectedNode.id,
    // Authenticated register: adopt a record left behind by a previous account.
    allowTransfer: Boolean(userId),
  });
  device = result.device;

  // Cấp peer trên node khách sẽ dùng VÀ mirror sang mọi node đang bật. Nếu node chính
  // lỗi thì ném ra (502 exit_node_provision_failed) thay vì trả 201 — trước đây lỗi bị
  // nuốt nên khách nhận "Connected" mà không bao giờ handshake được (xem peer-mirror.js).
  await provisionEverywhere({
    primaryNode: selectedNode,
    nodes: await nodeStore.active(),
    publicKey,
    allowedIPs: `${assignedIP}/32`,
    upsert: (node, key, ips) => provisionPeer(node, key, ips),
  });

  // Báo Telegram khi KHÁCH đăng ký máy mới: chỉ thiết bị MỚI và thuộc account thật
  // (thiết bị test/probe có userId null nên không làm phiền). Không chờ kết quả, không
  // để lỗi alert ảnh hưởng việc đăng ký (sendAlert tự bắt mọi lỗi).
  if (result.isNew && userId) {
    let buyerEmail = null;
    try {
      buyerEmail = (await authStore.listUsers()).find((u) => u.id === userId)?.email ?? null;
    } catch (err) {
      console.error("device alert: không tra được email của user:", err?.message ?? err);
    }
    await sendAlert(deviceRegisteredAlert({
      platform,
      name: deviceName ?? device.deviceName,
      email: buyerEmail,
      ip: device.assignedIP ?? assignedIP,
      node: selectedNode?.name ?? selectedNode?.id ?? null,
      replaced: replaced?.deviceName ?? replaced?.id ?? null,
    }));
  }

  if (apiShape === "v1") {
    return {
      status: result.isNew ? 201 : 200,
      body: {
        peer_id: device.id,
        replaced,
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

/**
 * Ghi IP công khai THẬT của máy khách vào bản ghi thiết bị (dashboard hiển thị "IP thật").
 *
 * Vì sao không lấy từ WireGuard: khách đi qua relay (Cloudflare/wsrelay) nên `wg show` chỉ
 * thấy endpoint `127.0.0.1` — vô nghĩa với chủ shop. IP thật chỉ có ở tầng HTTP, do
 * Cloudflare/Caddy forward qua `X-Forwarded-For`. IP nội bộ/loopback bị bỏ qua (không ghi),
 * vì ghi vào chỉ làm dashboard sai.
 *
 * @param {string|null} deviceId
 * @param {import("express").Request} req
 */
async function touchDeviceClientIp(deviceId, req) {
  if (!deviceId) return;
  try {
    const ip = clientIPAddress(req);
    const publicIp = ip && isPublicIp(ip) ? ip : null;
    await store.markSeen(deviceId, { clientIp: publicIp });
  } catch (err) {
    // Không được để việc thống kê làm hỏng luồng đăng ký/kết nối của khách.
    console.error("device markSeen failed:", err?.message ?? err);
  }
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

function measureLatency(host) {
  return new Promise((resolve) => {
    if (!host) return resolve({ ok: false });
    execFile("ping", ["-c", "1", "-W", "2", host], { timeout: 4000 }, (err, stdout) => {
      if (err) return resolve({ ok: false });
      const m = String(stdout).match(/time=([\d.]+)\s*ms/);
      resolve({ ok: true, ms: m ? Number(Number(m[1]).toFixed(1)) : null });
    });
  });
}

function wgTransferBytes() {
  return new Promise((resolve) => {
    execFile("wg", ["show", WG_INTERFACE, "transfer"], { timeout: 3000 }, (err, stdout) => {
      if (err) return resolve(null);
      // `wg show <iface> transfer` prints per-peer lines: <pubkey> <rx_bytes> <tx_bytes>
      const lines = String(stdout).trim().split("\n").filter(Boolean);
      if (!lines.length) return resolve({ rx_bytes: 0, tx_bytes: 0 });
      let rx = 0;
      let tx = 0;
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 3) {
          rx += Number(parts[1]) || 0;
          tx += Number(parts[2]) || 0;
        }
      }
      resolve({ rx_bytes: rx, tx_bytes: tx });
    });
  });
}

function wgPeerCount() {
  return new Promise((resolve) => {
    execFile("wg", ["show", WG_INTERFACE, "peers"], { timeout: 3000 }, (err, stdout) => {
      if (err) return resolve(null);
      resolve(String(stdout).trim() ? String(stdout).trim().split("\n").length : 0);
    });
  });
}

function parseSize(value, unit) {
  const n = Number(value);
  switch (unit) {
    case "KiB": return Math.round(n * 1024);
    case "MiB": return Math.round(n * 1024 * 1024);
    case "GiB": return Math.round(n * 1024 * 1024 * 1024);
    case "TiB": return Math.round(n * 1024 * 1024 * 1024 * 1024);
    default: return Math.round(n);
  }
}

// ---------------- Renewal reminder job ----------------
// Runs periodically: emails customers whose premium expires within 7/3/1 days,
// once per window, with a link to the buy page. Thresholds are configurable.
/**
 * Link tải iOS nằm ở dịch vụ ngoài (Diawi) sẽ HẾT HẠN (gói hiện tại: 15 ngày / 50 lượt tải) — mà
 * màn ép cập nhật trong app lại trỏ vào đó, link chết là khách không cập nhật được nữa. Nên mỗi
 * 6 giờ kiểm một lần: link ngoài không còn 200 thì tự đổi về trang cài tự phát (/install/ios) và
 * báo chủ shop để upload lại nếu muốn dùng Diawi tiếp.
 */
async function runIosLinkGuard() {
  const enabled = process.env.IOS_LINK_GUARD !== "0";
  if (!enabled) return;
  const current = appConfig.get("ios_ipa_url") || "";
  if (!current || current.includes("/install/ios")) return; // đang dùng trang tự phát ⇒ không cần kiểm
  try {
    // Dùng curl chứ không dùng fetch: VPS có bản ghi AAAA cho *.diawi.com mà IPv6 không đi được,
    // node fetch chọn IPv6 rồi treo tới ETIMEDOUT (đã gặp thật khi upload Diawi).
    const { stdout } = await execFileAsync("curl", ["-sSI", "-o", "/dev/null", "-w", "%{http_code}", "--max-time", "25", current]);
    const status = Number(String(stdout).trim());
    if (status >= 200 && status < 400) return;
    console.warn(`ios-link-guard: link tải iOS trả ${status} — chuyển về trang cài tự phát (${current})`);
    appConfig.set("ios_ipa_url", `${siteBaseUrl()}/install/ios`);
    const owner = process.env.OWNER_ALERT_EMAIL || "minhnb2@me.com";
    await sendUnmatchedTransferAlert({
      to: owner,
      amount: 0,
      content: `Link tải iOS cũ: ${current}`,
      reason: "link tải iOS (Diawi) đã hết hạn hoặc hết lượt tải — hệ thống đã tự chuyển sang trang cài trên server mình; upload lại IPA lên Diawi rồi PATCH /v1/admin/app-version {ipa_url}",
      dashboardUrl: `${siteBaseUrl()}/admin`,
    }).catch((err) => console.error("ios-link-guard alert failed:", err?.message ?? err));
  } catch (err) {
    console.warn(`ios-link-guard: không kiểm được link iOS (${current}): ${err?.message ?? err}`);
  }
}

async function runRenewalReminders() {
  try {
    const due = await authStore.listUsersDueForRenewalReminder();
    if (!due.length) return;
    const buyUrl = `${siteBaseUrl()}/buy`; // per-customer link added below
    for (const d of due) {
      const email = d.user.email;
      if (!email) continue;
      const lang = pickMailLang(d.user.lang);
      const link = `${buyUrl}?lang=${lang}&email=${encodeURIComponent(email)}`;
      const r = await sendRenewalReminder({
        to: email,
        daysLeft: d.daysLeft,
        expiresAt: d.sub.expiresAt,
        buyUrl: link,
        lang,
      });
      await authStore.markRenewalReminded(d.user.id, d.windowDays);
      console.log(`renewal-reminder: sent to ${email} (${d.daysLeft}d left, win ${d.windowDays}) sent=${r?.sent}`);
    }
  } catch (err) {
    console.error("runRenewalReminders failed:", err);
  }
}

// MeetFlow AI Pro reminders (web purchases never auto-renew — we email the
// customer a pre-filled renewal link so paying again is one tap).
async function runAiRenewalReminders() {
  try {
    const due = await aiStore.listDueForRenewalReminder();
    if (!due.length) return;
    for (const d of due) {
      const lang = pickMailLang(d.lang);
      const buyUrl = `${siteBaseUrl()}/ai/buy?lang=${lang}` +
        `&email=${encodeURIComponent(d.email)}` +
        `&plan=${encodeURIComponent(d.plan || "monthly")}`;
      const r = await sendRenewalReminder({
        to: d.email,
        lang,
        daysLeft: d.daysLeft,
        expiresAt: d.expiresAt,
        buyUrl,
        brand: "MeetFlow AI Pro",
      });
      await aiStore.markRenewalReminded(d.email, d.windowDays);
      console.log(
        `ai-renewal-reminder: ${d.email} (${d.daysLeft}d left, win ${d.windowDays}, lang ${lang}) sent=${r?.sent}`,
      );
    }
  } catch (err) {
    console.error("runAiRenewalReminders failed:", err);
  }
}

const RENEWAL_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6h
if (process.env.ENABLE_RENEWAL_REMINDERS !== "0") {
  // Small initial delay so the server finishes booting before first run.
  setTimeout(runRenewalReminders, 60_000);
  setTimeout(runIosLinkGuard, 90_000);
  setInterval(runIosLinkGuard, Number(process.env.IOS_LINK_GUARD_INTERVAL_MS ?? 6 * 60 * 60 * 1000));
  setInterval(runRenewalReminders, RENEWAL_INTERVAL_MS);
  setTimeout(runAiRenewalReminders, 90_000);
  setInterval(runAiRenewalReminders, RENEWAL_INTERVAL_MS);
  // Nudge unverified Firebase accounts (spaced out, capped — see above).
  setTimeout(runVerifyEmailReminders, 150_000);
  setInterval(runVerifyEmailReminders, VERIFY_REMINDER_INTERVAL_MS);
  console.log(`  renewal-reminders: every ${RENEWAL_INTERVAL_MS / 3_600_000}h (windows 7/3/1 days)`);
}

/**
 * BÁO CÁO ĐỊNH KỲ GỬI TỪ SERVER.
 *
 * Chủ shop yêu cầu rõ: báo cáo phải tự chạy trên server để **tắt máy Mac vẫn nhận được**.
 * Vì vậy lịch chạy nằm trong chính control plane (node-2), dữ liệu lấy tại chỗ, và tin
 * gửi thẳng tới Telegram Bot API từ server — không cần máy cá nhân nào bật.
 *
 * Mốc giờ: `ALERT_REPORT_TIMES` (mặc định "08:00,20:00", giờ server). Tắt: ALERT_REPORT=0.
 * Mốc đã gửi được nhớ trong appConfig nên restart service không gửi trùng.
 */
async function buildStatusReport() {
  const now = new Date();
  const devices = await store.all();

  // Node nào còn sống (ping thật) — để báo cáo phản ánh đúng cái khách đang dùng.
  const activeNodes = await nodeStore.active();
  const nodes = [];
  // Peer được MIRROR sang mọi node, nên đếm theo public key duy nhất — nếu cộng dồn
  // theo node thì báo cáo sẽ thổi số lên gấp đôi và trông như có sự cố.
  const peerKeys = new Set();
  const onlineKeys = new Set();
  for (const node of activeNodes) {
    const host = String(node.endpoint ?? "").split(":").shift();
    const probe = host ? await measureLatency(host) : { ok: false };
    nodes.push({ id: node.id, name: node.name ?? node.id, online: Boolean(probe?.ok), ms: probe?.ms ?? null });
    try {
      const rows = await wgForNode(node).dump();
      for (const row of rows) {
        peerKeys.add(row.publicKey);
        if (row.latestHandshakeSec && Date.now() / 1000 - row.latestHandshakeSec < 180) onlineKeys.add(row.publicKey);
      }
    } catch (err) {
      console.error(`report: không đọc được peer của ${node.id}:`, err?.message ?? err);
    }
  }

  const realDevices = devices.filter((d) => d.userId);
  const activeReal = realDevices.filter((d) => d.active !== false);
  const byPlatform = {};
  for (const d of activeReal) {
    const plat = d.platform && d.platform !== "unknown" ? d.platform : "other";
    byPlatform[plat] = (byPlatform[plat] ?? 0) + 1;
  }
  const dayAgo = Date.now() - 24 * 3600 * 1000;
  const newLast24h = realDevices.filter((d) => {
    const t = Date.parse(d.createdAt ?? "");
    return Number.isFinite(t) && t >= dayAgo;
  }).length;
  // "Active mà thiếu peer" = khách sẽ thấy Connected nhưng không có mạng (sự cố 15/09).
  const peerless = activeReal.filter((d) => !peerKeys.has(d.publicKey)).length;

  let pendingSign = 0;
  try {
    const list = await iosDevices.list();
    pendingSign = (list.devices ?? []).filter((d) => d.udid && !d.built).length;
  } catch (err) {
    console.error("report: không đọc được danh sách UDID:", err?.message ?? err);
  }

  let pendingPayments = 0;
  try {
    pendingPayments = (await authStore.listPendingPayments()).length;
  } catch (err) {
    console.error("report: không đọc được đơn chờ:", err?.message ?? err);
  }

  return formatStatusReport({
    now,
    nodes,
    peers: { online: onlineKeys.size, total: peerKeys.size },
    devices: {
      active: activeReal.length,
      total: realDevices.length,
      test: devices.length - realDevices.length,
      byPlatform,
      newLast24h,
      peerless,
    },
    ios: { pendingSign },
    payments: { pending: pendingPayments },
    extra: [`Kênh alert: telegram=${alertChannels().telegram ? "bật" : "tắt"}`],
  });
}

/** Gửi báo cáo ngay (dùng cho lịch và cho endpoint admin). */
async function sendStatusReport({ reason = "schedule" } = {}) {
  const report = await buildStatusReport();
  const result = await sendAlert(report);
  if (result.sent) {
    appConfig.set("alert_report_last_at", new Date().toISOString());
    console.log(`report (${reason}): đã gửi telegram`);
  } else {
    console.warn(`report (${reason}): KHÔNG gửi được — ${result.reason}`);
  }
  return { ...report, ...result, reason };
}

function startReportScheduler() {
  if (process.env.ALERT_REPORT === "0") {
    console.log("  report scheduler: tắt (ALERT_REPORT=0)");
    return;
  }
  const times = parseReportTimes(process.env.ALERT_REPORT_TIMES ?? "08:00,20:00");
  const windowMinutes = Number(process.env.ALERT_REPORT_WINDOW_MIN || 10);
  console.log(`  report scheduler: mốc ${times.map((t) => t.label).join(", ")} (giờ server), cửa sổ ${windowMinutes} phút`);
  const tick = async () => {
    try {
      const due = reportDue({
        now: new Date(),
        times,
        lastSentAt: appConfig.get("alert_report_last_at") ?? null,
        windowMinutes,
      });
      if (due.due) await sendStatusReport({ reason: `schedule ${due.slot}` });
    } catch (err) {
      console.error("report scheduler:", err?.message ?? err);
    }
  };
  const timer = setInterval(() => { tick().catch(() => {}); }, 60_000);
  timer.unref?.();
  tick().catch(() => {});
}

/**
 * Watchdog node: ping định kỳ các exit node, CHỈ alert khi trạng thái đổi (lên↔xuống) để
 * không spam Telegram mỗi vòng. Mặc định 5 phút; tắt bằng ALERT_WATCHDOG=0.
 */
const nodeOnlineState = new Map();

async function watchNodesOnce() {
  let nodes = [];
  try {
    nodes = await nodeStore.active();
  } catch (err) {
    console.error("alert watchdog: không đọc được danh sách node:", err?.message ?? err);
    return;
  }
  for (const node of nodes) {
    const host = String(node.endpoint ?? "").split(":").shift();
    if (!host) continue;
    const probe = await measureLatency(host);
    const online = Boolean(probe?.ok);
    const previous = nodeOnlineState.get(node.id);
    nodeOnlineState.set(node.id, online);
    if (previous === undefined || previous === online) continue;
    await sendAlert({
      title: online ? `Node ${node.name ?? node.id} đã trở lại` : `Node ${node.name ?? node.id} KHÔNG phản hồi`,
      level: online ? "ok" : "error",
      lines: [
        `Endpoint: ${node.endpoint}`,
        online ? `Ping: ${probe.ms ?? "?"} ms` : "Ping: timeout (khách đang dùng node này sẽ mất mạng)",
      ],
    });
  }
}

function startAlertWatchdog() {
  if (process.env.ALERT_WATCHDOG === "0") {
    console.log("  alert watchdog: tắt (ALERT_WATCHDOG=0)");
    return;
  }
  const everyMs = Math.max(60_000, Number(process.env.ALERT_WATCHDOG_MS || 300_000));
  const timer = setInterval(() => {
    watchNodesOnce().catch((err) => console.error("alert watchdog:", err?.message ?? err));
  }, everyMs);
  timer.unref?.();
  console.log(`  alert watchdog: mỗi ${Math.round(everyMs / 1000)}s (kênh: telegram=${alertChannels().telegram ? "bật" : "tắt"})`);
}

function onListen() {
  console.log(`PrivateVPN control plane listening on :${PORT} (${tlsReady ? "HTTPS" : "HTTP"})`);
  console.log(`  interface=${WG_INTERFACE} dryRun=${DRY_RUN} pool=${IP_POOL_CIDR}`);
  console.log(`  nodesFile=${NODES_FILE}`);
  console.log(`  plansFile=${PLANS_FILE} (${planStore.all().length} plan(s))`);
  console.log(`  mail transport=${mailTransportName()} (resend if RESEND_API_KEY is set)`);
  console.log(`  adminAllowedIPs=${Array.from(ADMIN_ALLOWED_IPS).join(",")}`);
  if (!WG_SERVER_PUBKEY) console.warn("  WARNING: WG_SERVER_PUBKEY not set");
  if (!WG_PUBLIC_ENDPOINT) console.warn("  WARNING: WG_PUBLIC_ENDPOINT not set");
  if (LEGACY_MODE === "1") console.warn("  WARNING: LEGACY_MODE=1 — unauthenticated join tokens + register enabled (App Store review window). Set LEGACY_MODE=0 after the authenticated app is released.");
  startAlertWatchdog();
  startReportScheduler();
  if (process.env.GFW_WATCH === "0") {
    console.log("  gfw-watch: tắt (GFW_WATCH=0)");
  } else {
    const everyMs = Math.max(60_000, Number(process.env.GFW_WATCH_MS || 300_000));
    gfwWatcher.start(everyMs);
    console.log(`  gfw-watch: mỗi ${Math.round(everyMs / 1000)}s (${gfwWatcher.hosts.length} host, telegram=${alertChannels().telegram ? "bật" : "tắt"})`);
  }
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
