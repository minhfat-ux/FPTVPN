import "./helpers.js";
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { api, apiRaw, bootServer, closeServer, readSse, eventsNamed } from "./helpers.js";

const { initDb, all, db } = await import("../src/db.js");
initDb();
const { createUser, issueToken } = await import("../src/auth.js");
const settings = await import("../src/settings.js");
const credits = await import("../src/credits.js");

// Deterministic baseline: tests that care about the welcome grant set it themselves
// (the shipped default is 10.000 credits for a first login).
settings.patchAppSettings({ signupCredits: 0 });

after(async () => {
  await closeServer();
});

function freshUser(email, role = "user") {
  const user = createUser({ email, password: "matkhau12345", name: "Credit", role });
  return { user, token: issueToken(user) };
}

test("a new account starts at zero and the ledger explains every movement", () => {
  const { user } = freshUser("credit-new@flowgpt.test");
  assert.equal(credits.getBalance(user.id), 0);
  assert.deepEqual(credits.getTotals(user.id), { granted: 0, spent: 0, entries: 0 });

  credits.grantCredits({ userId: user.id, amount: 100000, reason: "admin_grant", note: "cấp sẵn" });
  assert.equal(credits.getBalance(user.id), 100000);

  credits.spendCredits({ userId: user.id, amount: 3, ref: "m_1" });
  assert.equal(credits.getBalance(user.id), 99997);
  const totals = credits.getTotals(user.id);
  assert.equal(totals.granted, 100000);
  assert.equal(totals.spent, 3);
  assert.equal(totals.entries, 2);

  const ledger = credits.listLedger(user.id);
  assert.equal(ledger[0].delta, -3);
  assert.equal(ledger[0].reason, "chat_usage");
  assert.equal(ledger[0].balanceAfter, 99997);
  assert.equal(ledger[1].balanceAfter, 100000, "ledger giữ số dư sau mỗi bút toán");
});

test("signup credits come from settings — the shipped default is 10.000", () => {
  settings.patchAppSettings({ signupCredits: 0 });
  const none = freshUser("credit-signup0@flowgpt.test");
  assert.equal(credits.getBalance(none.user.id), 0);

  settings.patchAppSettings({ signupCredits: 10000 });
  const welcome = freshUser("credit-signup1@flowgpt.test");
  assert.equal(credits.getBalance(welcome.user.id), 10000);
  assert.equal(credits.listLedger(welcome.user.id)[0].reason, "signup");
  assert.equal(credits.creditSummary(welcome.user.id).granted, 10000);
  settings.patchAppSettings({ signupCredits: 0 });
});

test("cost is 1 credit per token (input + output, like ChatGPT), never below 1", () => {
  assert.equal(credits.costForUsage({ in: 700, out: 300 }), 1000);
  assert.equal(credits.costForUsage({ in: 12, out: 7 }), 19);
  assert.equal(credits.costForUsage({ in: 0, out: 0 }), 1);
  assert.equal(credits.costForUsage(null), 1);
  assert.equal(credits.costForUsage({ in: 100, out: 100 }, 0.5), 100, "perToken có thể giảm giá");
  assert.equal(credits.costForUsage({ in: 100, out: 100 }, 0), 0, "tắt đo lường thì không tính");
});

test("the chat gate blocks a user with no credit and lets admins through", () => {
  settings.patchAppSettings({ creditsEnabled: true });
  const user = freshUser("credit-gate@flowgpt.test");
  const blocked = credits.assertCanChat(user.user);
  assert.equal(blocked.allowed, false);
  assert.match(blocked.message, /hết credit/);
  assert.match(blocked.message, /meetflowai\.site/);

  credits.grantCredits({ userId: user.user.id, amount: 10 });
  assert.equal(credits.assertCanChat(user.user).allowed, true);

  const admin = freshUser("credit-admin@flowgpt.test", "admin");
  assert.equal(credits.assertCanChat(admin.user).allowed, true, "admin không bị chặn");

  settings.patchAppSettings({ creditsEnabled: false });
  assert.equal(credits.assertCanChat(user.user).allowed, true, "tắt đo lường thì ai cũng chat được");
  settings.patchAppSettings({ creditsEnabled: true });
});

