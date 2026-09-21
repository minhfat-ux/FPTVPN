import "./helpers.js";
import test, { after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";

const { initDb } = await import("../src/db.js");
initDb();
const settings = await import("../src/settings.js");
const { registerAdmin, chat, textOf, closeServer } = await import("./helpers.js");

// Không đóng server thì tiến trình test treo ở cuối (server giữ event loop).
after(async () => {
  await closeServer();
});

/**
 * Gateway OpenAI-compatible giả: ghi lại system prompt mà fBuddy thật sự gửi đi, rồi
 * trả về một câu cố định. Cần stub vì provider `mock` của app không nhìn thấy prompt —
 * mà đúng chỗ hỏng cần bắt là "prompt có tới được provider hay không".
 */
async function startStubGateway() {
  const seen = [];
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      let body = {};
      try {
        body = JSON.parse(raw);
      } catch {
        body = {};
      }
      const system = (body.messages ?? []).find((message) => message.role === "system")?.content ?? "";
      seen.push({ url: req.url, system, tools: (body.tools ?? []).length });
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      for (const chunk of [
        { choices: [{ delta: { content: "Dạ " } }] },
        { choices: [{ delta: { content: "em là fBuddy." } }] },
        { choices: [{ delta: {} }], usage: { prompt_tokens: 10, completion_tokens: 4 } },
      ]) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
      res.write("data: [DONE]\n\n");
      res.end();
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    seen,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

/**
 * Khối kiến thức app phải đi tới provider thật, không chỉ nằm trong hàm buildSystemPrompt.
 * Đây là ca bắt lỗi truyền thiếu tham số ở runChatTurn (kiểu `message: content` khi biến
 * đúng là `turn.content`) — lỗi đó làm cả lượt chat chết chứ không chỉ thiếu dữ kiện.
 */
test("provider nhận được khối kiến thức app, và câu hỏi về app thì có cả danh mục", async (t) => {
  const gateway = await startStubGateway();
  t.after(() => gateway.close());

  const { token } = await registerAdmin("app-knowledge-e2e@fbuddy.test");
  const provider = settings.createProvider({
    kind: "openai",
    name: "Stub gateway",
    baseUrl: gateway.baseUrl,
    apiKey: "stub-key-0123456789",
    models: ["stub-1"],
    enabled: true,
  });
  settings.patchAppSettings({ defaultProviderId: provider.id, defaultModel: "stub-1", creditsEnabled: false });

  const events = await chat({ token, content: "MeetFlow AI là gì? Nó có phải là em không?", skill: "chat" });
  assert.equal(textOf(events), "Dạ em là fBuddy.");
  assert.equal(gateway.seen.length, 1);

  const system = gateway.seen[0].system;
  // Định danh luôn có.
  assert.match(system, /Hệ sinh thái FlowTech/);
  assert.match(system, /MeetFlow AI: app dịch hội thoại thời gian thực và ghi biên bản cuộc họp\./);
  // Câu hỏi chạm tới app ⇒ danh mục chi tiết cũng đi theo.
  assert.match(system, /## DANH MỤC APP/);
  assert.match(system, /ghi biên bản cuộc họp \(meeting minutes\)/);
  assert.match(system, /id6765590042/);
  assert.match(system, /KHÔNG nói MeetFlow AI là fBuddy/);
  assert.match(system, /support@meetflowai\.site/);
});

/** Lượt làm việc thường không phải trả token cho danh mục app. */
test("lượt làm việc thường chỉ nhận khối định danh, không nhận danh mục", async (t) => {
  const gateway = await startStubGateway();
  t.after(() => gateway.close());

  const { token } = await registerAdmin("app-knowledge-plain@fbuddy.test");
  const provider = settings.createProvider({
    kind: "openai",
    name: "Stub gateway 2",
    baseUrl: gateway.baseUrl,
    apiKey: "stub-key-0123456789",
    models: ["stub-1"],
    enabled: true,
  });
  settings.patchAppSettings({ defaultProviderId: provider.id, defaultModel: "stub-1", creditsEnabled: false });

  await chat({ token, content: "viết giúp em một đoạn mô tả ngắn về quý 3", skill: "chat" });
  const system = gateway.seen[0].system;
  assert.match(system, /Hệ sinh thái FlowTech/);
  assert.doesNotMatch(system, /## DANH MỤC APP/);
});
