import "./helpers.js";
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { api, apiRaw, bootServer, closeServer, chat } from "./helpers.js";

const { initDb } = await import("../src/db.js");
initDb();
const { createUser, startSession, changePassword } = await import("../src/auth.js");
const sessions = await import("../src/sessions.js");
const settings = await import("../src/settings.js");

// The cross-device test runs a real chat turn; the demo provider needs no network.
if (!settings.listProviders().some((provider) => provider.kind === "mock" && provider.enabled)) {
  settings.createProvider({ name: "Demo sessions", kind: "mock", models: ["fbuddy-demo"] });
}

after(async () => {
  await closeServer();
});

/** A real login per device: same account, different user agent + IP. */
async function loginDevice(email, password, userAgent) {
  const { baseUrl } = await bootServer();
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": userAgent, "X-Forwarded-For": "203.0.113.9" },
    body: JSON.stringify({ email, password }),
  });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  return body.token;
}

const FULL = "matkhau12345";
const UA_CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/153.0.0.0 Safari/537.36";
const UA_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1";

test("one account, three devices: every session keeps working", async () => {
  // Registering already opens a session (the browser doing the signup).
  await api("POST", "/auth/register", { email: "multi@fbuddy.test", password: FULL });
  const laptop = await loginDevice("multi@fbuddy.test", FULL, UA_CHROME);
  const phone = await loginDevice("multi@fbuddy.test", FULL, UA_IPHONE);

  // All three tokens are independent and valid at the same time.
  for (const [name, token] of [["laptop", laptop], ["phone", phone]]) {
    const me = await api("GET", "/auth/me", undefined, token);
    assert.equal(me.user.email, "multi@fbuddy.test", `${name} phải đăng nhập được`);
    assert.ok(me.sessionId, `${name} phải có sessionId riêng`);
  }
  const laptopSessionId = (await api("GET", "/auth/me", undefined, laptop)).sessionId;
  const phoneSessionId = (await api("GET", "/auth/me", undefined, phone)).sessionId;
  assert.notEqual(laptopSessionId, phoneSessionId, "mỗi thiết bị một phiên riêng");

  const list = await api("GET", "/auth/sessions", undefined, phone);
  assert.equal(list.items.length, 3, "đăng ký + 2 lần đăng nhập = 3 phiên");
  assert.equal(list.items.filter((s) => s.current).length, 1, "chỉ một phiên là thiết bị đang gọi");
  assert.equal(list.items.find((s) => s.current).id, phoneSessionId);
  assert.match(list.items.find((s) => s.current).label, /Safari/);
  assert.ok(list.items.some((s) => /Chrome/.test(s.label ?? "")), "nhãn thiết bị suy ra từ user agent");
  assert.ok(list.items.every((s) => s.lastSeenAt && s.createdAt), "mỗi phiên có mốc thời gian");
});

test("revoking one device never touches the others", async () => {
  const laptop = await loginDevice("multi@fbuddy.test", FULL, UA_CHROME);
  const phone = await loginDevice("multi@fbuddy.test", FULL, UA_IPHONE);

  const list = await api("GET", "/auth/sessions", undefined, laptop);
  const phoneSession = list.items.find((s) => !s.current && /Safari/.test(s.label ?? ""));
  assert.ok(phoneSession, "phải thấy phiên của điện thoại");

  const revoked = await api("DELETE", `/auth/sessions/${phoneSession.id}`, undefined, laptop);
  assert.equal(revoked.ok, true);
  assert.equal(revoked.current, false);

  const phoneAfter = await apiRaw("GET", "/auth/me", undefined, phone);
  assert.equal(phoneAfter.status, 401, "thiết bị bị thu hồi phải bị đăng xuất");
  const laptopAfter = await apiRaw("GET", "/auth/me", undefined, laptop);
  assert.equal(laptopAfter.status, 200, "thiết bị đang gọi vẫn phải dùng được");

  // Unknown / someone else's session id is a 404, not a 500.
  const missing = await apiRaw("DELETE", "/auth/sessions/sess_khong_ton_tai", undefined, laptop);
  assert.equal(missing.status, 404);
});

test("logout only ends the calling device; revoke-others keeps it", async () => {
  const laptop = await loginDevice("multi@fbuddy.test", FULL, UA_CHROME);
  const phone = await loginDevice("multi@fbuddy.test", FULL, UA_IPHONE);

  await api("POST", "/auth/logout", {}, phone);
  assert.equal((await apiRaw("GET", "/auth/me", undefined, phone)).status, 401, "đăng xuất phải thu hồi phiên hiện tại");
  assert.equal((await apiRaw("GET", "/auth/me", undefined, laptop)).status, 200, "đăng xuất máy này không được đá máy kia");

  const other = await loginDevice("multi@fbuddy.test", FULL, UA_IPHONE);
  const result = await api("POST", "/auth/sessions/revoke-others", {}, laptop);
  assert.ok(result.revoked >= 1);
  assert.equal((await apiRaw("GET", "/auth/me", undefined, other)).status, 401);
  assert.equal((await apiRaw("GET", "/auth/me", undefined, laptop)).status, 200);
  const left = await api("GET", "/auth/sessions", undefined, laptop);
  assert.equal(left.items.length, 1, "chỉ còn thiết bị đang gọi");
  assert.equal(left.items[0].current, true);
});

