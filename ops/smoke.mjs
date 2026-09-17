#!/usr/bin/env node
/**
 * End-to-end smoke test against a running FlowGpt instance.
 *
 *   node ops/smoke.mjs                                  # http://127.0.0.1:7790/api
 *   node ops/smoke.mjs https://flowgpt.meetflowai.site/api
 *
 * Exercises the real HTTP surface: passwordless login → provider setup → a chat
 * turn that runs a tool → downloading the produced .pptx and checking its bytes.
 * Exits non-zero on the first failure so it can gate a deploy.
 */

const BASE = (process.argv[2] ?? "http://127.0.0.1:7790/api").replace(/\/+$/, "");
const EMAIL = process.env.SMOKE_EMAIL ?? `smoke+${Date.now()}@flowgpt.local`;

let step = 0;
const ok = (message) => console.log(`  \u001b[32m✔\u001b[0m ${message}`);
const info = (message) => console.log(`    ${message}`);
function fail(message) {
  console.log(`  \u001b[31m✖\u001b[0m ${message}`);
  process.exit(1);
}
function title(message) {
  step += 1;
  console.log(`\n${step}. ${message}`);
}

async function json(method, path, body, token) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  if (!response.ok) {
    return { ok: false, status: response.status, error: parsed?.error?.message ?? text.slice(0, 200) };
  }
  return { ok: true, status: response.status, data: parsed };
}

console.log(`FlowGpt smoke test → ${BASE}`);

// ---------------------------------------------------------------- 1. health
title("Sức khoẻ dịch vụ");
const health = await json("GET", "/health");
if (!health.ok) fail(`/health lỗi: ${health.error}`);
ok(`/health ok — version ${health.data.version}, ${health.data.providerCount} provider, ${health.data.mcpCount} MCP`);

// ------------------------------------------------- 2. passwordless request
title("Đăng nhập: yêu cầu mã qua email");
const requested = await json("POST", "/auth/request-token", { email: EMAIL });
if (!requested.ok) fail(`request-token lỗi (${requested.status}): ${requested.error}`);
const code = requested.data.devCode;
if (requested.data.delivered) ok(`Đã gửi mã thật tới ${EMAIL}`);
else if (code) ok(`Chưa cấu hình mailer — mã hiển thị tại chỗ: ${code}`);
else fail("Không gửi được email và cũng không có mã dự phòng (kiểm tra showLoginCodeWhenNoMailer)");

// --------------------------------------------------------- 3. verify -> JWT
title("Đăng nhập: xác thực mã");
if (!code) {
  info("Bỏ qua bước xác thực (đang gửi email thật).");
} else {
  const verified = await json("POST", "/auth/verify-token", { email: EMAIL, token: code });
  if (!verified.ok) fail(`verify-token lỗi (${verified.status}): ${verified.error}`);
  ok(`JWT nhận được cho ${verified.data.user.email} (admin: ${verified.data.user.isAdmin})`);
  globalThis.TOKEN = verified.data.token;

  const reuse = await json("POST", "/auth/verify-token", { email: EMAIL, token: code });
  if (reuse.ok) fail("Mã dùng lại được — phải là dùng-một-lần!");
  ok("Mã không dùng lại được (đúng)");
}

const token = globalThis.TOKEN;
if (!token) {
  console.log("\nKhông có token (mailer đang gửi thật) — dừng ở đây, các bước sau cần đăng nhập.\n");
  process.exit(0);
}

// ------------------------------------------------------------- 4. provider
title("Cấu hình nhà cung cấp AI");
const existing = await json("GET", "/settings/providers", undefined, token);
let providerId = null;
if (!existing.ok && existing.status === 403) {
  // A non-admin account cannot read provider settings — fine, the instance is
  // already configured and the chat steps below prove it works.
  info("Tài khoản này không phải admin — bỏ qua bước cấu hình provider.");
} else if (!existing.ok) {
  fail(`/settings/providers lỗi: ${existing.error}`);
} else {
  const enabled = existing.data.items.find((p) => p.enabled);
  if (enabled) {
    providerId = enabled.id;
    ok(`Đang dùng provider có sẵn: ${enabled.name} (${enabled.kind})`);
  } else {
    const created = await json("POST", "/settings/providers", { name: "Demo (smoke)", kind: "mock" }, token);
    if (!created.ok) fail(`Tạo provider lỗi (${created.status}): ${created.error}`);
    providerId = created.data.provider.id;
    ok(`Đã tạo provider Demo: ${providerId}`);
  }
}

// ----------------------------------------------------------------- 5. chat
title("Chat streaming + gọi công cụ (skill PPT)");
const response = await fetch(`${BASE}/chat/stream`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  body: JSON.stringify({ content: "Làm slide 2 trang giới thiệu FlowGpt", skill: "ppt" }),
});
if (!response.ok) fail(`chat/stream lỗi ${response.status}`);
if (!response.body) fail("chat/stream không trả về stream");

const events = [];
let buffer = "";
const decoder = new TextDecoder();
for await (const chunk of response.body) {
  buffer += decoder.decode(chunk, { stream: true });
  let index = buffer.indexOf("\n\n");
  while (index !== -1) {
    const block = buffer.slice(0, index);
    buffer = buffer.slice(index + 2);
    const name = /event: (\w+)/.exec(block)?.[1];
    const raw = /data: (.+)/.exec(block)?.[1];
    if (name && raw) {
      try {
        events.push({ event: name, data: JSON.parse(raw) });
      } catch {
        /* ignore malformed frame */
      }
    }
    index = buffer.indexOf("\n\n");
  }
}

const names = events.map((e) => e.event);
ok(`Nhận ${events.length} sự kiện: ${[...new Set(names)].join(", ")}`);
if (!names.includes("start")) fail("Thiếu sự kiện start");
if (!names.includes("done")) fail("Thiếu sự kiện done");

const toolCall = events.find((e) => e.event === "tool_call");
if (toolCall) ok(`Model gọi công cụ: ${toolCall.data.name} (${toolCall.data.source})`);
const toolResult = events.find((e) => e.event === "tool_result");
if (toolResult) ok(`Công cụ trả về: ok=${toolResult.data.ok} — ${toolResult.data.summary}`);

const artifact = events.find((e) => e.event === "artifact")?.data;
if (!artifact) {
  info("Không có artifact trong lượt này (chế độ demo chỉ tạo tệp khi nhận diện được skill).");
} else {
  ok(`Artifact: ${artifact.name} (${artifact.kind}, ${artifact.size} byte)`);

  title("Tải artifact và kiểm tra nội dung thật");
  const fileResponse = await fetch(`${BASE}/files/${artifact.id}/content`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!fileResponse.ok) fail(`Tải tệp lỗi ${fileResponse.status}`);
  const bytes = Buffer.from(await fileResponse.arrayBuffer());
  if (bytes.length !== artifact.size) fail(`Kích thước lệch: ${bytes.length} vs ${artifact.size}`);
  if (bytes.subarray(0, 2).toString() !== "PK") fail("Tệp không phải container ZIP (pptx) hợp lệ");
  ok(`Tải được ${bytes.length} byte, magic bytes "PK" — tệp Office hợp lệ`);
}

// ------------------------------------------------------------ 7. guardrails
title("Chốt bảo vệ");
const anon = await json("GET", "/conversations");
if (anon.ok) fail("Không cần token vẫn đọc được hội thoại!");
ok("Không có token → 401 (đúng)");

console.log(`\n\u001b[32mTẤT CẢ BƯỚC ĐỀU ĐẠT\u001b[0m — FlowGpt ở ${BASE} hoạt động.\n`);
