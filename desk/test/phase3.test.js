import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { api, bootDesk, closeDesk, issueCodeViaAdmin, safeJson, seedOrder, seedUser } from "./helpers.js";

/**
 * Phase 3: proxy Soniox (`WS /v1/desktop/stt`) và tóm tắt (`POST /v1/desktop/summary`).
 *
 * Cả hai nhà cung cấp đều được GIẢ LẬP tại chỗ — không có request nào ra internet,
 * nên test chạy được cả khi mất mạng và không đốt tiền thật.
 */

const SONIOX_KEY = "soniox-test-key-khong-duoc-lo";
const OPENROUTER_KEY = "openrouter-test-key-khong-duoc-lo";

// Đặt TRƯỚC khi import `src/*` (config đọc env) — riêng hạn mức tháng nằm ở helpers.js
// vì đó là giá trị `config` chốt lúc import, còn URL đọc lúc gọi nên đặt đâu cũng được.
process.env.DESK_SONIOX_API_KEY = SONIOX_KEY;
process.env.DESK_OPENROUTER_API_KEY = OPENROUTER_KEY;

/* ------------------------------------------------------------ Soniox giả --- */

const sonioxConfigs = [];
const sonioxAudio = [];
let sonioxSocket = null;

const fakeSoniox = http.createServer();
const sonioxWss = new WebSocketServer({ server: fakeSoniox });
sonioxWss.on("connection", (socket) => {
  sonioxSocket = socket;
  const chunks = [];
  socket.on("message", (data, isBinary) => {
    if (isBinary) {
      sonioxAudio.push(Buffer.from(data));
      return;
    }
    const text = data.toString("utf8");
    if (text.trim() === "") return;
    chunks.push(text);
    const parsed = safeJson(text);
    if (parsed) sonioxConfigs.push(parsed);
    // Trả về một khung token giống Soniox thật, kèm cả key để test việc che key.
    socket.send(
      JSON.stringify({
        tokens: [
          { text: "xin ", is_final: true },
          { text: "chào", is_final: false },
        ],
        echo_secret: SONIOX_KEY,
      }),
    );
  });
});
await new Promise((resolve) => fakeSoniox.listen(0, "127.0.0.1", resolve));
process.env.DESK_SONIOX_WS = `ws://127.0.0.1:${fakeSoniox.address().port}/transcribe-websocket`;

/* -------------------------------------------------------- OpenRouter giả --- */

const openrouterRequests = [];
const fakeOpenRouter = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    const body = safeJson(Buffer.concat(chunks).toString("utf8"));
    openrouterRequests.push({ auth: req.headers.authorization ?? null, body });
    const payload = JSON.stringify({
      model: "fake/model",
      choices: [{ message: { role: "assistant", content: '{"meetingTitle":"Họp thử"}' } }],
      usage: { total_tokens: 1234 },
    });
    res.writeHead(200, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) });
    res.end(payload);
  });
});
await new Promise((resolve) => fakeOpenRouter.listen(0, "127.0.0.1", resolve));
process.env.DESK_OPENROUTER_URL = `http://127.0.0.1:${fakeOpenRouter.address().port}/chat/completions`;

/* ------------------------------------------------------------------ setup -- */

seedUser({ id: "u_stt", email: "stt@example.com", name: "Khách STT" });
seedOrder({ id: "ord_stt", userId: "u_stt", status: "paid" });

const { baseUrl } = await bootDesk();
const { run, all, initDb } = await import("../src/db.js");
initDb();

const issuedStt = await issueCodeViaAdmin({ userId: "u_stt", orderId: "ord_stt", ip: "10.5.0.1" });
const activation = await api("POST", "/v1/desktop/activate", { code: issuedStt.code, deviceId: "may-stt" }, { ip: "10.5.0.1" });
assert.equal(activation.status, 200);
const TOKEN = activation.json.token;

const openClients = new Set();

