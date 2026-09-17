import "./helpers.js";
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { initDb } from "../src/db.js";

const { db } = await import("../src/db.js");
initDb();
const settings = await import("../src/settings.js");
const providers = await import("../src/providers/index.js");

after(() => {
  if (globalThis.__origFetch) globalThis.fetch = globalThis.__origFetch;
});

const originalFetch = globalThis.fetch;

function resetProviders() {
  db.prepare("DELETE FROM providers").run();
  settings.patchAppSettings({ defaultProviderId: null, defaultModel: null });
}

test("openrouter is a first-class provider kind with its own base URL", () => {
  const meta = providers.PROVIDER_KINDS.find((kind) => kind.id === "openrouter");
  assert.ok(meta, "thiếu kind openrouter");
  assert.equal(meta.defaultBaseUrl, "https://openrouter.ai/api/v1");
  assert.equal(meta.supportsTools, true);
  assert.equal(meta.supportsVision, true);
  assert.match(meta.keyHint, /openrouter\.ai/);
  // It reuses the OpenAI-compatible adapter, so it must resolve like one.
  assert.equal(providers.adapterFor("openrouter"), providers.adapterFor("openai-compatible"));
});

test("openrouter requests carry the attribution headers OpenRouter asks for", async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ data: [{ id: "google/gemini-2.5-flash" }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const provider = providers.toRuntimeProvider({
    id: "p_or",
    name: "OpenRouter",
    kind: "openrouter",
    base_url: "https://openrouter.ai/api/v1",
    api_key_enc: null,
    models_json: ["google/gemini-2.5-flash"],
    default_model: "google/gemini-2.5-flash",
    enabled: 1,
  });
  provider.apiKey = "sk-or-test";

  await providers.providerModels({ provider });
  assert.equal(calls[0].url, "https://openrouter.ai/api/v1/models");
  assert.equal(calls[0].init.headers["X-Title"], "FlowGpt");
  assert.ok(calls[0].init.headers["HTTP-Referer"], "cần HTTP-Referer");

  globalThis.fetch = originalFetch;
});

test("a default provider without a key falls back to one that has a key", () => {
  resetProviders();
  // Created with a placeholder, then cleared — createProvider refuses an empty key.
  const noKey = settings.createProvider({
    name: "OpenRouter",
    kind: "openrouter",
    baseUrl: "https://openrouter.ai/api/v1",
    apiKey: "sk-or-placeholder",
    models: ["google/gemini-2.5-flash"],
    defaultModel: "google/gemini-2.5-flash",
  });
  settings.updateProvider(noKey.id, { apiKey: "" });
  const withKey = settings.createProvider({
    name: "DeepSeek",
    kind: "openai-compatible",
    baseUrl: "https://api.deepseek.com/v1",
    apiKey: "sk-deepseek-x",
    models: ["deepseek-chat"],
    defaultModel: "deepseek-chat",
  });
  settings.patchAppSettings({ defaultProviderId: noKey.id, defaultModel: "google/gemini-2.5-flash" });

  const picked = settings.resolveProviderForChat({});
  assert.equal(picked.provider.id, withKey.id, "phải lùi về provider có key");
  assert.equal(picked.model, "deepseek-chat", "không được dùng model của provider mặc định");
  assert.deepEqual(picked.fallbackFrom, { id: noKey.id, name: "OpenRouter", reason: "missing_api_key" });

  // Once the key exists, the configured default wins again.
  settings.updateProvider(noKey.id, { apiKey: "sk-or-real" });
  const picked2 = settings.resolveProviderForChat({});
  assert.equal(picked2.provider.id, noKey.id);
  assert.equal(picked2.fallbackFrom, null);
  assert.equal(picked2.model, "google/gemini-2.5-flash");
});

test("with no usable provider at all the error names the missing key", () => {
  resetProviders();
  const provider = settings.createProvider({ name: "OpenRouter", kind: "openrouter", apiKey: "x", models: ["m"] });
  settings.updateProvider(provider.id, { apiKey: "" });
  settings.patchAppSettings({ defaultProviderId: provider.id, defaultModel: "m" });
  assert.throws(() => settings.resolveProviderForChat({}), /chưa có API key/);
  resetProviders();
});

test("models list marks providers that cannot answer yet", () => {
  resetProviders();
  const noKey = settings.createProvider({ name: "OpenRouter", kind: "openrouter", apiKey: "x", models: ["google/gemini-2.5-flash"] });
  settings.updateProvider(noKey.id, { apiKey: "" });
  const ready = settings.createProvider({ name: "DeepSeek", kind: "openai-compatible", apiKey: "sk-d", models: ["deepseek-chat"] });

  const items = settings.listModelsForUi();
  const fromNoKey = items.find((item) => item.providerId === noKey.id);
  const fromReady = items.find((item) => item.providerId === ready.id);
  assert.equal(fromNoKey.hasKey, false);
  assert.equal(fromReady.hasKey, true);
  resetProviders();
  globalThis.fetch = originalFetch;
});
