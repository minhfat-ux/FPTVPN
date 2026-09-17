#!/usr/bin/env node
/**
 * Create/refresh a provider and (optionally) make it the app default.
 *
 * The API key is read from a FILE so it never shows up in a command line, log or
 * transcript; it is stored AES-256-GCM encrypted by the app's own crypto module.
 * The key file is deleted at the end.
 *
 *   FLOWGPT_DATA_DIR=/var/lib/flowgpt NODE_ENV=production \
 *   node ops/configure-provider.mjs <keyFile> --name OpenRouter --kind openrouter \
 *        [--base-url https://openrouter.ai/api/v1] [--models a,b,c] \
 *        [--default-model a] [--set-default] [--disable-demo] [--verify-model x]
 *
 * Requires the app env (FLOWGPT_SECRET) so encryption matches the running service.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER = pathToFileURL(path.join(HERE, "..", "server", "src")).href;

const argv = process.argv.slice(2);
const keyFile = argv[0];
if (!keyFile || keyFile.startsWith("--")) {
  console.error("Thiếu đường dẫn file chứa API key.");
  process.exit(2);
}
function flag(name, fallback = undefined) {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? fallback : argv[index + 1];
}
function has(name) {
  return argv.includes(`--${name}`);
}

const name = flag("name", "Provider");
const kind = flag("kind", "openai-compatible");
/** `--base-url` may list candidates (comma separated); the first that answers wins. */
const baseUrlCandidates = (flag("base-url", "") || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const models = (flag("models", "") || "").split(",").map((m) => m.trim()).filter(Boolean);
const defaultModel = flag("default-model", undefined) || models[0] || undefined;
const verifyModel = flag("verify-model", undefined) || defaultModel;

if (!fs.existsSync(keyFile)) {
  console.error(`Không thấy file key: ${keyFile}`);
  process.exit(1);
}
const apiKey = fs.readFileSync(keyFile, "utf8").trim();
if (apiKey.length < 12) {
  console.error("File key có vẻ rỗng hoặc quá ngắn.");
  process.exit(1);
}
console.log(`Key đọc từ ${keyFile}: ${apiKey.slice(0, 5)}…${apiKey.slice(-3)} (len ${apiKey.length})`);

const { initDb, all } = await import(`${SERVER}/db.js`);
initDb();
const settings = await import(`${SERVER}/settings.js`);
const providers = await import(`${SERVER}/providers/index.js`);

function probeFor(candidateBaseUrl) {
  const probe = providers.toRuntimeProvider({
    id: "probe",
    name,
    kind,
    base_url: candidateBaseUrl ?? null,
    api_key_enc: null,
    models_json: [],
    default_model: null,
    image_model: null,
    enabled: 1,
  });
  probe.apiKey = apiKey;
  return probe;
}

// 1. Pick a base URL that actually answers, then read the live model list.
let baseUrl = null;
let liveModels = null;
const candidates = baseUrlCandidates.length ? baseUrlCandidates : [null];
for (const candidate of candidates) {
  const probe = probeFor(candidate);
  try {
    liveModels = await providers.providerModels({ provider: probe });
    baseUrl = candidate;
    console.log(`Base URL dùng được: ${candidate ?? "(mặc định của kind)"} — ${liveModels.length} model.`);
    break;
  } catch (err) {
    // A gateway may answer /chat/completions but not /models — verify before giving up.
    const message = String(err?.message ?? err);
    const modelsUnsupported = /404|not found|không hỗ trợ/i.test(message);
    try {
      await providers.testProvider({ provider: probe, model: verifyModel ?? models[0] });
      baseUrl = candidate;
      liveModels = null;
      console.log(`Base URL dùng được: ${candidate ?? "(mặc định của kind)"} (không có /models nhưng chat OK).`);
      break;
    } catch (chatErr) {
      console.log(`  ✖ ${candidate ?? "(mặc định)"}: ${modelsUnsupported ? message.slice(0, 90) : String(chatErr?.message ?? chatErr).slice(0, 120)}`);
    }
  }
}
if (!baseUrl && baseUrlCandidates.length) baseUrl = baseUrlCandidates[0];

// Prefer the live list, but keep the curated order the operator asked for.
const chosen = models.length ? models : liveModels?.slice(0, 8) ?? [];
if (liveModels && verifyModel && !liveModels.includes(verifyModel)) {
  console.log(`⚠ Model "${verifyModel}" không có trong danh sách thật — dùng model có thật.`);
}
const curatedInLive = models.find((model) => liveModels?.includes(model));
const finalDefault =
  (liveModels && defaultModel && liveModels.includes(defaultModel) ? defaultModel : null) ||
  curatedInLive ||
  (liveModels ? liveModels[0] : defaultModel);

// 2. Create or update the row.
const existing = all("providers").find(
  (row) => row.kind === kind && (row.name === name || (baseUrl && row.base_url === baseUrl)),
);
const payload = {
  name,
  kind,
  baseUrl: baseUrl ?? null,
  apiKey,
  models: chosen.length ? chosen : undefined,
  defaultModel: finalDefault,
  enabled: true,
};

let provider;
if (existing) {
  provider = settings.updateProvider(existing.id, payload);
  console.log(`Cập nhật provider: ${provider.id}`);
} else {
  provider = settings.createProvider(payload);
  console.log(`Tạo provider mới: ${provider.id}`);
}
console.log(`Model mặc định của provider: ${provider.defaultModel ?? "(chưa có)"}`);

// 3. Optionally switch the app default to it.
if (has("set-default")) {
  const before = settings.readAppSettings();
  settings.patchAppSettings({ defaultProviderId: provider.id, defaultModel: provider.defaultModel });
  console.log(
    `Đã đặt làm mặc định${before.defaultProviderId && before.defaultProviderId !== provider.id ? ` (trước đó: ${before.defaultProviderId})` : ""}.`,
  );
}

// 4. The key-free demo provider only confuses a configured instance.
if (has("disable-demo")) {
  for (const row of all("providers")) {
    if (row.id !== provider.id && row.kind === "mock") {
      settings.updateProvider(row.id, { enabled: false });
      console.log(`Đã tắt provider demo: ${row.name}`);
    }
  }
}

// 5. Prove the credential works, including a real streamed answer.
console.log("\nKiểm tra thật với provider…");
const runtime = providers.toRuntimeProvider(settings.getProviderRow(provider.id));
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 40000);
try {
  const result = await providers.testProvider({
    provider: runtime,
    model: verifyModel && liveModels?.includes(verifyModel) ? verifyModel : runtime.defaultModel,
    signal: controller.signal,
  });
  console.log(`  ✔ Trả lời OK trong ${result.latencyMs}ms (model ${runtime.defaultModel})`);

  const streamAbort = new AbortController();
  const streamTimer = setTimeout(() => streamAbort.abort(), 60000);
  let text = "";
  for await (const event of providers.streamChat({
    provider: runtime,
    model: runtime.defaultModel,
    messages: [{ role: "user", content: "Chào em, trả lời đúng một câu ngắn bằng tiếng Việt." }],
    tools: [],
    toolMode: "off",
    signal: streamAbort.signal,
  })) {
    if (event.type === "delta") text += event.text;
  }
  clearTimeout(streamTimer);
  console.log(`  ✔ Streaming thật: "${text.trim().slice(0, 100)}"`);
} catch (err) {
  console.error(`  ✖ Kiểm tra thất bại: ${err?.message ?? err}`);
  process.exitCode = 2;
} finally {
  clearTimeout(timer);
}

// 6. Never leave the key on disk.
fs.rmSync(keyFile, { force: true });
console.log(`\nĐã xoá file key tạm (${keyFile}).`);
