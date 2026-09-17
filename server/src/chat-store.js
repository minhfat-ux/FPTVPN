import { all, count, db, getById, insert, remove, update } from "./db.js";
import { notFound, nowIso, titleFromText } from "./util.js";

export function publicConversation(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    skill: row.skill,
    providerId: row.provider_id ?? null,
    model: row.model ?? null,
    pinned: Boolean(row.pinned),
    archived: Boolean(row.archived),
    messageCount: row.message_count ?? 0,
    lastMessagePreview: row.last_preview ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function publicMessage(row) {
  if (!row) return null;
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content ?? "",
    attachments: row.attachments ?? [],
    toolCalls: row.tool_calls ?? [],
    toolResults: row.tool_results ?? [],
    artifacts: row.artifacts ?? [],
    providerId: row.provider_id ?? null,
    model: row.model ?? null,
    usage: row.usage ?? null,
    choices: row.choices ?? [],
    error: row.error ?? null,
    createdAt: row.created_at,
  };
}

export function createConversation({ userId, title = null, skill = "auto", providerId = null, model = null }) {
  return insert("conversations", {
    user_id: userId,
    title: title ? String(title).slice(0, 200) : "Hội thoại mới",
    skill,
    provider_id: providerId,
    model,
  });
}

export function listConversations(userId, { q = null, archived = false, limit = 200 } = {}) {
  const params = [userId];
  let where = "user_id = ? AND archived = ?";
  params.push(archived ? 1 : 0);
  if (q) {
    where += " AND (title LIKE ? OR last_preview LIKE ?)";
    params.push(`%${q}%`, `%${q}%`);
  }
  return all("conversations", where, params, {
    order: "pinned DESC, updated_at DESC",
    limit,
  }).map(publicConversation);
}

export function getOwnedConversation(id, userId) {
  const row = getById("conversations", id);
  if (!row || row.user_id !== userId) throw notFound("Không tìm thấy hội thoại");
  return row;
}

export function updateConversation(id, patch) {
  const changes = {};
  if (patch.title !== undefined) changes.title = String(patch.title).slice(0, 200) || "Hội thoại mới";
  if (patch.skill !== undefined) changes.skill = patch.skill;
  if (patch.providerId !== undefined) changes.provider_id = patch.providerId;
  if (patch.model !== undefined) changes.model = patch.model;
  if (patch.pinned !== undefined) changes.pinned = patch.pinned ? 1 : 0;
  if (patch.archived !== undefined) changes.archived = patch.archived ? 1 : 0;
  return publicConversation(update("conversations", id, changes));
}

export function deleteConversation(id) {
  db.prepare("DELETE FROM messages WHERE conversation_id = ?").run(id);
  remove("conversations", id);
  // Never leave a dangling "conversation đang mở" pointer behind.
  db.prepare("UPDATE user_state SET last_conversation_id = NULL WHERE last_conversation_id = ?").run(id);
  return { ok: true };
}

// ------------------------------------------------- last opened per ACCOUNT
//
// Kept per user, not per session: opening FlowGpt on another device has to land
// on the conversation the user was just working on (see docs §13).

export function setLastConversationId(userId, conversationId) {
  const now = nowIso();
  db.prepare(
    `INSERT INTO user_state (user_id, last_conversation_id, created_at, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET last_conversation_id = excluded.last_conversation_id,
                                        updated_at = excluded.updated_at`,
  ).run(userId, conversationId ?? null, now, now);
  return conversationId ?? null;
}

/** The stored pointer, but only when that conversation still exists and is owned. */
export function getLastConversationId(userId) {
  const row = db.prepare("SELECT last_conversation_id AS id FROM user_state WHERE user_id = ?").get(userId);
  const id = row?.id ?? null;
  if (!id) return null;
  const conversation = getById("conversations", id);
  if (!conversation || conversation.user_id !== userId || conversation.archived) return null;
  return id;
}

export function duplicateConversation(id, userId) {
  const source = getOwnedConversation(id, userId);
  const copy = createConversation({
    userId,
    title: `${source.title} (bản sao)`.slice(0, 200),
    skill: source.skill,
    providerId: source.provider_id,
    model: source.model,
  });
  const messages = all("messages", "conversation_id = ?", [id], { order: "created_at ASC" });
  for (const message of messages) {
    insert("messages", {
      conversation_id: copy.id,
      user_id: userId,
      role: message.role,
      content: message.content,
      attachments_json: message.attachments ?? [],
      tool_calls_json: message.tool_calls ?? [],
      tool_results_json: message.tool_results ?? [],
      artifacts_json: message.artifacts ?? [],
      provider_id: message.provider_id,
      model: message.model,
      usage_json: message.usage ?? null,
    });
  }
  update("conversations", copy.id, { message_count: messages.length });
  return publicConversation(getById("conversations", copy.id));
}

