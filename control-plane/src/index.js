import express from "express";
import cors from "cors";
import crypto from "node:crypto";
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
import { AuthStore } from "./auth-store.js";
import { AppConfigStore } from "./app-config-store.js";
import { NodeStore, adminNode, publicNode } from "./node-store.js";
import { adminPageHTML } from "./admin-page.js";
import {
  sendOtpEmail,
  sendPaymentAlert,
  sendRenewalReminder,
  sendInvoiceEmail,
  sendAiInvoiceEmail,
  pickMailLang,
} from "./mailer.js";
import { AiAccessStore } from "./ai-access-store.js";
import { guidePageHTML } from "./guide-page.js";
import {
  buyPageHTML,
  AI_PLANS,
  paymentSuccessPageHTML,
  paymentCancelPageHTML,
  createPayosPaymentLink,
  createBankQrDataUrl,
  bankQrConfig,
  verifyPayosWebhook,
  pickBuyLang,
  momoQrConfig,
  PLANS_PUBLIC,
} from "./payments.js";

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
const APP_CONFIG_DB = process.env.APP_CONFIG_DB ?? path.join(__dirname, "..", "data", "app-config.db");
const DEFAULT_MIN_VERSION = process.env.MIN_IOS_VERSION ?? "1.0";
const DEFAULT_LATEST_VERSION = process.env.LATEST_IOS_VERSION ?? "1.0";
const DEFAULT_STORE_URL = process.env.APP_STORE_URL ?? "https://apps.apple.com/app/flowvpn";
const NODES_FILE = process.env.NODES_FILE ?? path.join(__dirname, "..", "data", "nodes.json"); // legacy JSON (imported once into SQLite)
const NODES_DB_FILE = process.env.NODES_DB_FILE ?? path.join(__dirname, "..", "data", "nodes.db");
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
// MeetFlow AI web purchases (separate product + account system).
const aiStore = new AiAccessStore(process.env.AI_ACCESS_FILE ?? path.join(__dirname, "..", "data", "ai-access.json"));
const nodeStore = new NodeStore(NODES_DB_FILE, buildFallbackExitNode(), { legacyJsonPath: NODES_FILE });
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

const app = express();
app.set("trust proxy", true);
app.use(cors());
app.use(express.json());