test("a chat turn charges the user and reports the new balance", async () => {
  settings.patchAppSettings({ creditsEnabled: true, creditsPerKToken: 1, defaultProviderId: null, defaultModel: null });
  if (!settings.listProviders().some((provider) => provider.kind === "mock" && provider.enabled)) {
    settings.createProvider({ name: "Demo credit", kind: "mock", models: ["flowgpt-demo"] });
  }
  const { token, user } = freshUser("credit-chat@flowgpt.test");
  credits.grantCredits({ userId: user.id, amount: 1000 });

  const { baseUrl } = await bootServer();
  const response = await fetch(`${baseUrl}/api/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ content: "Xin chào" }),
  });
  const events = await readSse(response);
  const done = eventsNamed(events, "done")[0];
  assert.ok(done, "lượt chat phải kết thúc bằng done");
  assert.ok(done.data.credits, "done phải kèm thông tin credit");
  assert.ok(done.data.credits.cost >= 1);
  assert.equal(done.data.credits.balance, 1000 - done.data.credits.cost);
  assert.equal(credits.getBalance(user.id), done.data.credits.balance);
});

test("a user at zero gets a 402 with a buy link instead of an answer", async () => {
  settings.patchAppSettings({ creditsEnabled: true, signupCredits: 0 });
  const { token } = freshUser("credit-broke@flowgpt.test");
  const { baseUrl } = await bootServer();
  const response = await fetch(`${baseUrl}/api/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ content: "Xin chào" }),
  });
  const events = await readSse(response);
  const error = eventsNamed(events, "error")[0];
  assert.ok(error, "phải trả về sự kiện error");
  assert.equal(error.data.code, "insufficient_credits");
  assert.match(error.data.message, /hết credit/i);
});

test("GET /api/credits returns the balance, pricing and history", async () => {
  settings.patchAppSettings({ signupCredits: 0 });
  const { token, user } = freshUser("credit-api@flowgpt.test");
  credits.grantCredits({ userId: user.id, amount: 50000 });
  const result = await api("GET", "/credits", undefined, token);
  assert.equal(result.credits.balance, 50000);
  assert.equal(result.credits.granted, 50000);
  assert.equal(result.credits.perToken, 1);
  assert.equal(result.credits.enabled, true);
  assert.ok(result.credits.buyUrl.includes("meetflowai.site"));
  assert.ok(Array.isArray(result.credits.recent));
  assert.ok(result.credits.estimatedTurnsLeft > 0);

  const anon = await apiRaw("GET", "/credits");
  assert.equal(anon.status, 401);
});

test("an admin can grant credits by email and the user list shows balances", async () => {
  settings.patchAppSettings({ signupCredits: 0 });
  const admin = freshUser("credit-admin2@flowgpt.test", "admin");
  const target = freshUser("credit-target@flowgpt.test");

  const granted = await api(
    "POST",
    "/admin/credits",
    { email: "credit-target@flowgpt.test", amount: 100000, note: "cấp sẵn cho chủ dự án" },
    admin.token,
  );
  assert.equal(granted.balance, 100000);
  assert.equal(granted.credits.balance, 100000);

  const users = await api("GET", "/admin/users", undefined, admin.token);
  const row = users.items.find((item) => item.id === target.user.id);
  assert.equal(row.creditBalance, 100000);

  // Deducting with a negative number is allowed, and regular users cannot grant.
  const deducted = await api("POST", "/admin/credits", { email: "credit-target@flowgpt.test", amount: -1 }, admin.token);
  assert.equal(deducted.balance, 99999);

  const forbidden = await apiRaw("POST", "/admin/credits", { email: "credit-admin2@flowgpt.test", amount: 10 }, target.token);
  assert.equal(forbidden.status, 403);

  const unknown = await apiRaw("POST", "/admin/credits", { email: "khong-ton-tai@flowgpt.test", amount: 10 }, admin.token);
  assert.equal(unknown.status, 404);

  const zero = await apiRaw("POST", "/admin/credits", { email: "credit-target@flowgpt.test", amount: 0 }, admin.token);
  assert.equal(zero.status, 400);
});

