/**
 * Kênh Telegram dùng chung cho `ops/agent-ping.mjs` và `ops/task.mjs`.
 *
 * Quy ước: KHÔNG truyền `offset` khi đọc — hai harness cùng đọc một hàng đợi, ai xác nhận
 * offset là tin biến mất với người kia. Telegram giữ tin ~24h nên chỉ đọc là đủ.
 */

import dns from "node:dns";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Có máy chỉ resolve api.telegram.org sang IPv6 nhưng không có route IPv6 ⇒ fetch chết.
dns.setDefaultResultOrder("ipv4first");

export const SELF = (process.env.AGENT_NAME || "MAC").toUpperCase();
export const PEER = SELF === "MAC" ? "WIN" : "MAC";

/** Đọc token/chat id từ env hoặc các file .env quen thuộc. */
export function readCreds() {
  const candidates = [
    process.env.FBUDDY_TG_ENV,
    path.join(process.cwd(), ".env.tg"),
    path.join(os.homedir(), ".flowvpn-tg.env"),
    "/etc/flowvpn-tg-bot.env",
  ].filter(Boolean);
  const pick = (key) => {
    for (const file of candidates) {
      try {
        const line = fs.readFileSync(file, "utf8").split("\n").find((row) => row.startsWith(`${key}=`));
        if (line) return line.slice(key.length + 1).trim().replace(/^["']|["']$/g, "");
      } catch {
        /* file không tồn tại */
      }
    }
    return "";
  };
  const token = process.env.TELEGRAM_BOT_TOKEN || pick("TELEGRAM_BOT_TOKEN");
  const chat = (
    process.env.TELEGRAM_CHAT_ID ||
    (pick("TELEGRAM_ALLOWED_CHATS") || "").split(",")[0] ||
    pick("TELEGRAM_CHAT_ID")
  ).trim();
  if (!token || !chat) {
    throw new Error("Thiếu token/chat Telegram. Đặt TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID, hoặc tạo ~/.flowvpn-tg.env");
  }
  return { token, chat };
}

/** Gửi một tin, trả về `{ ok, messageId }`. Tự thêm tiền tố `[MAC→WIN] `. */
export async function sendPing(text, { prefix = `[${SELF}→${PEER}]` } = {}) {
  const { token, chat } = readCreds();
  const body = new URLSearchParams({
    chat_id: chat,
    text: `${prefix} ${text}`,
    disable_web_page_preview: "true",
  });
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", body });
    const json = await res.json().catch(() => null);
    return { ok: Boolean(json?.ok), messageId: json?.result?.message_id ?? null, raw: json };
  } catch (error) {
    // Một số máy để fetch chết vì IPv6/路由 (đã gặp trên VPS) — thử lại bằng curl -4.
    try {
      const { execFile } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const run = promisify(execFile);
      const { stdout } = await run("curl", [
        "-4", "-sS", "-m", "10", "-X", "POST",
        `https://api.telegram.org/bot${token}/sendMessage`,
        "--data-urlencode", `chat_id=${chat}`,
        "--data-urlencode", `text=${prefix} ${text}`,
        "--data-urlencode", "disable_web_page_preview=true",
      ], { timeout: 12000 });
      const json = JSON.parse(stdout || "{}");
      return { ok: Boolean(json?.ok), messageId: json?.result?.message_id ?? null, raw: json, via: "curl" };
    } catch (fallbackError) {
      return { ok: false, messageId: null, raw: { fetch: String(error?.message ?? error), curl: String(fallbackError?.message ?? fallbackError) } };
    }
  }
}

/**
 * Đọc tin trong hàng đợi (không xoá). Trả về mảng đã chuẩn hoá:
 * `{ messageId, when, who, text, from, to }` với `from`/`to` suy ra từ tiền tố `[MAC→WIN]`.
 */
export async function readInbox({ sinceMin = 0 } = {}) {
  const { token } = readCreds();
  const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates?limit=50`);
  const json = await res.json().catch(() => null);
  const cutoff = sinceMin ? Math.floor(Date.now() / 1000) - sinceMin * 60 : 0;
  const out = [];
  for (const update of json?.result ?? []) {
    const message = update.message ?? update.channel_post ?? {};
    const when = message.date ?? 0;
    if (cutoff && when < cutoff) continue;
    const text = String(message.text ?? "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    const prefix = text.match(/^\[(MAC|WIN)\s*[→>-]+\s*(MAC|WIN)\]/i);
    out.push({
      messageId: update.update_id,
      when,
      who: message.from?.username || message.from?.first_name || message.from?.id || "?",
      text,
      body: prefix ? text.slice(prefix[0].length).trim() : text,
      from: prefix ? prefix[1].toUpperCase() : null,
      to: prefix ? prefix[2].toUpperCase() : null,
    });
  }
  return out;
}
