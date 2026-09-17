import { streamChat } from "./providers/index.js";
import { listAllTools, callTool, flattenToolResult, qualifiedToolName } from "./mcp.js";
import { TOOL_DEFINITIONS, toolDefinitionsForSkill, toModelTool, executeTool } from "./skills/index.js";
import { applyVisionFallback } from "./vision-fallback.js";
import { isConfirmed, planChoices } from "./skills/confirm.js";
import { excelChoices } from "./skills/vision.js";
import { hubSkillForUser, isSelectableSkill } from "./skills/hub.js";
import { listProviderRows, nextUsableProvider, readAppSettings, resolveProviderForChat, resolveVisionTarget } from "./settings.js";
import { assertCanChat, costForUsage, creditSettings, creditSummary, spendCredits } from "./credits.js";
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
  setLastConversationId,
  touchConversation,
  updateConversation,
} from "./chat-store.js";

const MAX_TOOL_ITERATIONS_CAP = 12;

/**
 * Skills whose whole point is producing a file, and the phrasings that mean
 * "make me one". With these two together the first model call is forced to use a
 * tool (`tool_choice: "required"`): a small model otherwise sometimes answers
 * with an outline in prose and never calls `generate_pptx`/`generate_xlsx`, which
 * looks exactly like "làm Excel không ra file".
 */
const FILE_SKILLS = new Set(["ppt", "excel", "data"]);
const WANTS_FILE =
  /(tạo|làm|xuất|viết|soạn|lập|đưa|chuyển|thành|ra|file|tệp|bảng|biểu|slide|excel|ppt|word|pdf|phân tích|thống kê|tính|dự toán)/i;

