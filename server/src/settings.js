import { all, getById, insert, remove, update, getAppSettings, setAppSettings } from "./db.js";
import { decryptSecret, encryptSecret, maskSecret } from "./crypto.js";
import { ApiError, badRequest, notFound, slugify } from "./util.js";
import { PROVIDER_KINDS, providerKind, toRuntimeProvider } from "./providers/index.js";
import { modelAcceptsImages } from "./providers/vision.js";

/** Client echoes masked values back on PATCH — anything like "•••" or this sentinel keeps the stored secret. */
export const KEEP_SECRET = "__KEEP__";

function looksMasked(value) {
  return value === KEEP_SECRET || /^[•*]{2,}/.test(String(value ?? "")) || /…/.test(String(value ?? ""));
}

function normalizeModels(input) {
  if (Array.isArray(input)) return input.map((m) => String(m).trim()).filter(Boolean);
  if (typeof input === "string") {
    return input
      .split(/[\n,]/)
      .map((m) => m.trim())
      .filter(Boolean);
  }
  return [];
}

// --------------------------------------------------------------- providers

export function publicProvider(row) {
  const apiKey = row.api_key_enc ? decryptSecret(row.api_key_enc) : null;
  const meta = providerKind(row.kind);
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    baseUrl: row.base_url ?? meta?.defaultBaseUrl ?? null,
    models: row.models ?? [],
    defaultModel: row.default_model ?? null,
    imageModel: row.image_model ?? meta?.defaultImageModel ?? null,
    enabled: Boolean(row.enabled),
    hasApiKey: Boolean(apiKey),
    apiKeyPreview: apiKey ? maskSecret(apiKey) : null,
    supportsImages: Boolean(meta?.supportsImages),
    supportsTools: Boolean(meta?.supportsTools),
    supportsVision: Boolean(meta?.supportsVision),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listProviderRows() {
  return all("providers", "", [], { order: "created_at ASC" });
}

export function listProviders() {
  return listProviderRows().map(publicProvider);
}

export function getProviderRow(id) {
  return getById("providers", id);
}

export function createProvider(input) {
  const kind = String(input?.kind ?? "").trim();
  if (!PROVIDER_KINDS.some((k) => k.id === kind)) {
    throw badRequest(`kind không hợp lệ. Chọn một trong: ${PROVIDER_KINDS.map((k) => k.id).join(", ")}`);
  }
  const name = String(input?.name ?? "").trim();
  if (!name) throw badRequest("Thiếu tên nhà cung cấp");
  if (kind !== "mock" && !String(input?.apiKey ?? "").trim()) {
    throw badRequest("Thiếu API key (trừ chế độ demo)");
  }
  const meta = providerKind(kind);
  const models = normalizeModels(input.models);
  const row = insert("providers", {
    name,
    kind,
    base_url: String(input.baseUrl ?? "").trim() || meta?.defaultBaseUrl || null,
    // The demo provider talks to nothing, so it stores no credential at all.
    api_key_enc: kind === "mock" ? null : encryptSecret(String(input.apiKey ?? "").trim()),
    models_json: models.length ? models : meta?.suggestedModels?.slice(0, 3) ?? [],
    default_model: input.defaultModel || (models[0] ?? meta?.suggestedModels?.[0] ?? null),
    image_model: input.imageModel ?? meta?.defaultImageModel ?? null,
    enabled: input.enabled === undefined ? 1 : input.enabled ? 1 : 0,
  });
  return publicProvider(row);
}

export function updateProvider(id, patch) {
  const existing = getById("providers", id);
  if (!existing) throw notFound("Không tìm thấy nhà cung cấp");
  const changes = {};
  if (patch.name !== undefined) changes.name = String(patch.name).trim() || existing.name;
  if (patch.kind !== undefined && patch.kind !== existing.kind) {
    if (!PROVIDER_KINDS.some((k) => k.id === patch.kind)) throw badRequest("kind không hợp lệ");
    changes.kind = patch.kind;
  }
  if (patch.baseUrl !== undefined) changes.base_url = String(patch.baseUrl).trim() || null;
  if (patch.models !== undefined) changes.models_json = normalizeModels(patch.models);
  if (patch.defaultModel !== undefined) changes.default_model = patch.defaultModel || null;
  if (patch.imageModel !== undefined) changes.image_model = patch.imageModel || null;
  if (patch.enabled !== undefined) changes.enabled = patch.enabled ? 1 : 0;
  if (patch.apiKey !== undefined) {
    const raw = String(patch.apiKey ?? "");
    if (raw === "") changes.api_key_enc = null;
    else if (!looksMasked(raw)) changes.api_key_enc = encryptSecret(raw.trim());
  }
  return publicProvider(update("providers", id, changes));
}

export function deleteProvider(id) {
  if (!getById("providers", id)) throw notFound("Không tìm thấy nhà cung cấp");
  remove("providers", id);
  const settings = getAppSettings();
  if (settings.defaultProviderId === id) setAppSettings({ defaultProviderId: null, defaultModel: null });
  return { ok: true };
}

/**
 * Picks the provider+model for a chat turn: explicit choice → conversation
 * choice → app default → first enabled provider. Throws a helpful error when
 * nothing is configured yet.
 *
 * A provider without an API key is never used: if the configured default has no
 * key (e.g. OpenRouter waiting for its key) the turn falls back to the first
 * provider that does, and reports `fallbackFrom` so the UI can explain it.
 */
/**
 * Cặp model dự phòng đã cấu hình (Cài đặt → Hệ thống → Model dự phòng).
 * Trả về `{ provider, model, row }` khi cặp đó còn dùng được, ngược lại `null`.
 */
export function resolveFallbackTarget() {
  const settings = getAppSettings();
  if (!settings.fallbackProviderId) return null;
  const row = listProviderRows().find((item) => item.id === settings.fallbackProviderId);
  if (!row || Number(row.enabled) !== 1) return null;
  const runtime = toRuntimeProvider(row);
  const ready = row.kind === "mock" || Boolean(decryptSecret(row.api_key_enc));
  if (!ready) return null;
  const model = settings.fallbackModel || runtime.defaultModel || runtime.models?.[0] || null;
  if (!model) return null;
  if (runtime.models?.length && !runtime.models.includes(model)) {
    const safe = runtime.defaultModel ?? runtime.models[0] ?? null;
    return safe ? { provider: runtime, model: safe, row } : null;
  }
  return { provider: runtime, model, row };
}

export function resolveProviderForChat({ providerId = null, model = null } = {}) {
  const settings = getAppSettings();
  const rows = listProviderRows().filter((row) => Number(row.enabled) === 1);
  if (!rows.length) {
    throw new ApiError(
      400,
      "bad_request",
      "Chưa có nhà cung cấp AI nào đang bật. Vào Cài đặt → Nhà cung cấp AI để thêm (hoặc bật chế độ Demo).",
    );
  }

  // The demo provider talks to nothing, so it counts as ready without a key.
  const isReady = (row) => row.kind === "mock" || Boolean(decryptSecret(row.api_key_enc));

  const wantedId = providerId ?? settings.defaultProviderId ?? null;
  const preferred = wantedId ? rows.find((row) => row.id === wantedId) ?? null : null;

  let row = preferred && isReady(preferred) ? preferred : null;
  let fallbackFrom = null;
  let usedFallbackModel = false;
  let fallbackModel = null;
  if (!row) {
    // Ưu tiên cặp DỰ PHÒNG đã cấu hình trước khi tự chọn một nhà cung cấp bất kỳ.
    const configured = resolveFallbackTarget();
    if (configured) {
      row = configured.row;
      fallbackModel = configured.model;
      usedFallbackModel = true;
      if (preferred) fallbackFrom = { id: preferred.id, name: preferred.name, reason: "missing_api_key" };
    }
  }
  if (!row) {
    if (preferred) fallbackFrom = { id: preferred.id, name: preferred.name, reason: "missing_api_key" };
    row = rows.find(isReady) ?? null;
    if (!row) {
      throw new ApiError(
        400,
        "bad_request",
        preferred
          ? `Nhà cung cấp mặc định "${preferred.name}" chưa có API key và không còn nhà cung cấp nào dùng được. Vào Cài đặt → Nhà cung cấp AI để dán key.`
          : "Chưa có nhà cung cấp AI nào dùng được — hãy dán API key trong Cài đặt → Nhà cung cấp AI.",
      );
    }
  }

  const runtime = toRuntimeProvider(row);
  const isDefaultProvider = row.id === settings.defaultProviderId;

  // Client (web/app/hội thoại cũ) có thể vẫn gửi `providerId` + `model` của nhà cung cấp đã bị
  // XOÁ (ví dụ OpenRouter). Trước đây server bỏ provider nhưng vẫn dùng model cũ ⇒ gọi nhà cung
  // cấp khác bằng model của nhà cung cấp đã xoá ⇒ lỗi "model không tồn tại" + phải retry (chậm).
  const providerWasRequested = Boolean(providerId);
  const providerWasHonoured = providerWasRequested && row.id === providerId;
  let requestedModel = typeof model === "string" && model.trim() ? model.trim() : null;
  let ignoredModel = null;
  if (requestedModel) {
    if (providerWasRequested && !providerWasHonoured) {
      ignoredModel = { model: requestedModel, reason: "provider_gone" };
      requestedModel = null;
      if (!fallbackFrom) fallbackFrom = { id: providerId, name: providerId, reason: "provider_gone" };
    } else if (runtime.models?.length && !runtime.models.includes(requestedModel)) {
      ignoredModel = { model: requestedModel, reason: "model_not_in_provider" };
      requestedModel = null;
    }
  }

  const chosenModel =
    requestedModel ||
    (isDefaultProvider ? settings.defaultModel : null) ||
    runtime.defaultModel ||
    runtime.models?.[0] ||
    null;
  if (!chosenModel) {
    throw new ApiError(400, "bad_request", `Nhà cung cấp "${row.name}" chưa có model nào. Thêm model trong Cài đặt.`);
  }
  const safeModel = runtime.models?.length && !runtime.models.includes(chosenModel)
    ? runtime.defaultModel ?? runtime.models[0]
    : chosenModel;
  if (safeModel !== chosenModel && !ignoredModel) {
    ignoredModel = { model: chosenModel, reason: "model_not_in_provider" };
  }
  return {
    provider: runtime,
    model: usedFallbackModel && fallbackModel ? fallbackModel : safeModel,
    row,
    fallbackFrom,
    ignoredModel,
    usedFallbackModel,
  };
}

/**
 * The provider+model used to *read* an image (OCR / table extraction) when the
 * model the user picked has no vision.
 *
 * Order: the configured `visionProviderId`/`visionModel`, then the provider that
 * is already serving the chat (if it can see), then the default provider, then
 * any enabled provider with a vision model. Returns null when the instance has
 * no vision model at all.
 */
export function resolveVisionTarget({ preferProviderId = null, preferModel = null } = {}) {
  const settings = getAppSettings();
  const rows = listProviderRows().filter((row) => Number(row.enabled) === 1);
  const isReady = (row) => row.kind === "mock" || Boolean(decryptSecret(row.api_key_enc));

  /** First model of this provider that really accepts images. */
  const visionModelFor = (runtime) => {
    const candidates = [runtime.defaultModel, ...(runtime.models ?? [])].filter(Boolean);
    const seen = new Set();
    for (const candidate of candidates) {
      if (seen.has(candidate)) continue;
      seen.add(candidate);
      if (modelAcceptsImages(runtime, candidate)) return candidate;
    }
    return null;
  };

  const pick = (row, forcedModel = null) => {
    if (!row || !isReady(row)) return null;
    const runtime = toRuntimeProvider(row);
    const model = forcedModel && modelAcceptsImages(runtime, forcedModel) ? forcedModel : visionModelFor(runtime);
    if (!model) return null;
    return { provider: runtime, model, row };
  };

  const configured = settings.visionProviderId
    ? pick(rows.find((row) => row.id === settings.visionProviderId) ?? null, settings.visionModel ?? null)
    : null;
  if (configured) return configured;

  const already = preferProviderId ? pick(rows.find((row) => row.id === preferProviderId) ?? null, preferModel) : null;
  if (already) return already;

  const byDefault = settings.defaultProviderId
    ? pick(rows.find((row) => row.id === settings.defaultProviderId) ?? null)
    : null;
  if (byDefault) return byDefault;

  for (const row of rows) {
    const target = pick(row);
    if (target) return target;
  }
  return null;
}

/**
 * The next provider that can actually serve a turn, skipping `excludeId`.
 * Used when the default provider rejects the request (out of credit, revoked
 * key, rate limit) so one bad provider cannot break every conversation.
 */
export function nextUsableProvider({ excludeId = null, providerId = null, model = null } = {}) {
  const rows = listProviderRows().filter((row) => Number(row.enabled) === 1 && row.id !== excludeId);
  const ready = rows.filter((row) => row.kind === "mock" || Boolean(decryptSecret(row.api_key_enc)));
  if (!ready.length) return null;
  const wanted = providerId ? ready.find((row) => row.id === providerId) : null;
  const row = wanted ?? ready[0];
  const runtime = toRuntimeProvider(row);
  const chosenModel = model || runtime.defaultModel || runtime.models?.[0] || null;
  if (!chosenModel) return null;
  return { provider: runtime, model: chosenModel, row };
}

/**
 * Public name for a model. Users should never see the vendor's model id — the
 * product is fBuddy — while admins keep the real id for configuration.
 */
export function publicModelLabel(model, kind = null, aliases = null) {
  const map = aliases ?? getAppSettings().modelAliases ?? {};
  const raw = String(model ?? "");
  if (map[raw]) return map[raw];
  // GLM family: glm-4.5-air → fBuddy-4.5-Air (also covers future glm-* models).
  if (kind === "glm" || /^glm-/i.test(raw)) {
    return `fBuddy-${raw.replace(/^glm-?/i, "")}`;
  }
  return raw;
}

export function listModelsForUi() {
  const settings = getAppSettings();
  const aliases = settings.modelAliases ?? {};
  const items = [];
  for (const row of listProviderRows()) {
    if (Number(row.enabled) !== 1) continue;
    const meta = providerKind(row.kind);
    const models = row.models?.length ? row.models : meta?.suggestedModels ?? [];
    // A provider without a key cannot actually answer — the UI hides/annotates it.
    const ready = row.kind === "mock" || Boolean(decryptSecret(row.api_key_enc));
    for (const model of models) {
      items.push({
        providerId: row.id,
        providerName: row.name,
        kind: row.kind,
        model,
        /** What the picker shows users: a fBuddy brand name, never the vendor id. */
        label: publicModelLabel(model, row.kind, aliases),
        isDefault: row.id === settings.defaultProviderId && (settings.defaultModel ?? row.default_model) === model,
        hasKey: ready,
        isAppDefaultProvider: row.id === settings.defaultProviderId,
        supportsTools: Boolean(meta?.supportsTools),
        supportsVision: Boolean(meta?.supportsVision),
        supportsImages: Boolean(meta?.supportsImages),
      });
    }
  }
  return items;
}

// ------------------------------------------------------------- MCP servers

function parseSecretMap(encrypted) {
  const json = decryptSecret(encrypted);
  if (!json) return {};
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function serializeSecretMap(map) {
  const entries = Object.entries(map ?? {}).filter(([key]) => String(key).trim());
  if (!entries.length) return null;
  return encryptSecret(JSON.stringify(Object.fromEntries(entries)));
}

function mergeSecretMap(existing, incoming) {
  if (incoming === undefined) return existing;
  if (incoming === null) return {};
  const out = {};
  for (const [key, value] of Object.entries(incoming)) {
    const name = String(key).trim();
    if (!name) continue;
    const raw = String(value ?? "");
    if (looksMasked(raw) && existing[name] !== undefined) out[name] = existing[name];
    else if (raw !== "") out[name] = raw;
  }
  return out;
}

function publicSecretMap(map) {
  return Object.entries(map ?? {}).map(([key, value]) => ({
    key,
    hasValue: Boolean(value),
    preview: maskSecret(value, { head: 3, tail: 2 }),
  }));
}

export function publicMcpServer(row) {
  const env = parseSecretMap(row.env_enc);
  const headers = parseSecretMap(row.headers_enc);
  return {
    id: row.id,
    name: row.name,
    slug: slugify(row.name, "mcp"),
    transport: row.transport,
    command: row.command ?? null,
    args: row.args ?? [],
    url: row.url ?? null,
    env: publicSecretMap(env),
    headers: publicSecretMap(headers),
    enabled: Boolean(row.enabled),
    autoApprove: Boolean(row.auto_approve),
    timeoutMs: row.timeout_ms ?? 30000,
    status: row.status ?? "unknown",
    toolCount: Array.isArray(row.tools) ? row.tools.length : 0,
    tools: row.tools ?? [],
    lastError: row.last_error ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listMcpServers() {
  return all("mcp_servers", "", [], { order: "created_at ASC" }).map(publicMcpServer);
}

export function getMcpRow(id) {
  return getById("mcp_servers", id);
}

export function getMcpRuntimeConfig(row) {
  return {
    id: row.id,
    name: row.name,
    slug: slugify(row.name, "mcp"),
    transport: row.transport,
    command: row.command ?? null,
    args: row.args ?? [],
    env: parseSecretMap(row.env_enc),
    url: row.url ?? null,
    headers: parseSecretMap(row.headers_enc),
    enabled: Boolean(row.enabled),
    autoApprove: Boolean(row.auto_approve),
    timeoutMs: row.timeout_ms ?? 30000,
  };
}

export function createMcpServer(input) {
  const name = String(input?.name ?? "").trim();
  if (!name) throw badRequest("Thiếu tên MCP server");
  const transport = String(input?.transport ?? "http").trim();
  if (!["stdio", "http", "sse"].includes(transport)) {
    throw badRequest("transport phải là stdio, http hoặc sse");
  }
  if (transport === "stdio" && !String(input?.command ?? "").trim()) {
    throw badRequest("transport stdio cần `command`");
  }
  if (transport !== "stdio" && !String(input?.url ?? "").trim()) {
    throw badRequest(`transport ${transport} cần \`url\``);
  }
  const row = insert("mcp_servers", {
    name,
    transport,
    command: String(input.command ?? "").trim() || null,
    args_json: Array.isArray(input.args) ? input.args.map(String) : [],
    env_enc: serializeSecretMap(input.env ?? {}),
    url: String(input.url ?? "").trim() || null,
    headers_enc: serializeSecretMap(input.headers ?? {}),
    enabled: input.enabled === undefined ? 1 : input.enabled ? 1 : 0,
    auto_approve: input.autoApprove ? 1 : 0,
    timeout_ms: Number(input.timeoutMs) > 0 ? Number(input.timeoutMs) : 30000,
    status: "unknown",
  });
  return publicMcpServer(row);
}

export function updateMcpServer(id, patch) {
  const existing = getById("mcp_servers", id);
  if (!existing) throw notFound("Không tìm thấy MCP server");
  const changes = {};
  if (patch.name !== undefined) changes.name = String(patch.name).trim() || existing.name;
  if (patch.transport !== undefined) {
    if (!["stdio", "http", "sse"].includes(patch.transport)) throw badRequest("transport không hợp lệ");
    changes.transport = patch.transport;
  }
  if (patch.command !== undefined) changes.command = String(patch.command ?? "").trim() || null;
  if (patch.args !== undefined) changes.args_json = Array.isArray(patch.args) ? patch.args.map(String) : [];
  if (patch.url !== undefined) changes.url = String(patch.url ?? "").trim() || null;
  if (patch.env !== undefined) changes.env_enc = serializeSecretMap(mergeSecretMap(parseSecretMap(existing.env_enc), patch.env));
  if (patch.headers !== undefined) {
    changes.headers_enc = serializeSecretMap(mergeSecretMap(parseSecretMap(existing.headers_enc), patch.headers));
  }
  if (patch.enabled !== undefined) changes.enabled = patch.enabled ? 1 : 0;
  if (patch.autoApprove !== undefined) changes.auto_approve = patch.autoApprove ? 1 : 0;
  if (patch.timeoutMs !== undefined) changes.timeout_ms = Number(patch.timeoutMs) > 0 ? Number(patch.timeoutMs) : 30000;
  // Connection state depends on the transport config, so it is reset on edit.
  changes.status = "unknown";
  changes.last_error = null;
  changes.tools_json = [];
  return publicMcpServer(update("mcp_servers", id, changes));
}

export function deleteMcpServer(id) {
  if (!getById("mcp_servers", id)) throw notFound("Không tìm thấy MCP server");
  remove("mcp_servers", id);
  return { ok: true };
}

export function setMcpStatus(id, { status, tools, lastError }) {
  const changes = { status };
  if (tools !== undefined) changes.tools_json = tools;
  if (lastError !== undefined) changes.last_error = lastError;
  return publicMcpServer(update("mcp_servers", id, changes));
}

// --------------------------------------------------------------- app config

export function readAppSettings() {
  return getAppSettings();
}

export function patchAppSettings(patch) {
  return setAppSettings(patch);
}

/** App settings safe to send to the browser: secrets become previews only. */
export function publicAppSettings(settings = getAppSettings()) {
  const { resendApiKeyEnc, sepayApiTokenEnc, sepayWebhookSecretEnc, ...rest } = settings;
  const key = resendApiKeyEnc ? decryptSecret(resendApiKeyEnc) : null;
  const sepayToken = sepayApiTokenEnc ? decryptSecret(sepayApiTokenEnc) : null;
  const sepaySecret = sepayWebhookSecretEnc ? decryptSecret(sepayWebhookSecretEnc) : null;
  return {
    ...rest,
    hasResendKey: Boolean(key),
    resendKeyPreview: key ? maskSecret(key, { head: 4, tail: 3 }) : null,
    hasSepayApiToken: Boolean(sepayToken),
    sepayApiTokenPreview: sepayToken ? maskSecret(sepayToken, { head: 6, tail: 3 }) : null,
    hasSepayWebhookSecret: Boolean(sepaySecret),
    sepayWebhookSecretPreview: sepaySecret ? maskSecret(sepaySecret, { head: 6, tail: 3 }) : null,
  };
}

/** Accepts `resendApiKey` (plain) from the UI and stores it encrypted. */
export function applyAppSettingsPatch(patch = {}) {
  const clean = { ...patch };
  if (clean.resendApiKey !== undefined) {
    const raw = String(clean.resendApiKey ?? "");
    if (raw === "") clean.resendApiKeyEnc = null;
    else if (!looksMasked(raw)) clean.resendApiKeyEnc = encryptSecret(raw.trim());
    delete clean.resendApiKey;
  }
  // SePay credentials follow the same rule: plain in, encrypted at rest, never
  // returned verbatim (the UI only ever sees a masked preview).
  for (const [field, column] of [
    ["sepayApiToken", "sepayApiTokenEnc"],
    ["sepayWebhookSecret", "sepayWebhookSecretEnc"],
  ]) {
    if (clean[field] === undefined) continue;
    const raw = String(clean[field] ?? "");
    if (raw === "") clean[column] = null;
    else if (!looksMasked(raw)) clean[column] = encryptSecret(raw.trim());
    delete clean[field];
  }
  return setAppSettings(clean);
}

// ---------------------------------------------------------------- voice

/**
 * Which provider (if any) handles each half of the voice pipeline.
 * `mode: "browser"` means the client uses Web Speech / SpeechSynthesis — free,
 * no key, nothing to install; `mode: "server"` means we call the provider.
 */
export function resolveVoiceConfig() {
  const settings = getAppSettings();
  const rows = listProviderRows().filter((row) => Number(row.enabled) === 1);

  const pick = (providerId, model, kindFilter, half) => {
    const row = providerId ? rows.find((r) => r.id === providerId) : null;
    if (!row || !kindFilter(row.kind)) {
      return { mode: "browser", providerId: null, providerName: null, model: null };
    }
    return {
      mode: "server",
      providerId: row.id,
      providerName: row.name,
      model: model || defaultVoiceModel(row.kind, half),
    };
  };

  return {
    language: settings.voiceLanguage || "vi-VN",
    autoRead: Boolean(settings.voiceAutoRead),
    speakRate: Number(settings.voiceSpeakRate) || 1,
    stt: pick(settings.voiceSttProviderId, settings.voiceSttModel, (kind) => STT_KINDS.has(kind), "stt"),
    tts: {
      ...pick(settings.voiceTtsProviderId, settings.voiceTtsModel, (kind) => TTS_KINDS.has(kind), "tts"),
      // Fall back to the kind's default voice so the UI always has something valid.
      voice:
        settings.voiceTtsVoice ||
        defaultVoiceName(
          (settings.voiceTtsProviderId && rows.find((r) => r.id === settings.voiceTtsProviderId)?.kind) || "",
        ),
    },
    /** Providers that can be selected for each half (for the settings UI). */
    options: rows
      .filter((row) => STT_KINDS.has(row.kind) || TTS_KINDS.has(row.kind))
      .map((row) => ({
        id: row.id,
        name: row.name,
        kind: row.kind,
        models: row.models ?? [],
        supportsStt: STT_KINDS.has(row.kind),
        supportsTts: TTS_KINDS.has(row.kind),
        defaultSttModel: defaultVoiceModel(row.kind, "stt"),
        defaultTtsModel: defaultVoiceModel(row.kind, "tts"),
        defaultTtsVoice: defaultVoiceName(row.kind),
      })),
  };
}

const STT_KINDS = new Set(["gemini", "openai", "openai-compatible", "mock"]);
const TTS_KINDS = new Set(["gemini", "openai", "openai-compatible", "mock"]);

export function defaultVoiceModel(kind, half) {
  if (kind === "gemini") return half === "stt" ? "gemini-2.5-flash" : "gemini-2.5-flash-preview-tts";
  if (kind === "openai") return half === "stt" ? "whisper-1" : "tts-1";
  // Groq and friends: OpenAI-compatible surface, but only STT is common.
  if (kind === "openai-compatible") return half === "stt" ? "whisper-large-v3-turbo" : "tts-1";
  return null;
}

export function defaultVoiceName(kind) {
  if (kind === "gemini") return "Kore";
  if (kind === "openai" || kind === "openai-compatible") return "alloy";
  return null;
}
