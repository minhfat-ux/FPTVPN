import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * MeetFlow AI — khoá kích hoạt bản Windows (activation keys).
 *
 * Bản Windows (.NET/WPF, repo `minhfat-ux/MeetFlowAI_Win`) kích hoạt theo KEY,
 * KHÔNG theo email: app gửi `{key, machineId}` tới `{ActivationApiUrl}/activate`
 * rồi lưu `license.json` đã ký HMAC trong `%LOCALAPPDATA%\MeetFlowAI`.
 *
 * Module này giữ NGUYÊN collection Firestore `activationKeys` do
 * `MeetFlowAI.Win/tools/activation/generate-key.js` + `firebase/functions/index.js`
 * tạo ra, nên mọi key đã bán vẫn kích hoạt được:
 *   - doc id  = sha256(key.trim().toUpperCase()) dạng hex
 *   - fields  = { status: "unused"|"used", plan, durationDays, createdAt,
 *                 machineId?, activatedAt?, expiresAt? }
 * Key cũ thiếu `plan`/`durationDays` được coi là `lifetime` (đúng như hàm
 * `activate` gốc trên Firebase).
 */

const APP_NAME = "meetflow-license";

/** Gói bán được → số ngày hiệu lực (null = vĩnh viễn). */
export const PLAN_DAYS = {
  monthly: 30,
  quarterly: 90,
  yearly: 365,
  lifetime: null,
};

export const PLAN_NAMES = Object.keys(PLAN_DAYS);

let dbPromise = null;

function dataDir() {
  return process.env.AI_ACCESS_FILE
    ? path.dirname(process.env.AI_ACCESS_FILE)
    : path.join(process.cwd(), "data");
}

function credentialFilePath() {
  return (
    process.env.FIREBASE_SERVICE_ACCOUNT_FILE ||
    path.join(dataDir(), "firebase-admin.json")
  );
}

/** Kết nối Firestore (service account của control plane). Ném lỗi nếu thiếu. */
async function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const { initializeApp, cert, getApps } = await import("firebase-admin/app");
      const { getFirestore } = await import("firebase-admin/firestore");
      const inline = (process.env.FIREBASE_SERVICE_ACCOUNT_JSON ?? "").trim();
      const raw = inline || fs.readFileSync(credentialFilePath(), "utf8");
      const sa = JSON.parse(raw);
      if (!sa.project_id || !sa.client_email || !sa.private_key) {
        throw new Error(
          "Service account JSON thiếu project_id / client_email / private_key",
        );
      }
      const existing = getApps().find((a) => a.name === APP_NAME);
      const app =
        existing ??
        initializeApp(
          { credential: cert(sa), projectId: sa.project_id },
          APP_NAME,
        );
      return getFirestore(app);
    })();
  }
  return dbPromise;
}

/** Trạng thái cấu hình (không lộ bí mật) — dùng cho health/log. */
export async function licenseConfigStatus() {
  try {
    await getDb();
    return {
      configured: true,
      source: process.env.FIREBASE_SERVICE_ACCOUNT_JSON
        ? "env:FIREBASE_SERVICE_ACCOUNT_JSON"
        : `file:${credentialFilePath()}`,
    };
  } catch (err) {
    return { configured: false, error: err?.message ?? String(err) };
  }
}

/** doc id trong Firestore — giống hệt generate-key.js / functions/index.js. */
export function hashKey(key) {
  return crypto
    .createHash("sha256")
    .update(String(key).trim().toUpperCase())
    .digest("hex");
}

