import "./helpers.js";
import test from "node:test";
import assert from "node:assert/strict";

const { initDb, getById, db } = await import("../src/db.js");
initDb();
const settings = await import("../src/settings.js");
const { decryptSecret } = await import("../src/crypto.js");

test("provider CRUD never returns the raw API key", () => {
  const provider = settings.createProvider({
    name: "Gemini test",
    kind: "gemini",
    apiKey: "AIzaSyTESTKEY0123456789",
    models: ["gemini-2.5-flash", "gemini-2.5-pro"],
  });
  assert.equal(provider.kind, "gemini");
  assert.equal(provider.hasApiKey, true);
  assert.equal(provider.apiKeyPreview, "AIzaSy…789");
  assert.equal(provider.apiKey, undefined);
  assert.deepEqual(provider.models, ["gemini-2.5-flash", "gemini-2.5-pro"]);
  assert.equal(provider.imageModel, "gemini-2.5-flash-image");
  assert.equal(provider.enabled, true);

  // Stored form is encrypted, and decryptable by the server only.
  const row = getById("providers", provider.id);
  assert.ok(row.api_key_enc.startsWith("v1."));
  assert.equal(decryptSecret(row.api_key_enc), "AIzaSyTESTKEY0123456789");

  const listed = settings.listProviders();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].apiKey, undefined);
});

test("updating a provider keeps a masked key, replaces a new one, clears an empty one", () => {
  const provider = settings.createProvider({
    name: "Key lifecycle",
    kind: "openai-compatible",
    baseUrl: "https://api.deepseek.com/v1",
    apiKey: "sk-original-key-value",
    models: ["deepseek-chat"],
  });

  // Masked echo from the UI must not overwrite the stored secret.
  const keptMasked = settings.updateProvider(provider.id, { apiKey: "sk-or…alue" });
  assert.equal(keptMasked.apiKeyPreview, "sk-ori…lue");

  const replaced = settings.updateProvider(provider.id, { apiKey: "sk-brand-new-key" });
  assert.equal(replaced.apiKeyPreview, "sk-bra…key");
  assert.equal(decryptSecret(getById("providers", provider.id).api_key_enc), "sk-brand-new-key");

  const cleared = settings.updateProvider(provider.id, { apiKey: "" });
  assert.equal(cleared.hasApiKey, false);
  assert.equal(cleared.apiKeyPreview, null);
});

test("provider validation rejects unknown kinds and missing keys", () => {
  assert.throws(() => settings.createProvider({ name: "x", kind: "not-a-kind", apiKey: "k" }), /kind không hợp lệ/);
  assert.throws(() => settings.createProvider({ name: "x", kind: "gemini", apiKey: "" }), /Thiếu API key/);
  // Demo needs no key at all.
  const demo = settings.createProvider({ name: "Demo", kind: "mock" });
  assert.equal(demo.hasApiKey, false);
  assert.equal(demo.apiKeyPreview, null);
});

test("resolveProviderForChat explains what to do when nothing is configured", () => {
  // Fresh DB state is guaranteed by the temp data dir per test file.
  db.prepare("DELETE FROM providers").run();
  assert.throws(() => settings.resolveProviderForChat({}), /Chưa có nhà cung cấp AI nào/);

  const provider = settings.createProvider({ name: "Demo", kind: "mock", models: ["flowgpt-demo"] });
  const resolved = settings.resolveProviderForChat({});
  assert.equal(resolved.provider.id, provider.id);
  assert.equal(resolved.model, "flowgpt-demo");
  assert.equal(resolved.provider.kind, "mock");
});

test("app settings only accept known keys and keep defaults", () => {
  const before = settings.readAppSettings();
  assert.equal(before.maxToolIterations, 6);
  const after = settings.patchAppSettings({ maxToolIterations: 9, hackerField: "nope" });
  assert.equal(after.maxToolIterations, 9);
  assert.equal(after.hackerField, undefined);
  assert.ok(after.systemPrompt.length > 20);
});

test("MCP servers validate transport requirements", () => {
  assert.throws(() => settings.createMcpServer({ name: "x", transport: "stdio" }), /cần `command`/);
  assert.throws(() => settings.createMcpServer({ name: "x", transport: "http" }), /cần `url`/);
  assert.throws(() => settings.createMcpServer({ name: "x", transport: "carrier-pigeon", url: "u" }), /transport/);

  const server = settings.createMcpServer({
    name: "Tệp nội bộ",
    transport: "http",
    url: "https://mcp.example.com/mcp",
    headers: { Authorization: "Bearer abc123def456" },
    env: { SECRET_TOKEN: "topsecret" },
  });
  assert.equal(server.transport, "http");
  assert.equal(server.slug, "tep-noi-bo");
  // Secrets come back as key names + previews only.
  assert.equal(server.headers.length, 1);
  assert.equal(server.headers[0].key, "Authorization");
  assert.equal(server.headers[0].hasValue, true);
  assert.ok(!JSON.stringify(server).includes("abc123def456"));
  assert.ok(!JSON.stringify(server).includes("topsecret"));
});

test("MCP secret maps merge on update without losing existing values", () => {
  const server = settings.createMcpServer({
    name: "Merge test",
    transport: "sse",
    url: "https://mcp.example.com/sse",
    headers: { Authorization: "Bearer keep-me", "X-Extra": "drop-me" },
  });

  const updated = settings.updateMcpServer(server.id, {
    headers: { Authorization: "•••", "X-New": "added" },
  });
  const byKey = Object.fromEntries(updated.headers.map((h) => [h.key, h]));
  assert.equal(byKey.Authorization.hasValue, true);
  assert.equal(byKey["X-Extra"], undefined); // omitted keys are removed
  assert.equal(byKey["X-New"].hasValue, true);

  const runtime = settings.getMcpRuntimeConfig(settings.getMcpRow(server.id));
  assert.equal(runtime.headers.Authorization, "Bearer keep-me");
  assert.equal(runtime.headers["X-New"], "added");
});

test("editing an MCP server resets its connection status", () => {
  const server = settings.createMcpServer({ name: "Status", transport: "http", url: "https://x.test/mcp" });
  settings.setMcpStatus(server.id, { status: "connected", tools: [{ name: "a" }] });
  assert.equal(settings.getMcpRow(server.id).status, "connected");

  const updated = settings.updateMcpServer(server.id, { url: "https://y.test/mcp" });
  assert.equal(updated.status, "unknown");
  assert.equal(updated.toolCount, 0);
});

test("listModelsForUi only exposes enabled providers", () => {
  db.prepare("DELETE FROM providers").run();
  const on = settings.createProvider({ name: "On", kind: "gemini", apiKey: "k1", models: ["gemini-2.5-flash"] });
  const off = settings.createProvider({ name: "Off", kind: "openai", apiKey: "k2", models: ["gpt-4o-mini"] });
  settings.updateProvider(off.id, { enabled: false });

  const items = settings.listModelsForUi();
  assert.equal(items.length, 1);
  assert.equal(items[0].providerId, on.id);
  assert.equal(items[0].supportsTools, true);
});
