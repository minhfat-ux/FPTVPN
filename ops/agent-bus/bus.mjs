#!/usr/bin/env node
/**
 * AGENT BUS — hàng đợi thông báo giữa hai harness, chạy TRÊN VPS.
 *
 * Vì sao cần: VPS không gọi VÀO được máy Windows (nó là client VPN một chiều: ping chết, không cổng
 * nào mở). Nhưng máy Windows gọi RA VPS thì được — qua tunnel (`10.77.0.1`) hoặc IP public. Nên thay
 * vì bắt bên kia poll git (nặng, có thể kẹt vì cây dirty), ta để họ poll một endpoint nhỏ ở đây:
 * nhanh, nhẹ, và VPS là máy luôn bật.
 *
 * Endpoint (đều cần token):
 *   POST /push   { to, kind, title, body?, ref? }   → thêm thông báo cho một bên
 *   GET  /pull?agent=win&since=<id>                 → thông báo mới hơn <id> gửi cho agent đó
 *   GET  /health                                    → không cần token
 *
 * Lưu trữ: JSONL ở AGENT_BUS_STORE (mặc định /var/lib/agent-bus/messages.jsonl) — không mất khi restart.
 * Token: AGENT_BUS_TOKEN (bắt buộc).
 */

import dns from "node:dns";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

// VPS này chỉ resolve api.telegram.org sang IPv6 (không có route IPv6) ⇒ fetch của Node chết với
// "fetch failed", trong khi curl -4 thì 200. Ưu tiên IPv4 để alert Telegram đi được.
dns.setDefaultResultOrder("ipv4first");

const PORT = Number(process.env.AGENT_BUS_PORT || 7799);
const HOST = process.env.AGENT_BUS_HOST || "0.0.0.0";
const TOKEN = String(process.env.AGENT_BUS_TOKEN || "").trim();
const STORE = process.env.AGENT_BUS_STORE || "/var/lib/agent-bus/messages.jsonl";
const PRESENCE = process.env.AGENT_BUS_PRESENCE || "/var/lib/agent-bus/presence.json";
const MAX_KEEP = Number(process.env.AGENT_BUS_MAX || 2000);

const TG_TOKEN = String(process.env.AGENT_TG_TOKEN || "").trim();
const TG_CHAT = String(process.env.AGENT_TG_CHAT || "").trim();

/**
 * IP THẬT của client. Sau Caddy, `remoteAddress` luôn là 127.0.0.1 nên nếu chỉ nhìn nó thì
 * mọi request từ Internet đều bị coi là "trong VPN" (đã gặp thật: /token trả 200 từ Internet).
 * Caddy nối IP thật vào CUỐI `X-Forwarded-For`, nên lấy phần tử cuối là đúng.
 */
