import test from "node:test";
import assert from "node:assert/strict";
import {
  MUTATING_COMMANDS,
  RESTARTABLE_SERVICES,
  confirmationPrompt,
  helpText,
  isAllowedChat,
  needsConfirmation,
  parseCallback,
  parseCommand,
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
  assert.equal(text.includes("*"), false, "không dùng * để tránh vỡ parse_mode");
});