/** Skill-specific steering appended to the system prompt. */
const SKILL_INSTRUCTIONS = {
  image: [
    "Người dùng đang ở chế độ Sửa ảnh.",
    "Nếu có ảnh đính kèm và yêu cầu là sửa nội dung ảnh bằng AI, gọi `edit_image` với fileId của ảnh.",
    "Nếu yêu cầu chỉ là cắt/xoay/filter/chèn chữ, gọi `open_image_studio` để chỉ người dùng mở Image Studio (thao tác ở đó không tốn credit).",
    "Sau khi gọi công cụ, mô tả ngắn gọn kết quả và gợi ý bước tiếp theo.",
  ].join(" "),
  ppt: [
    "Người dùng đang ở chế độ Làm PPT.",
    "QUY TẮC BẮT BUỘC: đề xuất DÀN Ý trước, nêu rõ lấy nội dung từ đâu, rồi chờ người dùng xác nhận — chỉ gọi `generate_pptx` để tạo tệp sau khi họ đồng ý (nút chọn đã có trên giao diện).",
    "Độ dài: 6–10 trang cho báo cáo thường; mỗi trang MỘT ý với 3–5 gạch đầu dòng. KHÔNG tạo một trang cho mỗi dòng dữ liệu, KHÔNG thêm trang 'Cảm ơn'/'Q&A'/mục lục nếu không được yêu cầu, KHÔNG lặp nội dung giữa các trang.",
    "Nếu trong hội thoại đã có tài liệu/ảnh/bảng: chỉ lấy các ý CHÍNH, gom thành phần, và ghi rõ nguồn trong dàn ý. Nếu thiếu thông tin (đối tượng, mục tiêu, độ dài, dữ liệu), hỏi 1–2 câu kèm lựa chọn trước.",
  ].join(" "),
  excel: [
    "Người dùng đang ở chế độ Làm Excel.",
    "QUY TẮC BẮT BUỘC: nêu KẾ HOẠCH trước (mấy sheet, cột nào, bao nhiêu dòng, lấy dữ liệu từ đâu) rồi chờ người dùng xác nhận — chỉ gọi công cụ tạo tệp sau khi họ đồng ý (nút chọn đã có trên giao diện).",
    "Dữ liệu phải là số liệu thật (không để ô trống kiểu '...'), tên cột rõ ràng, bật `totalsRow` cho cột số khi phù hợp.",
    "Nếu dữ liệu nằm trong ẢNH (ảnh chụp bảng, hoá đơn, sổ sách): dùng `xlsx_from_image` với id ảnh — công cụ này đọc ảnh rồi tạo tệp bằng đúng số liệu đọc được. KHÔNG tự gõ lại bảng và KHÔNG đoán số liệu.",
    "Nếu người dùng chưa nói rõ cần những cột/dữ liệu gì, hỏi 1–2 câu kèm lựa chọn trước khi tạo.",
  ].join(" "),
  data: [
    "Người dùng đang ở chế độ Phân tích dữ liệu.",
    "Nếu chưa biết fileId, gọi `list_files` trước. Sau đó gọi `analyze_data` với các thao tác phù hợp.",
    "Nếu người dùng chưa nói rõ cần phân tích gì (cột nào, câu hỏi nào, so sánh gì), hỏi 1–2 câu kèm lựa chọn trước khi chạy — đừng đoán.",
    "Nếu tệp là ẢNH, gọi `read_image` để lấy bảng trước rồi mới phân tích.",
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

/**
 * Billing facts handed to the model on every turn.
 *
 * The prompt never mentioned credits, so the assistant answered "FlowGpt miễn
 * phí" whenever anyone asked about money. Every number here is read fresh so the
 * answer matches what the UI shows.
 */
export function buildCreditKnowledge(user) {
  const settings = creditSettings();
  if (!settings.enabled || !user?.id) return "";
  const summary = creditSummary(user.id);
  const buy = settings.buyUrl
    ? `“Mua thêm token” ở menu tài khoản → trang nạp credit ${settings.buyUrl}`
    : "“Mua thêm token” ở menu tài khoản";
  return [
    "## Credit (số liệu thật, được phép nói với người dùng)",
    `KHÔNG miễn phí: mỗi lượt trừ (token vào + token ra) × ${settings.perToken} credit, làm tròn lên, tối thiểu 1 (1 credit = 1 token). Đăng nhập lần đầu được tặng ${settings.signupCredits} credit.`,
    `Của người dùng này: ${summary.balance} credit, đã dùng ${summary.spent}, trung bình ${summary.averageCostPerTurn}/lượt ≈ ${summary.estimatedTurnsLeft} lượt còn lại.`,
    `Muốn thêm credit: (1) bấm ảnh đại diện (góc trên phải) → “Xin thêm token” để gửi yêu cầu chờ quản trị viên duyệt; (2) ${buy}.`,
    "Mua kỹ năng là việc khác: mục “Chợ kỹ năng” trên thanh bên trái.",
    user.role === "admin"
      ? "Người dùng này là quản trị viên: hết credit vẫn chat được nhưng vẫn bị trừ credit."
      : "Được hỏi về credit/token/giá/số dư: trả lời 1–3 câu, luôn nêu công thức trừ credit, mức credit được tặng khi đăng nhập lần đầu và 2 đường nạp (xin thêm / mua thêm) bằng đúng số liệu trên; không nói FlowGpt miễn phí, không bịa giá.",
  ].join("\n");
}

/** Vision target for OCR when the chosen chat model cannot see images. */
function resolveVisionProviderFor({ providerId = null, model = null } = {}) {
  try {
    return resolveVisionTarget({ preferProviderId: providerId, preferModel: model });
  } catch {
    return null;
  }
}

export function buildSystemPrompt({ skill, files, settings, hubSkill = null, user = null, planFirst = false }) {
  const today = new Date().toISOString().slice(0, 10);
  const parts = [
    settings.systemPrompt,
    `Hôm nay là ${today}.`,
    SKILL_INSTRUCTIONS[skill] ?? "",
    planFirst
      ? "LƯỢT NÀY LÀ LƯỢT LẬP KẾ HOẠCH: hãy mô tả NGẮN GỌN kế hoạch sẽ làm (có gì, mấy phần/trang/sheet, cột nào, lấy dữ liệu từ đâu). " +
        "KHÔNG gọi công cụ tạo tệp (generate_pptx/generate_xlsx/xlsx_from_image) trong lượt này — người dùng sẽ bấm nút xác nhận ở dưới. " +
        "Chỉ gọi `list_files`/`read_image` nếu cần xem dữ liệu đã có để lập kế hoạch chính xác."
      : "",
    buildCreditKnowledge(user),
  ];
  if (hubSkill?.instructions) {
    parts.push(`Kỹ năng đang dùng: ${hubSkill.name}\n${hubSkill.instructions}`);
  }
  if (files.length) {
    parts.push(
      "Tệp người dùng đã tải lên trong hội thoại này. Khi gọi công cụ hãy dùng `id` dưới đây (KHÔNG dùng tên tệp làm fileId):\n" +
        files
          .map((f) => {
            const isImage = String(f.mime ?? "").startsWith("image/") || f.kind === "image";
            return `- ${f.name} — id: ${f.id} (${f.kind})${isImage ? " · là ẢNH: muốn đưa vào Excel hãy gọi `xlsx_from_image` với id này; nội dung ảnh được đọc tự động" : ""}`;
          })
          .join("\n"),
    );
  }
  return parts.filter(Boolean).join("\n\n");
}

/** Normalises the request, persists the user turn and writes the SSE preamble. */
export async function prepareTurn({ user, body, channel }) {
  const settings = readAppSettings();
  // Built-in ids, free hub skills and hub skills the user owns are all valid;
  // anything else falls back to the configured default skill.
  const requestedSkill = body?.skill;
  const skill = isSelectableSkill({ skillId: requestedSkill, userId: user.id, role: user.role })
    ? requestedSkill
    : settings.defaultSkill ?? "auto";
  /** Prompt-pack skills bought from the Skill Hub (null for built-ins). */
  const hubSkill = hubSkillForUser({ skillId: skill, userId: user.id, role: user.role });
  const content = String(body?.content ?? "").trim();
  const attachmentIds = Array.isArray(body?.attachments) ? body.attachments.slice(0, 10) : [];
  if (!content && !attachmentIds.length) throw new ApiError(400, "bad_request", "Nội dung trống");

  // Credit gate: metering on + no balance + not an admin ⇒ refuse with a clear
  // message (the UI turns this into a "nạp thêm" card).
  const credit = assertCanChat(user);
  if (!credit.allowed) {
    throw new ApiError(402, "insufficient_credits", credit.message, {
      balance: credit.balance,
      buyUrl: creditSettings().buyUrl,
    });
  }

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

  // Force the *right* tool call when the user picked a file skill and asked for the
  // artifact: naming the function is what makes it deterministic on a small model
  // (`tool_choice: {type:"function",function:{name}}`). The exact tool depends on
  // whether an image is attached, so the name is resolved further down.
  // `planFirst` turns the first turn into a planning turn instead (see below).
  const planFirst = FILE_SKILLS.has(skill) && !isConfirmed(content);
  const forceTool = FILE_SKILLS.has(skill) && WANTS_FILE.test(content) && !planFirst;

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

  // Any turn makes this the account's current thread, so the next device the
  // user opens FlowGpt on lands exactly here.
  setLastConversationId(user.id, conversation.id);

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

  // Which tool the user's request needs, now that the attachments are known.
  const wantsImage = files.some((file) => file.kind === "image" || String(file.mime ?? "").startsWith("image/"));
  const forceToolName = !forceTool
    ? null
    : skill === "ppt"
      ? "generate_pptx"
      : skill === "data"
        ? "analyze_data"
        : wantsImage
          ? "xlsx_from_image"
          : "generate_xlsx";

  return { settings, skill, hubSkill, content, provider, model, conversation, userMessage, files, forceTool, forceToolName, planFirst };
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
        // `fileId`/`name` ride along so the fallback OCR path knows which file
        // the pixels belong to (the adapters only read mime/dataBase64).
        images.push({ mime: image.mime, dataBase64: image.dataBase64, fileId: row.id, name: row.name });
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

/**
 * The model itself is gone (retired on the gateway, wrong id…). Worth one retry
 * with the provider's own default model before giving up on the provider.
 */
export function isProviderModelError(error) {
  const status = Number(error?.status ?? 0);
  const message = String(error?.message ?? "");
  return (
    status === 404 ||
    /no endpoints? found|model\b[^.]{0,60}(not found|does not exist|unavailable|deactivated|deprecated|invalid)|unknown model|invalid model|not a valid model/i.test(
      message,
    )
  );
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
  // A hub skill may narrow the toolset to the tools it actually needs.
  const offered = turn.hubSkill?.tools?.length
    ? builtin.filter((tool) => turn.hubSkill.tools.includes(tool.name) || tool.name === "list_files")
    : builtin;
  const modelTools = offered.map(toModelTool);
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

  const systemPrompt = buildSystemPrompt({ skill, files, settings, hubSkill: turn.hubSkill, user, planFirst: Boolean(turn.planFirst) });
  const messages = await buildModelMessages({ conversationId: conversation.id, systemPrompt });

  // Gateways hard-fail on an image part the model cannot handle (GLM: "content.type
  // 参数非法"). Instead of dropping the picture, the backend falls back to a vision
  // model: it reads the image, and the extracted text goes into this turn's context
  // so the user's real request ("đưa hết data trong ảnh thành excel") still works.
  const vision = await applyVisionFallback({ messages, provider, model, user, conversationId: conversation.id, signal, channel });
  if (vision.applied && vision.read) {
    if (messages[0]?.role === "system") {
      // The text is already in context — say so, or the model calls read_image again
      // (an extra vision round trip that costs the user time and tokens).
      messages[0].content +=
        `\n\nẢnh trong hội thoại này đã được đọc sẵn bằng ${vision.providerName} và nội dung nằm ngay trong tin nhắn của người dùng — KHÔNG gọi read_image cho ảnh đó nữa.`;
    }
    // Belt and braces: with a small model the prompt hint is not always obeyed, so
    // take the tool away for this turn (its job is already done).
    for (const name of ["read_image", "read_image_content"]) {
      const index = modelTools.findIndex((tool) => tool.name === name);
      if (index >= 0) modelTools.splice(index, 1);
    }
  }

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
      // First call of a file-skill turn: name the tool the user's request needs so
      // the model cannot answer with prose instead of a file.
      const forcedName =
        iteration === 0 && useTools && turn.forceToolName && modelTools.some((tool) => tool.name === turn.forceToolName)
          ? turn.forceToolName
          : null;
      const toolMode = forcedName ? "required" : turn.toolMode ?? "auto";
      const toolChoice = forcedName ? { type: "function", function: { name: forcedName } } : undefined;
      try {
        for await (const event of streamChat({
          provider,
          model,
          messages,
          tools: useTools ? modelTools : [],
          toolMode,
          toolChoice,
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

      // The default provider may be out of credit or have a revoked key, and a
      // model may have been retired by the gateway. As long as nothing was
      // streamed yet, recover: first retry the same provider with its own
      // default model, then swap to another ready provider.
      if (streamError) {
        const untouched = iteration === 0 && !text && !iterationText && !pendingCalls.length;
        const modelError = untouched && isProviderModelError(streamError);
        const creditError = untouched && isProviderCreditError(streamError);

        if (modelError && provider.defaultModel && provider.defaultModel !== model) {
          const from = model;
          model = provider.defaultModel;
          channel.send("notice", {
            message:
              `Model "${from}" không còn khả dụng (${truncate(String(streamError.message ?? ""), 120)}). ` +
              `Đã chuyển sang model mặc định của ${provider.name}.`,
          });
          iteration -= 1;
          continue;
        }

        const fallback = creditError || modelError
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
            // The current user message: tools read the intent from the user's own
            // words instead of trusting the model's arguments (see skills/vision.js).
            userMessage: turn.content ?? "",
            resolveImageProvider: async (preferred) => resolveImageProvider(preferred),
            resolveVisionTarget: async () => resolveVisionProviderFor({ providerId: provider.id, model }),
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
          // Tappable options the tool wants the user to choose from (the web
          // renders them under the message; the value is sent as the next turn).
          ...(result.choices?.length ? { choices: result.choices } : {}),
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

  // A planning turn gets its confirmation buttons from the *server*, not from the
  // model: glm-4-flash ignores `tool_choice` whenever the prompt says "propose a
  // plan first", so the buttons are attached here instead. They are persisted with
  // the message, so a reload keeps them.
  const planImage = files.find((file) => file.kind === "image" || String(file.mime ?? "").startsWith("image/"));
  const choices = turn.planFirst && !artifacts.length
    ? skill === "excel" && planImage
      ? // A photo in the request: the useful first question is *what to take from it*.
        excelChoices(planImage.id, planImage.name)
      : planChoices({ kind: skill === "ppt" ? "pptx" : "xlsx", detail: skill === "ppt" ? "theo dàn ý trên" : "theo kế hoạch trên" })
    : [];

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
    choices,
  });

  touchConversation(conversation.id, { preview: truncate(text || "(công cụ)", 120), increment: 1 });

  // Meter the turn. Gateways sometimes omit usage → charge the floor of 1.
  let credits = null;
  try {
    const cost = costForUsage(usage, creditSettings().perToken);
    if (cost > 0) {
      credits = { cost, balance: spendCredits({ userId: user.id, amount: cost, ref: assistantMessage.id }) };
    }
  } catch (err) {
    console.warn("[flowgpt] không ghi được credit:", err?.message ?? err);
  }

  channel.send("done", {
    messageId: assistantMessage.id,
    finishReason,
    iterations: toolCalls.length,
    durationMs: Date.now() - started,
    usage,
    artifacts,
    ...(choices.length ? { choices } : {}),
    ...(credits ? { credits } : {}),
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
