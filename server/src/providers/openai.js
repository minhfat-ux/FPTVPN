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

export function buildRequest({ provider, model, messages, tools, toolMode, temperature, acceptsImages, toolChoice }) {
  const body = {
    model,
    messages: toOpenAiMessages(messages, {
      acceptsImages: acceptsImages ?? modelAcceptsImages(provider, model),
    }),
    stream: true,
    temperature: temperature ?? 0.7,
  };
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
    if (!headers["X-Title"]) headers["X-Title"] = "FlowGpt";
  }
  return headers;
}

/** Provider capabilities differ: only some gateways accept stream_options. */
const SUPPORTS_STREAM_USAGE = new Set(["openai", "deepseek", "groq", "openrouter"]);

export async function* streamChat({ provider, model, messages, tools, toolMode, temperature, signal, includeUsage, toolChoice }) {
  const url = `${trimSlash(provider.baseUrl || "https://api.openai.com/v1")}/chat/completions`;
  const body = buildRequest({ provider, model, messages, tools, toolMode, temperature, toolChoice });
  const wantsUsage = includeUsage ?? SUPPORTS_STREAM_USAGE.has(provider.kind);
  if (wantsUsage) body.stream_options = { include_usage: true };

  const send = async (payload) =>
    fetch(url, {
      method: "POST",
      signal,
      headers: providerHeaders(provider, {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.apiKey}`,
      }),
      body: JSON.stringify(payload),
    });

  let response = await send(body);
  // Gateways that reject unknown fields answer 400 — retry once without usage.
  if (!response.ok && wantsUsage && response.status === 400) {
    const probe = await response.clone().text();
    if (/stream_options/i.test(probe)) {
      delete body.stream_options;
      response = await send(body);
    }
  }
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
  const response = await fetch(url, {
    method: "POST",
    signal,
    headers: providerHeaders(provider, {
      "Content-Type": "application/json",
      Authorization: `Bearer ${provider.apiKey}`,
    }),
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 8,
      stream: false,
    }),
  });
  await readJson(response, { providerName: provider.name });
  return { latencyMs: Date.now() - started };
}