test.after(async () => {
  for (const ws of openClients) {
    try {
      ws.terminate();
    } catch {
      /* đã đóng */
    }
  }
  openClients.clear();
  await closeDesk();
  // Socket phía desk→Soniox giả cũng phải cắt, nếu không `close()` chờ vô hạn.
  for (const socket of sonioxWss.clients) {
    try {
      socket.terminate();
    } catch {
      /* đã đóng */
    }
  }
  await new Promise((resolve) => sonioxWss.close(resolve));
  fakeSoniox.closeAllConnections?.();
  await new Promise((resolve) => fakeSoniox.close(resolve));
  fakeOpenRouter.closeAllConnections?.();
  await new Promise((resolve) => fakeOpenRouter.close(resolve));
});

/* -------------------------------------------------------------- tiện ích --- */

/** Mở WebSocket tới service và trả về `{ ws, messages, closed }`. */
function openStt({ token = TOKEN, path = "/v1/desktop/stt" } = {}) {
  const url = `${baseUrl.replace("http://", "ws://")}${path}${token ? `?token=${encodeURIComponent(token)}` : ""}`;
  const ws = new WebSocket(url);
  openClients.add(ws);
  const messages = [];
  let closed = null;
  const closedPromise = new Promise((resolve) => {
    ws.on("close", (code, reason) => {
      closed = { code, reason: reason.toString() };
      resolve(closed);
    });
  });
  ws.on("message", (data, isBinary) => messages.push(isBinary ? Buffer.from(data) : data.toString("utf8")));
  return { ws, messages, closedPromise, closed: () => closed };
}

/** Hỏi thẳng mã HTTP của một lần nâng cấp giao thức (không dùng WebSocket client). */
function upgradeStatus(path) {
  return new Promise((resolve, reject) => {
    const { port } = new URL(baseUrl);
    const req = http.request({
      host: "127.0.0.1",
      port,
      path,
      headers: {
        Connection: "Upgrade",
        Upgrade: "websocket",
        "Sec-WebSocket-Version": "13",
        "Sec-WebSocket-Key": Buffer.from("0123456789abcdef").toString("base64"),
        "x-forwarded-for": "10.5.9.9",
      },
    });
    req.on("response", (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on("upgrade", () => resolve(101));
    req.on("error", reject);
    req.end();
  });
}

/** Chờ WebSocket mở, có timeout và lỗi rõ ràng (không treo test). */
function waitForOpen(ws, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("WebSocket không mở được trong thời gian cho phép")), timeoutMs);
    const done = (fn, arg) => {
      clearTimeout(timer);
      fn(arg);
    };
    ws.on("open", () => done(resolve));
    ws.on("error", (err) => done(reject, new Error(`WebSocket lỗi: ${err?.message ?? err}`)));
    ws.on("unexpected-response", (_req, res) => done(reject, new Error(`WebSocket bị từ chối: HTTP ${res.statusCode}`)));
  });
}

function waitFor(predicate, timeoutMs = 3000) {
  const started = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      if (predicate()) return resolve(true);
      if (Date.now() - started > timeoutMs) return resolve(false);
      setTimeout(tick, 20);
    };
    tick();
  });
}

/* ------------------------------------------------------------------ tests -- */

test("WS không có token ⇒ HTTP 401 trước khi nâng cấp giao thức", async () => {
  assert.equal(await upgradeStatus("/v1/desktop/stt"), 401);
});

test("WS token rác ⇒ 401", async () => {
  assert.equal(await upgradeStatus("/v1/desktop/stt?token=rac.rac"), 401);
});

test("WS đường dẫn khác ⇒ 404", async () => {
  assert.equal(await upgradeStatus("/v1/desktop/khong-phai-stt"), 404);
});

