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
 *   GET  /subscribe?agent=win&since=<id>&host=<m>   → KÊNH ĐẨY (SSE): giữ mở, có tin là nhận ngay
 *   GET  /health                                    → không cần token
 *
 * Hai kiểu nhận tin, dùng cho hai tình huống khác nhau:
 *   - /subscribe (khuyến nghị): bên kia giữ một kết nối mở, lúc rảnh KHÔNG chạy gì cả. Có tin thì
 *     VPS đẩy xuống trong cùng một nhịp mạng. Đây là cách đã thay thế cho watcher poll 20 giây —
 *     poll bắt máy Windows spawn git liên tục, mỗi tiến trình là một cửa sổ console nháy lên.
 *   - /pull: cho lúc mới bật máy (lấy tin đến trong lúc tắt) hoặc khi kênh đẩy chưa nối được.
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

function touchPresence(agent, ip, since, count, host = "") {
  const table = readPresence();
  table[agent] = { at: new Date().toISOString(), ip, host, lastSince: since, messages: count };
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

// ---- KÊNH ĐẨY (SSE): bên kia giữ MỘT kết nối mở, có tin thì VPS đẩy xuống ngay ----------------
// Vì sao: poll 20 giây buộc bên kia chạy git hàng chục lần mỗi vòng. Trên Windows mỗi tiến trình
// con là MỘT cửa sổ console nháy lên rồi tắt ⇒ màn hình nháy không ngớt (đã gặp thật). Giữ kết nối
// mở thì lúc rảnh bên kia KHÔNG spawn gì cả, chỉ tốn một socket nằm im.
const HEARTBEAT_MS = Number(process.env.AGENT_BUS_HEARTBEAT_MS || 20000);

/** agent → Set<{ res, at }> — nhiều kết nối cùng agent vẫn đẩy cho tất cả (không bỏ sót). */
const subscribers = new Map();

function subscriberCount(agent) {
  return subscribers.get(agent)?.size ?? 0;
}

/** Đẩy tức thì cho mọi kết nối đang mở của `message.to`. Trả về số kết nối đã đẩy. */
function deliver(message) {
  const set = subscribers.get(message.to);
  if (!set || !set.size) return 0;
  const frame = `id: ${message.id}\ndata: ${JSON.stringify(message)}\n\n`;
  let delivered = 0;
  for (const sub of set) {
    try {
      sub.res.write(frame);
      delivered += 1;
    } catch {
      /* đứt thì dọn ở sự kiện 'close' */
    }
  }
  return delivered;
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
      return send(res, 200, {
        ok: true,
        count: items.length,
        latest: items.length ? items[items.length - 1].id : 0,
        // Ai đang giữ kênh ĐẨY — nhìn đây là biết bên kia có nghe được hay không.
        subscribers: Object.fromEntries([...subscribers].map(([agent, set]) => [agent, set.size])),
      });
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

    /**
     * GET /subscribe?agent=win&host=<tên máy>&since=<id> — kênh ĐẨY (Server-Sent Events).
     * Giữ kết nối mở; có tin cho agent này là đẩy xuống ngay, không cần bên kia poll.
     *
     * Nhịp tim chỉ để giữ kết nối khỏi bị cắt vì rảnh (Cloudflare cắt sau ~100s) — KHÔNG phải
     * để bên kia hỏi tin, nên nó không sinh tiến trình nào ở phía client.
     */
    if (req.method === "GET" && (url.pathname === "/subscribe" || url.pathname === "/events")) {
      const agent = String(url.searchParams.get("agent") ?? "").trim().toLowerCase();
      if (!agent) return send(res, 400, { error: "thiếu `agent`" });
      const since = Number(url.searchParams.get("since") ?? 0) || 0;
      const host = String(url.searchParams.get("host") ?? "").slice(0, 40);
      const ip = clientIp(req);
      const items = readAll();

      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      // Đệm ~2KB ngay đầu: ép mọi tầng đệm (Caddy, Cloudflare) xả dữ liệu đi thay vì giữ lại
      // chờ đủ gói — nếu không, tin đầu tiên có thể bị giam tới lúc nhịp tim tiếp theo.
      // Cố ý dùng ASCII thuần: dòng comment dài này có thể bị cắt ngang ranh giới gói TCP.
      res.write(`: ${`push-channel for ${agent} `.padEnd(1900, ".")}\n\n`);
      res.write(`event: hello\ndata: ${JSON.stringify({ ok: true, agent, latest: items.length ? items[items.length - 1].id : 0 })}\n\n`);

      const entry = { res, at: Date.now() };
      if (!subscribers.has(agent)) subscribers.set(agent, new Set());
      subscribers.get(agent).add(entry);
      touchPresence(agent, ip, since, 0, host);
      console.log(`[bus] ${agent} mở kênh đẩy từ ${ip} (đang có ${subscriberCount(agent)} kết nối)`);

      const beat = setInterval(() => {
        entry.at = Date.now();
        try {
          res.write(`: heartbeat\n\n`);
          // Giữ presence tươi: bảng trạng thái vẫn thấy bên này "đang nối", chỉ khác là không poll.
          touchPresence(agent, ip, since, 0, host);
        } catch {
          /* thôi */
        }
      }, HEARTBEAT_MS);

      let closed = false;
      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(beat);
        subscribers.get(agent)?.delete(entry);
        if (!subscriberCount(agent)) subscribers.delete(agent);
        console.log(`[bus] ${agent} đóng kênh đẩy (còn ${subscriberCount(agent)})`);
      };
      req.on("close", cleanup);
      req.on("error", cleanup);
      res.on("error", cleanup);
      return;
    }

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
      // Có kênh đẩy đang mở ⇒ bên kia nhận NGAY, không phải chờ vòng poll nào.
      const delivered = deliver(message);
      console.log(
        `[bus] #${message.id} → ${message.to} (${message.kind}) ${message.title}` +
          (delivered ? ` · đẩy tức thì tới ${delivered} kết nối` : " · chưa có kênh đẩy, để trong hàng đợi"),
      );
      // Mọi trao đổi đều alert lên Telegram cho người theo dõi.
      void alert(
        `[BUS] #${message.id} ${message.from}→${message.to} · ${message.kind}\n` +
          `${message.title}${message.body ? `\n${message.body.slice(0, 500)}` : ""}` +
          `${message.ref ? `\nref: ${message.ref}` : ""}`,
      );
      return send(res, 201, { ok: true, message, delivered });
    }

    // Xoá presence rác (ví dụ do test bằng vai của bên kia trên máy này) — nếu không, bảng trạng thái
    // sẽ báo "đối tác đang poll" trong khi thực tế đối tác chưa hề nối vào.
    if (req.method === "POST" && url.pathname === "/presence/reset") {
      try { fs.rmSync(PRESENCE, { force: true }); } catch { /* thôi */ }
      console.log("[bus] đã xoá presence");
      return send(res, 200, { ok: true });
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
      touchPresence(agent, clientIp(req), since, messages.length, String(url.searchParams.get("host") ?? "").slice(0, 40));
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
