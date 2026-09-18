import crypto from "node:crypto";
import { all, getById, insert, one, update } from "./db.js";
import { config } from "./config.js";
import { badRequest, notFound, nowIso } from "./util.js";

/**
 * Key kích hoạt cho **app Windows** (MeetFlow AI Overlay).
 *
 * Khác hẳn hướng đã bỏ (backend proxy giữ key nhà cung cấp): ở đây app vẫn để khách
 * tự nhập key Soniox/OpenRouter, còn "key kích hoạt" chỉ là thứ chủ dự án phát cho
 * khách để mở khoá app — sinh bằng một nút trong Control Panel, hoặc tự động gửi
 * email khi webhook xác nhận đã nhận tiền.
 *
 * App gọi: `POST {ActivationApiUrl}/activate` với `{ key, machineId }` và mong nhận
 * `{ valid, message, plan, activatedAt, expiresAt }` (xem `ActivationService.cs`).
 *
 * Nguyên tắc:
 *  - DB **chỉ lưu hash** của key (không lưu key gốc) ⇒ mất DB cũng không lộ key khách.
 *  - Key gắn được với một user/đơn để biết của ai, nhưng vẫn dùng được như key phát tay.
 *  - Mỗi key có hạn mức số máy (`maxDevices`), thu hồi được từng máy hoặc cả key.
 */

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const KEY_PREFIX = "MFW";
const KEY_BODY_LENGTH = 12;

/** `MFW-XXXX-XXXX-XXXX` — 60 bit, bỏ I/L/O/U cho khỏi lẫn khi đọc qua điện thoại. */
export function generateKey() {
  let body = "";
  for (let i = 0; i < KEY_BODY_LENGTH; i += 1) body += ALPHABET[crypto.randomInt(0, ALPHABET.length)];
  return `${KEY_PREFIX}-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}`;
}

/** Chuẩn hoá thứ khách dán vào (khoảng trắng, gạch, nhầm O/0, I/1, thiếu prefix). */
export function normalizeKey(input) {
  let raw = String(input ?? "")
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "");
  if (raw.startsWith(KEY_PREFIX)) raw = raw.slice(KEY_PREFIX.length);
  return raw.replace(/O/g, "0").replace(/[IL]/g, "1");
}

export function isWellFormedKey(input) {
  const raw = normalizeKey(input);
  return raw.length === KEY_BODY_LENGTH && [...raw].every((char) => ALPHABET.includes(char));
}

function keyHash(key) {
  return crypto.createHmac("sha256", `desktop-key:${config.secret}`).update(normalizeKey(key)).digest("hex");
}

function keyHint(key) {
  return normalizeKey(key).slice(-4);
}

export function publicKey(row) {
  if (!row) return null;
  return {
    id: row.id,
    keyHint: row.key_hint,
    userId: row.user_id ?? null,
    email: row.email ?? null,
    orderId: row.order_id ?? null,
    plan: row.plan,
    maxDevices: Number(row.max_devices ?? 1),
    status: row.status,
    note: row.note ?? null,
    sentAt: row.sent_at ?? null,
    revokedAt: row.revoked_at ?? null,
    createdAt: row.created_at,
    activations: listActivations({ keyId: row.id }),
  };
}

/**
 * Sinh một key mới và trả về **key gốc đúng một lần** (sau đó chỉ còn `keyHint`).
 * Dùng cho nút "Gen key" trong Control Panel và cho luồng tự động khi đơn `paid`.
 */
export function issueKey({ userId = null, email = null, orderId = null, plan = "windows", maxDevices = 1, note = null, createdBy = null }) {
  const cleanMax = Math.max(1, Math.min(20, Number(maxDevices) || 1));
  const expiresAt = null; // key không hết hạn; thu hồi bằng tay

  let key = generateKey();
  for (let attempt = 0; attempt < 5 && one("desktop_keys", "key_hash = ?", [keyHash(key)]); attempt += 1) {
    key = generateKey();
  }

  const row = insert("desktop_keys", {
    key_hash: keyHash(key),
    key_hint: keyHint(key),
    user_id: userId,
    email,
    order_id: orderId,
    plan: String(plan || "windows").slice(0, 40),
    max_devices: cleanMax,
    status: "active",
    note: note ? String(note).slice(0, 200) : null,
    created_by: createdBy,
    created_at: nowIso(),
    updated_at: nowIso(),
  });

  return { key, record: publicKey(row), expiresAt };
}

export function findKeyRow(key) {
  if (!isWellFormedKey(key)) return null;
  return one("desktop_keys", "key_hash = ?", [keyHash(key)]);
}

export function listKeys({ userId = null, status = null, limit = 50 } = {}) {
  const clauses = [];
  const params = [];
  if (userId) {
    clauses.push("user_id = ?");
    params.push(userId);
  }
  if (status) {
    clauses.push("status = ?");
    params.push(status);
  }
  const capped = Math.max(1, Math.min(200, Number(limit) || 50));
  return all("desktop_keys", clauses.join(" AND "), params, { order: "created_at DESC", limit: capped }).map(publicKey);
}

