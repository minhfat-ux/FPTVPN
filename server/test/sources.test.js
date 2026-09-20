// fBuddy phải NÓI RÕ nguồn tra cứu (yêu cầu chủ dự án 2026-09-20).
import "./helpers.js";
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { closeServer } from "./helpers.js";

const { initDb } = await import("../src/db.js");
initDb();
const { formatSourcesBlock, buildSystemPrompt } = await import("../src/agent.js");

after(async () => { await closeServer(); });

test("khối nguồn liệt kê web, tệp, công cụ và nói rõ phần còn lại", () => {
  const block = formatSourcesBlock([
    { kind: "web", label: "Giá xăng dầu", url: "https://example.gov.vn/gia" },
    { kind: "file", label: "bao-cao.xlsx" },
    { kind: "tool", label: "analyze_data" },
    { kind: "mcp", label: "mcp__crm__find" },
  ]);
  assert.match(block, /Nguồn tra cứu/);
  assert.match(block, /https:\/\/example\.gov\.vn\/gia/);
  assert.match(block, /bao-cao\.xlsx/);
  assert.match(block, /analyze_data/);
  assert.match(block, /mcp__crm__find/);
  assert.match(block, /KHÔNG tra nguồn ngoài/, "phải nói rõ phần dựa vào kiến thức model");
});

test("không có nguồn nào ⇒ vẫn nói rõ là chỉ dùng kiến thức model", () => {
  const block = formatSourcesBlock([]);
  assert.match(block, /kiến thức sẵn có của model/);
  assert.doesNotMatch(block, /• Web/);
});

test("system prompt có luật nguồn, không phụ thuộc prompt admin", () => {
  const prompt = buildSystemPrompt({
    skill: "chat",
    files: [],
    settings: { systemPrompt: "Bạn là trợ lý.", maxToolIterations: 6 },
    user: { id: "u1", name: null, email: "a@b.c", role: "user" },
  });
  assert.match(prompt, /NGUỒN THÔNG TIN/);
  assert.match(prompt, /không bịa nguồn/i);
});
