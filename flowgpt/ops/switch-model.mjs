#!/usr/bin/env node
/**
 * Switch the GLM provider (and the app default) to a different model and verify
 * it with a real call. No key is needed — it is already stored encrypted.
 *
 *   NODE_ENV=production node ops/switch-model.mjs --provider GLM --model glm-4-flash [--keep-models a,b]
 */

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER = pathToFileURL(path.join(HERE, "..", "server", "src")).href;

const argv = process.argv.slice(2);
const flag = (name, fallback = undefined) => {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? fallback : argv[index + 1];
};

const providerName = flag("provider", "GLM");
const model = flag("model");
if (!model) {
  console.error("Thiếu --model");
  process.exit(2);
}
const keepModels = (flag("keep-models", "") || "").split(",").map((m) => m.trim()).filter(Boolean);
const setDefault = !argv.includes("--no-default");

const { initDb, all } = await import(`${SERVER}/db.js`);
initDb();
const settings = await import(`${SERVER}/settings.js`);
const providers = await import(`${SERVER}/providers/index.js`);

const row = all("providers").find((entry) => entry.name === providerName);
if (!row) {
  console.error(`Không thấy provider tên "${providerName}"`);
  process.exit(1);
}

const models = keepModels.length ? keepModels : Array.from(new Set([model, ...(row.models ?? [])]));
const updated = settings.updateProvider(row.id, { models, defaultModel: model, enabled: true });
console.log(`Provider ${updated.name}: model mặc định → ${updated.defaultModel}`);
console.log(`Danh sách model: ${updated.models.join(", ")}`);

if (setDefault) {
  settings.patchAppSettings({ defaultProviderId: row.id, defaultModel: model });
  console.log(`App mặc định → ${updated.name} · ${model}`);
}

// Verify for real: a small completion plus a streamed answer.
const runtime = providers.toRuntimeProvider(settings.getProviderRow(row.id));
console.log("\nKiểm tra thật…");
try {
  const result = await providers.testProvider({ provider: runtime, model });
  console.log(`  ✔ Gọi được trong ${result.latencyMs}ms`);

  let text = "";
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 60000);
  for await (const event of providers.streamChat({
    provider: runtime,
    model,
    messages: [{ role: "user", content: "Chào em, trả lời đúng một câu ngắn bằng tiếng Việt." }],
    tools: [],
    toolMode: "off",
    signal: abort.signal,
  })) {
    if (event.type === "delta") text += event.text;
  }
  clearTimeout(timer);
  console.log(`  ✔ Streaming thật: "${text.trim().slice(0, 120)}"`);
  console.log(`\nMẶC ĐỊNH ĐANG CHẠY: ${updated.name} · ${model}`);
} catch (err) {
  console.error(`  ✖ Thất bại: ${err?.message ?? err}`);
  process.exitCode = 2;
}
