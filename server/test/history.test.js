import "./helpers.js";
import test from "node:test";
import assert from "node:assert/strict";
import { initDb } from "../src/db.js";

initDb();
const store = await import("../src/chat-store.js");

test("history skips empty assistant turns so the model does not stop on them", () => {
  const user = "u_history_test";
  const conversation = store.createConversation({ userId: user, title: "History" });
  store.createMessage({ conversationId: conversation.id, userId: user, role: "user", content: "Đưa hết data trong ảnh thành excel" });
  // A failed turn is persisted exactly like this: empty text, no tool calls.
  store.createMessage({ conversationId: conversation.id, userId: user, role: "assistant", content: "", error: "provider_error: GLM trả lỗi 400" });
  store.createMessage({ conversationId: conversation.id, userId: user, role: "user", content: "làm được chưa?" });
  // A tool-calling assistant turn with no prose must be KEPT.
  store.createMessage({
    conversationId: conversation.id,
    userId: user,
    role: "assistant",
    content: "",
    toolCalls: [{ id: "call_1", name: "generate_xlsx", args: { sheets: [] } }],
  });

  const history = store.historyForModel(conversation.id);
  const roles = history.map((entry) => entry.role);
  assert.deepEqual(roles, ["user", "user", "assistant"], `giữ đúng các lượt có nghĩa: ${roles.join(",")}`);
  assert.equal(history[0].content, "Đưa hết data trong ảnh thành excel");
  assert.equal(history[1].content, "làm được chưa?");
  assert.equal(history[2].toolCalls.length, 1, "lượt gọi công cụ vẫn phải được giữ");
});
