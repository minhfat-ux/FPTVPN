import test from "node:test";
import assert from "node:assert/strict";
import {
  MAC_ALIVE_STALE_MS,
  MUTATING_COMMANDS,
  READ_ONLY_COMMANDS,
  RESTARTABLE_SERVICES,
  TASK_STATUSES,
  VIBE_TARGETS,
  buildChatPrompt,
  buildVibeBody,
  chatHelpText,
  chatPreamble,
  chunkMessage,
  confirmationPrompt,
  describeMacAlive,
  isMacAlive,
  formatDuration,
  helpText,
  isAllowedChat,
  isVibecodeCommand,
  needsConfirmation,
  normalizeVibeTarget,
  parseCallback,
  parseChatArgs,
  parseCommand,
  parseVibecodeArgs,
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

test("/guard là lệnh đọc, /approve và /reject là lệnh thay đổi (phải bấm Xác nhận)", () => {
  // Guard đề xuất việc sửa; CHỈ chủ dự án approve thì agent mới được sửa/publish.
  assert.equal(parseCommand("/guard").name, "guard");
  assert.equal(parseCommand("/guard").mutating, false);
  assert.equal(needsConfirmation(parseCommand("/guard")), false);

  const approve = parseCommand("/approve G1758440000");
  assert.equal(approve.name, "approve");
  assert.deepEqual(approve.args, ["G1758440000"]);
  assert.equal(approve.mutating, true);
  assert.equal(needsConfirmation(approve), true);
  assert.equal(needsConfirmation(approve, { force: true }), false);

  const reject = parseCommand("/reject G1758440000 khong can sua");
  assert.equal(reject.name, "reject");
  assert.deepEqual(reject.args, ["G1758440000", "khong", "can", "sua"]);
  assert.equal(reject.mutating, true);
});

test("nút Xác nhận của /approve mang đúng id task (không phải nội dung dài)", () => {
  const parsed = parseCommand("/approve G1758440000");
  const cb = parseCallback(`ok:${parsed.name}:${parsed.args.join(",")}`);
  assert.deepEqual(cb, { action: "confirm", name: "approve", args: ["G1758440000"] });
});

// ---------------------------------------------------------- /vibecode (giao việc cho máy)

test("/vibecode là lệnh ĐỔI TRẠNG THÁI (giao việc cho máy khác phải xác nhận)", () => {
  for (const name of ["vibecode", "mac", "win"]) {
    assert.ok(MUTATING_COMMANDS.includes(name), `${name} phải nằm trong MUTATING_COMMANDS`);
    assert.ok(!READ_ONLY_COMMANDS.includes(name), `${name} không được coi là lệnh đọc`);
  }
  assert.equal(needsConfirmation(parseCommand("/vibecode mac sua loi iOS")), true);
  assert.equal(needsConfirmation(parseCommand("/mac sua loi iOS")), true);
});

test("parseVibecodeArgs: /vibecode <máy> <việc>", () => {
  assert.deepEqual(
    parseVibecodeArgs(["mac", "sửa", "lỗi", "mất", "mạng"]),
    { kind: "task", target: "mac", text: "sửa lỗi mất mạng" },
  );
  assert.deepEqual(
    parseVibecodeArgs(["WINDOWS", "build", "lại"]),
    { kind: "task", target: "win", text: "build lại" },
  );
});

test("parseVibecodeArgs: lệnh tắt /mac, /win suy ra máy từ tên lệnh", () => {
  assert.deepEqual(parseVibecodeArgs(["build", "lại", "1.4.4"], "mac"), { kind: "task", target: "mac", text: "build lại 1.4.4" });
  assert.deepEqual(parseVibecodeArgs(["kiểm", "tra", "route"], "win"), { kind: "task", target: "win", text: "kiểm tra route" });
});

test("parseVibecodeArgs: thiếu máy / thiếu việc / rỗng thì báo lỗi rõ, KHÔNG giao nhầm", () => {
  const noMachine = parseVibecodeArgs(["sửa", "lỗi", "iOS"]);
  assert.equal(noMachine.kind, "error");
  assert.match(noMachine.message, /Không rõ máy nào/);

  const noText = parseVibecodeArgs(["mac"]);
  assert.equal(noText.kind, "error");
  assert.match(noText.message, /Thiếu nội dung việc/);

  assert.deepEqual(parseVibecodeArgs([]), { kind: "help" });
});

test("parseVibecodeArgs: việc chứa chữ giống tên máy vẫn giữ nguyên nội dung", () => {
  // Chỉ chữ ĐẦU TIÊN mới là tên máy; "win" trong câu không được cắt đi.
  assert.deepEqual(
    parseVibecodeArgs(["mac", "so", "sánh", "win", "và", "mac"]),
    { kind: "task", target: "mac", text: "so sánh win và mac" },
  );
  // Lệnh tắt: chữ đầu là nội dung việc, không phải tên máy.
  assert.deepEqual(parseVibecodeArgs(["win", "là", "gì"], "mac"), { kind: "task", target: "mac", text: "win là gì" });
});

test("normalizeVibeTarget: nhận tên máy + bí danh, từ chối tên lạ", () => {
  assert.equal(normalizeVibeTarget("Mac"), "mac");
  assert.equal(normalizeVibeTarget("macos"), "mac");
  assert.equal(normalizeVibeTarget("win"), "win");
  assert.equal(normalizeVibeTarget("windows"), "win");
  assert.equal(normalizeVibeTarget("@server"), "server");
  assert.equal(normalizeVibeTarget("linux"), "");
  assert.equal(normalizeVibeTarget(""), "");
  // Mọi giá trị trả về phải là đích thật của hệ giao việc.
  for (const value of Object.values(VIBE_TARGETS)) {
    assert.ok(["mac", "win", "server"].includes(value), `đích lạ: ${value}`);
  }
});

test("nút Xác nhận của /vibecode là okvibe (nội dung việc quá dài cho callback_data)", () => {
  const parsed = parseCommand("/vibecode mac " + "x".repeat(200));
  const prompt = confirmationPrompt(parsed);
  const callback = parseCallback("okvibe");
  assert.deepEqual(callback, { action: "confirm", name: "vibecode", args: [] });
  // Nội dung việc KHÔNG được nhét vào callback_data (Telegram giới hạn 64 byte).
  const data = prompt.buttons.flat().map((b) => b.callback_data);
  assert.deepEqual(data, ["okvibe", "cancel"]);
  assert.ok(data.every((d) => Buffer.byteLength(d, "utf8") <= 64));
  // Prompt phải nói RÕ máy nhận + việc, vì gõ nhầm máy là việc đi sai chỗ.
  assert.match(prompt.text, /Giao cho: Mac/);
  assert.match(prompt.text, /x{10}/);
});

test("isVibecodeCommand phân biệt được với /task", () => {
  assert.equal(isVibecodeCommand("vibecode"), true);
  assert.equal(isVibecodeCommand("mac"), true);
  assert.equal(isVibecodeCommand("win"), true);
  assert.equal(isVibecodeCommand("task"), false);
  assert.equal(isVibecodeCommand("restart"), false);
});

test("buildVibeBody ghi rõ việc đến từ chủ dự án + đòi ack/bằng chứng", () => {
  const body = buildVibeBody("sửa lỗi mất mạng iOS", { at: new Date("2026-09-22T10:00:00Z") });
  assert.match(body, /chủ dự án giao TRỰC TIẾP qua Telegram/);
  assert.match(body, /2026-09-22T10:00:00\.000Z/);
  assert.match(body, /sửa lỗi mất mạng iOS/);
  assert.match(body, /bằng chứng/);
  assert.match(body, /báo NGAY/);
});

test("helpText có nhắc /vibecode + /mac + /win", () => {
  const help = helpText();
  for (const needle of ["/vibecode mac", "/vibecode win", "/mac <việc>", "/win <việc>"]) {
    assert.ok(help.includes(needle), `help thiếu "${needle}"`);
  }
});

test("/wakeup là lệnh đọc: chạy ngay, không bắt bấm Xác nhận, và có trong /help", () => {
  // Đánh thức máy là việc gấp — thêm một bước bấm Xác nhận là làm mất đúng công dụng.
  // Nhưng nó vẫn KHÔNG được nằm trong MUTATING_COMMANDS vì không đổi trạng thái nào.
  const parsed = parseCommand("/wakeup");
  assert.equal(parsed.name, "wakeup");
  assert.equal(parsed.mutating, false);
  assert.equal(needsConfirmation(parsed), false);
  assert.ok(READ_ONLY_COMMANDS.includes("wakeup"));
  assert.ok(!MUTATING_COMMANDS.includes("wakeup"));
  assert.match(helpText(), /\/wakeup/);
});

test("mọi lệnh trong READ_ONLY/MUTATING đều parse được (không lệnh nào bị bỏ quên)", () => {
  for (const name of [...READ_ONLY_COMMANDS, ...MUTATING_COMMANDS]) {
    assert.equal(parseCommand(`/${name}`).name, name, `parseCommand("/${name}")`);
  }
});

test("describeMacAlive: nhịp tim mới ⇒ Mac đang thức, kèm nguồn điện + trạng thái khoá ngủ", () => {
  const now = 1_800_000_000_000;
  const beat = { epoch: now / 1000 - 30, ac: true, nosleep: true, host: "macbook-air-2" };
  const out = describeMacAlive(beat, now);
  assert.match(out, /ĐANG THỨC/);
  assert.match(out, /30s/);
  assert.match(out, /cắm sạc/);
  assert.match(out, /đã khoá không ngủ/);
});

test("describeMacAlive: nhịp tim cũ ⇒ Mac đang ngủ, và nói rõ việc không mất", () => {
  const now = 1_800_000_000_000;
  const beat = { epoch: now / 1000 - 600, ac: false, nosleep: false };
  const out = describeMacAlive(beat, now);
  assert.match(out, /ĐANG NGỦ/);
  assert.match(out, /10 phút/);
  assert.match(out, /pin/);
  assert.match(out, /node-2/);
});

test("describeMacAlive: đúng ngưỡng staleMs thì vẫn coi là thức (biên)", () => {
  const now = 1_800_000_000_000;
  const atEdge = { epoch: now / 1000 - MAC_ALIVE_STALE_MS / 1000 };
  assert.match(describeMacAlive(atEdge, now), /ĐANG THỨC/);
  const overEdge = { epoch: now / 1000 - MAC_ALIVE_STALE_MS / 1000 - 1 };
  assert.match(describeMacAlive(overEdge, now), /ĐANG NGỦ/);
});

test("describeMacAlive: thiếu/ hỏng nhịp tim ⇒ nói chưa từng nhận, không đoán bừa", () => {
  for (const bad of [null, undefined, {}, { epoch: 0 }, { epoch: "abc" }]) {
    assert.match(describeMacAlive(bad), /Chưa từng nhận nhịp tim/);
  }
});

test("describeMacAlive: nhịp tim ở tương lai (lệch giờ) không tạo số âm", () => {
  const now = 1_800_000_000_000;
  const out = describeMacAlive({ epoch: now / 1000 + 120, ac: true, nosleep: true }, now);
  assert.match(out, /ĐANG THỨC/);
  assert.ok(!out.includes("-"), "không được hiện tuổi âm");
});

test("isMacAlive: dùng chung ngưỡng với describeMacAlive (không lệch logic)", () => {
  const now = 1_800_000_000_000;
  const fresh = { epoch: now / 1000 - 10 };
  const stale = { epoch: now / 1000 - MAC_ALIVE_STALE_MS / 1000 - 1 };
  assert.equal(isMacAlive(fresh, now), true);
  assert.equal(isMacAlive(stale, now), false);
  assert.equal(isMacAlive(null, now), false);
  assert.match(describeMacAlive(fresh, now), /ĐANG THỨC/);
  assert.match(describeMacAlive(stale, now), /ĐANG NGỦ/);
});

test("help mô tả /wakeup là lệnh TRẠNG THÁI trước, đánh thức sau (đúng thực tế mạng công ty)", () => {
  const help = helpText();
  assert.match(help, /Trạng thái máy Mac/);
  assert.match(help, /đang THỨC hay đang NGỦ/);
  // Phải nói rõ giới hạn, không để hiểu là luôn đánh thức được.
  assert.match(help, /forward cổng UDP 9/);
});
