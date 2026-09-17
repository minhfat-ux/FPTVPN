import crypto from "node:crypto";

export function newId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

export function nowIso() {
  return new Date().toISOString();
}

/** Error carrying an HTTP status + stable machine code (see docs/API_CONTRACT.md §0). */
export class ApiError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (msg, details) => new ApiError(400, "bad_request", msg, details);
export const unauthorized = (msg = "Cần đăng nhập") => new ApiError(401, "unauthorized", msg);
export const forbidden = (msg = "Không có quyền") => new ApiError(403, "forbidden", msg);
export const notFound = (msg = "Không tìm thấy") => new ApiError(404, "not_found", msg);
export const rateLimited = (msg = "Quá nhiều yêu cầu, thử lại sau") =>
  new ApiError(429, "rate_limited", msg);

/** Wrap an async express handler so rejections reach the error middleware. */
export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

export function slugify(input, fallback = "item") {
  const s = String(input ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return s || fallback;
}

export function truncate(text, max) {
  const s = String(text ?? "");
  return s.length <= max ? s : `${s.slice(0, Math.max(0, max - 1))}…`;
}

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, Number(n) || 0));
}

export function parseJson(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function boolToInt(v) {
  return v ? 1 : 0;
}

export function intToBool(v) {
  return Number(v) === 1;
}

/** Small fixed-window rate limiter (per key) — no external store needed. */
export class RateLimiter {
  constructor({ limit, windowMs }) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.hits = new Map();
  }

  check(key) {
    const now = Date.now();
    const entry = this.hits.get(key);
    if (!entry || now - entry.start >= this.windowMs) {
      this.hits.set(key, { start: now, count: 1 });
      return { ok: true, remaining: this.limit - 1 };
    }
    entry.count += 1;
    if (entry.count > this.limit) {
      return { ok: false, remaining: 0, retryAfterMs: this.windowMs - (now - entry.start) };
    }
    return { ok: true, remaining: this.limit - entry.count };
  }

  /** Drop expired buckets so the map cannot grow without bound. */
  sweep() {
    const now = Date.now();
    for (const [key, entry] of this.hits) {
      if (now - entry.start >= this.windowMs) this.hits.delete(key);
    }
  }
}

/**
 * Vietnamese-aware title heuristic: first line, trimmed, no trailing punctuation.
 * Used when the model is unavailable, so a conversation always has a readable title.
 */
export function titleFromText(text, max = 64) {
  const firstLine = String(text ?? "").split(/\r?\n/).find((l) => l.trim()) ?? "";
  const cleaned = firstLine.replace(/^[#>*\-\s]+/, "").replace(/[.,;:!?]+$/, "").trim();
  return truncate(cleaned || "Hội thoại mới", max);
}
