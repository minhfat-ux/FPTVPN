import test from "node:test";
import assert from "node:assert/strict";
import {
  MUTATING_COMMANDS,
  READ_ONLY_COMMANDS,
  RESTARTABLE_SERVICES,
  TASK_STATUSES,
  buildChatPrompt,
  chatHelpText,
  chatPreamble,
  chunkMessage,
  confirmationPrompt,
  formatDuration,
  helpText,
  isAllowedChat,
  needsConfirmation,
  parseCallback,
  parseChatArgs,
  parseCommand,
  reportTasks,
  telegramCallTimeoutMs,
  trimChatHistory,
} from "../src/tg-commands.js";

test("isAllowedChat: chỉ đúng chat id trong whitelist", () => {
  const allow = ["8579321658"];
  assert.equal(isAllowedChat("8579321658", allow), true);
  assert.equal(isAllowedChat(8579321658, allow), true, "số cũng phải khớp");
  assert.equal(isAllowedChat("123", allow), false);
  assert.equal(isAllowedChat("", allow), false);
  assert.equal(isAllowedChat("8579321658", []), false, "whitelist rỗng ⇒ không ai được lệnh");
});

test("parseCommand: nhận có/không dấu /, bỏ @tênbot, tách tham số", () => {
  assert.deepEqual(parseCommand("/status"), { name: "status", args: [], mutating: false });
  assert.deepEqual(parseCommand("status"), { name: "status", args: [], mutating: false });
  assert.deepEqual(parseCommand("/log@VPNFlowBot cp 20"), { name: "log", args: ["cp", "20"], mutating: false });
  assert.deepEqual(parseCommand("/restart cp"), { name: "restart", args: ["cp"], mutating: true });
  assert.deepEqual(parseCommand(""), { name: "help", args: [], mutating: false });
});

test("parseCommand: lệnh lạ ⇒ unknown (không đoán bừa)", () => {
  const parsed = parseCommand("/rm -rf /");
  assert.equal(parsed.name, "unknown");
  assert.equal(parsed.unknown, "rm");
  assert.equal(parsed.mutating, false);
});

test("lệnh đổi trạng thái luôn nằm trong MUTATING_COMMANDS và cần xác nhận", () => {
  for (const name of MUTATING_COMMANDS) {
    const parsed = parseCommand(`/${name}`);
    assert.equal(parsed.mutating, true, `${name} phải được coi là lệnh thay đổi`);
    assert.equal(needsConfirmation(parsed), true, `${name} phải cần xác nhận`);
  }
  const readOnly = parseCommand("/status");
  assert.equal(needsConfirmation(readOnly), false);
  assert.equal(needsConfirmation(parseCommand("/restart cp"), { force: true }), false, "sau khi bấm Xác nhận thì chạy thẳng");
});

test("confirmationPrompt: có nút Xác nhận/Huỷ và callback_data đúng định dạng", () => {
  const prompt = confirmationPrompt(parseCommand("/restart cp"));
  assert.match(prompt.text, /restart cp/);
  assert.equal(prompt.text.includes("*"), false, "prompt gửi không parse_mode ⇒ không dùng *");
  const buttons = prompt.buttons.flat();
  assert.equal(buttons[0].callback_data, "ok:restart:cp");
  assert.equal(buttons[1].callback_data, "cancel");
});

test("/task là lệnh thay đổi và nút xác nhận không nhét nội dung vào callback_data (giới hạn 64 byte)", () => {
  const parsed = parseCommand("/task kiểm tra vì sao node-2 nhiều peer mà ít online trong 3 tiếng gần đây");
  assert.equal(parsed.name, "task");
  assert.equal(parsed.mutating, true);
  const prompt = confirmationPrompt(parsed);
  const confirm = prompt.buttons.flat().find((b) => b.callback_data !== "cancel");
  assert.equal(confirm.callback_data, "oktask", "callback phải ngắn, không mang nội dung việc");
  assert.ok(confirm.callback_data.length <= 64);
  assert.match(prompt.text, /node-2 nhiều peer/, "nội dung việc hiện trong tin xác nhận");
  assert.deepEqual(parseCallback("oktask"), { action: "confirm", name: "task", args: [] });
});