function clientIp(req) {
  const raw = String(req.socket.remoteAddress ?? "").replace(/^::ffff:/, "");
  if (raw !== "127.0.0.1" && raw !== "::1") return raw;
  const forwarded = String(req.headers["x-forwarded-for"] ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return forwarded.length ? forwarded[forwarded.length - 1].replace(/^::ffff:/, "") : raw;
}

const insideVpn = (ip) => /^10\.(77|78)\./.test(ip) || ip === "127.0.0.1" || ip === "::1";

/**
 * Alert lên Telegram cho NGƯỜI (Telegram chỉ để alert, không phải kênh máy–máy).
 *
 * Dùng `curl -4` chứ không dùng fetch: trên VPS này `fetch` của Node bị ETIMEDOUT tới
 * api.telegram.org (TCP thẳng và curl đều OK — đã đo), nên curl là đường chắc ăn.
 */
async function alert(text) {
  if (!TG_TOKEN || !TG_CHAT) return null;
  try {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const run = promisify(execFile);
    const { stdout } = await run(
      "curl",
      [
        "-4", "-sS", "-m", "10",
        "-X", "POST",
        `https://api.telegram.org/bot${TG_TOKEN}/sendMessage`,
        "--data-urlencode", `chat_id=${TG_CHAT}`,
        "--data-urlencode", `text=${text}`,
        "--data-urlencode", "disable_web_page_preview=true",
      ],
      { timeout: 12000 },
    );
    const json = JSON.parse(stdout || "{}");
    if (!json?.ok) {
      console.log(`[bus] alert lỗi: ${JSON.stringify(json).slice(0, 160)}`);
      return null;
    }
    console.log(`[bus] alert Telegram OK (message_id ${json.result.message_id})`);
    return json.result.message_id;
  } catch (error) {
    console.log(`[bus] alert lỗi: ${String(error?.message ?? error).slice(0, 160)}`);
    return null;
  }
}

if (!TOKEN) {
  console.error("Thiếu AGENT_BUS_TOKEN — từ chối chạy.");
  process.exit(2);
}
fs.mkdirSync(path.dirname(STORE), { recursive: true });
if (!fs.existsSync(STORE)) fs.writeFileSync(STORE, "");

/**
 * Ai đang thực sự poll connector. Không có "presence" thì không biết bên kia còn sống hay không —
 * đây chính là thứ phân biệt "đã gửi" với "đã có người nhận".
 */
function readPresence() {
  try {
    return JSON.parse(fs.readFileSync(PRESENCE, "utf8"));
  } catch {
    return {};
  }
}

function touchPresence(agent, ip, since, count) {
  const table = readPresence();
  table[agent] = { at: new Date().toISOString(), ip, lastSince: since, messages: count };
  try {
    fs.writeFileSync(PRESENCE, JSON.stringify(table, null, 1));
  } catch {
    /* không ghi được thì thôi */
  }
}

/** Đọc toàn bộ thông báo, cắt bớt nếu quá dài. */
function readAll() {
  const lines = fs.readFileSync(STORE, "utf8").split("\n").filter(Boolean);
  const items = [];
  for (const line of lines) {
    try {
      items.push(JSON.parse(line));
    } catch {
      /* bỏ dòng hỏng */
    }
  }
  return items;
}

function compact() {
  const items = readAll();
  if (items.length <= MAX_KEEP) return;
  fs.writeFileSync(STORE, `${items.slice(-MAX_KEEP).map((item) => JSON.stringify(item)).join("\n")}\n`);
}

function authorised(req, url) {
  const header = String(req.headers.authorization ?? "");
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return bearer === TOKEN || url.searchParams.get("token") === TOKEN;
}

function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(body) });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 64 * 1024) throw new Error("body quá lớn");
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  return text ? JSON.parse(text) : {};
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  try {
    if (url.pathname === "/health") {
      const items = readAll();
      return send(res, 200, { ok: true, count: items.length, latest: items.length ? items[items.length - 1].id : 0 });
    }
    // Tự đăng ký token: CHỈ cho máy nằm trong subnet VPN (10.77.0.0/24, 10.78.0.0/24).
    // Nhờ vậy client VPN tự lấy được token mà không cần người chép tay, còn Internet thì không.
    if (req.method === "GET" && url.pathname === "/token") {
      const ip = clientIp(req);
      if (!insideVpn(ip)) {
        console.log(`[bus] TỪ CHỐI cấp token cho ${ip}`);
        void alert(`[BUS] ⛔ Từ chối cấp token cho IP ngoài VPN: ${ip}`);
        return send(res, 403, { error: "chỉ máy trong VPN mới lấy được token" });
      }
      console.log(`[bus] cấp token cho ${ip}`);
      void alert(`[BUS] 🔑 Cấp token cho máy trong VPN: ${ip}`);
      return send(res, 200, { token: TOKEN, note: "dùng làm Authorization: Bearer <token>" });
    }

    if (!authorised(req, url)) return send(res, 401, { error: "unauthorized" });

    if (req.method === "POST" && url.pathname === "/push") {
      const body = await readBody(req);
      const to = String(body.to ?? "").trim().toLowerCase();
      if (!to) return send(res, 400, { error: "thiếu `to`" });
      const items = readAll();
      const message = {
        id: (items.length ? items[items.length - 1].id : 0) + 1,
        at: new Date().toISOString(),
        to,
        from: String(body.from ?? "mac").toLowerCase(),
        kind: String(body.kind ?? "notify"),
        title: String(body.title ?? "").slice(0, 300),
        body: String(body.body ?? "").slice(0, 4000),
        ref: body.ref ? String(body.ref).slice(0, 200) : null,
      };
      fs.appendFileSync(STORE, `${JSON.stringify(message)}\n`);
      compact();
      console.log(`[bus] #${message.id} → ${message.to} (${message.kind}) ${message.title}`);
      // Mọi trao đổi đều alert lên Telegram cho người theo dõi.
      void alert(
        `[BUS] #${message.id} ${message.from}→${message.to} · ${message.kind}\n` +
          `${message.title}${message.body ? `\n${message.body.slice(0, 500)}` : ""}` +
          `${message.ref ? `\nref: ${message.ref}` : ""}`,
      );
      return send(res, 201, { ok: true, message });
    }

    if (req.method === "GET" && url.pathname === "/presence") {
      const table = readPresence();
      const now = Date.now();
      const agents = Object.entries(table).map(([agent, info]) => ({
        agent,
        ...info,
        secondsAgo: Math.round((now - new Date(info.at).getTime()) / 1000),
      }));
      return send(res, 200, { agents });
    }

    if (req.method === "GET" && url.pathname === "/pull") {
      const agent = String(url.searchParams.get("agent") ?? "").trim().toLowerCase();
      const since = Number(url.searchParams.get("since") ?? 0) || 0;
      if (!agent) return send(res, 400, { error: "thiếu `agent`" });
      const items = readAll();
      const messages = items.filter((item) => item.to === agent && item.id > since);
      touchPresence(agent, clientIp(req), since, messages.length);
      return send(res, 200, { agent, since, latest: items.length ? items[items.length - 1].id : 0, messages });
    }

    return send(res, 404, { error: "not found" });
  } catch (error) {
    return send(res, 500, { error: String(error?.message ?? error) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[bus] nghe ${HOST}:${PORT} · store ${STORE}`);
});
