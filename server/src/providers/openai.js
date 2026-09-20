import { parseSse, readJson } from "./sse.js";
import { modelAcceptsImages } from "./vision.js";

/**
 * OpenAI-compatible adapter — covers api.openai.com, DeepSeek, Groq, OpenRouter,
 * Together, vLLM/Ollama `/v1`, and any other "chat/completions" gateway.
 *
 * Normalised message shape used across adapters:
 *   { role: 'system'|'user'|'assistant'|'tool', content: string,
 *     images?: [{ mime, dataBase64 }], toolCalls?: [{ id, name, args }],
 *     toolCallId?, name? }
 */

function toOpenAiMessages(messages, { acceptsImages = true } = {}) {
  return messages.map((msg) => {
    if (msg.role === "tool") {
      return {
        role: "tool",
        tool_call_id: msg.toolCallId,
        content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content ?? ""),
      };
    }
    if (msg.role === "assistant" && msg.toolCalls?.length) {
      return {
        role: "assistant",
        // Empty string, not null: some gateways validate the type strictly.
        content: msg.content || "",
        tool_calls: msg.toolCalls.map((call) => ({
          id: call.id,
          type: "function",
          function: { name: call.name, arguments: JSON.stringify(call.args ?? {}) },
        })),
      };
    }
    if (msg.images?.length) {
      const parts = [];
      if (msg.content) parts.push({ type: "text", text: msg.content });
      if (acceptsImages) {
        for (const image of msg.images) {
          parts.push({
            type: "image_url",
            image_url: { url: `data:${image.mime};base64,${image.dataBase64}` },
          });
        }
        return { role: msg.role, content: parts };
      }
      // The model cannot read images and the gateway would answer 400 for an
      // `image_url` part. Drop it, tell the model what happened (so it never
      // invents the picture) and let the agent notify the user.
      const note = `[${msg.images.length} ảnh đính kèm không gửi được vì model hiện tại không xem được ảnh]`;
      parts.push({ type: "text", text: note });
      return { role: msg.role, content: parts };
    }
    return { role: msg.role, content: msg.content ?? "" };
  });
}

/**
 * Model families that answer 400 for any `temperature` but the provider default:
 * "Unsupported value: 'temperature' does not support 0.7 with this model.
 *  Only the default (1) value is supported." (OpenAI o-series, gpt-5+).
 *
 * Gui kem `temperature` cho nhom nay la mat ca luot chat, nen chan TRUOC khi goi;
 * gateway khac van nhan dung gia tri caller truyen vao.
 */
const TEMPERATURE_DEFAULT_ONLY = /^(?:o[1-9]|gpt-[5-9]|gpt-1\d)/i;

export function supportsTemperature(model) {
  return !TEMPERATURE_DEFAULT_ONLY.test(String(model ?? "").trim());
}

/**
 * Hai cach viet cung mot tham so: model moi chi nhan `max_completion_tokens`,
 * gateway cu (vLLM/Ollama/DeepSeek…) chi nhan `max_tokens`. Gap 400 thi DOI TEN
 * chu khong bo, de giu nguyen y dinh gioi han do dai cau tra loi.
 */
const TOKEN_LIMIT_ALIASES = { max_tokens: "max_completion_tokens", max_completion_tokens: "max_tokens" };

/** Chi nhung field nay moi duoc phep bo/doi ten khi model tu choi. */
const DROPPABLE_FIELDS = new Set([
  "stream_options",
  "temperature",
  "top_p",
  "max_tokens",
  "max_completion_tokens",
  "tools",
  "tool_choice",
  "reasoning_effort",
]);

/**
 * Doc ten field ma gateway phu nhan trong body loi 400. Tra `null` khi khong nhan ra
 * hoac field do khong nam trong request (luc do retry la vo nghia).
 */
export function rejectedField(body, errorText) {
  const match = /(?:unsupported|unknown|invalid|unrecognized)\s+(?:parameter|value|field|argument)s?[^A-Za-z0-9_]{0,4}['"`]?([a-z_]{3,32})/i
    .exec(String(errorText ?? ""));
  if (!match) return null;
  const field = match[1].toLowerCase();
  if (!(field in body) || !DROPPABLE_FIELDS.has(field)) return null;
  return field;
}

/** So vong bo field toi da cho MOT luot goi — model hong khong duoc loop vo han. */
const MAX_PARAM_RETRIES = 3;

export function buildRequest({ provider, model, messages, tools, toolMode, temperature, acceptsImages, toolChoice }) {
  const body = {
    model,
    messages: toOpenAiMessages(messages, {
      acceptsImages: acceptsImages ?? modelAcceptsImages(provider, model),
    }),
    stream: true,
  };
  if (supportsTemperature(model)) body.temperature = temperature ?? 0.7;
  if (tools?.length && toolMode !== "off") {
    body.tools = tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema ?? { type: "object", properties: {} },
      },
    }));
    // `toolChoice` may name one function ({type:"function",function:{name}}) —
    // GLM, OpenAI and OpenRouter all accept that, and it is what makes "làm Excel"
    // deterministic on a small model that would otherwise answer in prose.
    body.tool_choice = toolChoice ?? (toolMode === "required" ? "required" : "auto");
  }
  return body;
}

/** OpenRouter asks for attribution headers; harmless for other gateways. */
function providerHeaders(provider, extra = {}) {
  const headers = { ...(provider.headers ?? {}), ...extra };
  if (provider.kind === "openrouter") {
    if (!headers["HTTP-Referer"] && provider.referer) headers["HTTP-Referer"] = provider.referer;
    if (!headers["X-Title"]) headers["X-Title"] = "fBuddy";
  }
  return headers;
}

