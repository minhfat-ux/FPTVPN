import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { ApiError } from "./util.js";
import { getMcpRuntimeConfig, setMcpStatus } from "./settings.js";
import { all } from "./db.js";

/**
 * MCP client manager (backend-side, as requested): admin declares servers in
 * Settings, the server keeps one live client per enabled server and exposes the
 * merged tool list to the model under `mcp__<serverSlug>__<toolName>`.
 */

const clients = new Map(); // serverId -> { client, transport, tools, config }

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function buildTransport(config) {
  switch (config.transport) {
    case "stdio":
      return new StdioClientTransport({
        command: config.command,
        args: config.args ?? [],
        env: { ...process.env, ...(config.env ?? {}) },
        stderr: "pipe",
      });
    case "http":
      return new StreamableHTTPClientTransport(new URL(config.url), {
        requestInit: { headers: config.headers ?? {} },
      });
    case "sse":
      return new SSEClientTransport(new URL(config.url), {
        requestInit: { headers: config.headers ?? {} },
      });
    default:
      throw new ApiError(400, "bad_request", `transport không hỗ trợ: ${config.transport}`);
  }
}

export function qualifiedToolName(slug, toolName) {
  return `mcp__${slug}__${toolName}`;
}

async function openClient(config) {
  const client = new Client(
    { name: "flowgpt", version: "0.1.0" },
    { capabilities: {} },
  );
  const transport = buildTransport(config);
  await withTimeout(
    client.connect(transport),
    config.timeoutMs || 30000,
    `Hết thời gian kết nối MCP server "${config.name}" (${config.timeoutMs || 30000}ms)`,
  );
  const listed = await withTimeout(
    client.listTools(),
    config.timeoutMs || 30000,
    `Hết thời gian liệt kê tool của "${config.name}"`,
  );
  const tools = (listed?.tools ?? []).map((tool) => ({
    name: tool.name,
    description: tool.description ?? "",
    inputSchema: tool.inputSchema ?? { type: "object", properties: {} },
  }));
  return { client, transport, tools, config };
}

/** Connects (or reuses) one enabled server; records status back into the DB. */
export async function connectServer(serverId, { force = false } = {}) {
  const existing = clients.get(serverId);
  if (existing && !force) return existing;

  const row = all("mcp_servers", "id = ?", [serverId])[0];
  if (!row) throw new ApiError(404, "not_found", "Không tìm thấy MCP server");
  const config = getMcpRuntimeConfig(row);
  if (!config.enabled) return null;

  if (existing) await closeServer(serverId).catch(() => {});

  try {
    const entry = await openClient(config);
    clients.set(serverId, entry);
    setMcpStatus(serverId, { status: "connected", tools: entry.tools, lastError: null });
    return entry;
  } catch (err) {
    setMcpStatus(serverId, {
      status: "error",
      tools: [],
      lastError: String(err?.message ?? err).slice(0, 500),
    });
    throw new ApiError(502, "mcp_error", `Không kết nối được MCP "${config.name}": ${err?.message ?? err}`);
  }
}

export async function closeServer(serverId) {
  const entry = clients.get(serverId);
  if (!entry) return;
  clients.delete(serverId);
  try {
    await entry.client.close();
  } catch {
    // Closing is best-effort — a dead child process must not break the request.
  }
}

export async function connectAll() {
  const rows = all("mcp_servers", "enabled = 1");
  const results = [];
  for (const row of rows) {
    try {
      const entry = await connectServer(row.id);
      results.push({ id: row.id, ok: Boolean(entry), toolCount: entry?.tools.length ?? 0 });
    } catch (err) {
      results.push({ id: row.id, ok: false, error: String(err?.message ?? err) });
    }
  }
  return results;
}

/** All tools from enabled servers, already namespaced for the model. */
export async function listAllTools() {
  const rows = all("mcp_servers", "enabled = 1");
  const items = [];
  for (const row of rows) {
    let entry = clients.get(row.id);
    if (!entry) {
      try {
        entry = await connectServer(row.id);
      } catch {
        continue; // a broken server must not hide the healthy ones
      }
    }
    if (!entry) continue;
    for (const tool of entry.tools) {
      items.push({
        serverId: row.id,
        serverName: row.name,
        serverSlug: entry.config.slug,
        name: tool.name,
        qualifiedName: qualifiedToolName(entry.config.slug, tool.name),
        description: tool.description ?? "",
        inputSchema: tool.inputSchema ?? { type: "object", properties: {} },
      });
    }
  }
  return items;
}

/** Resolve a namespaced tool name back to its server + raw tool name. */
export async function resolveTool(qualifiedName) {
  const tools = await listAllTools();
  return tools.find((tool) => tool.qualifiedName === qualifiedName) ?? null;
}

export async function callTool({ serverId, toolName, args, signal }) {
  const entry = clients.get(serverId) ?? (await connectServer(serverId));
  if (!entry) throw new ApiError(400, "mcp_error", "MCP server đang tắt");
  const started = Date.now();
  try {
    const result = await withTimeout(
      entry.client.callTool({ name: toolName, arguments: args ?? {} }, undefined, {
        signal,
        timeout: entry.config.timeoutMs || 30000,
      }),
      (entry.config.timeoutMs || 30000) + 2000,
      `Hết thời gian gọi tool ${toolName}`,
    );
    return { result, durationMs: Date.now() - started };
  } catch (err) {
    throw new ApiError(502, "mcp_error", `Tool ${toolName} lỗi: ${err?.message ?? err}`);
  }
}

/** Settings "test" button: connect with the given (unsaved) config. */
export async function testServerConfig(config) {
  const started = Date.now();
  const entry = await openClient({ ...config, timeoutMs: config.timeoutMs ?? 20000 });
  const tools = entry.tools;
  await entry.client.close().catch(() => {});
  return { tools, latencyMs: Date.now() - started };
}

export async function refreshServer(serverId) {
  await connectServer(serverId, { force: true });
  return clients.get(serverId)?.tools ?? [];
}

export function connectedServerIds() {
  return [...clients.keys()];
}

export async function closeAll() {
  await Promise.all([...clients.keys()].map((id) => closeServer(id)));
}

/**
 * Flattens an MCP tool result into something the model can read.
 * MCP returns { content: [{ type: 'text'|'image'|..., text?, data?, mimeType? }] }.
 */
export function flattenToolResult(result, { maxChars = 12000 } = {}) {
  const blocks = result?.content ?? [];
  const texts = [];
  const images = [];
  for (const block of blocks) {
    if (block.type === "text" && block.text) texts.push(block.text);
    else if (block.type === "image" && block.data) {
      images.push({ mime: block.mimeType ?? "image/png", dataBase64: block.data });
    } else if (block.type === "resource" && block.resource?.text) texts.push(block.resource.text);
    else texts.push(JSON.stringify(block));
  }
  const joined = texts.join("\n").trim();
  return {
    text: joined.length > maxChars ? `${joined.slice(0, maxChars)}\n…(đã cắt bớt)` : joined,
    images: images.slice(0, 3),
    isError: Boolean(result?.isError),
  };
}