export function createMessage({
  conversationId,
  userId,
  role,
  content = "",
  attachments = [],
  toolCalls = [],
  toolResults = [],
  artifacts = [],
  providerId = null,
  model = null,
  usage = null,
  choices = [],
  error = null,
}) {
  return insert("messages", {
    conversation_id: conversationId,
    user_id: userId,
    role,
    content,
    attachments_json: attachments,
    tool_calls_json: toolCalls,
    tool_results_json: toolResults,
    artifacts_json: artifacts,
    provider_id: providerId,
    model,
    usage_json: usage,
    choices_json: choices,
    error,
  });
}

export function listMessages(conversationId, { limit = 500 } = {}) {
  return all("messages", "conversation_id = ?", [conversationId], {
    order: "created_at ASC",
    limit,
  }).map(publicMessage);
}

/**
 * Only the messages newer than `sinceMessageId` — used by the cross-device poll
 * so a second browser can pick up a turn that another device just ran without
 * re-downloading the whole thread. Falls back to the full list if the anchor is
 * gone (conversation cleared, message deleted).
 */
export function listMessagesAfter(conversationId, sinceMessageId, { limit = 200 } = {}) {
  const anchor = db
    .prepare("SELECT created_at, rowid AS rid FROM messages WHERE id = ? AND conversation_id = ?")
    .get(sinceMessageId, conversationId);
  if (!anchor) return listMessages(conversationId);
  return all(
    "messages",
    "conversation_id = ? AND (created_at > ? OR (created_at = ? AND rowid > ?))",
    [conversationId, anchor.created_at, anchor.created_at, anchor.rid],
    { order: "created_at ASC, rowid ASC", limit },
  ).map(publicMessage);
}

export function messageCount(conversationId) {
  return count("messages", "conversation_id = ?", [conversationId]);
}

/** Records that a turn happened: bumps counters, preview and updated_at. */
export function touchConversation(conversationId, { preview = null, title = null, increment = 1 } = {}) {
  const row = getById("conversations", conversationId);
  if (!row) return null;
  const patch = {
    message_count: (row.message_count ?? 0) + increment,
    last_preview: preview ? String(preview).slice(0, 300) : row.last_preview,
  };
  if (title) patch.title = String(title).slice(0, 200);
  return publicConversation(update("conversations", conversationId, patch));
}

export function maybeSetTitleFromFirstMessage(conversation, text) {
  if (!conversation) return null;
  if (conversation.title && conversation.title !== "Hội thoại mới") return null;
  const title = titleFromText(text);
  return updateConversation(conversation.id, { title });
}

/** Recent conversation context in the shape the provider adapters expect. */
export function historyForModel(conversationId, { maxMessages = 24 } = {}) {
  const rows = all("messages", "conversation_id = ? AND role IN ('user','assistant')", [conversationId], {
    order: "created_at DESC",
    limit: maxMessages,
  })
    .reverse()
    // Failed turns are stored as an assistant message with no text and no tool
    // calls. Replaying those makes some gateways (GLM) answer with an empty
    // completion — `finish_reason: stop`, zero tokens — so the user sees a turn
    // that silently does nothing. They carry no information, so drop them.
    .filter(
      (row) =>
        !(
          row.role === "assistant" &&
          !String(row.content ?? "").trim() &&
          !(row.tool_calls ?? []).length
        ),
    );

  const history = [];
  for (const row of rows) {
    if (row.role === "user") {
      history.push({
        role: "user",
        content: row.content ?? "",
        attachments: row.attachments ?? [],
        _id: row.id,
      });
    } else {
      const calls = (row.tool_calls ?? []).map((call) => ({
        id: call.id,
        name: call.name,
        args: call.args ?? {},
      }));
      history.push({
        role: "assistant",
        content: row.content ?? "",
        toolCalls: calls,
        _id: row.id,
      });
      for (const result of row.tool_results ?? []) {
        history.push({
          role: "tool",
          toolCallId: result.id,
          name: result.name,
          content: result.modelText ?? result.summary ?? "",
        });
      }
    }
  }
  return history;
}