/** Provider capabilities differ: only some gateways accept stream_options. */
const SUPPORTS_STREAM_USAGE = new Set(["openai", "deepseek", "groq", "openrouter"]);

function postChat(url, provider, body, signal) {
  return fetch(url, {
    method: "POST",
    signal,
    headers: providerHeaders(provider, {
      "Content-Type": "application/json",
      Authorization: `Bearer ${provider.apiKey}`,
    }),
    body: JSON.stringify(body),
  });
}

/**
 * Goi `chat/completions` va TU CHUA khi model tu choi mot field: doc body 400, bo
 * (hoac doi ten) dung field do roi goi lai. Nho vay adapter khong phai doan capability
 * cua tung model/gateway, va mot field la khong lam chet ca luot chat.
 */
async function postChatTolerant(url, provider, body, signal) {
  let response = await postChat(url, provider, body, signal);
  for (let attempt = 0; attempt < MAX_PARAM_RETRIES; attempt += 1) {
    if (response.ok || response.status !== 400) break;
    const field = rejectedField(body, await response.clone().text());
    if (!field) break;
    const value = body[field];
    delete body[field];
    const alias = TOKEN_LIMIT_ALIASES[field];
    if (alias && !(alias in body)) body[alias] = value;
    response = await postChat(url, provider, body, signal);
  }
  return response;
}


export async function* streamChat({ provider, model, messages, tools, toolMode, temperature, signal, includeUsage, toolChoice }) {
  const url = `${trimSlash(provider.baseUrl || "https://api.openai.com/v1")}/chat/completions`;
  const body = buildRequest({ provider, model, messages, tools, toolMode, temperature, toolChoice });
  const wantsUsage = includeUsage ?? SUPPORTS_STREAM_USAGE.has(provider.kind);
  if (wantsUsage) body.stream_options = { include_usage: true };

  const response = await postChatTolerant(url, provider, body, signal);
  if (!response.ok) {
    await readJson(response, { providerName: provider.name });
    return;
  }
  if (!response.body) throw new Error(`${provider.name} không trả về stream`);

  const toolAccumulator = new Map();
  let usage = null;

  for await (const chunk of parseSse(response)) {
    if (chunk.data === "[DONE]") break;
    let payload;
    try {
      payload = JSON.parse(chunk.data);
    } catch {
      continue;
    }
    if (payload.usage) {
      usage = {
        in: payload.usage.prompt_tokens ?? payload.usage.input_tokens ?? 0,
        out: payload.usage.completion_tokens ?? payload.usage.output_tokens ?? 0,
      };
    }
    const choice = payload.choices?.[0];
    if (!choice) continue;
    const delta = choice.delta ?? {};

    if (delta.content) yield { type: "delta", text: delta.content };
    // DeepSeek/OpenRouter expose chain-of-thought here.
    if (delta.reasoning_content) yield { type: "reasoning", text: delta.reasoning_content };

    for (const call of delta.tool_calls ?? []) {
      const index = call.index ?? 0;
      const current = toolAccumulator.get(index) ?? { id: null, name: "", argsText: "" };
      if (call.id) current.id = call.id;
      if (call.function?.name) current.name = call.function.name;
      if (call.function?.arguments) current.argsText += call.function.arguments;
      toolAccumulator.set(index, current);
    }

    if (choice.finish_reason) {
      for (const [, call] of [...toolAccumulator.entries()].sort((a, b) => a[0] - b[0])) {
        yield {
          type: "tool_call",
          id: call.id ?? `call_${Math.random().toString(36).slice(2, 12)}`,
          name: call.name,
          args: safeParseArgs(call.argsText),
        };
      }
      toolAccumulator.clear();
      if (usage) yield { type: "usage", ...usage };
      yield { type: "done", finishReason: choice.finish_reason };
    }
  }
  if (usage) yield { type: "usage_final", ...usage };
}

function safeParseArgs(text) {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { _raw: text };
  }
}

function trimSlash(value) {
  return String(value ?? "").replace(/\/+$/, "");
}

export async function listModels({ provider, signal }) {
  const url = `${trimSlash(provider.baseUrl || "https://api.openai.com/v1")}/models`;
  const response = await fetch(url, {
    signal,
    headers: providerHeaders(provider, { Authorization: `Bearer ${provider.apiKey}` }),
  });
  const json = await readJson(response, { providerName: provider.name });
  const models = (json?.data ?? json?.models ?? [])
    .map((m) => (typeof m === "string" ? m : m.id ?? m.name))
    .filter(Boolean);
  return models.sort();
}

/** Tiny non-streaming probe used by the Settings "test connection" button. */
export async function testConnection({ provider, model, signal }) {
  const started = Date.now();
  const url = `${trimSlash(provider.baseUrl || "https://api.openai.com/v1")}/chat/completions`;
  // `max_completion_tokens` la ten moi (model OpenAI hien tai tra 400 neu gui
  // `max_tokens`); gateway cu chi hieu `max_tokens` thi `postChatTolerant` tu doi ten.
  const response = await postChatTolerant(
    url,
    provider,
    {
      model,
      messages: [{ role: "user", content: "ping" }],
      max_completion_tokens: 8,
      stream: false,
    },
    signal,
  );
  await readJson(response, { providerName: provider.name });
  return { latencyMs: Date.now() - started };
}