test("parseCallback: đọc được nút xác nhận và huỷ", () => {
  assert.deepEqual(parseCallback("ok:restart:cp"), { action: "confirm", name: "restart", args: ["cp"] });
  assert.deepEqual(parseCallback("ok:mirror"), { action: "confirm", name: "mirror", args: [] });
  assert.deepEqual(parseCallback("cancel"), { action: "cancel" });
  assert.deepEqual(parseCallback("ok:restart;rm -rf /"), { action: "unknown" }, "không nhận callback lạ");
});

test("/build là lệnh đọc (chạy test), /deploy là lệnh thay đổi (phải xác nhận)", () => {
  assert.equal(parseCommand("/build").mutating, false);
  assert.equal(needsConfirmation(parseCommand("/build")), false);
  const deploy = parseCommand("/deploy");
  assert.equal(deploy.name, "deploy");
  assert.equal(deploy.mutating, true);
  assert.equal(needsConfirmation(deploy), true);
  assert.match(helpText(), /\/build/);
  assert.match(helpText(), /\/deploy/);
});

test("RESTARTABLE_SERVICES: danh sách trắng cố định, không nhận tên service tuỳ ý", () => {
  assert.equal(RESTARTABLE_SERVICES.cp, "flowvpn-cp.service");
  assert.equal(RESTARTABLE_SERVICES["rm -rf /"], undefined);
  assert.equal(Object.keys(RESTARTABLE_SERVICES).length, 4);
});

test("helpText: liệt kê đủ nhóm lệnh, không dùng Markdown dễ vỡ", () => {
  const text = helpText();
  assert.match(text, /\/status/);
  assert.match(text, /\/restart cp/);
  assert.match(text, /\/task/);
  assert.match(text, /\/chat/);
  assert.equal(text.includes("*"), false, "không dùng * để tránh vỡ parse_mode");
});

test("/chat là lệnh đọc: không cần xác nhận, vẫn tách được câu hỏi nhiều chữ", () => {
  const parsed = parseCommand("/chat giá vàng hôm nay");
  assert.equal(parsed.name, "chat");
  assert.deepEqual(parsed.args, ["giá", "vàng", "hôm", "nay"]);
  assert.equal(parsed.mutating, false);
  assert.equal(needsConfirmation(parsed), false);
});

test("parseChatArgs: help / reset / on / off / câu hỏi", () => {
  assert.deepEqual(parseChatArgs([]), { kind: "help" });
  assert.deepEqual(parseChatArgs(["reset"]), { kind: "reset" });
  assert.deepEqual(parseChatArgs(["clear"]), { kind: "reset" });
  assert.deepEqual(parseChatArgs(["on"]), { kind: "on" });
  assert.deepEqual(parseChatArgs(["off"]), { kind: "off" });
  assert.deepEqual(parseChatArgs(["xin", "chào"]), { kind: "message", text: "xin chào" });
  // "on the internet" không được hiểu nhầm thành bật chế độ chat.
  assert.deepEqual(parseChatArgs(["on", "the", "internet"]), { kind: "message", text: "on the internet" });
});

test("trimChatHistory: giữ lượt gần nhất, bỏ lượt rỗng, đúng thứ tự", () => {
  const history = [
    { role: "user", content: "câu 1" },
    { role: "assistant", content: "đáp 1" },
    { role: "user", content: "  " },
    { role: "assistant", content: "đáp 2" },
  ];
  const out = trimChatHistory(history, { maxTurns: 3, maxChars: 1000 });
  assert.deepEqual(out, [
    { role: "assistant", content: "đáp 1" },
    { role: "assistant", content: "đáp 2" },
  ]);
  assert.equal(trimChatHistory(null).length, 0);
});

test("trimChatHistory: tôn trọng maxChars (bỏ lượt cũ khi quá dài)", () => {
  const history = [
    { role: "user", content: "a".repeat(50) },
    { role: "assistant", content: "b".repeat(50) },
    { role: "user", content: "c".repeat(50) },
  ];
  const out = trimChatHistory(history, { maxTurns: 10, maxChars: 120 });
  assert.equal(out.length, 2, "chỉ giữ 2 lượt gần nhất vừa 120 ký tự");
  assert.equal(out[out.length - 1].content, "c".repeat(50));
});

test("chatPreamble: cho phép tra internet nhưng cấm thay đổi hệ thống", () => {
  const text = chatPreamble();
  assert.match(text, /web_search|tìm kiếm internet/);
  assert.match(text, /KHÔNG (sửa|chạy)/);
});

