/**
 * Minimal Server-Sent Events reader over a fetch Response body.
 * Works for OpenAI, Anthropic, Gemini (`alt=sse`) and MCP HTTP streams.
 */
export async function* parseSse(response) {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const flushBlock = function* (block) {
    if (!block.trim()) return;
    let event = "message";
    const dataLines = [];
    for (const line of block.split(/\r?\n/)) {
      if (!line || line.startsWith(":")) continue;
      const colon = line.indexOf(":");
      const field = colon === -1 ? line : line.slice(0, colon);
      const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
      if (field === "event") event = value;
      else if (field === "data") dataLines.push(value);
    }
    if (!dataLines.length) return;
    yield { event, data: dataLines.join("\n") };
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let index = buffer.search(/\r?\n\r?\n/);
    while (index !== -1) {
      const block = buffer.slice(0, index);
      buffer = buffer.slice(index + buffer.slice(index).match(/^\r?\n\r?\n/)[0].length);
      yield* flushBlock(block);
      index = buffer.search(/\r?\n\r?\n/);
    }
  }
  yield* flushBlock(buffer);
}

/** Reads a non-streaming JSON response, raising a provider error when not 2xx. */
export async function readJson(response, { providerName = "provider" } = {}) {
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!response.ok) {
    const detail =
      json?.error?.message ?? json?.message ?? json?.error ?? text?.slice(0, 400) ?? "";
    const error = new Error(`${providerName} trả lỗi ${response.status}: ${detail}`);
    error.status = response.status;
    error.code = "provider_error";
    throw error;
  }
  return json;
}