test("changing the password revokes every device", async () => {
  const laptop = await loginDevice("multi@fbuddy.test", FULL, UA_CHROME);
  const phone = await loginDevice("multi@fbuddy.test", FULL, UA_IPHONE);
  await api("PATCH", "/auth/me", { currentPassword: FULL, password: "matkhaumoi12345" }, laptop);

  assert.equal((await apiRaw("GET", "/auth/me", undefined, laptop)).status, 401);
  assert.equal((await apiRaw("GET", "/auth/me", undefined, phone)).status, 401);
  const relogin = await loginDevice("multi@fbuddy.test", "matkhaumoi12345", UA_CHROME);
  assert.equal((await apiRaw("GET", "/auth/me", undefined, relogin)).status, 200);
  // Put the password back so the remaining tests keep using FULL.
  await api("PATCH", "/auth/me", { currentPassword: "matkhaumoi12345", password: FULL }, relogin);
});

test("tokens minted before sessions existed still work (no forced logout on deploy)", async () => {
  const user = createUser({ email: "legacy-session@fbuddy.test", password: FULL });
  const { issueToken } = await import("../src/auth.js");
  const legacy = issueToken(user); // no sid
  const me = await api("GET", "/auth/me", undefined, legacy);
  assert.equal(me.user.email, "legacy-session@fbuddy.test");
  assert.equal(me.sessionId, null, "token cũ không có phiên để quản lý");
});

test("the device list is capped so it cannot grow forever", () => {
  const user = createUser({ email: "many-devices@fbuddy.test", password: FULL });
  for (let i = 0; i < sessions.MAX_SESSIONS_PER_USER + 3; i += 1) {
    startSession({ user, ip: "127.0.0.1", userAgent: `${UA_CHROME} build/${i}` });
  }
  const list = sessions.listSessions(user.id, null);
  assert.equal(list.length, sessions.MAX_SESSIONS_PER_USER);
  assert.ok(sessions.activeSessionCount(user.id) <= sessions.MAX_SESSIONS_PER_USER);
});

test("the conversation you were in follows the account to the next device", async () => {
  const laptop = await loginDevice("multi@fbuddy.test", FULL, UA_CHROME);
  const phone = await loginDevice("multi@fbuddy.test", FULL, UA_IPHONE);

  const events = await chat({ token: laptop, content: "Xin chào, đây là hội thoại trên laptop" });
  const started = events.find((event) => event.event === "start").data;
  const conversationId = started.conversationId;
  assert.ok(conversationId);

  // A turn on the laptop becomes the account's current thread…
  const me = await api("GET", "/auth/me", undefined, phone);
  assert.equal(me.lastConversationId, conversationId, "máy khác phải thấy hội thoại đang làm việc");

  // …so the phone opens the same thread and sees the laptop's messages.
  const detail = await api("GET", `/conversations/${conversationId}`, undefined, phone);
  assert.ok(detail.messages.length >= 2, "điện thoại phải thấy nội dung hội thoại của laptop");
  assert.equal(detail.partial, false);

  // Incremental sync: only what arrived after the anchor.
  const anchor = detail.messages.at(-1).id;
  const incremental = await api("GET", `/conversations/${conversationId}?since=${anchor}`, undefined, phone);
  assert.equal(incremental.partial, true);
  assert.equal(incremental.messages.length, 0, "chưa có gì mới thì trả về rỗng");

  await chat({ token: laptop, content: "Tin nhắn thứ hai từ laptop", conversationId });
  const afterSecond = await api("GET", `/conversations/${conversationId}?since=${anchor}`, undefined, phone);
  assert.ok(afterSecond.messages.length >= 2, "tin nhắn mới của laptop phải đồng bộ sang máy khác");
  assert.ok(
    afterSecond.messages.some((message) => /Tin nhắn thứ hai/.test(message.content)),
    "đúng nội dung vừa gửi",
  );

  // Opening another conversation moves the pointer; "chat mới" clears it.
  const other = await api("POST", "/conversations", { title: "Hội thoại khác" }, phone);
  await api("POST", `/conversations/${other.conversation.id}/active`, {}, phone);
  assert.equal(
    (await api("GET", "/auth/me", undefined, laptop)).lastConversationId,
    other.conversation.id,
    "mở hội thoại trên điện thoại phải đổi hội thoại hiện tại cho cả tài khoản",
  );
  await api("DELETE", "/conversations/active", undefined, phone);
  assert.equal((await api("GET", "/auth/me", undefined, laptop)).lastConversationId, null);

  // Someone else's conversation cannot be pinned as "active".
  const stranger = createUser({ email: "stranger-session@fbuddy.test", password: FULL });
  const strangerConversation = await api("POST", "/conversations", { title: "Riêng tư" }, startSession({ user: stranger }).token);
  const forbidden = await apiRaw(
    "POST",
    `/conversations/${strangerConversation.conversation.id}/active`,
    {},
    phone,
  );
  assert.equal(forbidden.status, 404);
});
