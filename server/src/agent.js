import { streamChat } from "./providers/index.js";
import { listAllTools, callTool, flattenToolResult, qualifiedToolName } from "./mcp.js";
import { TOOL_DEFINITIONS, toolDefinitionsForSkill, toModelTool, executeTool, isKnownSkill } from "./skills/index.js";
import { listProviderRows, nextUsableProvider, readAppSettings, resolveProviderForChat } from "./settings.js";
import { getOwnedFile, asTextPayload, asImagePayload, publicFile } from "./files.js";
import { all, audit, update } from "./db.js";
import { toRuntimeProvider } from "./providers/index.js";
import { ApiError, newId, truncate } from "./util.js";
import {
  createConversation,
  createMessage,
  getOwnedConversation,
  historyForModel,
  maybeSetTitleFromFirstMessage,
  publicConversation,
  touchConversation,
  updateConversation,
} from "./chat-store.js";

const MAX_TOOL_ITERATIONS_CAP = 12;

/** Skill-specific steering appended to the system prompt. */
const SKILL_INSTRUCTIONS = {
  image: [
    "Người dùng đang ở chế độ Sửa ảnh.",
    "Nếu có ảnh đính kèm và yêu cầu là sửa nội dung ảnh bằng AI, gọi `edit_image` với fileId của ảnh.",
    "Nếu yêu cầu chỉ là cắt/xoay/filter/chèn chữ, gọi `open_image_studio` để chỉ người dùng mở Image Studio (miễn phí).",
    "Sau khi gọi công cụ, mô tả ngắn gọn kết quả và gợi ý bước tiếp theo.",
  ].join(" "),
  ppt: [
    "Người dùng đang ở chế độ Làm PPT.",
    "Luôn gọi `generate_pptx` khi đã đủ ý. Tự soạn nội dung đầy đủ: mỗi slide có tiêu đề và 3–6 gạch đầu dòng súc tích, thêm `notes` khi hữu ích.",
    "Slide đầu tiên là slide tiêu đề. Không hỏi lại nếu có thể tự quyết định hợp lý.",
  ].join(" "),
  excel: [
    "Người dùng đang ở chế độ Làm Excel.",
    "Luôn gọi `generate_xlsx` với dữ liệu thật (không để ô trống kiểu '...'), đặt tên cột rõ ràng và bật `totalsRow` cho cột số khi phù hợp.",
  ].join(" "),
  data: [
    "Người dùng đang ở chế độ Phân tích dữ liệu.",
    "Nếu chưa biết fileId, gọi `list_files` trước. Sau đó gọi `analyze_data` với các thao tác phù hợp.",
    "Diễn giải kết quả bằng tiếng Việt: nêu con số nổi bật, xu hướng và bất thường. Không bịa số liệu ngoài kết quả công cụ.",
  ].join(" "),
  chat: "Người dùng đang ở chế độ Trò chuyện thường. Chỉ gọi công cụ khi thật sự cần thiết.",
};

