import { parseSse, readJson } from "./sse.js";

/**
 * OpenAI-compatible adapter — covers api.openai.com, DeepSeek, Groq, OpenRouter,
 * Together, vLLM/Ollama `/v1`, and any other "chat/completions" gateway.
 *
 * Normalised message shape used across adapters:
 *   { role: 'system'|'user'|'assistant'|'tool', content: string,
 *     images?: [{ mime, dataBase64 }], toolCalls?: [{ id, name, args }],
 *     toolCallId?, name? }
 */

function toOpenAiMessages(messages) {
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
        content: msg.content || null,
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
      for (const image of msg.images) {
        parts.push({
          type: "image_url",
          image_url: { url: `data:${image.mime};base64,${image.dataBase64}` },
        });
      }
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
 * Gửi kèm `temperature` cho nhóm này là mất cả lượt chat, nên chặn TRƯỚC khi gọi;
 * gateway khác vẫn nhận đúng giá trị caller truyền vào.
 */
const TEMPERATURE_DEFAULT_ONLY = /^(?:o[1-9]|gpt-[5-9]|gpt-1\d)/i;

export function supportsTemperature(model) {
  return !TEMPERATURE_DEFAULT_ONLY.test(String(model ?? "").trim());
}

/**
 * Hai cách viết cùng một tham số: model mới chỉ nhận `max_completion_tokens`,
 * gateway cũ (vLLM/Ollama/DeepSeek…) chỉ nhận `max_tokens`. Gặp 400 thì ĐỔI TÊN
 * chứ không bỏ, để giữ nguyên ý định giới hạn độ dài câu trả lời.
 */
const TOKEN_LIMIT_ALIASES = { max_tokens: "max_completion_tokens", max_completion_tokens: "max_tokens" };

/** Chỉ những field này mới được phép bỏ/đổi tên khi model từ chối. */
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
 * Đọc tên field mà gateway phủ nhận trong body lỗi 400. Trả `null` khi không nhận ra
 * hoặc field đó không nằm trong request (lúc đó retry là vô nghĩa).
 */
export function rejectedField(body, errorText) {
  const match = /(?:unsupported|unknown|invalid|unrecognized)\s+(?:parameter|value|field|argument)s?[^A-Za-z0-9_]{0,4}['"`]?([a-z_]{3,32})/i
    .exec(String(errorText ?? ""));
  if (!match) return null;
  const field = match[1].toLowerCase();
  if (!(field in body) || !DROPPABLE_FIELDS.has(field)) return null;
  return field;
}

/** Số vòng bỏ field tối đa cho MỘT lượt gọi — model hỏng không được loop vô hạn. */
const MAX_PARAM_RETRIES = 3;

export function buildRequest({ provider, model, messages, tools, toolMode, temperature }) {
  const body = {
    model,
    messages: toOpenAiMessages(messages),
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
    body.tool_choice = toolMode === "required" ? "required" : "auto";
  }
  return body;
}

/** OpenRouter asks for attribution headers; harmless for other gateways. */
function providerHeaders(provider, extra = {}) {
  const headers = { ...(provider.headers ?? {}), ...extra };
  if (provider.kind === "openrouter") {
    if (!headers["HTTP-Referer"] && provider.referer) headers["HTTP-Referer"] = provider.referer;
    if (!headers["X-Title"]) headers["X-Title"] = "FlowGpt";
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
 * Gọi `chat/completions` và TỰ CHỮA khi model từ chối một field: đọc body 400, bỏ
 * (hoặc đổi tên) đúng field đó rồi gọi lại. Nhờ vậy adapter không phải đoán capability
 * của từng model/gateway, và một field lạ không làm chết cả lượt chat.
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

export async function* streamChat({ provider, model, messages, tools, toolMode, temperature, signal, includeUsage }) {
  const url = `${trimSlash(provider.baseUrl || "https://api.openai.com/v1")}/chat/completions`;
  const body = buildRequest({ provider, model, messages, tools, toolMode, temperature });
  if (includeUsage ?? SUPPORTS_STREAM_USAGE.has(provider.kind)) body.stream_options = { include_usage: true };

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
  // `max_completion_tokens` là tên mới (model OpenAI hiện tại trả 400 nếu gửi
  // `max_tokens`); gateway cũ chỉ hiểu `max_tokens` thì `postChatTolerant` tự đổi tên.
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
