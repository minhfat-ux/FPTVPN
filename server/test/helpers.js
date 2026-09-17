/**
 * Shared test harness.
 *
 * MUST be imported before any `src/*` module: ESM evaluates this file first
 * (it is the first import), so the env vars are in place before `config.js`
 * reads them — each test file therefore gets its own temp data dir and port.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "fbuddy-test-"));
process.env.FBUDDY_DATA_DIR = dataDir;
process.env.FBUDDY_SECRET = "test-secret-0123456789-abcdefghij";
process.env.FBUDDY_PORT = "0";
process.env.FBUDDY_HOST = "127.0.0.1";
process.env.NODE_ENV = "test";

export const TEST_DATA_DIR = dataDir;

let booted = null;

/** Boots the real express app on an ephemeral port. */
export async function bootServer() {
  if (booted) return booted;
  const mod = await import("../src/index.js");
  if (!mod.server.listening) await once(mod.server, "listening");
  const { port } = mod.server.address();
  booted = { baseUrl: `http://127.0.0.1:${port}`, server: mod.server, app: mod.app };
  return booted;
}

export async function closeServer() {
  if (!booted) return;
  await new Promise((resolve) => booted.server.close(resolve));
  booted = null;
}

/** `api('POST', '/auth/login', body, token)` → parsed JSON (throws on !ok). */
export async function api(method, path, body = undefined, token = undefined) {
  const { baseUrl } = await bootServer();
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${baseUrl}/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const json = text ? safeJson(text) : null;
  if (!response.ok) {
    const error = new Error(`${method} ${path} → ${response.status}: ${text.slice(0, 300)}`);
    error.status = response.status;
    error.body = json;
    throw error;
  }
  return json;
}

export async function apiRaw(method, path, body = undefined, token = undefined) {
  const { baseUrl } = await bootServer();
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${baseUrl}/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function uploadFile({ name, mime, content, token, conversationId = null }) {
  const { baseUrl } = await bootServer();
  const form = new FormData();
  form.append("file", new Blob([content], { type: mime }), name);
  if (conversationId) form.append("conversationId", conversationId);
  const response = await fetch(`${baseUrl}/api/files`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`upload → ${response.status}: ${text.slice(0, 300)}`);
  return safeJson(text);
}

/** Registers the first (admin) account and returns { token, user }. */
export async function registerAdmin(email = "admin@fbuddy.test") {
  const result = await api("POST", "/auth/register", {
    email,
    password: "matkhau12345",
    name: "Quản trị",
  });
  return result;
}

/** Consumes an SSE response into `[{ event, data }]`. */
export async function readSse(response) {
  const events = [];
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let index = buffer.indexOf("\n\n");
    while (index !== -1) {
      const block = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      const parsed = parseBlock(block);
      if (parsed) events.push(parsed);
      index = buffer.indexOf("\n\n");
    }
  }
  return events;
}

function parseBlock(block) {
  let event = "message";
  const dataLines = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  if (!dataLines.length) return null;
  return { event, data: safeJson(dataLines.join("\n")) };
}

/** Runs one chat turn in the mock provider and returns its SSE events. */
export async function chat({ token, content, skill = "auto", attachments = [], conversationId = null, toolMode = "auto" }) {
  const response = await apiRaw("POST", "/chat/stream", {
    content,
    skill,
    attachments,
    conversationId,
    toolMode,
  }, token);
  if (!response.ok) throw new Error(`chat/stream → ${response.status}: ${(await response.text()).slice(0, 300)}`);
  return readSse(response);
}

export function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function textOf(events) {
  return events
    .filter((e) => e.event === "delta")
    .map((e) => e.data.text)
    .join("");
}

export function eventsNamed(events, name) {
  return events.filter((e) => e.event === name);
}
