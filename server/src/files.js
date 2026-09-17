import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import { insert, getById, remove, all } from "./db.js";
import { badRequest, notFound } from "./util.js";

export const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "text/tab-separated-values",
  "application/json",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const EXT_MIME = {
  ".csv": "text/csv",
  ".tsv": "text/tab-separated-values",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".json": "application/json",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pdf": "application/pdf",
};

export function kindFor(mime, name = "") {
  if (String(mime).startsWith("image/")) return "image";
  const ext = path.extname(name).toLowerCase();
  if ([".csv", ".tsv", ".xlsx", ".xls"].includes(ext)) return "data";
  if ([".pptx"].includes(ext)) return "pptx";
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("text/") || mime === "application/json") return "text";
  return "document";
}

export function normalizeMime(mime, name) {
  const ext = path.extname(String(name ?? "")).toLowerCase();
  if (!mime || mime === "application/octet-stream") return EXT_MIME[ext] ?? "application/octet-stream";
  return mime;
}

export function isAllowed(mime, name) {
  const normalized = normalizeMime(mime, name);
  if (ALLOWED_MIME.has(normalized)) return true;
  return EXT_MIME[path.extname(String(name ?? "")).toLowerCase()] !== undefined;
}

function publicFileBase(row) {
  return {
    id: row.id,
    name: row.name,
    mime: row.mime,
    size: row.size,
    kind: row.kind,
    origin: row.origin,
    createdAt: row.created_at,
  };
}

export function publicFile(row) {
  if (!row) return null;
  return { ...publicFileBase(row), url: `/api/files/${row.id}/content` };
}

export function publicArtifact(row) {
  if (!row) return null;
  return {
    ...publicFileBase(row),
    url: `/api/files/${row.id}/content`,
    meta: row.meta ?? {},
  };
}

export async function saveBuffer({
  userId,
  conversationId = null,
  name,
  mime,
  buffer,
  origin = "upload",
  kind = null,
  meta = {},
}) {
  const size = buffer.length;
  const maxBytes = 25 * 1024 * 1024;
  if (size > maxBytes) throw badRequest(`Tệp vượt quá ${Math.round(maxBytes / 1024 / 1024)}MB`);
  const resource = insert("files", {
    user_id: userId,
    conversation_id: conversationId,
    name: String(name || "file").slice(0, 200),
    mime: normalizeMime(mime, name),
    size,
    stored_name: "",
    kind: kind ?? kindFor(mime, name),
    origin,
    meta_json: meta,
  });
  const ext = path.extname(String(name ?? "")).slice(0, 12);
  const storedName = `${resource.id}${ext}`;
  await fs.writeFile(path.join(config.filesDir, storedName), buffer);
  const { update } = await import("./db.js");
  return update("files", resource.id, { stored_name: storedName });
}

export async function readFileBuffer(row) {
  if (!row) throw notFound("Không tìm thấy tệp");
  const full = path.join(config.filesDir, row.stored_name);
  const buffer = await fs.readFile(full);
  return { buffer, mime: row.mime, name: row.name };
}

export function getFileRow(id) {
  return getById("files", id);
}

export function getOwnedFile(id, userId) {
  const row = getById("files", id);
  if (!row || row.user_id !== userId) throw notFound("Không tìm thấy tệp");
  return row;
}

/**
 * Resolves the file a tool was asked to work on.
 *
 * Models routinely pass the file *name* (`IMG_3737.jpeg`) where the schema asks
 * for an id, which used to fail with a bare "Không tìm thấy tệp" and left the
 * user staring at "tôi gặp vấn đề khi tạo Excel từ ảnh". An id wins; otherwise a
 * name is accepted (newest first, ideally from this conversation) and the error
 * tells the model exactly what to do next.
 */
export function resolveOwnedFile({ id = null, name = null, userId, conversationId = null, expectKind = null }) {
  const wanted = String(id ?? name ?? "").trim();
  if (!wanted) throw badRequest("Thiếu `fileId` (gọi list_files để lấy id)");

  let row = getById("files", wanted);
  if (row && row.user_id !== userId) row = null;

  if (!row) {
    const named = all("files", "user_id = ? AND name = ?", [userId, wanted], { order: "created_at DESC", limit: 5 });
    row = (conversationId ? named.find((entry) => entry.conversation_id === conversationId) : null) ?? named[0] ?? null;
  }

  if (!row) {
    const available = all("files", "user_id = ?", [userId], { order: "created_at DESC", limit: 8 });
    const hint = available.length
      ? `Tệp đang có: ${available.map((entry) => `${entry.name} (id: ${entry.id})`).join(", ")}`
      : "Người dùng chưa tải tệp nào lên.";
    throw badRequest(`Không tìm thấy tệp "${wanted}". Gọi list_files để lấy đúng id. ${hint}`);
  }

  if (expectKind && row.kind !== expectKind) {
    throw badRequest(`${row.name} không phải ${expectKind === "image" ? "ảnh" : expectKind} (đang là ${row.kind})`);
  }
  return row;
}

export function listFiles(userId, { conversationId = null, origin = null, limit = 100 } = {}) {
  const clauses = ["user_id = ?"];
  const params = [userId];
  if (conversationId) {
    clauses.push("conversation_id = ?");
    params.push(conversationId);
  }
  if (origin) {
    clauses.push("origin = ?");
    params.push(origin);
  }
  return all("files", clauses.join(" AND "), params, { order: "created_at DESC", limit });
}

export async function deleteFile(row) {
  try {
    await fs.unlink(path.join(config.filesDir, row.stored_name));
  } catch {
    // Already gone — deleting the row is what matters.
  }
  return remove("files", row.id);
}

export function serializeAttachment(row) {
  return publicFile(row);
}

/** Base64 payload for vision models. */
export async function asImagePayload(row, { maxBytes = 8 * 1024 * 1024 } = {}) {
  if (!row || row.kind !== "image") return null;
  if (row.size > maxBytes) return null;
  const { buffer, mime } = await readFileBuffer(row);
  return { mime, dataBase64: buffer.toString("base64"), name: row.name };
}

/** Plain-text payload for text-like files (CSV, TXT, JSON) used as chat context. */
export async function asTextPayload(row, { maxChars = 20000 } = {}) {
  const ext = path.extname(row.name).toLowerCase();
  const textual =
    row.mime.startsWith("text/") || [".csv", ".tsv", ".md", ".json", ".txt"].includes(ext);
  if (!textual) return null;
  const { buffer } = await readFileBuffer(row);
  const text = buffer.toString("utf8");
  return { text: text.length > maxChars ? `${text.slice(0, maxChars)}\n…(đã cắt bớt)` : text, truncated: text.length > maxChars };
}
