#!/usr/bin/env node
/**
 * Ping nhanh giữa hai harness qua Telegram.
 *
 *   node ops/agent-ping.mjs send "nội dung ngắn"
 *   node ops/agent-ping.mjs read [--since <phút>] [--json]
 *
 * Việc GIAO TASK có trạng thái (nhận/đang làm/xong/nghiệm thu) thì dùng `ops/task.mjs`,
 * không dùng script này. Xem docs/TASK-PROTOCOL.md.
 */

import { sendPing, readInbox } from "./lib/telegram.mjs";

const [action, ...rest] = process.argv.slice(2);
const flagValue = (name, fallback = null) => {
  const index = rest.indexOf(`--${name}`);
  return index >= 0 && rest[index + 1] ? rest[index + 1] : fallback;
};

if (action === "send") {
  const text = rest.filter((part) => !part.startsWith("--")).join(" ").trim();
  if (!text) {
    console.error('Thiếu nội dung. Ví dụ: node ops/agent-ping.mjs send "đang chạy test"');
    process.exit(2);
  }
  const result = await sendPing(text);
  console.log(result.ok ? `đã gửi (message_id ${result.messageId})` : `gửi lỗi: ${JSON.stringify(result.raw).slice(0, 160)}`);
  process.exitCode = result.ok ? 0 : 1;
} else if (action === "read") {
  const messages = await readInbox({ sinceMin: Number(flagValue("since", 0)) || 0 });
  if (rest.includes("--json")) {
    console.log(JSON.stringify(messages, null, 1));
  } else {
    const lines = messages.map((message) => {
      const time = new Date(message.when * 1000).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
      return `  ${time} ${message.who}: ${message.text.slice(0, 300)}`;
    });
    console.log(lines.length ? lines.join("\n") : "  (không có tin nào)");
  }
} else {
  console.error('Dùng: node ops/agent-ping.mjs send "…" | read [--since <phút>] [--json]');
  process.exit(2);
}
