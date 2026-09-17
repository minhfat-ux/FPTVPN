import "./helpers.js";
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { api, bootServer, closeServer, readSse, eventsNamed, textOf } from "./helpers.js";

const { initDb, all } = await import("../src/db.js");
initDb();
const settings = await import("../src/settings.js");
const { isProviderCreditError } = await import("../src/agent.js");
const { createUser, issueToken } = await import("../src/auth.js");

after(async () => {
  await closeServer();
  if (globalThis.__realFetch) globalThis.fetch = globalThis.__realFetch;
});

const REAL_FETCH = globalThis.fetch;
globalThis.__realFetch = REAL_FETCH;

function userFor(email) {
  const existing = all("users", "email = ?", [email])[0];
  const user = existing ?? createUser({ email, password: "matkhau12345" });
  return { token: issueToken(user) };
}

test("credit/auth/rate-limit failures are recognised, other errors are not", () => {
  assert.equal(isProviderCreditError({ status: 429, message: "余额不足或无可用资源包,请充值。" }), true);
  assert.equal(isProviderCreditError({ status: 401, message: "Invalid API key" }), true);
  assert.equal(isProviderCreditError({ status: 402 }), true);
  assert.equal(isProviderCreditError({ message: "insufficient balance" }), true);
  assert.equal(isProviderCreditError({ status: 500, message: "internal error" }), false);
  assert.equal(isProviderCreditError({ message: "context length exceeded" }), false);
  assert.equal(isProviderCreditError(undefined), false);
});

test("a provider that rejects the turn is swapped for another one mid-flight", async () => {
  // A GLM provider with a fake key becomes the default; its endpoint always 429s.
  const glm = settings.createProvider({
    name: "GLM (hết tiền)",
    kind: "glm",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    apiKey: "aaaa.bbbb",
    models: ["glm-4.6"],
    defaultModel: "glm-4.6",
  });
  // The backup is a real HTTP provider so we can prove a second request is made.
  const backup = settings.createProvider({
    name: "Backup HTTP",
    kind: "openai-compatible",
    baseUrl: "https://backup.example.com/v1",
    apiKey: "sk-backup",
    models: ["backup-model"],
    defaultModel: "backup-model",
  });
  settings.patchAppSettings({ defaultProviderId: glm.id, defaultModel: "glm-4.6" });

  const calls = [];
  globalThis.fetch = async (url, init) => {
    const target = String(url);
    calls.push(target);
    if (target.includes("bigmodel.cn")) {
      return new Response(JSON.stringify({ error: { message: "余额不足或无可用资源包,请充值。" } }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (target.includes("backup.example.com")) {
      const body = [
        'data: {"choices":[{"delta":{"content":"Trả lời từ provider dự phòng."}}]}',
        "",
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
        "",
        "data: [DONE]",
        "",
        "",
      ].join("\n");
      return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
    }
    return REAL_FETCH(url, init);
  };

  const { token } = userFor("failover@flowgpt.test");
  const { baseUrl } = await bootServer();
  const response = await REAL_FETCH(`${baseUrl}/api/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ content: "Xin chào", skill: "chat" }),
  });
  const events = await readSse(response);

  const notices = eventsNamed(events, "notice");
  assert.equal(notices.length, 1, "phải có đúng một thông báo chuyển provider");
  assert.match(notices[0].data.message, /GLM \(hết tiền\)/);
  assert.match(notices[0].data.message, /chuyển sang/);
  assert.ok(calls.some((url) => url.includes("bigmodel.cn")), "phải thử provider mặc định trước");
  assert.ok(
    calls.some((url) => url.includes("backup.example.com") && url.endsWith("/chat/completions")),
    `phải gọi provider dự phòng sau đó (đã gọi: ${calls.filter((u) => u.startsWith("http")).join(", ")})`,
  );
  assert.match(textOf(events), /provider dự phòng/);
  assert.ok(eventsNamed(events, "done").length >= 1);

  globalThis.fetch = REAL_FETCH;
  settings.patchAppSettings({ defaultProviderId: null, defaultModel: null });
  settings.updateProvider(glm.id, { enabled: false });
  settings.updateProvider(backup.id, { enabled: false });
});

test("when every provider is out of credit the turn reports the error", async () => {
  for (const row of all("providers")) settings.updateProvider(row.id, { enabled: false });
  const glm = settings.createProvider({
    name: "GLM (hết tiền)",
    kind: "glm",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    apiKey: "aaaa.bbbb",
    models: ["glm-4.6"],
    defaultModel: "glm-4.6",
  });
  settings.patchAppSettings({ defaultProviderId: glm.id, defaultModel: "glm-4.6" });

  globalThis.fetch = async (url, init) => {
    if (String(url).includes("bigmodel.cn")) {
      return new Response(JSON.stringify({ error: { message: "余额不足或无可用资源包,请充值。" } }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      });
    }
    return REAL_FETCH(url, init);
  };

  const { token } = userFor("failover2@flowgpt.test");
  const { baseUrl } = await bootServer();
  const response = await REAL_FETCH(`${baseUrl}/api/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ content: "Xin chào" }),
  });
  const events = await readSse(response);
  const errors = eventsNamed(events, "error");
  assert.equal(errors.length, 1);
  assert.match(errors[0].data.message, /429|充值|余额/);

  globalThis.fetch = REAL_FETCH;
  settings.updateProvider(glm.id, { enabled: false });
  const mock = all("providers", "kind = ?", ["mock"])[0];
  if (mock) settings.updateProvider(mock.id, { enabled: true });
  settings.patchAppSettings({ defaultProviderId: null, defaultModel: null });
  assert.ok(api); // keep the helper import meaningful
});
