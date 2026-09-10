import fs from "node:fs/promises";
import path from "node:path";

/**
 * Optional Firebase Authentication source for the admin dashboard.
 *
 * MeetFlow AI accounts are Firebase accounts, so "registered users" means the
 * Firebase user list. Reading it needs a service-account key, which the control
 * plane may not have: everything here degrades to
 * `{ configured: false, error }` instead of throwing, so the dashboard still
 * works with the data the control plane owns.
 *
 * Credentials can come from:
 *   - FIREBASE_SERVICE_ACCOUNT_JSON  (inline JSON, e.g. in the systemd unit)
 *   - FIREBASE_SERVICE_ACCOUNT_FILE  (path to the JSON)
 *   - <data dir>/firebase-admin.json (saved from the admin page)
 * The file is written with mode 0600 and never sent back to the browser.
 */

const CACHE_TTL_MS = 60 * 1000;
const APP_NAME = "flowvpn-admin";

let adminModule = null;
let firebaseApp = null;
let loadedFingerprint = null;
let cache = { at: 0, users: [], error: null, configured: false };

function dataDir() {
  return process.env.AI_ACCESS_FILE
    ? path.dirname(process.env.AI_ACCESS_FILE)
    : path.join(process.cwd(), "data");
}

function credentialFilePath() {
  return process.env.FIREBASE_SERVICE_ACCOUNT_FILE || path.join(dataDir(), "firebase-admin.json");
}

/** Where the credentials came from + whether they are usable (no secrets out). */
export async function credentialStatus() {
  const inline = (process.env.FIREBASE_SERVICE_ACCOUNT_JSON ?? "").trim();
  if (inline) {
    return { configured: true, source: "env:FIREBASE_SERVICE_ACCOUNT_JSON", path: null, projectId: safeProjectId(inline) };
  }
  const file = credentialFilePath();
  try {
    const raw = await fs.readFile(file, "utf8");
    return { configured: true, source: `file:${file}`, path: file, projectId: safeProjectId(raw) };
  } catch {
    return { configured: false, source: null, path: file, projectId: null };
  }
}

function safeProjectId(raw) {
  try {
    const parsed = JSON.parse(raw);
    return parsed.project_id ?? parsed.projectId ?? null;
  } catch {
    return null;
  }
}

async function readCredential() {
  const inline = (process.env.FIREBASE_SERVICE_ACCOUNT_JSON ?? "").trim();
  const raw = inline || (await fs.readFile(credentialFilePath(), "utf8"));
  const parsed = JSON.parse(raw);
  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new Error("Service account JSON thieu project_id / client_email / private_key");
  }
  return { parsed, fingerprint: `${parsed.project_id}:${parsed.client_email}:${String(parsed.private_key).slice(-24)}` };
}

/** Validates and stores a pasted service-account JSON (admin-only action). */
export async function saveCredential(json) {
  const parsed = typeof json === "string" ? JSON.parse(json) : json;
  if (!parsed?.project_id || !parsed?.client_email || !parsed?.private_key) {
    throw new Error("Service account JSON thieu project_id / client_email / private_key");
  }
  if (String(parsed.private_key).includes("\\n")) {
    parsed.private_key = String(parsed.private_key).replace(/\\n/g, "\n");
  }
  const file = credentialFilePath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(parsed, null, 2), { mode: 0o600 });
  await fs.chmod(file, 0o600).catch(() => {});
  resetCache();
  return { projectId: parsed.project_id, client_email: parsed.client_email, path: file };
}

/** Removes stored credentials (env-provided ones keep working). */
export async function clearCredential() {
  const file = credentialFilePath();
  await fs.rm(file, { force: true });
  resetCache();
}

function resetCache() {
  firebaseApp = null;
  loadedFingerprint = null;
  cache = { at: 0, users: [], error: null, configured: false };
}

async function getAdmin() {
  if (!adminModule) adminModule = await import("firebase-admin");
  const admin = adminModule.default ?? adminModule;
  const { parsed, fingerprint } = await readCredential();
  if (!firebaseApp || loadedFingerprint !== fingerprint) {
    try {
      await firebaseApp?.delete();
    } catch {
      /* the previous app may already be gone */
    }
    firebaseApp = admin.initializeApp(
      { credential: admin.credential.cert(parsed) },
      `${APP_NAME}-${Date.now()}`,
    );
    loadedFingerprint = fingerprint;
  }
  return admin;
}

function mapUser(user) {
  return {
    uid: user.uid,
    email: user.email ?? null,
    displayName: user.displayName ?? null,
    provider: (user.providerData ?? []).map((p) => p.providerId).filter(Boolean).join(",") || "password",
    created: user.metadata?.creationTime ? new Date(user.metadata.creationTime).toISOString() : null,
    lastSignIn: user.metadata?.lastSignInTime ? new Date(user.metadata.lastSignInTime).toISOString() : null,
    emailVerified: Boolean(user.emailVerified),
    disabled: Boolean(user.disabled),
  };
}

/**
 * Firebase Auth users, cached briefly. Never throws: a missing key or a bad
 * key becomes `{ configured: false | true, error }` for the dashboard.
 */
export async function listFirebaseUsers({ max = 1000, force = false } = {}) {
  const status = await credentialStatus();
  if (!status.configured) {
    return { configured: false, error: null, users: [], count: 0, truncated: false };
  }
  if (!force && cache.at && Date.now() - cache.at < CACHE_TTL_MS) {
    return { ...cache, configured: true, projectId: status.projectId };
  }

  try {
    const admin = await getAdmin();
    const users = [];
    let pageToken;
    do {
      const remaining = Math.max(1, Math.min(1000, max - users.length));
      const page = await admin.auth().listUsers(remaining, pageToken);
      users.push(...page.users.map(mapUser));
      pageToken = page.pageToken;
    } while (pageToken && users.length < max);

    cache = { at: Date.now(), users, error: null, truncated: users.length >= max };
    return { configured: true, projectId: status.projectId, users, count: users.length, truncated: users.length >= max, error: null };
  } catch (err) {
    const message = String(err?.message ?? err).slice(0, 300);
    cache = { at: Date.now(), users: [], error: message, truncated: false };
    return { configured: true, projectId: status.projectId, users: [], count: 0, truncated: false, error: message };
  }
}

/** Firebase-side account actions (null result unit = success, throws on error). */
export async function setUserDisabled(uid, disabled) {
  const admin = await getAdmin();
  await admin.auth().updateUser(uid, { disabled: Boolean(disabled) });
  resetCache();
}

export async function deleteFirebaseUser(uid) {
  const admin = await getAdmin();
  await admin.auth().deleteUser(uid);
  resetCache();
}

export async function sendPasswordReset(email) {
  const admin = await getAdmin();
  const link = await admin.auth().generatePasswordResetLink(email);
  return { link };
}
