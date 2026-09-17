import { decryptSecret } from "../crypto.js";
import { config } from "../config.js";
import { ApiError } from "../util.js";
import * as openai from "./openai.js";
import * as anthropic from "./anthropic.js";
import * as gemini from "./gemini.js";
import * as mock from "./mock.js";

const ADAPTERS = { openai, "openai-compatible": openai, openrouter: openai, anthropic, gemini, mock };

/** Kinds offered in Settings → Nhà cung cấp AI. */
export const PROVIDER_KINDS = [
  {
    id: "gemini",
    label: "Google Gemini",
    defaultBaseUrl: "https://generativelanguage.googleapis.com",
    suggestedModels: [
      "gemini-2.5-flash",
      "gemini-2.5-pro",
      "gemini-2.5-flash-lite",
      "gemini-2.0-flash",
    ],
    defaultImageModel: "gemini-2.5-flash-image",
    supportsImages: true,
    supportsTools: true,
    supportsVision: true,
    keyHint: "Lấy key tại aistudio.google.com/apikey",
  },
  {
    id: "openai",
    label: "OpenAI",
    defaultBaseUrl: "https://api.openai.com/v1",
    suggestedModels: ["gpt-4o-mini", "gpt-4o", "gpt-4.1", "gpt-4.1-mini", "o4-mini"],
    defaultImageModel: "gpt-image-1",
    supportsImages: true,
    supportsTools: true,
    supportsVision: true,
    keyHint: "Lấy key tại platform.openai.com/api-keys",
  },
  {
    id: "anthropic",
    label: "Anthropic Claude",
    defaultBaseUrl: "https://api.anthropic.com",
    suggestedModels: [
      "claude-sonnet-4-5",
      "claude-haiku-4-5",
      "claude-3-7-sonnet-latest",
      "claude-3-5-haiku-latest",
    ],
    defaultImageModel: null,
    supportsImages: false,
    supportsTools: true,
    supportsVision: true,
    keyHint: "Lấy key tại console.anthropic.com",
  },
  {
    id: "openrouter",
    label: "OpenRouter (một key — nhiều model, có model miễn phí)",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    suggestedModels: [
      "deepseek/deepseek-chat",
      "google/gemini-2.5-flash",
      "openai/gpt-4o-mini",
      "anthropic/claude-3.5-sonnet",
      "meta-llama/llama-3.3-70b-instruct",
    ],
    defaultImageModel: null,
    supportsImages: false,
    supportsTools: true,
    supportsVision: true,
    keyHint:
      "Lấy key tại openrouter.ai/keys. Sau khi dán key, bấm “Kiểm tra” để nạp danh sách model thật " +
      "(model có hậu tố :free là miễn phí, có giới hạn lượt/phút).",
  },
  {
    id: "openai-compatible",
    label: "OpenAI-compatible khác (DeepSeek, Groq, Ollama, vLLM…)",
    defaultBaseUrl: "https://api.deepseek.com/v1",
    suggestedModels: ["deepseek-chat", "deepseek-reasoner"],
    defaultImageModel: null,
    supportsImages: false,
    supportsTools: true,
    supportsVision: false,
    keyHint: "Base URL phải kết thúc bằng /v1 với các gateway kiểu OpenAI.",
  },
  {
    id: "mock",
    label: "Demo (không cần key)",
    defaultBaseUrl: null,
    suggestedModels: ["flowgpt-demo"],
    defaultImageModel: null,
    supportsImages: true,
    supportsTools: true,
    supportsVision: true,
    keyHint: "Chế độ demo để thử luồng chat và công cụ.",
  },
];

export function providerKind(kind) {
  return PROVIDER_KINDS.find((k) => k.id === kind) ?? null;
}

export function adapterFor(kind) {
  const adapter = ADAPTERS[kind];
  if (!adapter) throw new ApiError(400, "bad_request", `Provider kind không hỗ trợ: ${kind}`);
  return adapter;
}

/** DB row → runtime provider (decrypts the API key, fills default base URL). */
export function toRuntimeProvider(row) {
  if (!row) return null;
  const meta = providerKind(row.kind);
  const apiKey = decryptSecret(row.api_key_enc) ?? "";
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    baseUrl: row.base_url ?? meta?.defaultBaseUrl ?? null,
    apiKey,
    /** OpenRouter wants a referer/title for attribution; also useful for logs. */
    referer: config.publicUrl,
    hasKey: Boolean(apiKey) || row.kind === "mock",
    models: row.models ?? [],
    defaultModel: row.default_model ?? row.models?.[0] ?? null,
    imageModel: row.image_model ?? meta?.defaultImageModel ?? null,
    enabled: Boolean(row.enabled),
    supportsImages: Boolean(meta?.supportsImages),
    supportsTools: Boolean(meta?.supportsTools),
    supportsVision: Boolean(meta?.supportsVision),
  };
}

export async function* streamChat({ provider, model, ...rest }) {
  const adapter = adapterFor(provider.kind);
  yield* adapter.streamChat({ provider, model, ...rest });
}

export function testProvider({ provider, model, signal }) {
  return adapterFor(provider.kind).testConnection({ provider, model, signal });
}

export function providerModels({ provider, signal }) {
  return adapterFor(provider.kind).listModels({ provider, signal });
}

export const PROVIDER_KIND_IDS = PROVIDER_KINDS.map((k) => k.id);
