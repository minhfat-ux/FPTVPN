import "./helpers.js";
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { api, apiRaw, bootServer, chat, closeServer, eventsNamed, registerAdmin, textOf, uploadFile, readSse } from "./helpers.js";

const CSV = [
  "khu-vuc,doanh-thu,so-don",
  "Mien Bac,1200000,12",
  "Mien Nam,1500000,15",
  "Mien Nam,900000,9",
  "Mien Trung,300000,6",
  "Mien Bac,700000,7",
].join("\n");

let ctx = {};

after(async () => {
  await closeServer();
});

test("boots and reports health + meta before any account exists", async () => {
  const { baseUrl } = await bootServer();
  const health = await fetch(`${baseUrl}/api/health`).then((r) => r.json());
  assert.equal(health.ok, true);
  assert.equal(health.providerCount, 0);

  const meta = await fetch(`${baseUrl}/api/meta`).then((r) => r.json());
  assert.equal(meta.firstUserIsAdmin, true);
  assert.equal(meta.hasUsers, false);
  assert.equal(meta.allowSignup, true);
});

test("protected routes require a token", async () => {
  const response = await apiRaw("GET", "/conversations");
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, "unauthorized");
});

test("the first registered account becomes admin", async () => {
  const { user, token } = await registerAdmin("admin@fbuddy.test");
  assert.equal(user.isAdmin, true);
  assert.equal(user.role, "admin");
  assert.ok(token);
  ctx.token = token;

  const me = await api("GET", "/auth/me", undefined, token);
  assert.equal(me.user.email, "admin@fbuddy.test");
});

test("a second account is a normal user and cannot read admin settings", async () => {
  const { user, token } = await api("POST", "/auth/register", {
    email: "user@fbuddy.test",
    password: "matkhau12345",
  });
  assert.equal(user.isAdmin, false);
  ctx.userToken = token;

  const response = await apiRaw("GET", "/settings/providers", undefined, token);
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, "forbidden");
});

test("login rejects a wrong password without leaking whether the email exists", async () => {
  const wrong = await apiRaw("POST", "/auth/login", {
    email: "admin@fbuddy.test",
    password: "sai-mat-khau",
  });
  assert.equal(wrong.status, 401);
  const missing = await apiRaw("POST", "/auth/login", {
    email: "khong-ton-tai@fbuddy.test",
    password: "sai-mat-khau",
  });
  assert.equal(missing.status, 401);
  assert.equal((await wrong.json()).error.message, (await missing.json()).error.message);
});

test("admin configures the demo provider and masks its key", async () => {
  const created = await api(
    "POST",
    "/settings/providers",
    { name: "Demo (không cần key)", kind: "mock" },
    ctx.token,
  );
  assert.equal(created.provider.kind, "mock");
  // The demo provider needs no credential, so it reports no key at all.
  assert.equal(created.provider.hasApiKey, false);
  ctx.providerId = created.provider.id;

  const listed = await api("GET", "/settings/providers", undefined, ctx.token);
  assert.equal(listed.items.length, 1);
  assert.equal(listed.items[0].apiKey, undefined);
  assert.equal(listed.items[0].apiKeyPreview, null);

  const models = await api("GET", "/models", undefined, ctx.token);
  assert.equal(models.items[0].model, "fbuddy-demo");
});

test("provider test endpoint reports a working connection", async () => {
  const result = await api("POST", `/settings/providers/${ctx.providerId}/test`, {}, ctx.token);
  assert.equal(result.ok, true);
  assert.ok(result.latencyMs >= 0);
});

