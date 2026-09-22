/**
 * Cảnh báo Telegram cho mac-selfdefense.
 *
 * Đọc `~/.vpnflow-telegram` (cùng convention với scripts/housekeeping/restart-dsh-web.sh).
 * Token KHÔNG bao giờ được ghi ra log hay báo cáo.
 *
 * Vì sao có 2 transport: mạng của máy Mac này KHÔNG tới được api.telegram.org
 * (đo 22/09/2026: http=000 sau 10s), nhưng VPS 103.173.155.50 thì tới được (http=302).
 * Nên ngoài đường trực tiếp còn có đường relay qua SSH tới VPS của chính chủ dự án.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

export const DEFAULT_TG_FILE = path.join(os.homedir(), ".vpnflow-telegram");

export const DEFAULT_RELAY = {
  host: "root@103.173.155.50",
  key: path.join(os.homedir(), ".ssh", "dsh_tunnel"),
  sshBin: "/usr/bin/ssh",
};

export function expandHome(p) {
  if (typeof p !== "string") return p;
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

/**
 * Lấy 1 giá trị từ file cấu hình dạng text.
 *
 * Nhận CẢ HAI kiểu ngăn cách vì file thật trên máy dùng `=`:
 *   TELEGRAM_BOT_TOKEN=123:ABC      (kiểu đang dùng trong ~/.vpnflow-telegram)
 *   "TELEGRAM_CHAT_ID": "456"       (kiểu JSON)
 * Bản cũ chỉ nhận `:` nên không bao giờ khớp file thật ⇒ mọi alert đều im lặng.
 */
export function pickValue(text, key) {
  const re = new RegExp(`^\\s*"?${key}"?\\s*[:=]\\s*"?([^"\\r\\n]+?)"?\\s*$`, "m");
  const m = text.match(re);
  return m ? m[1].trim() : null;
}

/** @returns {{token: string, chat: string, relayHost: string}|null} */
export function readTelegramCreds(file = DEFAULT_TG_FILE) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
  const token = pickValue(text, "TELEGRAM_BOT_TOKEN");
  const chat = pickValue(text, "TELEGRAM_CHAT_ID");
  if (!token || !chat) return null;
  return { token, chat, relayHost: pickValue(text, "TELEGRAM_RELAY_HOST") ?? DEFAULT_RELAY.host };
}

/** Bỏ token khỏi mọi chuỗi trước khi ghi log. */
export function redact(text, creds) {
  let out = String(text ?? "");
  if (creds?.token) out = out.split(creds.token).join("<TOKEN>");
  return out;
}

/**
 * Chống spam: cùng một nội dung trong `windowMs` thì chỉ gửi 1 lần.
 * Trạng thái nằm trên đĩa để sống sót qua restart của daemon.
 */
export class Deduper {
  constructor(stateFile, windowMs = 10 * 60 * 1000) {
    this.stateFile = stateFile;
    this.windowMs = windowMs;
    this.seen = new Map();
    this.#load();
  }

  #load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.stateFile, "utf8"));
      const now = Date.now();
      for (const [k, ts] of Object.entries(raw.seen ?? {})) {
        if (now - ts < this.windowMs) this.seen.set(k, ts);
      }
    } catch {
      /* lần chạy đầu */
    }
  }

  #save() {
    try {
      fs.mkdirSync(path.dirname(this.stateFile), { recursive: true });
      fs.writeFileSync(this.stateFile, JSON.stringify({ seen: Object.fromEntries(this.seen) }, null, 2));
    } catch {
      /* không chặn luồng cảnh báo chỉ vì không ghi được state */
    }
  }

  shouldSend(key) {
    const now = Date.now();
    const last = this.seen.get(key);
    if (last && now - last < this.windowMs) return false;
    this.seen.set(key, now);
    this.#save();
    return true;
  }
}

export function keyOf(text) {
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);
}

