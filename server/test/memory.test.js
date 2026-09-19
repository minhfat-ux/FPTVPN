import "./helpers.js";
import test from "node:test";
import assert from "node:assert/strict";

const { initDb } = await import("../src/db.js");
initDb();
const settings = await import("../src/settings.js");
const { buildSystemPrompt } = await import("../src/agent.js");
const { TOOL_DEFINITIONS } = await import("../src/skills/index.js");
const {
  rememberFact,
  learnSelfReference,
  buildMemoryBlock,
  listMemories,
  forgetAllMemories,
} = await import("../src/memory.js");

const UID = "memory-test-user";

test("remember_fact ghi/ghi đè theo (kind, key), không trùng lặp", () => {
  forgetAllMemories(UID);
  rememberFact({ userId: UID, key: "tên", value: "Minh", source: "model" });
  rememberFact({ userId: UID, key: "tên", value: "Minh An", source: "model" }); // ghi đè
  rememberFact({ userId: UID, key: "công ty", value: "FlowTech", kind: "fact" });

  const memories = listMemories(UID);
  assert.equal(memories.length, 2); // cùng key "tên" chỉ còn 1 mẩu
  assert.equal(memories.find((m) => m.key === "tên").value, "Minh An");
  assert.equal(memories.find((m) => m.key === "công ty").value, "FlowTech");
});

test("learnSelfReference học đúng cách xưng hô từ câu người dùng gõ", () => {
  forgetAllMemories(UID);
  // "em cần..." → tự xưng em.
  assert.equal(learnSelfReference({ userId: UID, text: "em cần hỏi về thuế" })?.value, "em");
  // "anh muốn..." → tự xưng anh.
  assert.equal(learnSelfReference({ userId: UID, text: "anh muốn làm slide" })?.value, "anh");
  // "em ơi" là GỌI trợ lý, không phải tự xưng → không học.
  forgetAllMemories(UID);
  assert.equal(learnSelfReference({ userId: UID, text: "em ơi" }), null);
});

test("buildMemoryBlock gom tên + xưng hô + sự thật, và buildSystemPrompt có nhúng khối này", () => {
  forgetAllMemories(UID);
  rememberFact({ userId: UID, key: "tên", value: "Minh", source: "model" });
  learnSelfReference({ userId: UID, text: "anh muốn hỏi" });

  const block = buildMemoryBlock({ userId: UID, query: "bất kỳ", accountName: "minh@example.com" });
  assert.match(block, /BỘ NHỚ VỀ NGƯỜI DÙNG/);
  assert.match(block, /minh@example\.com/);
  assert.match(block, /tên: Minh/);
  assert.match(block, /tự xưng "anh"/);

  const prompt = buildSystemPrompt({
    skill: "chat",
    files: [],
    settings: settings.readAppSettings(),
    user: { id: UID, name: "minh@example.com" },
    message: "chào anh",
  });
  assert.match(prompt, /BỘ NHỚ VỀ NGƯỜI DÙNG/);
  assert.match(prompt, /tên: Minh/);
});

test("hai công cụ nhớ được đăng ký cho model", () => {
  const names = TOOL_DEFINITIONS.map((tool) => tool.name);
  assert.ok(names.includes("remember_fact"));
  assert.ok(names.includes("search_past_chats"));
});
