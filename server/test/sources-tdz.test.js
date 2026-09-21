// Chặn tái phát BUG-20260920-005: `Cannot access 'sources' before initialization`.
//
// Lỗi chỉ nổ ở lượt CÓ tra cứu (autoResearch có findings) nên trông như "thỉnh thoảng mới lỗi".
// Test này chạy THẬT một lượt như vậy qua `runChatTurn` với provider mock ⇒ nếu ai đó lại đặt
// khối dùng `sources` lên trước dòng khai báo, test đỏ ngay.
import "./helpers.js";
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { closeServer } from "./helpers.js";

const { initDb, all } = await import("../src/db.js");
initDb();
const { createUser } = await import("../src/auth.js");
const { grantCredits } = await import("../src/credits.js");
const { createConversation } = await import("../src/chat-store.js");
const settings = await import("../src/settings.js");
const { runChatTurn } = await import("../src/agent.js");
const { formatSourcesBlock } = await import("../src/agent.js");

after(async () => { await closeServer(); });

function mockProvider() {
  const existing = settings.listProviders().find((p) => p.kind === "mock");
  if (existing) return settings.resolveProviderForChat({ providerId: existing.id });
  const created = settings.createProvider({ name: "Demo TDZ", kind: "mock", models: ["fbuddy-demo"], apiKey: "x" });
  return settings.resolveProviderForChat({ providerId: created.id });
}

test("lượt CÓ kết quả tra cứu chạy được (không lỗi TDZ) và gắn khối nguồn", async () => {
  const user = createUser({ email: `tdz${Date.now()}@fbuddy.test`, password: "matkhau12345", name: "TDZ" });
  grantCredits({ userId: user.id, amount: 5000 });
  const conversation = createConversation({ userId: user.id, title: "tdz" });
  const { provider, model } = mockProvider();

  const sent = [];
  const channel = { send: (event, data) => sent.push({ event, data }), close() {}, onClose() {}, get closed() { return false; } };

  const turn = {
    settings: settings.readAppSettings(),
    skill: "chat",
    hubSkill: null,
    content: "giá vàng hôm nay bao nhiêu",
    provider,
    model,
    conversation,
    userMessage: "giá vàng hôm nay bao nhiêu",
    files: [],
    forceTool: false,
    forceToolName: null,
    planFirst: false,
    // Đúng hình dạng dữ liệu mà `maybePreResearch` trả về khi tra được nguồn.
    autoResearch: {
      researcher: "tai-chinh",
      label: "Tài chính",
      confidence: "medium",
      text: "KẾT QUẢ TRA CỨU …",
      findings: [{ title: "Giá vàng SJC", url: "https://giavang.com.vn/gia-vang-sjc/" }],
    },
  };

  const result = await runChatTurn({ user: { ...user, isAdmin: true }, turn, channel, signal: new AbortController().signal });
  assert.ok(result?.messageId, "lượt phải chạy xong và trả về messageId");

  const row = all("messages", "id = ?", [result.messageId])[0];
  assert.ok(row, "tin nhắn trợ lý phải được lưu");
  assert.match(row.content, /Nguồn tra cứu/, "phải có khối nguồn");
  assert.match(row.content, /giavang\.com\.vn/, "phải nêu URL nguồn đã tra");
  assert.match(row.content, /đang hỏi chuyên gia tra cứu/, "phải báo ngay là đang hỏi chuyên gia");
  assert.equal((row.content.match(/chuyên gia tra cứu/g) ?? []).length, 1, "lời báo chỉ được xuất hiện MỘT lần");
  const done = sent.find((e) => e.event === "done");
  assert.ok(done?.data?.sources?.length, "sự kiện done phải kèm danh sách nguồn");
  assert.equal(formatSourcesBlock([{ kind: "web", label: "x", url: "https://x.vn" }]).includes("https://x.vn"), true);
});
