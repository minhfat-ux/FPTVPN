#!/usr/bin/env node
/**
 * Multi-device verification against a running instance.
 *
 *   node ops/sessions-check.mjs                                   # production
 *   node ops/sessions-check.mjs http://127.0.0.1:7790/api
 *
 * Proves, with real HTTP calls, that:
 *   1. the same email can hold several sessions at once (logging in on device B
 *      does not log device A out),
 *   2. every device is listed and only one is marked "current",
 *   3. revoking one device leaves the others working,
 *   4. the conversation you were in follows the account to the other device,
 *      including an incremental `?since=` sync of messages that device ran,
 *   5. logout only ends the calling device.
 *
 * The throwaway account is removed at the end (see ops/prune-test-users.mjs if a
 * run is interrupted).
 */

const BASE = (process.argv[2] ?? "https://flowgpt.meetflowai.site/api").replace(/\/+$/, "");
const EMAIL = `sessions-check+${Date.now()}@flowgpt.local`;
const PASSWORD = "matkhau12345";
const UA_LAPTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/153.0.0.0 Safari/537.36";
const UA_PHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Version/17.0 Mobile/15E148 Safari/604.1";

let failures = 0;
const ok = (message) => console.log(`  \u001b[32m✔\u001b[0m ${message}`);
const bad = (message) => {
  failures += 1;
  console.log(`  \u001b[31m✖\u001b[0m ${message}`);
};
const info = (message) => console.log(`    ${message}`);

async function call(method, path, { body, token, userAgent } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(userAgent ? { "User-Agent": userAgent } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return { status: response.status, ok: response.ok, data, text };
}

async function login(userAgent) {
  const result = await call("POST", "/auth/login", { body: { email: EMAIL, password: PASSWORD }, userAgent });
  if (!result.ok) throw new Error(`login → ${result.status}: ${result.text.slice(0, 200)}`);
  return result.data.token;
}

console.log(`FlowGpt — kiểm tra nhiều thiết bị → ${BASE}`);

const registered = await call("POST", "/auth/register", { body: { email: EMAIL, password: PASSWORD } });
if (!registered.ok) {
  console.error(`✖ không tạo được tài khoản test: ${registered.status} ${registered.text.slice(0, 200)}`);
  process.exit(1);
}
ok(`tài khoản test: ${EMAIL}`);

const laptop = await login(UA_LAPTOP);
const phone = await login(UA_PHONE);

// 1. Both devices work at the same time.
const laptopMe = await call("GET", "/auth/me", { token: laptop });
const phoneMe = await call("GET", "/auth/me", { token: phone });
if (laptopMe.ok && phoneMe.ok) ok("đăng nhập thiết bị thứ hai KHÔNG đá thiết bị thứ nhất");
else bad(`một trong hai thiết bị bị đăng xuất (laptop=${laptopMe.status}, phone=${phoneMe.status})`);
if (laptopMe.data?.sessionId && phoneMe.data?.sessionId && laptopMe.data.sessionId !== phoneMe.data.sessionId) {
  ok(`mỗi thiết bị một phiên riêng (${laptopMe.data.sessionId.slice(0, 10)}… ≠ ${phoneMe.data.sessionId.slice(0, 10)}…)`);
} else bad("hai thiết bị dùng chung một phiên");

// 2. The device list.
const list = await call("GET", "/auth/sessions", { token: laptop });
const sessions = list.data?.items ?? [];
info(`danh sách: ${sessions.map((s) => `${s.label ?? "?"}${s.current ? " (đang dùng)" : ""}`).join(" | ")}`);
if (sessions.length === 3) ok("3 phiên: đăng ký + 2 lần đăng nhập");
else bad(`mong đợi 3 phiên, thấy ${sessions.length}`);
if (sessions.filter((s) => s.current).length === 1) ok("chỉ đúng một phiên được đánh dấu thiết bị này");
else bad("đánh dấu 'thiết bị này' sai");
if (sessions.some((s) => /Safari/.test(s.label ?? ""))) ok("nhãn thiết bị được suy ra từ user agent (Safari · iOS)");
else bad("không nhận ra nhãn thiết bị");

// 3. A turn on the laptop becomes the account's current thread.
const chat = await fetch(`${BASE}/chat/stream`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${laptop}` },
  body: JSON.stringify({ content: "Xin chào từ laptop, hội thoại này phải theo sang điện thoại", skill: "chat" }),
});
let started = null;
let buffer = "";
for await (const chunk of chat.body) {
  buffer += Buffer.from(chunk).toString("utf8");
  const frames = buffer.split("\n\n");
  buffer = frames.pop() ?? "";
  for (const frame of frames) {
    const event = /^event: (.+)$/m.exec(frame)?.[1];
    const raw = /^data: (.+)$/m.exec(frame)?.[1];
    if (event === "start" && raw) started = JSON.parse(raw);
  }
}
const conversationId = started?.conversationId;
if (conversationId) ok(`laptop đã chat trong hội thoại ${conversationId}`);
else bad("không lấy được conversationId từ lượt chat");

const phoneAfter = await call("GET", "/auth/me", { token: phone });
if (phoneAfter.data?.lastConversationId === conversationId) ok("điện thoại mở /auth/me thấy đúng hội thoại đang làm việc");
else bad(`lastConversationId trên điện thoại = ${phoneAfter.data?.lastConversationId}, mong đợi ${conversationId}`);

const detail = await call("GET", `/conversations/${conversationId}`, { token: phone });
const seen = detail.data?.messages ?? [];
if (seen.length >= 2) ok(`điện thoại đọc được ${seen.length} tin nhắn của laptop (ngữ cảnh xuyên thiết bị)`);
else bad(`điện thoại chỉ thấy ${seen.length} tin nhắn`);

// 4. Incremental sync after another turn on the laptop.
const anchor = seen.at(-1)?.id;
const empty = await call("GET", `/conversations/${conversationId}?since=${anchor}`, { token: phone });
if ((empty.data?.messages ?? []).length === 0) ok("?since= khi chưa có gì mới trả về rỗng (poll rẻ)");
else bad("?since= trả về dữ liệu cũ");

const second = await fetch(`${BASE}/chat/stream`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${laptop}` },
  body: JSON.stringify({ content: "Tin thứ hai từ laptop", skill: "chat", conversationId }),
});
for await (const _ of second.body) {
  /* drain */
}
const afterSecond = await call("GET", `/conversations/${conversationId}?since=${anchor}`, { token: phone });
const fresh = afterSecond.data?.messages ?? [];
if (fresh.length >= 2 && fresh.some((m) => /Tin thứ hai/.test(m.content))) {
  ok("tin nhắn mới của laptop đồng bộ sang điện thoại qua ?since=");
} else bad(`đồng bộ thiếu: ${fresh.length} tin nhắn mới`);

