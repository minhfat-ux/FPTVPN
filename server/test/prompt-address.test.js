import "./helpers.js";
import test from "node:test";
import assert from "node:assert/strict";

const { initDb, DEFAULT_APP_SETTINGS } = await import("../src/db.js");
initDb();
const settings = await import("../src/settings.js");
const { buildSystemPrompt } = await import("../src/agent.js");

/**
 * Xưng hô là quy tắc ở tầng code: phải có mặt dù admin có đổi prompt hệ thống
 * trong Cài đặt, vì gọi sai vai (người dùng xưng "anh" mà trợ lý xưng "tôi") là
 * lỗi giao tiếp nặng với người dùng Việt.
 */
test("quy tắc xưng hô luôn được ghép vào system prompt, kể cả khi admin đổi prompt", () => {
  // Prompt hệ thống bị admin thay bằng nội dung khác hoàn toàn.
  const appSettings = { ...settings.readAppSettings(), systemPrompt: "Chỉ trả lời ngắn gọn." };
  const prompt = buildSystemPrompt({ skill: "chat", files: [], settings: appSettings, user: null });

  assert.match(prompt, /Chỉ trả lời ngắn gọn\./); // prompt của admin vẫn còn
  assert.match(prompt, /XƯNG HÔ/);
  // Ánh xạ vai cụ thể — đúng ví dụ đã chốt: người dùng xưng "anh" ⇒ trợ lý nhận "em".
  assert.match(prompt, /xưng "anh" ⇒ bạn gọi họ là "anh" và tự xưng "em"/);
  assert.match(prompt, /Xưng "chị" ⇒ gọi "chị", tự xưng "em"/);
  assert.match(prompt, /xưng "em" ⇒ bạn gọi họ là "em" và tự xưng "anh"/);
  assert.match(prompt, /tự xưng "mình" và gọi họ là "bạn"/);
  // Cấm trộn vai và cấm tự xưng "tôi" khi người dùng đang xưng anh/chị/em.
  assert.match(prompt, /KHÔNG trộn vai/);
  assert.match(prompt, /KHÔNG tự xưng "tôi"/);
  // Người dùng nói rõ cách gọi thì phải theo.
  assert.match(prompt, /gọi tôi là sếp/);
});

test("prompt mặc định định danh fBuddy và không nhận tên cũ", () => {
  const prompt = DEFAULT_APP_SETTINGS.systemPrompt;
  assert.match(prompt, /Tên của bạn là fBuddy/);
  assert.match(prompt, /KHÔNG tự nhận là FlowGpt\/FlowGPT/);
});
