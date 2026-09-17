import "./helpers.js";
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { api, bootServer, closeServer, readSse, eventsNamed, textOf } from "./helpers.js";

const { initDb, all } = await import("../src/db.js");
initDb();
const settings = await import("../src/settings.js");
const { isProviderCreditError, isProviderModelError } = await import("../src/agent.js");
const { createUser, issueToken } = await import("../src/auth.js");
const { grantCredits } = await import("../src/credits.js");

after(async () => {
  await closeServer();
  if (globalThis.__realFetch) globalThis.fetch = globalThis.__realFetch;
});

const REAL_FETCH = globalThis.fetch;
globalThis.__realFetch = REAL_FETCH;

function userFor(email) {
  const existing = all("users", "email = ?", [email])[0];
  const user = existing ?? createUser({ email, password: "matkhau12345" });
  // The credit gate runs before the provider, so give the turn something to spend.
  if (!existing) grantCredits({ userId: user.id, amount: 1000 });
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

test("retired models are recognised so the turn can recover", () => {
  // The exact error OpenRouter returns for a model that no longer exists.
  assert.equal(
    isProviderModelError({ status: 404, message: "OpenRouter trả lỗi 404: No endpoints found for anthropic/claude-3.5-sonnet." }),
    true,
  );
  assert.equal(isProviderModelError({ message: "The model `gpt-4o` does not exist" }), true);
  assert.equal(isProviderModelError({ status: 400, message: "unknown model: glm-9" }), true);
  assert.equal(isProviderModelError({ status: 429, message: "余额不足" }), false);
  assert.equal(isProviderModelError({ status: 500, message: "internal error" }), false);
  assert.equal(isProviderModelError(undefined), false);
});

test("a retired model retries on the provider's own default model first", async () => {
  // Provider whose first model is retired; the default model still works.
  const provider = settings.createProvider({
    name: "Retired model provider",
    kind: "openai-compatible",
    baseUrl: "https://retired.example.com/v1",
    apiKey: "sk-retired",
    models: ["old-model", "good-model"],
    defaultModel: "good-model",
  });
  settings.patchAppSettings({ defaultProviderId: provider.id, defaultModel: "old-model" });

  const requested = [];
  globalThis.fetch = async (url, init) => {
    const target = String(url);
    if (target.includes("retired.example.com")) {
      const body = JSON.parse(init.body ?? "{}");
      requested.push(body.model);
      if (body.model === "old-model") {
        return new Response(JSON.stringify({ error: { message: "No endpoints found for old-model." } }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }
      const stream = [
        'data: {"choices":[{"delta":{"content":"Trả lời bằng model mặc định."}}]}',
        "",
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
        "",
        "data: [DONE]",
        "",
        "",
      ].join("\n");
      return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
    }
    return REAL_FETCH(url, init);
  };

  const { token } = userFor("model-retired@flowgpt.test");
  const { baseUrl } = await bootServer();
  const response = await REAL_FETCH(`${baseUrl}/api/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ content: "Xin chào", model: "old-model", providerId: provider.id }),
  });
  const events = await readSse(response);

  assert.deepEqual(requested, ["old-model", "good-model"], "phải thử model cũ rồi tới model mặc định");
  const notice = eventsNamed(events, "notice")[0];
  assert.ok(notice, "phải thông báo cho người dùng");
  assert.match(notice.data.message, /old-model/);
  assert.match(textOf(events), /model mặc định/);
  assert.ok(eventsNamed(events, "done").length >= 1);

  globalThis.fetch = REAL_FETCH;
  settings.updateProvider(provider.id, { enabled: false });
  settings.patchAppSettings({ defaultProviderId: null, defaultModel: null });
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