test("buildChatPrompt: có tiền tố, lịch sử trước và câu hỏi mới", () => {
  const prompt = buildChatPrompt(
    [
      { role: "user", content: "thời tiết Hà Nội" },
      { role: "assistant", content: "Hôm nay 30 độ." },
    ],
    "còn ngày mai?",
  );
  assert.match(prompt, /CHẾ ĐỘ CHAT/);
  assert.match(prompt, /Hội thoại trước/);
  assert.match(prompt, /Anh: thời tiết Hà Nội/);
  assert.match(prompt, /Trợ lý: Hôm nay 30 độ\./);
  assert.match(prompt, /Anh: còn ngày mai\?/);
});

test("chatHelpText: hướng dẫn rõ /chat và các lệnh con", () => {
  const text = chatHelpText();
  assert.match(text, /\/chat </);
  assert.match(text, /\/chat on/);
  assert.match(text, /\/chat off/);
  assert.match(text, /\/chat reset/);
});

test("/reporttasks là lệnh đọc: nhận cả camelCase, không cần xác nhận", () => {
  for (const text of ["/reporttasks", "/reportTasks", "reporttasks", "/tasks"]) {
    const parsed = parseCommand(text);
    assert.equal(parsed.mutating, false, `${text} không được là lệnh thay đổi`);
    assert.equal(needsConfirmation(parsed), false, `${text} không cần xác nhận`);
  }
  assert.equal(parseCommand("/reportTasks").name, "reporttasks");
  assert.ok(READ_ONLY_COMMANDS.includes("reporttasks"));
  assert.ok(!MUTATING_COMMANDS.includes("reporttasks"));
});

test("helpText: có nhắc /reporttasks", () => {
  const text = helpText();
  assert.match(text, /\/reporttasks/);
  assert.equal(text.includes("*"), false);
});

test("formatDuration: giây / phút / giờ", () => {
  assert.equal(formatDuration(0), "0s");
  assert.equal(formatDuration(45_000), "45s");
  assert.equal(formatDuration(65_000), "1m05s");
  assert.equal(formatDuration(3_600_000 + 7 * 60_000), "1h07m");
  assert.equal(formatDuration(-5), "0s", "số âm coi như 0");
});

test("reportTasks: sổ rỗng thì nói rõ chưa có việc", () => {
  const text = reportTasks([]);
  assert.match(text, /Chưa có việc agent/);
  assert.match(reportTasks(null), /Chưa có việc agent/);
});