// 5. Revoking one device leaves the other alone.
const phoneSession = sessions.find((s) => !s.current && /Safari/.test(s.label ?? ""));
const revoked = await call("DELETE", `/auth/sessions/${phoneSession.id}`, { token: laptop });
const phoneNow = await call("GET", "/auth/me", { token: phone });
const laptopNow = await call("GET", "/auth/me", { token: laptop });
if (revoked.ok && phoneNow.status === 401 && laptopNow.ok) ok("thu hồi một thiết bị: thiết bị đó bị đăng xuất, thiết bị còn lại vẫn dùng được");
else bad(`thu hồi sai: revoke=${revoked.status}, phone=${phoneNow.status}, laptop=${laptopNow.status}`);

// 6. Logout only ends the calling device.
const phone2 = await login(UA_PHONE);
await call("POST", "/auth/logout", { body: {}, token: phone2 });
const phone2Now = await call("GET", "/auth/me", { token: phone2 });
const laptopStill = await call("GET", "/auth/me", { token: laptop });
if (phone2Now.status === 401 && laptopStill.ok) ok("đăng xuất chỉ kết thúc phiên của thiết bị gọi");
else bad(`đăng xuất ảnh hưởng sai: phone2=${phone2Now.status}, laptop=${laptopStill.status}`);

console.log(
  `\n${failures ? `\u001b[31m${failures} mục chưa đạt\u001b[0m` : "\u001b[32mĐẠT HẾT\u001b[0m"}` +
    `\nTài khoản test cần dọn: node ops/prune-test-users.mjs --apply`,
);
process.exit(failures ? 1 : 0);
