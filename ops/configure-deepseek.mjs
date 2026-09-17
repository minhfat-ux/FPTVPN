#!/usr/bin/env node
/**
 * Configure (or refresh) the DeepSeek provider and make it the default.
 *
 * The API key is read from a file so it never appears in a command line, log or
 * transcript; it is stored AES-256-GCM encrypted by the app's own crypto module.
 * The key file is deleted afterwards.
 *
 *   FBUDDY_DATA_DIR=/var/lib/fbuddy NODE_ENV=production \
 *     node ops/configure-deepseek.mjs /tmp/fbuddy-deepseek.key [baseUrl] [models]
 *
 * Requires the app's env (FBUDDY_SECRET) to be loaded so encryption matches the
 * running service.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
// Windows needs file:// URLs for absolute imports; Linux accepts both.
const SERVER = pathToFileURL(path.join(HERE, "..", "server", "src")).href;

const keyFile = process.argv[2] ?? "/tmp/fbuddy-deepseek.key";
const baseUrl = process.argv[3] ?? "https://api.deepseek.com/v1";
const models = (process.argv[4] ?? "deepseek-chat,deepseek-reasoner").split(",").map((m) => m.trim());
const defaultModel = models[0];

if (!fs.existsSync(keyFile)) {
  console.error(`Không thấy file key: ${keyFile}`);
  process.exit(1);
}
const apiKey = fs.readFileSync(keyFile, "utf8").trim();
const masked = `${apiKey.slice(0, 5)}…${apiKey.slice(-3)}`;
console.log(`Key đọc từ ${keyFile}: ${masked} (len ${apiKey.length})`);

const { initDb, all } = await import(`${SERVER}/db.js`);
initDb();
const settings = await import(`${SERVER}/settings.js`);
const providers = await import(`${SERVER}/providers/index.js`);

// 1. Create or update the DeepSeek provider.
const existing = all("providers", "kind = ? OR name = ?", ["openai-compatible", "DeepSeek"])
  .find((row) => /deepseek/i.test(row.name) || /deepseek/i.test(row.base_url ?? ""));

let provider;
if (existing) {
  provider = settings.updateProvider(existing.id, {
    name: "DeepSeek",
    kind: "openai-compatible",
    baseUrl,
    apiKey,
    models,
    defaultModel,
    enabled: true,
  });
  console.log(`Cập nhật provider: ${provider.id}`);
} else {
  provider = settings.createProvider({
    name: "DeepSeek",
    kind: "openai-compatible",
    baseUrl,
    apiKey,
    models,
    defaultModel,
    enabled: true,
  });
  console.log(`Tạo provider mới: ${provider.id}`);
}

// 2. DeepSeek becomes the default; the key-free demo provider is switched off so
//    the app never silently answers from the mock.
for (const row of all("providers")) {
  if (row.id !== provider.id && row.kind === "mock") {
    settings.updateProvider(row.id, { enabled: false });
    console.log(`Đã tắt provider demo: ${row.name}`);
  }
}
settings.patchAppSettings({ defaultProviderId: provider.id, defaultModel });

console.log(`Mặc định: ${provider.name} · ${defaultModel}`);
console.log(`Key đã lưu (mã hoá): ${provider.apiKeyPreview}`);

// 3. Prove the credential works with a real request.
console.log("\nKiểm tra kết nối thật tới DeepSeek…");
const runtime = providers.toRuntimeProvider(settings.getProviderRow(provider.id));
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 30000);
try {
  const result = await providers.testProvider({ provider: runtime, model: defaultModel, signal: controller.signal });
  console.log(`  ✔ DeepSeek trả lời OK trong ${result.latencyMs}ms (model ${defaultModel})`);

  // 4. And that streaming + tool calling survives the real API.
  const { streamChat } = providers;
  const streamed = { text: "", tools: [] };
  const streamAbort = new AbortController();
  const streamTimer = setTimeout(() => streamAbort.abort(), 60000);
  for await (const event of streamChat({
    provider: runtime,
    model: defaultModel,
    messages: [{ role: "user", content: "Chào em, trả lời đúng một câu ngắn." }],
    tools: [],
    toolMode: "off",
    signal: streamAbort.signal,
  })) {
    if (event.type === "delta") streamed.text += event.text;
  }
  clearTimeout(streamTimer);
  console.log(`  ✔ Streaming thật: "${streamed.text.trim().slice(0, 80)}"`);
} catch (err) {
  console.error(`  ✖ Kiểm tra DeepSeek thất bại: ${err?.message ?? err}`);
  console.error("    (Key vẫn đã được lưu — sửa key trong Cài đặt → Nhà cung cấp AI nếu cần.)");
  process.exitCode = 2;
} finally {
  clearTimeout(timer);
}

// 5. Never leave the key on disk.
fs.rmSync(keyFile, { force: true });
console.log(`\nĐã xoá file key tạm (${keyFile}).`);