test("proxy: bỏ api_key của client, chèn key thật, chuyển audio và token về app", async () => {
  const client = openStt();
  await waitForOpen(client.ws);
  client.ws.send(
    JSON.stringify({
      api_key: "key-gia-cua-client",
      model: "stt-rt-v5",
      audio_format: "pcm_s16le",
      sample_rate: 16000,
      num_channels: 1,
      translation: { type: "one_way", target_language: "en" },
    }),
  );
  const configured = await waitFor(() => sonioxConfigs.length > 0);
  assert.equal(configured, true, "Soniox giả phải nhận được cấu hình");

  const sent = sonioxConfigs.at(-1);
  assert.equal(sent.api_key, SONIOX_KEY, "key thật của server phải được chèn vào");
  assert.equal(JSON.stringify(sent).includes("key-gia-cua-client"), false, "key client gửi không được chuyển tiếp");
  assert.equal(sent.translation.target_language, "en");
  assert.equal(sent.sample_rate, 16000);

  const audio = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]);
  client.ws.send(audio);
  assert.equal(await waitFor(() => sonioxAudio.length > 0), true, "audio phải tới Soniox");
  assert.deepEqual(sonioxAudio.at(-1), audio);

  assert.equal(await waitFor(() => client.messages.length > 0), true, "token phải trả về app");
  const tokenFrame = safeJson(client.messages.find((message) => typeof message === "string" && message.includes("tokens")));
  assert.equal(tokenFrame.tokens[0].text, "xin ");
  assert.equal(client.messages.join("").includes(SONIOX_KEY), false, "key không bao giờ được lộ ra client");
  assert.equal(client.messages.join("").includes("[redacted]"), true, "chuỗi chứa key phải bị che");

  client.ws.close();
  await client.closedPromise;
});

test("khung TEXT thứ hai (khác rỗng) bị từ chối ⇒ đóng 1008", async () => {
  const client = openStt();
  await waitForOpen(client.ws);
  client.ws.send(JSON.stringify({ audio_format: "pcm_s16le" }));
  await waitFor(() => client.messages.length > 0 || client.closed());
  client.ws.send(JSON.stringify({ api_key: "lai-thu-gui-key" }));
  const closed = await client.closedPromise;
  assert.equal(closed.code, 1008);
});

test("đóng phiên ⇒ ghi mức dùng để tính hạn mức tháng", async () => {
  const before = all("SELECT * FROM desk_usage WHERE user_id = ? AND kind = 'stt'", "u_stt").length;
  const client = openStt();
  await waitForOpen(client.ws);
  client.ws.send(JSON.stringify({ audio_format: "pcm_s16le", sample_rate: 16000 }));
  await waitFor(() => sonioxConfigs.length > 0);
  client.ws.send(Buffer.alloc(3200));
  await new Promise((resolve) => setTimeout(resolve, 250));
  client.ws.close();
  await client.closedPromise;

  const recorded = await waitFor(() => all("SELECT * FROM desk_usage WHERE user_id = ? AND kind = 'stt'", "u_stt").length > before);
  assert.equal(recorded, true, "phải có dòng desk_usage cho phiên STT");
  const rows = all("SELECT * FROM desk_usage WHERE user_id = ? AND kind = 'stt'", "u_stt");
  assert.equal(rows.at(-1).bytes > 0, true);
});

test("activation bị thu hồi ⇒ WS bị từ chối 401", async () => {
  const issued = await issueCodeViaAdmin({ userId: "u_stt", orderId: "ord_stt", ip: "10.5.0.2" });
  const fresh = await api("POST", "/v1/desktop/activate", { code: issued.code, deviceId: "may-thu-hoi" }, { ip: "10.5.0.2" });
  assert.equal(fresh.status, 200);
  const { revokeActivation } = await import("../src/sessions.js");
  revokeActivation({ id: fresh.json.activationId, reason: "test" });
  assert.equal(await upgradeStatus(`/v1/desktop/stt?token=${encodeURIComponent(fresh.json.token)}`), 401);
});

