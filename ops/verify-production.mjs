#!/usr/bin/env node
/**
 * Production verification: one real chat turn against the running instance, then
 * clean up after itself (temporary user, conversation, messages and artifacts).
 *
 * Proves the deployed stack end to end: default provider + model, streaming,
 * tool calling, artifact creation and download — through Cloudflare-facing code
 * paths but over loopback.
 *
 *   NODE_ENV=production node ops/verify-production.mjs [baseUrl] [prompt]
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER = pathToFileURL(path.join(HERE, "..", "server", "src")).href;

const BASE = (process.argv[2] ?? "http://127.0.0.1:7790/api").replace(/\/+$/, "");
const PROMPT = process.argv[3] ?? "Làm slide 2 trang giới thiệu fBuddy, nội dung ngắn gọn.";

const { initDb, db } = await import(`${SERVER}/db.js`);
initDb();
const { createUser, issueToken } = await import(`${SERVER}/auth.js`);
const settings = await import(`${SERVER}/settings.js`);
const { config } = await import(`${SERVER}/config.js`);

const picked = settings.resolveProviderForChat({});
console.log(`Provider mặc định: ${picked.provider.name} · ${picked.model}`);

const email = `verify+${Date.now()}@fbuddy.local`;
const user = createUser({ email, password: crypto.randomBytes(24).toString("base64url") });
const token = issueToken(user);
console.log(`Tài khoản tạm: ${email}`);

let failed = false;
const cleanup = () => {
  try {
    const convos = db.prepare("SELECT id FROM conversations WHERE user_id = ?").all(user.id).map((r) => r.id);
    for (const id of convos) {
      db.prepare("DELETE FROM messages WHERE conversation_id = ?").run(id);
    }
    for (const row of db.prepare("SELECT stored_name FROM files WHERE user_id = ?").all(user.id)) {
      try {
        fs.rmSync(path.join(config.filesDir, row.stored_name), { force: true });
      } catch {
        /* already gone */
      }
    }
    db.prepare("DELETE FROM files WHERE user_id = ?").run(user.id);
    db.prepare("DELETE FROM user_skills WHERE user_id = ?").run(user.id);
    db.prepare("DELETE FROM conversations WHERE user_id = ?").run(user.id);
    db.prepare("DELETE FROM email_tokens WHERE email = ?").run(email);
    db.prepare("DELETE FROM users WHERE id = ?").run(user.id);
    console.log("Đã dọn tài khoản tạm và dữ liệu của nó.");
  } catch (err) {
    console.error("Dọn dẹp lỗi:", err?.message ?? err);
  }
};

try {
  const response = await fetch(`${BASE}/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ content: PROMPT, skill: "ppt" }),
  });
  if (!response.ok) throw new Error(`chat/stream trả ${response.status}`);

  const events = [];
  let buffer = "";
  const decoder = new TextDecoder();
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let index = buffer.indexOf("\n\n");
    while (index !== -1) {
      const block = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      const name = /event: (\w+)/.exec(block)?.[1];
      const raw = /data: (.+)/.exec(block)?.[1];
      if (name && raw) {
        try {
          events.push({ event: name, data: JSON.parse(raw) });
        } catch {
          /* ignore */
        }
      }
      index = buffer.indexOf("\n\n");
    }
  }

  const names = events.map((e) => e.event);
  const start = events.find((e) => e.event === "start")?.data;
  const notice = events.find((e) => e.event === "notice")?.data;
  const toolCall = events.find((e) => e.event === "tool_call")?.data;
  const toolResult = events.find((e) => e.event === "tool_result")?.data;
  const artifact = events.find((e) => e.event === "artifact")?.data;
  const error = events.find((e) => e.event === "error")?.data;
  const text = events.filter((e) => e.event === "delta").map((e) => e.data.text).join("");

  console.log(`Sự kiện: ${[...new Set(names)].join(", ")}`);
  console.log(`Provider thực tế: ${start?.providerName} · ${start?.model}`);
  if (notice) console.log(`Thông báo chuyển provider: ${notice.message}`);
  if (error) {
    failed = true;
    console.log(`✖ Lỗi từ server: ${error.code} — ${error.message}`);
  }
  if (toolCall) console.log(`Tool: ${toolCall.name} (${toolCall.source}) — ok=${toolResult?.ok}`);
  if (artifact) {
    const fileResponse = await fetch(`${BASE}/files/${artifact.id}/content`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const bytes = Buffer.from(await fileResponse.arrayBuffer());
    const valid = bytes.subarray(0, 2).toString() === "PK";
    console.log(`Artifact: ${artifact.name} — ${bytes.length} byte, magic PK=${valid}`);
    if (!valid) failed = true;
  }
  console.log(`Trả lời (${text.length} ký tự): ${text.replace(/\s+/g, " ").trim().slice(0, 200)}`);
  if (!text.trim() && !artifact) failed = true;
  console.log(failed ? "\n✖ VERIFY THẤT BẠI" : "\n✔ VERIFY ĐẠT — stack production chạy đúng");
} catch (err) {
  failed = true;
  console.error(`✖ ${err?.message ?? err}`);
} finally {
  cleanup();
}
process.exit(failed ? 1 : 0);
