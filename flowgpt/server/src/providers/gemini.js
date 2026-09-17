import { parseSse, readJson } from "./sse.js";

/** Google Gemini (generativelanguage) adapter, SSE streaming. */
const DEFAULT_BASE = "https://generativelanguage.googleapis.com";

function base(provider) {
  return String(provider.baseUrl || DEFAULT_BASE).replace(/\/+$/, "");
}

function headers(provider) {
  return {
    "Content-Type": "application/json",
    "x-goog-api-key": provider.apiKey,
    ...(provider.headers ?? {}),
  };
}

export function toGeminiContents(messages) {
  const systemText = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .filter(Boolean)
    .join("\n\n");
  const contents = [];

  const push = (role, parts) => {
    const last = contents[contents.length - 1];
    // Gemini rejects two consecutive turns with the same role.
    if (last && last.role === role) last.parts.push(...parts);
    else contents.push({ role, parts });
  };

  for (const msg of messages) {
    if (msg.role === "system") continue;
    if (msg.role === "tool") {
      push("user", [
        {
          functionResponse: {
            name: msg.name ?? "tool",
            response: { result: typeof msg.content === "string" ? safeParse(msg.content) : msg.content },
          },
        },
      ]);
      continue;
    }
    if (msg.role === "assistant") {
      const parts = [];
      if (msg.content) parts.push({ text: msg.content });
      for (const call of msg.toolCalls ?? []) {
        parts.push({ functionCall: { name: call.name, args: call.args ?? {} } });
      }
      if (parts.length) push("model", parts);
      continue;
    }
    const parts = [];
    if (msg.content) parts.push({ text: msg.content });
    for (const image of msg.images ?? []) {
      parts.push({ inlineData: { mimeType: image.mime, data: image.dataBase64 } });
    }
    push("user", parts.length ? parts : [{ text: "" }]);
  }
  return { systemText, contents };
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: String(text).slice(0, 500) };
  }
}

export async function* streamChat({ provider, model, messages, tools, toolMode, temperature, signal }) {
  const { systemText, contents } = toGeminiContents(messages);
  const body = {
    contents,
    generationConfig: { temperature: temperature ?? 0.7 },
  };
  if (systemText) body.systemInstruction = { parts: [{ text: systemText }] };
  if (tools?.length && toolMode !== "off") {
    body.tools = [
      {
        functionDeclarations: tools.map((tool) => ({
          name: sanitizeName(tool.name),
          description: tool.description,
          parameters: sanitizeSchema(tool.inputSchema),
        })),
      },
    ];
    body.toolConfig = { functionCallingConfig: { mode: toolMode === "required" ? "ANY" : "AUTO" } };
  }

  const url = `${base(provider)}/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;
  const response = await fetch(url, {
    method: "POST",
    signal,
    headers: headers(provider),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    await readJson(response, { providerName: provider.name });
    return;
  }

  let usage = null;
  let callIndex = 0;
  for await (const chunk of parseSse(response)) {
    let payload;
    try {
      payload = JSON.parse(chunk.data);
    } catch {
      continue;
    }
    if (payload.usageMetadata) {
      usage = {
        in: payload.usageMetadata.promptTokenCount ?? 0,
        out: payload.usageMetadata.candidatesTokenCount ?? 0,
      };
    }
    const candidate = payload.candidates?.[0];
    if (!candidate) continue;
    for (const part of candidate.content?.parts ?? []) {
      if (part.text) yield { type: "delta", text: part.text };
      else if (part.functionCall) {
        callIndex += 1;
        yield {
          type: "tool_call",
          id: `call_${Date.now().toString(36)}_${callIndex}`,
          name: part.functionCall.name,
          args: part.functionCall.args ?? {},
        };
      }
    }
    if (candidate.finishReason) {
      if (usage) yield { type: "usage", ...usage };
      yield { type: "done", finishReason: candidate.finishReason };
    }
  }
  if (usage) yield { type: "usage_final", ...usage };
}

/** Gemini function names must match [A-Za-z0-9_.-]; our MCP names use `__`. */
function sanitizeName(name) {
  return String(name).replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 64);
}

/** Gemini rejects JSON-Schema keywords it does not know about. */
function sanitizeSchema(schema) {
  if (!schema || typeof schema !== "object") return { type: "object", properties: {} };
  const allowed = ["type", "description", "properties", "required", "items", "enum", "nullable"];
  const walk = (node) => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== "object") return node;
    const out = {};
    for (const [key, value] of Object.entries(node)) {
      if (!allowed.includes(key)) continue;
      if (key === "properties") {
        out.properties = Object.fromEntries(
          Object.entries(value ?? {}).map(([k, v]) => [k, walk(v)]),
        );
      } else if (key === "items") {
        out.items = walk(value);
      } else {
        out[key] = value;
      }
    }
    if (!out.type && out.properties) out.type = "object";
    return out;
  };
  return walk(schema);
}

export async function listModels({ provider, signal }) {
  const response = await fetch(`${base(provider)}/v1beta/models`, {
    signal,
    headers: headers(provider),
  });
  const json = await readJson(response, { providerName: provider.name });
  return (json?.models ?? [])
    .filter((m) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
    .map((m) => String(m.name).replace(/^models\//, ""))
    .sort();
}

export async function testConnection({ provider, model, signal }) {
  const started = Date.now();
  const response = await fetch(
    `${base(provider)}/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      signal,
      headers: headers(provider),
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "ping" }] }] }),
    },
  );
  await readJson(response, { providerName: provider.name });
  return { latencyMs: Date.now() - started };
}