test("meta publishes the popup timing and credit pricing for the promo script", async () => {
  settings.patchAppSettings({ signupCredits: 10000 });
  const { baseUrl } = await bootServer();
  const meta = await fetch(`${baseUrl}/api/meta`).then((r) => r.json());
  assert.equal(meta.promo.reminderMinutes, 5);
  assert.equal(meta.promo.creditSnoozeMinutes, 1440);
  assert.equal(meta.credits.enabled, true);
  assert.equal(meta.credits.signupCredits, 10000);
  assert.equal(meta.credits.perToken, 1);
  // The shipped default points at FlowGpt's own top-up page, not an external shop.
  assert.equal(meta.credits.buyUrl, settings.readAppSettings().creditBuyUrl);
  assert.match(meta.credits.buyUrl, /\?view=topup$/);
  settings.patchAppSettings({ signupCredits: 0 });
});

test("the system prompt states the credit policy, the live balance and how to top up", async () => {
  settings.patchAppSettings({ signupCredits: 10000, creditsEnabled: true });
  const { buildSystemPrompt, buildCreditKnowledge } = await import("../src/agent.js");
  const { user } = freshUser("credit-prompt@flowgpt.test");
  const appSettings = settings.readAppSettings();

  const prompt = buildSystemPrompt({ skill: "chat", files: [], settings: appSettings, user });
  assert.match(prompt, /KHÔNG miễn phí/);
  assert.match(prompt, /\(token vào \+ token ra\) × 1 credit/);
  assert.match(prompt, /tặng 10000 credit/);
  assert.match(prompt, /Của người dùng này: 10000 credit/);
  // The exact labels the UI shows, so the model can point at them.
  assert.match(prompt, /Xin thêm token/);
  assert.match(prompt, /Mua thêm token/);
  assert.match(prompt, /Chợ kỹ năng/);
  assert.match(prompt, /\?view=topup/);

  // Admins are told the gate does not apply to them, but metering still does.
  const admin = freshUser("credit-prompt-admin@flowgpt.test", "admin");
  assert.match(buildCreditKnowledge(admin.user), /quản trị viên/);

  // Metering off ⇒ the model has nothing to say about credits.
  settings.patchAppSettings({ creditsEnabled: false });
  const plain = buildSystemPrompt({ skill: "chat", files: [], settings: settings.readAppSettings(), user });
  assert.doesNotMatch(plain, /KHÔNG miễn phí/);
  assert.equal(buildCreditKnowledge(user), "");

  settings.patchAppSettings({ creditsEnabled: true, signupCredits: 0 });
});

test("average turn cost drives the 'còn lại bao nhiêu lượt' estimate", () => {
  settings.patchAppSettings({ signupCredits: 0 });
  const { user } = freshUser("credit-average@flowgpt.test");
  credits.grantCredits({ userId: user.id, amount: 301 });
  credits.spendCredits({ userId: user.id, amount: 2, ref: "m1" });
  credits.spendCredits({ userId: user.id, amount: 4, ref: "m2" });
  const summary = credits.creditSummary(user.id);
  assert.equal(summary.averageCostPerTurn, 3);
  assert.equal(summary.balance, 295);
  assert.equal(summary.estimatedTurnsLeft, Math.floor(295 / 3));
  db.prepare("DELETE FROM credit_ledger WHERE user_id = ?").run(user.id);
  assert.equal(all("credit_ledger", "user_id = ?", [user.id]).length, 0);
});
