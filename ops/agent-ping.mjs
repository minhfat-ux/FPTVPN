#!/usr/bin/env node
/**
 * Kênh ping giữa các harness qua Telegram (bot @Minhnb2_bot).
 *
 *   node ops/agent-ping.mjs send "nội dung"      # gửi (tự thêm tiền tố [MAC→WIN])
 *   node ops/agent-ping.mjs read                 # đọc tin chưa xác nhận (không xoá khỏi queue)
 *   node ops/agent-ping.mjs read --since 30      # chỉ tin trong 30 phút gần nhất
 *
 * Vì sao KHÔNG xác nhận offset: cả hai harness cùng đọc một hàng đợi. Ai gọi getUpdates
 * với offset lớn hơn là đã "xác nhận" và tin biến mất với người kia. Nên chỉ ĐỌC, không
 * bao giờ truyền offset ⇒ hai bên đều thấy đủ tin (Telegram giữ 24 giờ).
 *
 * Token đọc từ (theo thứ tự): $TELEGRAM_BOT_TOKEN, ~/.flowvpn-tg.env, /etc/flowvpn-tg-bot.env.
 * KHÔNG in token ra, không ghi token vào repo.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ME = process.env.AGENT_TAG || "MAC";
const PEER = ME === "MAC" ? "WIN" : "MAC";

function readCreds() {
  // Thứ tự: file trong repo (đã bị .gitignore che bởi mẫu `.env.*`) → file trong $HOME → file trên server.
  const repoFile = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", ".env.tg");
  const candidates = [repoFile, path.join(os.homedir(), ".flowvpn-tg.env"), "/etc/flowvpn-tg-bot.env"];
  let text = "";
  for (const file of candidates) {
    try { text = fs.readFileSync(file, "utf8"); break; } catch { /* thử file kế tiếp */ }
  }
  const pick = (...names) => {
    for (const name of names) {
      const m = new RegExp(`^${name}=(.*)$`, "m").exec(text);
      if (m) {
        const v = m[1].trim().replace(/^["']|["']$/g, "");
        if (v) return v;
      }
    }
    return "";
  };
  const token = process.env.TELEGRAM_BOT_TOKEN || pick("TELEGRAM_BOT_TOKEN");
  const chat = (process.env.TELEGRAM_CHAT_ID || (pick("TELEGRAM_ALLOWED_CHATS") || "").split(",")[0] || pick("TELEGRAM_CHAT_ID")).trim();
  if (!token || !chat) {
    console.error("Thiếu token/chat Telegram. Đặt TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID, hoặc tạo ~/.flowvpn-tg.env");
    process.exit(2);
  }
  return { token, chat };
}

const [action, ...rest] = process.argv.slice(2);
const { token, chat } = readCreds();
const api = `https://api.telegram.org/bot${token}`;

if (action === "send") {
  const text = rest.join(" ").trim();
  if (!text) { console.error('Thiếu nội dung. Ví dụ: node ops/agent-ping.mjs send "đang chạy test"'); process.exit(2); }
  const body = new URLSearchParams({ chat_id: chat, text: `[${ME}→${PEER}] ${text}`, disable_web_page_preview: "true" });
  const res = await fetch(`${api}/sendMessage`, { method: "POST", body });
  const json = await res.json().catch(() => null);
  console.log(json?.ok ? `đã gửi (message_id ${json.result.message_id})` : `gửi lỗi: ${JSON.stringify(json).slice(0, 160)}`);
  process.exitCode = json?.ok ? 0 : 1;
} else if (action === "read") {
  const sinceMin = Number((rest.includes("--since") ? rest[rest.indexOf("--since") + 1] : 0)) || 0;
  const cutoff = sinceMin ? Math.floor(Date.now() / 1000) - sinceMin * 60 : 0;
  const res = await fetch(`${api}/getUpdates?limit=30`);   // KHÔNG truyền offset
  const json = await res.json().catch(() => null);
  const updates = json?.result ?? [];
  const lines = [];
  for (const u of updates) {
    const m = u.message ?? u.channel_post ?? {};
    const when = m.date ?? 0;
    if (cutoff && when < cutoff) continue;
    const who = m.from?.username || m.from?.first_name || m.from?.id || "?";
    const text = String(m.text ?? "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    const time = new Date(when * 1000).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
    lines.push(`  ${time} ${who}: ${text.slice(0, 300)}`);
  }
  console.log(lines.length ? lines.join("\n") : "  (không có tin nào)");
} else {
  console.error("Dùng: node ops/agent-ping.mjs send \"…\" | read [--since <phút>]");
  process.exit(2);
}