test("plain chat streams start → delta → done and persists the turn", async () => {
  const events = await chat({ token: ctx.token, content: "Xin chào fBuddy" });
  const names = events.map((e) => e.event);
  assert.equal(names[0], "start");
  assert.ok(names.includes("delta"));
  assert.equal(names[names.length - 1], "done");

  const start = events[0].data;
  assert.ok(start.conversationId.startsWith("c_"));
  assert.equal(start.providerName, "Demo (không cần key)");
  assert.equal(start.model, "fbuddy-demo");
  ctx.conversationId = start.conversationId;

  const text = textOf(events);
  assert.match(text, /fBuddy/);

  const stored = await api("GET", `/conversations/${ctx.conversationId}`, undefined, ctx.token);
  assert.equal(stored.messages.length, 2);
  assert.equal(stored.messages[0].role, "user");
  assert.equal(stored.messages[1].role, "assistant");
  assert.equal(stored.conversation.title, "Xin chào fBuddy");
});

test("the PPT skill proposes the deck first and only writes it after a confirmation", async () => {
  // 1) The first turn is a *planning* turn: no file, and the server attaches the
  //    confirmation buttons itself (glm-4-flash ignores tool_choice when the prompt
  //    tells it to propose a plan first).
  const plan = await chat({
    token: ctx.token,
    content: "Làm slide giới thiệu fBuddy",
    skill: "ppt",
    conversationId: ctx.conversationId,
  });
  const planDone = eventsNamed(plan, "done")[0].data;
  assert.equal(eventsNamed(plan, "artifact").length, 0, "lượt lập kế hoạch không được tạo tệp");
  assert.ok(planDone.choices?.length >= 3, "phải có nút xác nhận cho người dùng");
  assert.equal(planDone.choices.some((choice) => choice.id === "create"), true);
  ctx.pptChoices = planDone.choices;

  // 2) Approving the plan writes the .pptx.
  const createChoice = planDone.choices.find((choice) => choice.id === "create");
  const events = await chat({
    token: ctx.token,
    content: createChoice.value,
    skill: "ppt",
    conversationId: ctx.conversationId,
  });
  const results = eventsNamed(events, "tool_result");
  assert.equal(results[0].data.name, "generate_pptx");
  assert.equal(results[0].data.ok, true);
  assert.equal(results[0].data.data.needsConfirm, undefined, "lượt xác nhận phải tạo tệp thật");
  assert.equal(results[0].data.artifacts.length, 1);

  const artifacts = eventsNamed(events, "artifact");
  assert.equal(artifacts.length, 1);
  assert.equal(artifacts[0].data.kind, "pptx");
  ctx.pptxArtifact = artifacts[0].data;

  // The bytes on disk are a real zip (pptx) container.
  const response = await apiRaw("GET", `/files/${ctx.pptxArtifact.id}/content`, undefined, ctx.token);
  assert.equal(response.status, 200);
  const buffer = Buffer.from(await response.arrayBuffer());
  assert.ok(buffer.length > 5000, `pptx quá nhỏ: ${buffer.length}`);
  assert.equal(buffer.subarray(0, 2).toString(), "PK");
});

test("the Excel skill also confirms the plan before writing the workbook", async () => {
  const plan = await chat({
    token: ctx.token,
    content: "Lập bảng Excel dự toán",
    skill: "excel",
    conversationId: ctx.conversationId,
  });
  const planDone = eventsNamed(plan, "done")[0].data;
  assert.equal(eventsNamed(plan, "artifact").length, 0, "lượt lập kế hoạch không được tạo tệp");
  assert.ok(planDone.choices?.length >= 3);

  const createChoice = planDone.choices.find((choice) => choice.id === "create");
  const events = await chat({
    token: ctx.token,
    content: createChoice.value,
    skill: "excel",
    conversationId: ctx.conversationId,
  });
  const results = eventsNamed(events, "tool_result");
  assert.equal(results[0].data.name, "generate_xlsx");
  assert.equal(results[0].data.ok, true);

  const artifact = eventsNamed(events, "artifact")[0].data;
  const response = await apiRaw("GET", `/files/${artifact.id}/content`, undefined, ctx.token);
  const buffer = Buffer.from(await response.arrayBuffer());
  assert.equal(buffer.subarray(0, 2).toString(), "PK");
  assert.match(artifact.name, /\.xlsx$/);
});