// Simple bearer-token auth (optional). Enable by setting AUTH_TOKEN.
// /health is always public so it can be used as a liveness probe.
app.use((req, res, next) => {
  if (!AUTH_TOKEN) return next();
  if (req.path === "/health" || req.path === "/v1/health" || req.path === "/nodes" || req.path === "/v1/nodes" || req.path === "/v1/app-version") return next();
  if (req.path.startsWith("/v1/auth/") || req.path === "/v1/enrollment-tokens" || req.path === "/v1/peers/register" || req.path === "/v1/account" || req.path === "/v1/devices" || req.path.startsWith("/v1/devices/")) return next();
  // Public payment flow: buy page + create order + PayOS webhook.
  if (req.path === "/buy" || req.path.startsWith("/buy/") || req.path.startsWith("/v1/payments/")) return next();
  // Public MeetFlow AI purchase flow (buy page, create/status/qr/confirm,
  // entitlement lookup used by the apps).
  if (req.path === "/ai/buy" || req.path.startsWith("/ai/buy/") || req.path.startsWith("/v1/ai/")) return next();
  // Activation guides.
  if (req.path === "/guide" || req.path.startsWith("/guide/") || req.path.startsWith("/ai/guide")) return next();
  // Brand logos referenced by the buy pages.
  if (req.path.startsWith("/assets/")) return next();
  // Public app downloads (APK host).
  if (req.path === "/v1/downloads/android") return next();
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

// ---------------- Web payments (PayOS: MoMo wallet + Bank QR VietQR) ----------------
/**
 * Store / APK download links per product. App Store URLs come from env so they
 * can be filled in the moment each app is published (no code change):
 *   APP_STORE_URL_IOS            → VPNFlow iOS
 *   APP_STORE_URL_MAC            → VPNFlow macOS
 *   TESTFLIGHT_URL_IOS           → VPNFlow iOS TestFlight public link
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

function storeLinks(product) {
  const base = publicBaseUrl();
  return product === "ai"
    ? {
        ios: process.env.APP_STORE_URL_MEETFLOW_AI || null,
        mac: process.env.APP_STORE_URL_MEETFLOW_MAC || null,
        android: `${base}/v1/ai/downloads/android`,
      }
    : {
        ios: process.env.APP_STORE_URL_IOS || null,
        mac: process.env.APP_STORE_URL_MAC || null,
        // Used while the app is only in beta (before App Store approval).
        testflight: process.env.TESTFLIGHT_URL_IOS || null,
        android: `${base}/v1/downloads/android`,
      };
}

// Trang mua hàng (Android sideload + iOS web-account flow). Ngưới dùng nhập
// email tài khoản, chọn gói, thanh toán; webhook kích hoạt premium.
// ?lang=en|vi|zh|ja|ko maps the paywall to the app language.

function buyLang(req) {
  return pickBuyLang(String(req.query?.lang ?? "").slice(0, 8));
}

app.get(["/buy", "/buy/"], (req, res) => {
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
    const allowed = { "vpnflow-logo.png": "image/png", "meetflow-logo.png": "image/png" };
    const type = allowed[req.params.file];
    if (!type) return res.status(404).send("Not found");
    const file = path.join(process.env.ASSETS_DIR || path.join(__dirname, "..", "assets"), req.params.file);
    if (!fs.existsSync(file)) return res.status(404).send("Not found");
    res.type(type).sendFile(file);
  } catch {
    res.status(500).send("Internal error");
  }
});

// Activation guides — linked from the buy pages and the invoice emails.
app.get(["/guide", "/guide/"], (req, res) => {
  res.type("html").send(
    guidePageHTML({ lang: buyLang(req), product: "vpn", buyUrl: `${publicBaseUrl()}/buy` }),
  );
});

app.get(["/ai/guide", "/ai/guide/"], (req, res) => {
  res.type("html").send(
    guidePageHTML({ lang: buyLang(req), product: "ai", buyUrl: `${publicBaseUrl()}/ai/buy` }),
  );
});

app.get(["/ai/buy", "/ai/buy/"], (req, res) => {
  res.type("html").send(
    buyPageHTML({
      baseUrl: publicBaseUrl(),
      lang: buyLang(req),
      product: "ai",
      links: storeLinks("ai"),
      prefillEmail: String(req.query?.email ?? "").slice(0, 120),
      prefillPlan: String(req.query?.plan ?? "").slice(0, 20),
      methods: availablePaymentMethods(),
    }),
  );
});

app.get(["/ai/buy/success", "/ai/buy/success/"], (req, res) => {
  res.type("html").send(paymentSuccessPageHTML(buyLang(req), "ai"));
});

app.get(["/ai/buy/cancel", "/ai/buy/cancel/"], (req, res) => {
  res.type("html").send(paymentCancelPageHTML(buyLang(req), "ai"));
});

// Creates a MeetFlow Pro order and returns the payment QR (bank / WeChat / Alipay).
app.post("/v1/ai/payments/create", async (req, res) => {
  try {
    const { email, plan, method, lang } = req.body ?? {};
    if (!email || !/\S+@\S+/.test(email)) {
      return res.status(400).json({ code: "invalid_email", error: "Email không hợp lệ." });
    }
    const planCfg = AI_PLANS[plan];
    if (!planCfg) return res.status(400).json({ code: "invalid_plan", error: "Gói không hợp lệ." });

    const orderCode = Math.floor(Date.now() / 1000);
    await aiStore.recordPendingPayment(orderCode, { email, plan, method, lang: pickMailLang(lang) });
    fireAiPaymentAlert(orderCode, email, plan, planCfg.amount);

    if (method === "momo") {
      const cfg = momoQrConfig();
      if (cfg) {
        const qrDataUrl = await createBankQrDataUrl({
          accountNumber: cfg.accountNumber,
          accountName: cfg.accountName,
          bin: cfg.bin,
          amount: planCfg.amount,
          orderCode,
        });
        return res.json({ qrDataUrl, orderCode, amount: planCfg.amount, method: "momo" });
      }
      return res.json({ qrImageUrl: "/v1/ai/payments/qr/momo", orderCode, amount: planCfg.amount, method: "momo" });
    }

    if (method === "wechat" || method === "alipay") {
      return res.json({ qrImageUrl: `/v1/ai/payments/qr/${method}`, orderCode, amount: planCfg.amount, method });
    }

    // Default: direct bank transfer via VietQR (same TPBank account).
    const bank = bankQrConfig();
    if (!bank) {
      return res.status(502).json({ code: "bank_not_configured", error: "Bank QR chưa được cấu hình (BANK_QR_ACCOUNT)." });
    }
    const qrDataUrl = await createBankQrDataUrl({
      accountNumber: bank.accountNumber,
      accountName: bank.accountName,
      amount: planCfg.amount,
      orderCode,
    });
    return res.json({ qrDataUrl, orderCode, amount: planCfg.amount, method: "bankqr" });
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
    const file = path.join(process.env.PAY_QR_DIR || "/root/flowvpn-pay", `${name}.png`);
    if (!fs.existsSync(file)) return res.status(404).json({ error: "QR image not uploaded yet" });
    res.sendFile(file);
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
    await activateAiProAndInvoice({
      orderCode: order.orderCode,
      email: order.email,
      plan: order.plan,
      method: order.method,
      lang: order.lang,
    });
    res.type("html").send(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Đã xác nhận</title><style>body{min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:-apple-system,Segoe UI,sans-serif;color:#fff;background:linear-gradient(180deg,#051525,#0a1f3a)}.c{max-width:420px;padding:32px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:18px;text-align:center}.ok{font-size:48px;color:#33c773}h1{font-size:20px;margin:10px 0}p{color:rgba(255,255,255,.6);font-size:14px}</style></head><body><div class="c"><div class="ok">✅</div><h1>Đã xác nhận thanh toán</h1><p>MeetFlow Pro đã kích hoạt cho <b>${order.email}</b>.</p></div></body></html>`);
  } catch (err) {
    console.error("ai confirm-link failed:", err);
    res.status(500).send("Lỗi xác nhận. Liên hệ support@meetflowai.site");
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
    await activateAiProAndInvoice({
      orderCode: order.orderCode,
      email: order.email,
      plan: order.plan,
      method: order.method,
      lang: order.lang,
    });
    res.json({ ok: true, email: order.email });
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
    res.json(await aiStore.entitlementForEmail(email));
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

/** Grants MeetFlow Pro for a paid order and emails the invoice. */
async function activateAiProAndInvoice({ orderCode, email, plan, method = "bankqr", lang }) {
  const planCfg = AI_PLANS[plan] ?? AI_PLANS.monthly;
  const ent = await aiStore.grantPro(email, {
    plan,
    days: planCfg.days,
    orderCode,
    productId: `meetflow.${method}.${plan}`,
    lang: pickMailLang(lang),
  });
  const invoiceResult = await sendAiInvoiceEmail({
    to: email,
    orderCode,
    planLabel: planCfg.label,
    amount: planCfg.amount,
    days: planCfg.days,
    activatedAt: new Date().toISOString(),
    expiresAt: ent?.expires_at ?? null,
    guideUrl: `${siteBaseUrl()}/ai/guide`,
    lang,
    oneTime: AI_PLANS[plan]?.oneTime === true,
  });
  console.log(
    `ai-invoice: ${method}.${plan} granted to ${email} (order ${orderCode}) mailSent=${invoiceResult?.sent === true}`,
  );
  return ent;
}

/** Owner alert for a new MeetFlow Pro order (confirm link is product-scoped). */
async function fireAiPaymentAlert(orderCode, email, plan, amount) {
  const owner = process.env.OWNER_ALERT_EMAIL || "minhnb2@me.com";
  const base = process.env.PUBLIC_BASE_URL || "https://api.meetflowai.site";
  const sig = paymentConfirmSignature("ai:" + orderCode);
  const confirmUrl = `${base}/v1/ai/payments/confirm/${orderCode}?t=${sig}`;
  try {
    const r = await sendPaymentAlert({ to: owner, orderCode, buyerEmail: email, plan, amount, confirmUrl, product: "MeetFlow AI Pro" });
    console.log(`ai-payment-alert order ${orderCode} to ${owner}: sent=${r?.sent}`);
  } catch (err) {
    console.error("fireAiPaymentAlert failed:", err);
  }
}

app.post("/v1/payments/create", async (req, res) => {
  try {
    const { email, plan, method, lang } = req.body ?? {};
    if (!email || !/\S+@\S+/.test(email)) return res.status(400).json({ code: "invalid_email", error: "Email không hợp lệ." });
    const planCfg = PLANS_PUBLIC[plan];
    if (!planCfg) return res.status(400).json({ code: "invalid_plan", error: "Gói không hợp lệ." });

    const orderCode = Math.floor(Date.now() / 1000);
    await authStore.recordPendingPayment(orderCode, { email, plan, method, lang: pickMailLang(lang) });

    // Alert the owner (email) with a signed one-click confirm link.
    firePaymentAlert(orderCode, email, plan, planCfg.amount);

    if (method === "bankqr") {
      const bank = bankQrConfig();
      if (!bank) return res.status(502).json({ code: "bank_not_configured", error: "Bank QR chưa được cấu hình (BANK_QR_ACCOUNT)." });
      const qrDataUrl = await createBankQrDataUrl({
        accountNumber: bank.accountNumber,
        accountName: bank.accountName,
        amount: planCfg.amount,
        orderCode,
      });
      return res.json({ qrDataUrl, orderCode, amount: planCfg.amount, method: "bankqr" });
    }

    if (method === "momo") {
      // MoMo speaks VietQR, so mint a per-order QR with the amount pre-filled.
      const cfg = momoQrConfig();
      if (cfg) {
        const qrDataUrl = await createBankQrDataUrl({
          accountNumber: cfg.accountNumber,
          accountName: cfg.accountName,
          bin: cfg.bin,
          amount: planCfg.amount,
          orderCode,
        });
        return res.json({ qrDataUrl, orderCode, amount: planCfg.amount, method: "momo" });
      }
      // Fallback: static collection image (customer types the amount).
      return res.json({ qrImageUrl: "/v1/payments/qr/momo", orderCode, amount: planCfg.amount, method: "momo" });
    }

    if (method === "wechat" || method === "alipay") {
      // Personal collection QR: static image, paid amount entered by the
      // customer. Admin confirms manually via /v1/admin/payments/:code/confirm.
      return res.json({ qrImageUrl: `/v1/payments/qr/${method}`, orderCode, amount: planCfg.amount, method });
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
    const file = path.join(process.env.PAY_QR_DIR || "/root/flowvpn-pay", `${name}.png`);
    if (!fs.existsSync(file)) return res.status(404).json({ error: "QR image not uploaded yet" });
    res.sendFile(file);
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

// Serve the Android APK for direct download (sideload distribution).
app.get("/v1/downloads/android", async (_req, res) => {
  try {
    const apkDir = process.env.APK_DIR || "/root/flowvpn-apk";
    const apkPath = path.join(apkDir, "VPNFlow-latest.apk");
    if (!fs.existsSync(apkPath)) {
      return res.status(404).send("APK not found. Contact support@meetflowai.site");
    }
    res.download(apkPath, "VPNFlow.apk");
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

    const pending = await authStore.takePendingPayment(evt.orderCode);
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
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("webhook failed:", err);
    res.status(500).json({ error: "Internal error" });
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
      prefix: "bankqr",
      lang: order.lang ?? (await authStore.langForEmail(order.email)),
    });
    res.json({ ok: true, email: order.email });
  } catch (err) {
    res.status(500).json({ error: "Internal error" });
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
      prefix: "bankqr",
      lang: order.lang ?? (await authStore.langForEmail(order.email)),
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
async function activatePaymentAndInvoice({ orderCode, email, plan, prefix = "bankqr", lang }) {
  const planCfg = PLANS_PUBLIC[plan] ?? PLANS_PUBLIC.monthly;
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
    planLabel: planCfg.label,
    amount: planCfg.amount,
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
  return user;
}

async function firePaymentAlert(orderCode, email, plan, amount) {
  const owner = process.env.OWNER_ALERT_EMAIL || "minhnb2@me.com";
  const base = process.env.PUBLIC_BASE_URL || "https://api.meetflowai.site";
  const sig = paymentConfirmSignature(orderCode);
  const confirmUrl = `${base}/v1/payments/confirm/${orderCode}?t=${sig}`;
  try {
    const r = await sendPaymentAlert({ to: owner, orderCode, buyerEmail: email, plan, amount, confirmUrl });
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
    const login = await authStore.startEmailLogin(req.body?.email);
    // The apps send their UI language so the code arrives localized.
    const lang = pickMailLang(req.body?.lang);
    await authStore.rememberLangForEmail(login.email, lang);
    const mail = await sendOtpEmail({ email: login.email, code: login.code, lang });
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
app.get("/v1/app-version", (_req, res) => {
  res.json({
    platform: "ios",
    minimum_version: appConfig.get("minimum_ios_version"),
    latest_version: appConfig.get("latest_ios_version"),
    store_url: appConfig.get("app_store_url"),
  });
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
  });
});

app.patch("/v1/admin/app-version", requireAdminAuth, async (req, res) => {
  try {
    const { minimum_version, latest_version, store_url } = req.body ?? {};
    if (minimum_version !== undefined) appConfig.set("minimum_ios_version", minimum_version);
    if (latest_version !== undefined) appConfig.set("latest_ios_version", latest_version);
    if (store_url !== undefined) appConfig.set("app_store_url", store_url);
    res.json({
      minimum_version: appConfig.get("minimum_ios_version"),
      latest_version: appConfig.get("latest_ios_version"),
      store_url: appConfig.get("app_store_url"),
    });
  } catch (err) {
    res.status(500).json({ error: "Internal error" });
  }
});

// Owner visibility (FR-ADMIN-001): dashboard statistics — device counts by
// platform/status, live wg peer count, and region buckets derived from the
// wg peer endpoint IP (public IP of the connected client).
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
    const peers = [];
    const nodeList = await nodeStore.all();
    const seen = new Set();
    for (const node of nodeList) {
      const mgr = wgForNode(node);
      const rows = await mgr.dump();
      for (const row of rows) {
        if (seen.has(row.publicKey)) continue;
        seen.add(row.publicKey);
        peers.push(row);
      }
    }
    if (peers.length === 0) {
      const local = await wg.dump();
      for (const row of local) {
        if (!seen.has(row.publicKey)) peers.push(row);
      }
    }

    const onlinePeers = peers.filter((p) => {
      if (!p.latestHandshakeSec) return false;
      return Date.now() / 1000 - p.latestHandshakeSec < 180; // < 3 min
    });

    // Region buckets from the client endpoint's public IP (best-effort, no
    // external API — country code from IANA/ASN-lite mapping).
    const regionByIp = {};
    for (const p of onlinePeers) {
      const host = p.endpoint ? p.endpoint.split(":")[0] : null;
      if (!host) continue;
      regionByIp[host] = (regionByIp[host] ?? 0) + 1;
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
  const node = device.exitNodeId
    ? await nodeStore.findById(device.exitNodeId)
    : await nodeStore.firstActive();
  if (node) {
    await wgForNode(node).removePeer(device.publicKey);
  }
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

  const selectedNode = await selectExitNode(exitNodeId);
  if (!selectedNode) {
    const error = new Error("No active exit node available");
    error.statusCode = 503;
    throw error;
  }

  const result = await store.upsertByPublicKey({ publicKey, deviceName, assignedIP, platform, userId, exitNodeId: selectedNode.id });
  device = result.device;

  await provisionPeer(selectedNode, publicKey, `${assignedIP}/32`);

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
  setInterval(runRenewalReminders, RENEWAL_INTERVAL_MS);
  setTimeout(runAiRenewalReminders, 90_000);
  setInterval(runAiRenewalReminders, RENEWAL_INTERVAL_MS);
  console.log(`  renewal-reminders: every ${RENEWAL_INTERVAL_MS / 3_600_000}h (windows 7/3/1 days)`);
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
