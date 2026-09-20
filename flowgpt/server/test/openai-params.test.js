import "./helpers.js";
import test, { after } from "node:test";
import assert from "node:assert/strict";

const openai = await import("../src/providers/openai.js");

after(() => {
  if (globalThis.__origFetch) globalThis.fetch = globalThis.__origFetch;
});
globalThis.__origFetch = globalThis.fetch;

const REAL_FETCH = globalThis.fetch;

function sseBody(text) {
  return [
    `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}`,
    "",
    'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
    "",
    "data: [DONE]",
    "",
    "",
  ].join("\n");
}

async function collect(stream) {
  const events = [];
  for await (const event of stream) events.push(event);
  return events;
}

function provider(extra = {}) {
  return {
    name: "OpenAi",
    kind: "openai",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "sk-test",
    ...extra,
  };
}

test("model chặn temperature thì request KHÔNG gửi temperature", () => {
  const gpt5 = openai.buildRequest({ model: "gpt-5-mini", messages: [{ role: "user", content: "hi" }] });
  assert.equal("temperature" in gpt5, false, "gpt-5 không được nhận temperature");
  const o3 = openai.buildRequest({ model: "o3-mini", messages: [{ role: "user", content: "hi" }] });
  assert.equal("temperature" in o3, false, "o-series không được nhận temperature");
  const older = openai.buildRequest({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: "hi" }],
    temperature: 0.2,
  });
  assert.equal(older.temperature, 0.2, "model cũ vẫn phải giữ temperature của caller");
});

test("400 vì temperature ⇒ tự bỏ field rồi gọi lại, lượt chat vẫn chạy", async () => {
  const bodies = [];
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    bodies.push(body);
    if ("temperature" in body) {
      return new Response(
        JSON.stringify({
          error: {
            message:
              "Unsupported value: 'temperature' does not support 0.7 with this model. Only the default (1) value is supported.",
          },
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response(sseBody("xin chào"), { status: 200, headers: { "Content-Type": "text/event-stream" } });
  };

  const events = await collect(
    // Model KHÔNG nằm trong danh sách đoán trước ⇒ đúng ca phải tự chữa sau khi bị 400.
    openai.streamChat({ provider: provider(), model: "gateway-la-model", messages: [{ role: "user", content: "hi" }] }),
  );
  assert.equal(bodies.length, 2, "phải gọi lại đúng 1 lần");
  assert.equal("temperature" in bodies[1], false, "lần 2 không còn temperature");
  assert.equal(events.find((e) => e.type === "delta")?.text, "xin chào");
  globalThis.fetch = REAL_FETCH;
});

test("400 vì stream_options ⇒ vẫn tự chữa như trước (không hồi quy)", async () => {
  const bodies = [];
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    bodies.push(body);
    if (body.stream_options) {
      return new Response(JSON.stringify({ error: { message: "Unsupported parameter: 'stream_options'" } }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(sseBody("ok"), { status: 200, headers: { "Content-Type": "text/event-stream" } });
  };

  const events = await collect(
    openai.streamChat({ provider: provider(), model: "gpt-4o-mini", messages: [{ role: "user", content: "hi" }] }),
  );
  assert.equal(bodies.length, 2);
  assert.equal("stream_options" in bodies[1], false);
  assert.equal(events.find((e) => e.type === "delta")?.text, "ok");
  globalThis.fetch = REAL_FETCH;
});

test("testConnection: gateway cũ chỉ hiểu max_tokens ⇒ đổi tên rồi gọi lại", async () => {
  const bodies = [];
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    bodies.push(body);
    if ("max_completion_tokens" in body) {
      return new Response(
        JSON.stringify({
          error: { message: "Unsupported parameter: 'max_completion_tokens'. Use 'max_tokens' instead." },
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response(JSON.stringify({ choices: [{ message: { content: "pong" } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const result = await openai.testConnection({ provider: provider(), model: "gpt-4o-mini" });
  assert.equal(bodies.length, 2);
  assert.equal(bodies[1].max_tokens, 8, "giữ nguyên giới hạn 8 token, chỉ đổi tên field");
  assert.equal("max_completion_tokens" in bodies[1], false);
  assert.ok(typeof result.latencyMs === "number");
  globalThis.fetch = REAL_FETCH;
});

test("400 không nhận ra field ⇒ báo lỗi thật, KHÔNG retry vô hạn", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ error: { message: "Tài khoản đã hết hạn mức sử dụng." } }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  };

  await assert.rejects(
    collect(openai.streamChat({ provider: provider(), model: "gpt-4o-mini", messages: [{ role: "user", content: "hi" }] })),
    /hết hạn mức/,
  );
  assert.equal(calls, 1, "lỗi không liên quan tới tham số thì không được gọi lại");
  globalThis.fetch = REAL_FETCH;
});