test("reportTasks: việc đang chạy lên đầu, kèm thời gian và nhãn", () => {
  const now = 1_000_000;
  const tasks = [
    { id: 1, kind: "task", prompt: "việc cũ đã xong", status: "done", startedAt: now - 120_000, endedAt: now - 60_000 },
    { id: 2, kind: "task", prompt: "việc đang chạy dở", status: "running", startedAt: now - 30_000 },
  ];
  const text = reportTasks(tasks, { now });
  const lines = text.split("\n");
  assert.match(lines[0], /1 đang chạy \/ 2 gần đây/);
  assert.match(lines[1], /#2/);
  assert.match(lines[1], /30s/);
  assert.match(lines[2], /#1/);
  assert.match(lines[2], /1m00s/);
  assert.ok(lines[1].includes(TASK_STATUSES.running));
  assert.ok(lines[2].includes(TASK_STATUSES.done));
});

test("reportTasks: việc lỗi hiện lý do, không hiện lý do cho việc xong", () => {
  const now = 2_000_000;
  const tasks = [
    { id: 9, kind: "task", prompt: "việc lỗi", status: "failed", startedAt: now - 5_000, endedAt: now, error: "exit code 1" },
    { id: 8, kind: "task", prompt: "việc xong", status: "done", startedAt: now - 5_000, endedAt: now, error: "rác" },
  ];
  const text = reportTasks(tasks, { now });
  assert.match(text, /↳ exit code 1/);
  assert.equal(text.includes("↳ rác"), false);
});

test("reportTasks: tôn trọng limit và báo số việc cũ hơn", () => {
  const now = 3_000_000;
  const tasks = Array.from({ length: 5 }, (_, i) => ({
    id: i + 1, prompt: `việc ${i + 1}`, status: "done", startedAt: now - (5 - i) * 1000, endedAt: now,
  }));
  const text = reportTasks(tasks, { now, limit: 2 });
  assert.match(text, /và 3 việc cũ hơn/);
  assert.equal((text.match(/^• /gm) ?? []).length, 2);
});

test("telegramCallTimeoutMs: long-poll getUpdates phải rộng hơn timeout của chính nó", () => {
  // Đây là bất biến đã bị vi phạm thật: client timeout 12s < poll timeout 25s ⇒ mỗi vòng
  // poll đều "timeout 12s" rồi thử lại, bot nhận tin chậm và log đầy lỗi.
  for (const poll of [5, 25, 50]) {
    assert.ok(
      telegramCallTimeoutMs("getUpdates", poll) > poll * 1000,
      `timeout client phải > ${poll}s`,
    );
  }
  assert.equal(telegramCallTimeoutMs("getUpdates", 25), 40_000);
  assert.equal(telegramCallTimeoutMs("sendMessage"), 12_000);
  // Tham số rỗng/âm/sai kiểu thì dùng mặc định 25s, không được trả NaN hay số âm.
  assert.equal(telegramCallTimeoutMs("getUpdates"), 40_000);
  assert.equal(telegramCallTimeoutMs("getUpdates", 0), 40_000);
  assert.equal(telegramCallTimeoutMs("getUpdates", "abc"), 40_000);
  assert.equal(telegramCallTimeoutMs("getUpdates", -3), 40_000);
});

test("chunkMessage: KHÔNG cắt đôi emoji ở ranh giới (lỗi 'chữ không ăn unicode')", () => {
  const loneSurrogate = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

  // Emoji rơi đúng vào mốc cắt: cách cũ (match theo code unit) sinh 2 mảnh, mỗi mảnh một nửa.
  const tricky = `${"a".repeat(3799)}🚀${"b".repeat(50)}`;
  const chunks = chunkMessage(tricky, 3800);
  assert.ok(chunks.length >= 1);
  for (const c of chunks) {
    assert.equal(loneSurrogate.test(c), false, `mảnh chứa surrogate lẻ: ${JSON.stringify(c.slice(-4))}`);
    assert.ok(c.length <= 3800, `mảnh vượt giới hạn: ${c.length}`);
  }
  assert.equal(chunks.join(""), tricky, "ghép các mảnh phải ra đúng chuỗi gốc (emoji còn nguyên)");

  // Emoji ở ngay ranh giới với max nhỏ: vẫn không được vỡ.
  const small = "🙂".repeat(3) + "x".repeat(4);
  for (const c of chunkMessage(small, 3)) assert.equal(loneSurrogate.test(c), false, JSON.stringify(c));
  assert.equal(chunkMessage(small, 3).join(""), small);

  // Ưu tiên cắt ở xuống dòng/khoảng trắng gần cuối để không vỡ từ.
  const words = `${"x".repeat(18)} ${"y".repeat(30)}`;
  const cut = chunkMessage(words, 20);
  assert.equal(cut[0], `${"x".repeat(18)} `, JSON.stringify(cut[0]));
  // Khoảng trắng nằm quá xa cuối (>20% đầu) thì cắt thẳng, không kéo dài mảnh.
  const early = `${"ab".repeat(6)} ${"z".repeat(30)}`;
  assert.equal(chunkMessage(early, 20)[0].length, 20);

  // Ca biên: rỗng, max sai, chuỗi ngắn hơn giới hạn.
  assert.deepEqual(chunkMessage(""), [""]);
  assert.deepEqual(chunkMessage(null), [""]);
  assert.deepEqual(chunkMessage("ngắn"), ["ngắn"]);
  assert.equal(chunkMessage("x".repeat(10), 0).length, 1, "max sai ⇒ dùng mặc định 3800");
  assert.equal(chunkMessage("x".repeat(4000), "abc")[0].length, 3800, "max sai ⇒ mặc định 3800");
  // Tin rất dài nhiều emoji: mọi mảnh sạch và ghép lại đúng gốc.
  const huge = "🔥Báo cáo VPNFlow ✅ ".repeat(400);
  const hugeChunks = chunkMessage(huge, 3800);
  assert.ok(hugeChunks.length > 1);
  for (const c of hugeChunks) assert.equal(loneSurrogate.test(c), false);
  assert.equal(hugeChunks.join(""), huge);
});