test("quá hạn mức tháng ⇒ chặn mở phiên (429)", async () => {
  // Hạn mức test = 1 phút; ghi 90 giây sử dụng là vượt.
  run(
    `INSERT INTO desk_usage (id, user_id, activation_id, kind, seconds, bytes, tokens, created_at)
     VALUES (?, ?, ?, 'stt', 90, 0, 0, ?)`,
    "use_test_quota",
    "u_stt",
    null,
    new Date().toISOString(),
  );
  assert.equal(await upgradeStatus(`/v1/desktop/stt?token=${encodeURIComponent(TOKEN)}`), 429);
  const summary = await api(
    "POST",
    "/v1/desktop/summary",
    { messages: [{ role: "user", content: "tóm tắt" }] },
    { token: TOKEN, ip: "10.5.0.3" },
  );
  assert.equal(summary.status, 403);
  assert.equal(summary.json.code, "quota_exceeded");
});

test("POST /v1/desktop/summary: key ở server, model do server chọn, token được ghi lại", async () => {
  // Bỏ dòng vượt hạn mức để test này chạy được.
  run("DELETE FROM desk_usage WHERE id = 'use_test_quota'");
  const result = await api(
    "POST",
    "/v1/desktop/summary",
    {
      model: "model-dat-tien-cua-client",
      messages: [
        { role: "system", content: "Bạn soạn biên bản họp." },
        { role: "user", content: "Nội dung cuộc họp..." },
      ],
      temperature: 0.2,
      max_tokens: 4096,
      response_format: { type: "json_object" },
    },
    { token: TOKEN, ip: "10.5.0.4" },
  );
  assert.equal(result.status, 200);
  assert.equal(result.json.content, '{"meetingTitle":"Họp thử"}');
  assert.equal(result.json.usage.tokens, 1234);
  assert.equal(result.text.includes(OPENROUTER_KEY), false, "key không được lộ ra client");

  const sent = openrouterRequests.at(-1);
  assert.equal(sent.auth, `Bearer ${OPENROUTER_KEY}`);
  assert.equal(sent.body.model !== "model-dat-tien-cua-client", true, "client không được tự chọn model");
  assert.equal(sent.body.stream, false);
  assert.deepEqual(sent.body.response_format, { type: "json_object" });

  const rows = all("SELECT * FROM desk_usage WHERE user_id = ? AND kind = 'summary'", "u_stt");
  assert.equal(rows.length >= 1, true);
  assert.equal(rows.at(-1).tokens, 1234);
});

test("summary: payload quá lớn ⇒ 400", async () => {
  // `config.maxSummaryChars` chốt lúc import nên phải gửi payload thật sự vượt trần.
  const huge = "x".repeat(200_001);
  const result = await api(
    "POST",
    "/v1/desktop/summary",
    { messages: [{ role: "user", content: huge }] },
    { token: TOKEN, ip: "10.5.0.5" },
  );
  assert.equal(result.status, 400);
  assert.equal(result.json.code, "bad_request");
});

test("summary: thiếu key nhà cung cấp ⇒ 503 (không lộ chi tiết nội bộ)", async () => {
  const saved = process.env.DESK_OPENROUTER_API_KEY;
  delete process.env.DESK_OPENROUTER_API_KEY;
  try {
    const result = await api(
      "POST",
      "/v1/desktop/summary",
      { messages: [{ role: "user", content: "x" }] },
      { token: TOKEN, ip: "10.5.0.6" },
    );
    assert.equal(result.status, 503);
    assert.equal(result.json.code, "provider_not_configured");
  } finally {
    process.env.DESK_OPENROUTER_API_KEY = saved;
  }
});

test("summary: yêu cầu đăng nhập bằng token phiên", async () => {
  const result = await api("POST", "/v1/desktop/summary", { messages: [] }, { ip: "10.5.0.7" });
  assert.equal(result.status, 401);
});