/** Sinh một key dạng MF-XXXX-XXXX-XXXX-XXXX-XXXX (20 ký tự A-Z0-9). */
export function createKey() {
  const bytes = crypto
    .randomBytes(15)
    .toString("base64url")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  const raw = bytes.padEnd(20, "0").slice(0, 20);
  return `MF-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toIso(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  if (typeof value === "object" && typeof value.seconds === "number") {
    return new Date(value.seconds * 1000).toISOString();
  }
  return null;
}

function normalizePlan(plan) {
  const p = String(plan ?? "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(PLAN_DAYS, p) ? p : "lifetime";
}

function isExpired(data) {
  const iso = toIso(data?.expiresAt);
  return Boolean(iso) && new Date(iso) <= new Date();
}

/**
 * Sinh `count` key cho một gói. Chỉ trả key MỘT LẦN — Firestore chỉ lưu hash.
 * @returns {Promise<{plan: string, durationDays: number|null, keys: string[]}>}
 */
export async function generateKeys({ plan, count = 1 } = {}) {
  const planName = String(plan ?? "").trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(PLAN_DAYS, planName)) {
    throw new Error(`Gói không hợp lệ: ${plan}. Dùng: ${PLAN_NAMES.join(", ")}`);
  }
  const wanted = Number.parseInt(count, 10);
  if (!Number.isInteger(wanted) || wanted < 1 || wanted > 500) {
    throw new Error("Số lượng key phải là số nguyên 1..500");
  }

  const db = await getDb();
  const durationDays = PLAN_DAYS[planName];
  const createdAt = new Date();
  const keys = [];
  let guard = 0;

  while (keys.length < wanted) {
    if (++guard > wanted * 50) {
      throw new Error("Không sinh đủ key (va chạm hash quá nhiều lần)");
    }
    const key = createKey();
    const ref = db.collection("activationKeys").doc(hashKey(key));
    const snap = await ref.get();
    if (snap.exists) continue;
    await ref.set({
      status: "unused",
      plan: planName,
      durationDays,
      createdAt,
      source: "control-plane",
    });
    keys.push(key);
  }

  return { plan: planName, durationDays, keys };
}

/** Kích hoạt: mirror đúng ngữ nghĩa hàm `activate` trên Firebase Functions. */
export async function activateLicense({ key, machineId } = {}) {
  const cleanKey = String(key ?? "").trim();
  const machine = String(machineId ?? "").trim();
  if (!cleanKey || !machine) {
    return { status: 400, body: { valid: false, message: "Key and machineId are required" } };
  }

  const db = await getDb();
  const ref = db.collection("activationKeys").doc(hashKey(cleanKey));

  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) {
        return { status: 404, body: { valid: false, message: "Activation key not found" } };
      }

      const data = snap.data() ?? {};
      if (data.status === "revoked") {
        return { status: 403, body: { valid: false, message: "Activation key has been revoked" } };
      }
      if (isExpired(data)) {
        return { status: 403, body: { valid: false, message: "Activation key has expired" } };
      }
      if (data.status === "used" && data.machineId !== machine) {
        return {
          status: 409,
          body: { valid: false, message: "Activation key is already used on another machine" },
        };
      }
      if (data.status === "used" && data.machineId === machine) {
        return {
          status: 200,
          body: {
            valid: true,
            message: "Already activated on this machine",
            plan: normalizePlan(data.plan),
            activatedAt: toIso(data.activatedAt),
            expiresAt: toIso(data.expiresAt),
          },
        };
      }

      const now = new Date();
      const plan = normalizePlan(data.plan);
      const durationDays = Number.isInteger(data.durationDays)
        ? data.durationDays
        : PLAN_DAYS[plan];
      const expiresAt = durationDays ? addDays(now, durationDays) : null;

      tx.update(ref, {
        status: "used",
        machineId: machine,
        activatedAt: now,
        expiresAt,
        activatedVia: "control-plane",
      });

      return {
        status: 200,
        body: {
          valid: true,
          message: "Activated",
          plan,
          activatedAt: now.toISOString(),
          expiresAt: expiresAt ? expiresAt.toISOString() : null,
        },
      };
    });
  } catch (err) {
    return { status: 500, body: { valid: false, message: err?.message ?? String(err) } };
  }
}

/** Kiểm tra license của một máy (mirror hàm `verify`). */
export async function verifyLicense({ key, machineId } = {}) {
  const cleanKey = String(key ?? "").trim();
  const machine = String(machineId ?? "").trim();
  if (!cleanKey || !machine) {
    return { status: 400, body: { valid: false, message: "Key and machineId are required" } };
  }

  const db = await getDb();
  const snap = await db.collection("activationKeys").doc(hashKey(cleanKey)).get();
  if (!snap.exists) {
    return { status: 404, body: { valid: false, message: "Activation key not found" } };
  }

  const data = snap.data() ?? {};
  if (data.status === "revoked") {
    return { status: 403, body: { valid: false, message: "Activation key has been revoked" } };
  }
  if (isExpired(data)) {
    return { status: 403, body: { valid: false, message: "License has expired" } };
  }
  if (data.status === "used" && data.machineId === machine) {
    return {
      status: 200,
      body: {
        valid: true,
        message: "Activated",
        plan: normalizePlan(data.plan),
        activatedAt: toIso(data.activatedAt),
        expiresAt: toIso(data.expiresAt),
      },
    };
  }
  return { status: 403, body: { valid: false, message: "License is not activated for this machine" } };
}

/** Thu hồi một key (admin). Trả về true nếu key tồn tại. */
export async function revokeLicense(key) {
  const cleanKey = String(key ?? "").trim();
  if (!cleanKey) throw new Error("Thiếu key");
  const db = await getDb();
  const ref = db.collection("activationKeys").doc(hashKey(cleanKey));
  const snap = await ref.get();
  if (!snap.exists) return false;
  await ref.update({ status: "revoked", revokedAt: new Date() });
  return true;
}

/** Thống kê theo status/plan (admin) — không lộ key. */
export async function licenseStats() {
  const db = await getDb();
  const snap = await db.collection("activationKeys").get();
  const byStatus = {};
  const byPlan = {};
  snap.forEach((doc) => {
    const d = doc.data() ?? {};
    const status = d.status ?? "unknown";
    const plan = normalizePlan(d.plan);
    byStatus[status] = (byStatus[status] ?? 0) + 1;
    byPlan[plan] = (byPlan[plan] ?? 0) + 1;
  });
  return { total: snap.size, byStatus, byPlan };
}
