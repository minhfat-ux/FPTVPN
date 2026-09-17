import { all, getById, insert, remove, update, getAppSettings, setAppSettings } from "./db.js";
import { decryptSecret, encryptSecret, maskSecret } from "./crypto.js";
import { ApiError, badRequest, notFound, slugify } from "./util.js";
import { PROVIDER_KINDS, providerKind, toRuntimeProvider } from "./providers/index.js";

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
  const chosenModel =
    model ||
    (isDefaultProvider ? settings.defaultModel : null) ||
    runtime.defaultModel ||
    runtime.models?.[0] ||
    null;
  if (!chosenModel) {
    throw new ApiError(400, "bad_request", `Nhà cung cấp "${row.name}" chưa có model nào. Thêm model trong Cài đặt.`);
  }
  return { provider: runtime, model: chosenModel, row, fallbackFrom };
}

export function listModelsForUi() {
  const settings = getAppSettings();
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
  const { resendApiKeyEnc, ...rest } = settings;
  const key = resendApiKeyEnc ? decryptSecret(resendApiKeyEnc) : null;
  return {
    ...rest,
    hasResendKey: Boolean(key),
    resendKeyPreview: key ? maskSecret(key, { head: 4, tail: 3 }) : null,
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