export function revokeKey({ id, reason = "admin_revoked", actor = null }) {
  const row = getById("desktop_keys", id);
  if (!row) throw notFound("Không tìm thấy key");
  if (row.revoked_at) return publicKey(row);
  update("desktop_keys", id, { status: "revoked", revoked_at: nowIso(), note: row.note });
  return publicKey(getById("desktop_keys", id));
}

export function markKeySent(id) {
  return publicKey(update("desktop_keys", id, { sent_at: nowIso() }));
}

export function listActivations({ keyId, machineId = null } = {}) {
  const clauses = ["key_id = ?"];
  const params = [keyId];
  if (machineId) {
    clauses.push("machine_id = ?");
    params.push(machineId);
  }
  return all("desktop_key_activations", clauses.join(" AND "), params, { order: "activated_at ASC" }).map((row) => ({
    id: row.id,
    machineId: row.machine_id,
    machineLabel: row.machine_label ?? null,
    activatedAt: row.activated_at,
    lastSeenAt: row.last_seen_at,
    revokedAt: row.revoked_at ?? null,
  }));
}

/**
 * Cổng mà **app Windows** gọi vào (`POST /api/desktop/activate`).
 *
 * Trả đúng hình dạng `ActivationService.cs` mong đợi. Mọi nhánh từ chối đều trả
 * `valid: false` kèm câu tiếng Anh ngắn (app hiển thị thẳng chuỗi này).
 *
 * @returns {{valid: boolean, message: string, plan?: string, activatedAt?: string, expiresAt?: string|null}}
 */
export function activateKey({ key, machineId, machineLabel = null, ip = null }) {
  const cleanMachine = String(machineId ?? "").trim().slice(0, 128);
  if (!cleanMachine) {
    return { valid: false, message: "Machine id is required." };
  }
  if (!isWellFormedKey(key)) {
    return { valid: false, message: "Activation key format is invalid." };
  }

  const row = findKeyRow(key);
  if (!row) {
    return { valid: false, message: "Activation key not found." };
  }
  if (row.revoked_at || row.status !== "active") {
    return { valid: false, message: "This activation key has been revoked." };
  }

  const activations = listActivations({ keyId: row.id });
  const existing = activations.find((entry) => entry.machineId === cleanMachine && !entry.revokedAt);

  if (!existing) {
    const live = activations.filter((entry) => !entry.revokedAt);
    if (live.length >= Number(row.max_devices ?? 1)) {
      return { valid: false, message: "This key has reached its device limit." };
    }
    // Máy đã bị thu hồi thì không tự kích hoạt lại (thu hồi phải "dính").
    const wasRevoked = activations.some((entry) => entry.machineId === cleanMachine && entry.revokedAt);
    if (wasRevoked) {
      return { valid: false, message: "This device has been revoked." };
    }

    insert("desktop_key_activations", {
      key_id: row.id,
      machine_id: cleanMachine,
      machine_label: machineLabel ? String(machineLabel).slice(0, 64) : null,
      ip: ip ? String(ip).slice(0, 64) : null,
      activated_at: nowIso(),
      last_seen_at: nowIso(),
      created_at: nowIso(),
      updated_at: nowIso(),
    });
  } else {
    update("desktop_key_activations", existing.id, { last_seen_at: nowIso(), machine_label: machineLabel ?? existing.machineLabel });
  }

  const fresh = getById("desktop_keys", row.id);
  return {
    valid: true,
    message: "Activated",
    plan: fresh.plan,
    activatedAt: fresh.created_at,
    expiresAt: null,
  };
}

export function revokeActivation({ keyId, activationId, reason = "admin_revoked" }) {
  const row = getById("desktop_key_activations", activationId);
  if (!row || row.key_id !== keyId) throw notFound("Không tìm thấy máy đã kích hoạt");
  if (row.revoked_at) return publicKey(getById("desktop_keys", keyId));
  update("desktop_key_activations", activationId, { revoked_at: nowIso(), updated_at: nowIso() });
  return publicKey(getById("desktop_keys", keyId));
}

/** Đơn đã `paid` này đã có key chưa? (idempotent cho webhook gọi lại nhiều lần) */
export function keyForOrder(orderId) {
  if (!orderId) return null;
  return one("desktop_keys", "order_id = ? AND revoked_at IS NULL", [orderId]);
}

export function assertKeyRequest(body) {
  const maxDevices = Number(body?.maxDevices ?? 1);
  if (!Number.isFinite(maxDevices) || maxDevices < 1) {
    throw badRequest("Số máy tối đa phải là số nguyên >= 1");
  }
  return { maxDevices: Math.min(20, Math.trunc(maxDevices)) };
}