function shellQuote(s) {
  return `'${String(s).split("'").join(`'\\''`)}'`;
}

/** Dựng URL + body của lời gọi sendMessage. */
export function buildTelegramRequest(creds, text) {
  return {
    url: `https://api.telegram.org/bot${creds.token}/sendMessage`,
    body: new URLSearchParams({ chat_id: creds.chat, text }).toString(),
  };
}

/** Đường trực tiếp: máy này tự gọi được api.telegram.org. */
export async function sendViaDirect(req, { timeoutMs = 15000, fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== "function") return { ok: false, error: "không có fetch" };
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetchImpl(req.url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: req.body,
      signal: ac.signal,
    });
    return { ok: res.ok, status: res.status, transport: "direct" };
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err), transport: "direct" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Đường relay: SSH tới VPS rồi để VPS gọi Telegram.
 *
 * Body được đẩy qua stdin (`--data-binary @-`) nên nội dung cảnh báo KHÔNG bao giờ
 * nằm trong command line của tiến trình trên VPS.
 */
export function sendViaSsh(req, opts = {}) {
  const {
    host = DEFAULT_RELAY.host,
    key = DEFAULT_RELAY.key,
    sshBin = DEFAULT_RELAY.sshBin,
    timeoutMs = 25000,
    spawn = spawnSync,
  } = opts;

  const remote =
    `/usr/bin/curl -s -m 20 -X POST ${shellQuote(req.url)} ` +
    `-H 'content-type: application/x-www-form-urlencoded' --data-binary @-`;

  const res = spawn(
    sshBin,
    [
      "-i", expandHome(key),
      "-o", "IdentitiesOnly=yes",
      "-o", "BatchMode=yes",
      "-o", "ConnectTimeout=8",
      "-o", "StrictHostKeyChecking=accept-new",
      host,
      remote,
    ],
    { input: req.body, encoding: "utf8", timeout: timeoutMs },
  );

  if (res.error) return { ok: false, error: String(res.error.message ?? res.error), transport: "ssh" };
  if (res.status !== 0) {
    return {
      ok: false,
      error: `ssh rc=${res.status} ${String(res.stderr ?? "").trim().slice(0, 200)}`,
      transport: "ssh",
    };
  }
  try {
    const parsed = JSON.parse(res.stdout || "{}");
    return { ok: Boolean(parsed.ok), status: parsed.ok ? 200 : 400, transport: "ssh", detail: parsed.description };
  } catch {
    return { ok: false, error: `phản hồi lạ: ${String(res.stdout ?? "").slice(0, 200)}`, transport: "ssh" };
  }
}

/**
 * Gửi 1 tin Telegram. Không bao giờ throw — cảnh báo lỗi không được làm chết daemon.
 *
 * @param {'direct'|'ssh'|'auto'} transport 'auto' = thử trực tiếp, thất bại thì relay.
 */
export async function sendTelegram(text, opts = {}) {
  const {
    file = DEFAULT_TG_FILE,
    timeoutMs = 15000,
    fetchImpl = globalThis.fetch,
    spawn = spawnSync,
    transport = "auto",
    creds = readTelegramCreds(file),
    relayHost,
    relayKey,
  } = opts;

  if (!creds) return { ok: false, error: `thiếu TELEGRAM_BOT_TOKEN/CHAT_ID trong ${file}` };
  const req = buildTelegramRequest(creds, text);

  if (transport === "direct") return sendViaDirect(req, { timeoutMs, fetchImpl });
  if (transport === "ssh") {
    return sendViaSsh(req, { host: relayHost ?? creds.relayHost, key: relayKey, spawn, timeoutMs: timeoutMs + 10000 });
  }

  const direct = await sendViaDirect(req, { timeoutMs: Math.min(timeoutMs, 8000), fetchImpl });
  if (direct.ok) return direct;
  const relay = sendViaSsh(req, {
    host: relayHost ?? creds.relayHost,
    key: relayKey,
    spawn,
    timeoutMs: timeoutMs + 10000,
  });
  if (relay.ok) return relay;
  return { ok: false, error: `direct: ${direct.error}; ssh: ${relay.error}`, transport: "auto" };
}
