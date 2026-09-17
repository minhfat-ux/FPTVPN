import { parseSse, readJson } from "./sse.js";

/** Anthropic Messages API adapter (Claude). */
const DEFAULT_BASE = "https://api.anthropic.com";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_TOKENS = 8192;

function headers(provider) {
  return {
    "Content-Type": "application/json",
    "x-api-key": provider.apiKey,
    "anthropic-version": ANTHROPIC_VERSION,
    ...(provider.headers ?? {}),
  };
}

/** Claude requires tool results inside a `user` turn; merge runs of them. */
export function toAnthropicMessages(messages) {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .filter(Boolean)
    .join("\n\n");
  const out = [];

  const pushToolResult = (block) => {
    const last = out[out.length - 1];
    if (last?.role === "user" && Array.isArray(last.content) && last.content.every((p) => p.type === "tool_result")) {
      last.content.push(block);
    } else {
      out.push({ role: "user", content: [block] });
    }
  };

  for (const msg of messages) {
    if (msg.role === "system") continue;
    if (msg.role === "tool") {
      pushToolResult({
        type: "tool_result",
        tool_use_id: msg.toolCallId,
        content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content ?? ""),
        ...(msg.isError ? { is_error: true } : {}),
      });
      continue;
    }
    if (msg.role === "assistant") {
      const content = [];
      if (msg.content) content.push({ type: "text", text: msg.content });
      for (const call of msg.toolCalls ?? []) {
        content.push({ type: "tool_use", id: call.id, name: call.name, input: call.args ?? {} });
      }
      if (content.length) out.push({ role: "assistant", content });
      continue;
    }
    // user
    if (msg.images?.length) {
      const content = [];
      for (const image of msg.images) {
        content.push({
          type: "image",
          source: { type: "base64", media_type: image.mime, data: image.dataBase64 },
        });
      }
      if (msg.content) content.push({ type: "text", text: msg.content });
      out.push({ role: "user", content });
      continue;
    }
    out.push({ role: "user", content: msg.content ?? "" });
  }
  return { system, messages: out };
}

export async function* streamChat({ provider, model, messages, tools, toolMode, temperature, signal }) {
  const { system, messages: converted } = toAnthropicMessages(messages);
  const body = {
    model,
    max_tokens: MAX_TOKENS,
    stream: true,
    temperature: temperature ?? 0.7,
    messages: converted,
  };
  if (system) body.system = system;
  if (tools?.length && toolMode !== "off") {
    body.tools = tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema ?? { type: "object", properties: {} },
    }));
    if (toolMode === "required") body.tool_choice = { type: "any" };
  }

  const response = await fetch(`${String(provider.baseUrl || DEFAULT_BASE).replace(/\/+$/, "")}/v1/messages`, {
    method: "POST",
    signal,
    headers: headers(provider),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    await readJson(response, { providerName: provider.name });
    return;
  }

  let currentTool = null;
  let argsText = "";
  let usage = null;

  for await (const chunk of parseSse(response)) {
    let payload;
    try {
      payload = JSON.parse(chunk.data);
    } catch {
      continue;
    }
    switch (payload.type) {
      case "message_start":
        usage = {
          in: payload.message?.usage?.input_tokens ?? 0,
          out: payload.message?.usage?.output_tokens ?? 0,
        };
        break;
      case "content_block_start":
        if (payload.content_block?.type === "tool_use") {
          currentTool = { id: payload.content_block.id, name: payload.content_block.name };
          argsText = "";
        }
        break;
      case "content_block_delta":
        if (payload.delta?.type === "text_delta") yield { type: "delta", text: payload.delta.text };
        else if (payload.delta?.type === "thinking_delta") yield { type: "reasoning", text: payload.delta.thinking };
        else if (payload.delta?.type === "input_json_delta") argsText += payload.delta.partial_json ?? "";
        break;
      case "content_block_stop":
        if (currentTool) {
          yield { type: "tool_call", id: currentTool.id, name: currentTool.name, args: safeParse(argsText) };
          currentTool = null;
          argsText = "";
        }
        break;
      case "message_delta":
        if (payload.usage) {
          usage = { in: usage?.in ?? 0, out: payload.usage.output_tokens ?? usage?.out ?? 0 };
        }
        if (payload.delta?.stop_reason) {
          if (usage) yield { type: "usage", ...usage };
          yield { type: "done", finishReason: payload.delta.stop_reason };
        }
        break;
      default:
        break;
    }
  }
  if (usage) yield { type: "usage_final", ...usage };
}

function safeParse(text) {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { _raw: text };
  }
}

export async function listModels({ provider, signal }) {
  const response = await fetch(`${String(provider.baseUrl || DEFAULT_BASE).replace(/\/+$/, "")}/v1/models`, {
    signal,
    headers: headers(provider),
  });
  const json = await readJson(response, { providerName: provider.name });
  return (json?.data ?? []).map((m) => m.id).filter(Boolean).sort();
}

export async function testConnection({ provider, model, signal }) {
  const started = Date.now();
  const response = await fetch(`${String(provider.baseUrl || DEFAULT_BASE).replace(/\/+$/, "")}/v1/messages`, {
    method: "POST",
    signal,
    headers: headers(provider),
    body: JSON.stringify({
      model,
      max_tokens: 8,
      messages: [{ role: "user", content: "ping" }],
    }),
  });
  await readJson(response, { providerName: provider.name });
  return { latencyMs: Date.now() - started };
}