test("uploads are validated, listed, downloadable and owned", async () => {
  const uploaded = await uploadFile({
    name: "doanh-thu.csv",
    mime: "text/csv",
    content: CSV,
    token: ctx.token,
    conversationId: ctx.conversationId,
  });
  assert.equal(uploaded.file.kind, "data");
  assert.equal(uploaded.file.size, CSV.length);
  ctx.csvFileId = uploaded.file.id;

  const other = await apiRaw(
    "GET",
    `/files/${ctx.csvFileId}/content`,
    undefined,
    ctx.userToken,
  );
  assert.equal(other.status, 404);

  const blocked = await apiRaw("POST", "/files", undefined, ctx.token);
  assert.ok(blocked.status >= 400);

  const rejected = await (async () => {
    const form = new FormData();
    form.append("file", new Blob(["MZ"], { type: "application/x-msdownload" }), "virus.exe");
    return fetch(`${(await bootServer()).baseUrl}/api/files`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ctx.token}` },
      body: form,
    });
  })();
  assert.equal(rejected.status, 400);
  assert.match((await rejected.json()).error.message, /không hỗ trợ/i);
});

test("the data skill analyses an uploaded CSV and returns tables", async () => {
  const events = await chat({
    token: ctx.token,
    content: "Phân tích dữ liệu trong file này giúp em",
    skill: "data",
    attachments: [ctx.csvFileId],
    conversationId: ctx.conversationId,
  });
  const results = eventsNamed(events, "tool_result");
  assert.equal(results.length, 1);
  assert.equal(results[0].data.name, "analyze_data");
  assert.equal(results[0].data.ok, true, results[0].data.error ?? "");
  assert.equal(results[0].data.data.rowCount, 5);
  assert.equal(results[0].data.data.columnCount, 3);
  assert.ok(Array.isArray(results[0].data.data.tables));
  assert.ok(results[0].data.data.tables.length >= 1);
});

test("toolMode=off never calls a tool even when the prompt asks for one", async () => {
  const events = await chat({
    token: ctx.token,
    content: "Làm slide về bất cứ thứ gì",
    skill: "ppt",
    toolMode: "off",
    conversationId: ctx.conversationId,
  });
  assert.equal(eventsNamed(events, "tool_call").length, 0);
  assert.ok(textOf(events).length > 0);
});

test("the default chat skill still executes a real tool (skill steers, never gates)", async () => {
  // Regression: with skill="chat" the model used to be offered no tools at all,
  // so "làm slide" answered "công cụ không khả dụng" instead of building a deck.
  const events = await chat({
    token: ctx.token,
    content: "Làm slide giúp anh về fBuddy",
    skill: "chat",
    conversationId: ctx.conversationId,
  });
  const results = eventsNamed(events, "tool_result");
  assert.equal(results.length, 1, "mong đợi đúng một tool result");
  assert.equal(results[0].data.name, "generate_pptx");
  assert.equal(results[0].data.ok, true, results[0].data.error ?? results[0].data.summary);
  // In "chat" mode the deck is still proposed first (see confirm.js) — the point
  // of this test is that the tool is *reachable*, not that it writes immediately.
  assert.ok(
    results[0].data.data.needsConfirm === true || eventsNamed(events, "artifact").length === 1,
    "phải đề xuất dàn ý hoặc tạo tệp, không được báo thiếu công cụ",
  );
});

test("a file skill forces the first tool call instead of a prose outline", async () => {
  // Regression: glm-4-flash sometimes answered "đây là dàn ý…" and never called
  // generate_pptx, so the user got text where a .pptx was expected.
  const events = await chat({
    token: ctx.token,
    content: "Làm slide 4 trang về fBuddy giúp anh",
    skill: "ppt",
    conversationId: ctx.conversationId,
  });
  const calls = eventsNamed(events, "tool_call").map((event) => event.data.name);
  assert.ok(calls.length >= 1, `phải gọi công cụ ngay (đã gọi: ${calls.join(", ") || "không"})`);
  assert.ok(calls.includes("generate_pptx"), `công cụ đầu tiên phải là generate_pptx (đã gọi: ${calls.join(", ")})`);
});

test("an unknown tool name yields a helpful error instead of a silent failure", async () => {
  const { executeTool, TOOL_DEFINITIONS } = await import("../src/skills/index.js");
  const result = await executeTool("khong_co_tool_nay", {}, { userId: "u_test", files: [] });
  assert.equal(result.ok, false);
  assert.match(result.summary, /không có công cụ/i);
  assert.ok(TOOL_DEFINITIONS.length >= 5);
});

test("analyze_data actually filters rows (regression: the comparison op lives in op_filter)", async () => {
  const { executeTool } = await import("../src/skills/index.js");
  const me = await api("GET", "/auth/me", undefined, ctx.token);
  const result = await executeTool(
    "analyze_data",
    {
      fileId: ctx.csvFileId,
      operations: [{ op: "filter", column: "khu-vuc", op_filter: "contains", value: "Mien Nam" }],
    },
    { userId: me.user.id, files: [] },
  );
  assert.equal(result.ok, true, result.error ?? "");
  const table = result.data.tables[0];
  assert.equal(table.rows.length, 2);
  assert.ok(table.rows.every((row) => String(row[0]).includes("Mien Nam")));

  // An unsupported comparison operator still fails loudly rather than silently.
  const bad = await executeTool(
    "analyze_data",
    { fileId: ctx.csvFileId, operations: [{ op: "filter", column: "khu-vuc", op_filter: "khong-co", value: "x" }] },
    { userId: me.user.id, files: [] },
  );
  assert.equal(bad.ok, false);
  assert.match(bad.error, /Toán tử lọc/);
});

test("conversations: list, search, pin, duplicate, delete", async () => {
  const list = await api("GET", "/conversations", undefined, ctx.token);
  assert.ok(list.items.length >= 1);

  const search = await api("GET", "/conversations/search?q=Xin%20ch%C3%A0o", undefined, ctx.token);
  assert.ok(search.items.length >= 1);

  const pinned = await api("PATCH", `/conversations/${ctx.conversationId}`, { pinned: true }, ctx.token);
  assert.equal(pinned.conversation.pinned, true);

  const copy = await api("POST", `/conversations/${ctx.conversationId}/duplicate`, {}, ctx.token);
  assert.match(copy.conversation.title, /bản sao/);
  const copyDetail = await api("GET", `/conversations/${copy.conversation.id}`, undefined, ctx.token);
  assert.ok(copyDetail.messages.length >= 2);

  const removed = await api("DELETE", `/conversations/${copy.conversation.id}`, undefined, ctx.token);
  assert.equal(removed.ok, true);
  const missing = await apiRaw("GET", `/conversations/${copy.conversation.id}`, undefined, ctx.token);
  assert.equal(missing.status, 404);
});

test("artifacts list contains everything the assistant generated", async () => {
  const artifacts = await api("GET", "/artifacts", undefined, ctx.token);
  const kinds = artifacts.items.map((a) => a.kind);
  assert.ok(kinds.includes("pptx"));
  assert.ok(kinds.includes("xlsx"));
  assert.ok(artifacts.items.every((a) => a.url.startsWith("/api/files/")));
});

test("MCP servers can be registered and are masked in responses", async () => {
  const created = await api(
    "POST",
    "/settings/mcp",
    {
      name: "Tệp nội bộ",
      transport: "http",
      url: "https://mcp.example.com/mcp",
      headers: { Authorization: "Bearer abc123def456" },
    },
    ctx.token,
  );
  assert.equal(created.server.transport, "http");
  assert.equal(created.server.tools.length, 0);
  assert.ok(!JSON.stringify(created.server).includes("abc123def456"));

  const listed = await api("GET", "/settings/mcp", undefined, ctx.token);
  assert.equal(listed.items.length, 1);
  assert.equal(listed.items[0].headers[0].key, "Authorization");
  assert.equal(listed.items[0].headers[0].hasValue, true);

  // Testing an unreachable server must fail softly (no throw, ok:false).
  const tested = await api("POST", `/settings/mcp/${created.server.id}/test`, {}, ctx.token);
  assert.equal(tested.ok, false);
  assert.ok(typeof tested.message === "string" && tested.message.length > 0);

  const deleted = await api("DELETE", `/settings/mcp/${created.server.id}`, undefined, ctx.token);
  assert.equal(deleted.ok, true);
});

test("skills endpoint describes the four skills and their tools", async () => {
  const skills = await api("GET", "/skills", undefined, ctx.token);
  const ids = skills.items.map((s) => s.id);
  assert.deepEqual(ids, ["chat", "image", "ppt", "excel", "data"]);
  const toolNames = skills.tools.map((t) => t.name);
  for (const name of ["generate_pptx", "generate_xlsx", "analyze_data", "edit_image"]) {
    assert.ok(toolNames.includes(name), `thiếu tool ${name}`);
  }
});

test("admin can disable signup and create users manually", async () => {
  await api("PUT", "/settings/app", { settings: { allowSignup: false } }, ctx.token);
  const blocked = await apiRaw("POST", "/auth/register", {
    email: "late@fbuddy.test",
    password: "matkhau12345",
  });
  assert.equal(blocked.status, 403);

  const created = await api(
    "POST",
    "/admin/users",
    { email: "invited@fbuddy.test", password: "matkhau12345", role: "user" },
    ctx.token,
  );
  assert.equal(created.user.email, "invited@fbuddy.test");

  const stats = await api("GET", "/admin/stats", undefined, ctx.token);
  assert.equal(stats.users, 3);
  await api("PUT", "/settings/app", { settings: { allowSignup: true } }, ctx.token);
});

test("change password invalidates old tokens", async () => {
  const session = await api("POST", "/auth/login", { email: "user@fbuddy.test", password: "matkhau12345" });
  const oldToken = session.token;
  assert.equal((await api("GET", "/auth/me", undefined, oldToken)).user.email, "user@fbuddy.test");

  const changed = await apiRaw(
    "PATCH",
    "/auth/me",
    { currentPassword: "matkhau12345", password: "matkhaumoi123" },
    oldToken,
  );
  assert.equal(changed.status, 200);

  const stale = await apiRaw("GET", "/auth/me", undefined, oldToken);
  assert.equal(stale.status, 401);
  assert.equal((await api("POST", "/auth/login", { email: "user@fbuddy.test", password: "matkhaumoi123" })).user.email, "user@fbuddy.test");
});

test("chat without any enabled provider returns a helpful SSE error", async () => {
  const listed = await api("GET", "/settings/providers", undefined, ctx.token);
  for (const provider of listed.items) {
    await api("PATCH", `/settings/providers/${provider.id}`, { enabled: false }, ctx.token);
  }
  const events = await chat({ token: ctx.token, content: "hello" });
  const errors = eventsNamed(events, "error");
  assert.equal(errors.length, 1);
  assert.match(errors[0].data.message, /Chưa có nhà cung cấp AI nào/);
});

test("rate limiting eventually refuses a burst on the chat route", async () => {
  // A fresh token: the password-change test above invalidated older sessions.
  const session = await api("POST", "/auth/login", {
    email: "user@fbuddy.test",
    password: "matkhaumoi123",
  });
  const responses = [];
  for (let i = 0; i < 62; i += 1) {
    responses.push(await apiRaw("POST", "/chat/stream", { content: "spam" }, session.token));
  }
  assert.ok(
    responses.some((r) => r.status === 429),
    "expected at least one 429 within 62 rapid requests",
  );
  for (const response of responses) {
    if (response.body) await response.body.cancel().catch(() => {});
  }
});