export function sseChannel(res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  if (typeof res.flushHeaders === "function") res.flushHeaders();
  let closed = false;
  const heartbeat = setInterval(() => {
    if (!closed) res.write(": ping\n\n");
  }, 15000);
  return {
    send(event, data) {
      if (closed) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data ?? {})}\n\n`);
    },
    close() {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      res.end();
    },
    get closed() {
      return closed;
    },
    onClose(fn) {
      res.on("close", () => {
        closed = true;
        clearInterval(heartbeat);
        fn();
      });
    },
  };
}

function resolveImageProvider(preferredId = null) {
  const settings = readAppSettings();
  const rows = listProviderRows().filter((row) => Number(row.enabled) === 1);
  const withImages = rows.filter((row) => toRuntimeProvider(row).supportsImages);
  if (!withImages.length) return null;
  const explicit = preferredId && withImages.find((row) => row.id === preferredId);
  if (explicit) return toRuntimeProvider(explicit);
  const byDefault = settings.defaultProviderId && withImages.find((row) => row.id === settings.defaultProviderId);
  if (byDefault) return toRuntimeProvider(byDefault);
  return toRuntimeProvider(withImages[0]);
}

function buildSystemPrompt({ skill, files, settings }) {
  const today = new Date().toISOString().slice(0, 10);
  const parts = [settings.systemPrompt, `Hôm nay là ${today}.`, SKILL_INSTRUCTIONS[skill] ?? ""];
  if (files.length) {
    parts.push(
      "Tệp người dùng đã tải lên trong hội thoại này (dùng đúng id khi gọi công cụ):\n" +
        files.map((f) => `- ${f.name} — id: ${f.id} (${f.kind})`).join("\n"),
    );
  }
  return parts.filter(Boolean).join("\n\n");
}

/** Normalises the request, persists the user turn and writes the SSE preamble. */
export async function prepareTurn({ user, body, channel }) {
  const settings = readAppSettings();
  // Any skill the catalogue knows (today's built-ins, tomorrow's marketplace
  // additions) is accepted; unknown values fall back to the configured default.
  const skill = isKnownSkill(body?.skill) ? body.skill : settings.defaultSkill ?? "auto";
  const content = String(body?.content ?? "").trim();
  const attachmentIds = Array.isArray(body?.attachments) ? body.attachments.slice(0, 10) : [];
  if (!content && !attachmentIds.length) throw new ApiError(400, "bad_request", "Nội dung trống");

  const { provider, model, fallbackFrom } = resolveProviderForChat({
    providerId: body?.providerId ?? null,
    model: body?.model ?? null,
  });
  // The configured default can be a provider that has no key yet (e.g. OpenRouter
  // before its key is pasted). The turn still runs; the UI explains the swap.
  const notice = fallbackFrom
    ? `Nhà cung cấp mặc định "${fallbackFrom.name}" chưa có API key nên lượt này dùng "${provider.name}". ` +
      "Vào Cài đặt → Nhà cung cấp AI để dán key."
    : null;

  let conversation;
  if (body?.conversationId) {
    conversation = getOwnedConversation(body.conversationId, user.id);
    if (body?.providerId || body?.model || body?.skill) {
      updateConversation(conversation.id, {
        providerId: body?.providerId ?? conversation.provider_id,
        model: body?.model ?? conversation.model,
        skill,
      });
      conversation = getOwnedConversation(conversation.id, user.id);
    }
  } else {
    conversation = createConversation({
      userId: user.id,
      skill,
      providerId: provider.id,
      model,
    });
  }

  const attachmentRows = attachmentIds.map((id) => getOwnedFile(id, user.id));
  const attachments = attachmentRows.map((row) => {
    const dto = publicFile(row);
    // Uploads made before the conversation existed are re-homed to it.
    if (!row.conversation_id) update("files", row.id, { conversation_id: conversation.id });
    return dto;
  });

  const userMessage = createMessage({
    conversationId: conversation.id,
    userId: user.id,
    role: "user",
    content,
    attachments,
  });

  const titled = maybeSetTitleFromFirstMessage(conversation, content || attachments[0]?.name || "Hội thoại mới");
  const updated = touchConversation(conversation.id, {
    preview: truncate(content || "(tệp đính kèm)", 120),
  });

  channel.send("start", {
    conversationId: conversation.id,
    messageId: null,
    userMessageId: userMessage.id,
    userMessage: {
      id: userMessage.id,
      conversationId: conversation.id,
      role: "user",
      content,
      attachments,
      createdAt: userMessage.created_at,
    },
    conversation: updated ?? publicConversation(conversation),
    providerId: provider.id,
    providerName: provider.name,
    model,
    skill,
    ...(notice ? { notice } : {}),
    title: titled?.title ?? (updated ?? conversation).title,
  });

  const files = all("files", "user_id = ? AND (conversation_id = ? OR conversation_id IS NULL)", [
    user.id,
    conversation.id,
  ], { order: "created_at DESC", limit: 50 }).map(publicFile);

  return { settings, skill, content, provider, model, conversation, userMessage, files };
}

/** Turns the stored history + fresh user turn into provider-shaped messages. */
export async function buildModelMessages({ conversationId, systemPrompt, historyLimit = 24 }) {
  const history = historyForModel(conversationId, { maxMessages: historyLimit });
  const messages = [{ role: "system", content: systemPrompt }];

  for (const entry of history) {
    if (entry.role !== "user") {
      messages.push({
        role: entry.role,
        content: entry.content,
        ...(entry.toolCalls?.length ? { toolCalls: entry.toolCalls } : {}),
        ...(entry.toolCallId ? { toolCallId: entry.toolCallId, name: entry.name } : {}),
      });
      continue;
    }
    const images = [];
    const textBits = [];
    for (const attachment of entry.attachments ?? []) {
      const row = all("files", "id = ?", [attachment.id])[0];
      if (!row) continue;
      const image = await asImagePayload(row);
      if (image) {
        images.push({ mime: image.mime, dataBase64: image.dataBase64 });
        continue;
      }
      const text = await asTextPayload(row, { maxChars: 12000 });
      if (text) textBits.push(`Nội dung tệp ${row.name}:\n${text.text}`);
    }
    messages.push({
      role: "user",
      content: [entry.content, ...textBits].filter(Boolean).join("\n\n"),
      attachments: entry.attachments ?? [],
      ...(images.length ? { images } : {}),
    });
  }
  return messages;
}

/** Provider failures worth retrying elsewhere: no credit, bad key, rate limit. */
export function isProviderCreditError(error) {
  const status = Number(error?.status ?? 0);
  const message = String(error?.message ?? "");
  if ([401, 402, 403, 429].includes(status)) return true;
  return /余额|欠费|quota|balance|credit|insufficient|billing|rate.?limit|invalid.?api.?key|unauthor/i.test(message);
}

/** Replaces the throwing provider with the next usable one (once per turn). */
function switchToFallbackProvider({ failed, attemptedIds }) {
  const settings = readAppSettings();
  const skipped = new Set(attemptedIds);
  for (const row of listProviderRows()) {
    if (Number(row.enabled) !== 1 || skipped.has(row.id) || row.id === failed.id) continue;
    const candidate = nextUsableProvider({ excludeId: null, providerId: row.id });
    if (candidate) return candidate;
  }
  return null;
}

/**
 * Runs the assistant turn: streams text, executes built-in + MCP tool calls and
 * persists one assistant message holding the whole turn.
 */
export async function runChatTurn({ user, turn, channel, signal }) {
  const { settings, skill, conversation, files } = turn;
  const started = Date.now();
  // These two may be swapped below when the configured provider has no credit.
  let provider = turn.provider;
  let model = turn.model;
  const attemptedProviderIds = [provider.id];

  const builtin = toolDefinitionsForSkill(skill);
  const modelTools = builtin.map(toModelTool);
  // Resolution uses the FULL built-in list, not just the offered subset: a real
  // tool name must always execute, and an unknown name gets a useful message.
  const toolIndex = new Map(TOOL_DEFINITIONS.map((tool) => [tool.name, { source: "builtin" }]));

  let mcpTools = [];
  if (provider.supportsTools) {
    try {
      mcpTools = await listAllTools();
    } catch {
      mcpTools = [];
    }
    for (const tool of mcpTools) {
      modelTools.push({
        name: tool.qualifiedName,
        description: `[MCP:${tool.serverName}] ${tool.description}`.slice(0, 900),
        inputSchema: tool.inputSchema,
      });
      toolIndex.set(tool.qualifiedName, { source: "mcp", serverId: tool.serverId, rawName: tool.name });
    }
  }

  const systemPrompt = buildSystemPrompt({ skill, files, settings });
  const messages = await buildModelMessages({ conversationId: conversation.id, systemPrompt });

  const toolCalls = [];
  const toolResults = [];
  const artifacts = [];
  let text = "";
  let usage = null;
  let finishReason = "stop";
  const maxIterations = Math.min(
    Number(settings.maxToolIterations) || 6,
    MAX_TOOL_ITERATIONS_CAP,
  );
  const useTools = provider.supportsTools && (turn.toolMode ?? "auto") !== "off";

  try {
    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      if (signal.aborted) break;
      channel.send("status", { stage: iteration === 0 ? "thinking" : "calling_tool" });

      const pendingCalls = [];
      let iterationText = "";

      let streamError = null;
      try {
        for await (const event of streamChat({
          provider,
          model,
          messages,
          tools: useTools ? modelTools : [],
          toolMode: turn.toolMode ?? "auto",
          signal,
        })) {
          if (signal.aborted) break;
          switch (event.type) {
            case "delta":
              iterationText += event.text;
              text += event.text;
              channel.send("delta", { text: event.text });
              break;
            case "reasoning":
              channel.send("reasoning", { text: event.text });
              break;
            case "tool_call":
              pendingCalls.push(event);
              break;
            case "usage":
            case "usage_final":
              usage = { in: event.in ?? usage?.in ?? 0, out: event.out ?? usage?.out ?? 0 };
              break;
            case "done":
              finishReason = event.finishReason ?? "stop";
              break;
            default:
              break;
          }
        }
      } catch (err) {
        streamError = err;
      }

      // The default provider may be out of credit or have a revoked key. As long
      // as nothing was streamed yet, swap to another ready provider instead of
      // failing the whole conversation.
      if (streamError) {
        const canSwap =
          iteration === 0 && !text && !iterationText && !pendingCalls.length && isProviderCreditError(streamError);
        const fallback = canSwap
          ? switchToFallbackProvider({ failed: provider, attemptedIds: attemptedProviderIds })
          : null;
        if (!fallback) throw streamError;
        attemptedProviderIds.push(fallback.provider.id);
        channel.send("notice", {
          message:
            `Nhà cung cấp "${provider.name}" không dùng được (${truncate(String(streamError.message ?? ""), 160)}). ` +
            `Lượt này chuyển sang "${fallback.provider.name}".`,
        });
        provider = fallback.provider;
        model = fallback.model;
        // Retry the same iteration with the replacement provider.
        iteration -= 1;
        continue;
      }

      if (usage) channel.send("usage", usage);

      if (!pendingCalls.length) break;

      // Assistant turn that requested the tools, then the results themselves.
      messages.push({
        role: "assistant",
        content: iterationText,
        toolCalls: pendingCalls.map((call) => ({ id: call.id, name: call.name, args: call.args ?? {} })),
      });

      for (const call of pendingCalls) {
        if (signal.aborted) break;
        const meta = toolIndex.get(call.name);
        const startedAt = Date.now();
        const callRecord = {
          id: call.id,
          name: call.name,
          args: call.args ?? {},
          source: meta?.source ?? "unknown",
          ...(meta?.serverId ? { serverId: meta.serverId } : {}),
        };
        channel.send("tool_call", callRecord);

        let result;
        if (meta?.source === "builtin") {
          result = await executeTool(call.name, call.args ?? {}, {
            userId: user.id,
            conversationId: conversation.id,
            files,
            signal,
            resolveImageProvider: async (preferred) => resolveImageProvider(preferred),
          });
        } else if (meta?.source === "mcp") {
          try {
            const { result: raw, durationMs } = await callTool({
              serverId: meta.serverId,
              toolName: meta.rawName ?? call.name,
              args: call.args ?? {},
              signal,
            });
            const flat = flattenToolResult(raw);
            result = {
              ok: !flat.isError,
              summary: truncate(flat.text || "(không có nội dung trả về)", 200),
              data: { text: flat.text },
              artifacts: [],
              modelText: flat.text || "(MCP tool không trả nội dung văn bản)",
              durationMs,
            };
          } catch (err) {
            result = {
              ok: false,
              summary: truncate(err?.message ?? String(err), 200),
              data: {},
              artifacts: [],
              modelText: `LỖI MCP: ${err?.message ?? err}`,
              durationMs: Date.now() - startedAt,
            };
          }
        } else {
          const available = [...toolIndex.keys()].join(", ");
          result = {
            ok: false,
            summary: `Không có công cụ tên "${call.name}"`,
            data: { available: [...toolIndex.keys()] },
            artifacts: [],
            modelText:
              `LỖI: không tồn tại công cụ "${call.name}". ` +
              `Các công cụ đang có: ${available}. Hãy gọi lại bằng tên đúng.`,
            durationMs: 0,
          };
        }

        const resultDto = {
          id: call.id,
          name: call.name,
          ok: Boolean(result.ok),
          summary: result.summary ?? "",
          data: result.data ?? {},
          artifacts: result.artifacts ?? [],
          error: result.error ?? null,
          durationMs: result.durationMs ?? Date.now() - startedAt,
        };
        toolCalls.push(callRecord);
        toolResults.push(resultDto);
        for (const artifact of result.artifacts ?? []) {
          artifacts.push(artifact);
          channel.send("artifact", artifact);
        }
        channel.send("tool_result", resultDto);

        messages.push({
          role: "tool",
          toolCallId: call.id,
          name: call.name,
          content: result.modelText ?? result.summary ?? "",
          isError: !result.ok,
        });
      }

      if (iteration === maxIterations - 1) {
        channel.send("status", { stage: "finishing" });
      }
    }
  } catch (err) {
    const code = err?.code ?? "internal_error";
    const message = err?.message ?? String(err);
    const assistantMessage = createMessage({
      conversationId: conversation.id,
      userId: user.id,
      role: "assistant",
      content: text,
      toolCalls,
      toolResults,
      artifacts,
      providerId: provider.id,
      model,
      usage,
      error: `${code}: ${message}`,
    });
    channel.send("error", { code, message });
    channel.send("done", { messageId: assistantMessage.id, finishReason: "error", iterations: 0 });
    audit(user.id, "chat.error", conversation.id, { code, message: truncate(message, 300) });
    return { messageId: assistantMessage.id, error: message };
  }

  const assistantMessage = createMessage({
    conversationId: conversation.id,
    userId: user.id,
    role: "assistant",
    content: text,
    toolCalls,
    toolResults,
    artifacts,
    providerId: provider.id,
    model,
    usage,
  });

  touchConversation(conversation.id, { preview: truncate(text || "(công cụ)", 120), increment: 1 });
  channel.send("done", {
    messageId: assistantMessage.id,
    finishReason,
    iterations: toolCalls.length,
    durationMs: Date.now() - started,
    usage,
    artifacts,
  });
  return { messageId: assistantMessage.id };
}

export { resolveImageProvider, qualifiedToolName, TOOL_DEFINITIONS };
export const chatToolNames = TOOL_DEFINITIONS.map((tool) => tool.name);

/** Best-effort conversation-object refresh used by the route layer. */
export function refreshConversation(conversationId) {
  try {
    return publicConversation(all("conversations", "id = ?", [conversationId])[0]);
  } catch {
    return null;
  }
}

export function newTurnId() {
  return newId("turn");
}
