import fs from "node:fs/promises";
import path from "node:path";

/**
 * Google Play purchases — server-side verification.
 *
 * In-app purchases on Android are handled entirely on the device (Play Billing
 * queries the entitlement locally), so the control plane knew nothing about
 * them: a paying Play subscriber showed up in the dashboard as "chưa thấy gói".
 * The app now reports each purchase token here and this module asks Google
 * whether it is real.
 *
 * Credentials: a Google service account with Play Console access.
 *   - PLAY_SERVICE_ACCOUNT_JSON / PLAY_SERVICE_ACCOUNT_FILE env, or
 *   - <data dir>/play-admin.json (saved by the admin)
 * The account must be invited in Play Console → Users and permissions, and the
 * Google Play Android Developer API must be enabled for its Cloud project —
 * otherwise every call comes back 401/403.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/androidpublisher";
const API_ROOT = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications";

let authClient = null;
let loadedFingerprint = null;

function dataDir() {
  return process.env.AI_ACCESS_FILE
    ? path.dirname(process.env.AI_ACCESS_FILE)
    : path.join(process.cwd(), "data");
}

export function playPackageName() {
  return (process.env.PLAY_PACKAGE_NAME ?? "com.meetflow.translator").trim();
}

function credentialFilePath() {
  return process.env.PLAY_SERVICE_ACCOUNT_FILE || path.join(dataDir(), "play-admin.json");
}

/** Where the Play credentials come from (never returns the private key). */
export async function playCredentialStatus() {
  const inline = (process.env.PLAY_SERVICE_ACCOUNT_JSON ?? "").trim();
  const projectId = (raw) => {
    try {
      return JSON.parse(raw).project_id ?? null;
    } catch {
      return null;
    }
  };
  if (inline) {
    return { configured: true, source: "env:PLAY_SERVICE_ACCOUNT_JSON", path: null, projectId: projectId(inline), packageName: playPackageName() };
  }
  const file = credentialFilePath();
  try {
    return { configured: true, source: `file:${file}`, path: file, projectId: projectId(await fs.readFile(file, "utf8")), packageName: playPackageName() };
  } catch {
    return { configured: false, source: null, path: file, projectId: null, packageName: playPackageName() };
  }
}

async function readCredential() {
  const inline = (process.env.PLAY_SERVICE_ACCOUNT_JSON ?? "").trim();
  const raw = inline || (await fs.readFile(credentialFilePath(), "utf8"));
  const parsed = JSON.parse(raw);
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("Service account JSON thiếu client_email / private_key");
  }
  return parsed;
}

export async function savePlayCredential(json) {
  const parsed = typeof json === "string" ? JSON.parse(json) : json;
  if (!parsed?.client_email || !parsed?.private_key) {
    throw new Error("Service account JSON thiếu client_email / private_key");
  }
  if (String(parsed.private_key).includes("\\n")) {
    parsed.private_key = String(parsed.private_key).replace(/\\n/g, "\n");
  }
  const file = credentialFilePath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(parsed, null, 2), { mode: 0o600 });
  await fs.chmod(file, 0o600).catch(() => {});
  resetPlayAuth();
  return { client_email: parsed.client_email, project_id: parsed.project_id ?? null, path: file };
}

export async function clearPlayCredential() {
  await fs.rm(credentialFilePath(), { force: true });
  resetPlayAuth();
}

function resetPlayAuth() {
  authClient = null;
  loadedFingerprint = null;
}

/** Minimal OAuth2 JWT-bearer client (no extra dependency). */
async function getAccessToken() {
  const crypto = await import("node:crypto");
  const credential = await readCredential();
  const fingerprint = `${credential.client_email}:${String(credential.private_key).slice(-24)}`;
  if (authClient && loadedFingerprint === fingerprint && authClient.expiresAt > Date.now() + 60_000) {
    return authClient.accessToken;
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT", ...(credential.private_key_id ? { kid: credential.private_key_id } : {}) };
  const claims = {
    iss: credential.client_email,
    scope: SCOPE,
    aud: credential.token_uri || TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const signingInput = `${b64(header)}.${b64(claims)}`;
  const signature = crypto.createSign("RSA-SHA256").update(signingInput).sign(credential.private_key, "base64url");
  const assertion = `${signingInput}.${signature}`;

  const response = await fetch(credential.token_uri || TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Google OAuth2 ${response.status}: ${body.error_description || body.error || "unknown error"}`);
  }
  authClient = { accessToken: body.access_token, expiresAt: Date.now() + (Number(body.expires_in ?? 3600) * 1000) };
  loadedFingerprint = fingerprint;
  return authClient.accessToken;
}

async function googleGet(url) {
  const token = await getAccessToken();
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.error?.message || `HTTP ${response.status}`;
    const error = new Error(`Play API: ${message}`);
    error.statusCode = response.status;
    throw error;
  }
  return body;
}

/**
 * Verifies one purchase token against Google.
 *
 * Subscriptions use the v2 endpoint (productId, expiry, auto-renew state);
 * one-time products fall back to the classic endpoint. Returns a normalized
 * result the store and the dashboard can both use.
 */
export async function verifyPurchase({ purchaseToken, productId, kind = "subs" }) {
  const pkg = playPackageName();
  const id = encodeURIComponent(purchaseToken);

  if (kind === "subs") {
    const data = await googleGet(`${API_ROOT}/${pkg}/purchases/subscriptionsv2/tokens/${id}`);
    const line = Array.isArray(data.lineItems) ? data.lineItems[0] : null;
    const expiry = line?.expiryTime ?? null;
    const state = data.subscriptionState ?? "SUBSCRIPTION_STATE_UNSPECIFIED";
    const active = state === "SUBSCRIPTION_STATE_ACTIVE"
      || state === "SUBSCRIPTION_STATE_IN_GRACE_PERIOD"
      || state === "SUBSCRIPTION_STATE_CANCELED"; // still valid until expiry
    return {
      kind: "subs",
      productId: line?.productId ?? productId ?? null,
      orderId: data.latestOrderId ?? null,
      expiresAt: expiry,
      active: Boolean(active && expiry && Date.parse(expiry) > Date.now()),
      autoRenewing: Boolean(line?.autoRenewingPlan?.autoRenewEnabled),
      state,
      obfuscatedAccountId: data.externalAccountIdentifiers?.obfuscatedExternalAccountId ?? null,
      obfuscatedProfileId: data.externalAccountIdentifiers?.obfuscatedExternalProfileId ?? null,
      acknowledged: Boolean(data.acknowledgementState === "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED"),
      raw: { subscriptionState: state, expiryTime: expiry, latestOrderId: data.latestOrderId ?? null },
    };
  }

  const data = await googleGet(`${API_ROOT}/${pkg}/purchases/products/${encodeURIComponent(productId)}/tokens/${id}`);
  const purchaseTime = Number(data.purchaseTimeMillis ?? 0);
  return {
    kind: "product",
    productId,
    orderId: data.orderId ?? null,
    expiresAt: null,
    active: Number(data.purchaseState) === 0, // 0 = purchased
    autoRenewing: false,
    state: `purchaseState=${data.purchaseState}`,
    obfuscatedAccountId: data.obfuscatedExternalAccountId ?? null,
    obfuscatedProfileId: null,
    acknowledged: Boolean(data.acknowledgementState === 1),
    raw: { purchaseTimeMillis: purchaseTime, consumptionState: data.consumptionState ?? null },
  };
}
