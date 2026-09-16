import test from "node:test";
import assert from "node:assert/strict";
import { alertChannels, renderAlertText, sendAlert, sendTelegram } from "../src/alerts.js";

const ENV = { TELEGRAM_BOT_TOKEN: "123:ABC", TELEGRAM_CHAT_ID: "999", ALERT_EMAIL: "owner@example.com" };
const silent = { log: () => {}, warn: () => {}, error: () => {} };

function okFetch(capture) {
  return async (url, options) => {
    capture.push({ url, options });
    return { ok: true, status: 200, json: async () => ({ ok: true, result: { message_id: 42 } }) };
  };
}

test("alertChannels: báo đúng kênh đang bật, KHÔNG lộ token", () => {
  const on = alertChannels(ENV);
  assert.equal(on.telegram, true);
  assert.equal(on.telegramChatId, "999");
  assert.equal(on.email, "owner@example.com");
  assert.equal(JSON.stringify(on).includes("123:ABC"), false, "không được trả token ra ngoài");

  const off = alertChannels({});
  assert.equal(off.telegram, false);
  assert.equal(off.email, null);
});

test("renderAlertText: có icon theo mức, tiêu đề và từng dòng", () => {
  const text = renderAlertText({ title: "Đơn mới", lines: ["order 123", "200.000đ", ""], level: "ok" });
  assert.match(text, /^✅ Đơn mới/);
  assert.match(text, /• order 123/);
  assert.match(text, /• 200\.000đ/);
  assert.equal(text.includes("• \n"), false, "bỏ dòng rỗng");
});

test("sendTelegram: thiếu cấu hình thì KHÔNG gọi mạng, trả lý do rõ ràng", async () => {
  let called = 0;
  const result = await sendTelegram("hi", { env: {}, fetchImpl: async () => { called += 1; } });
  assert.equal(result.sent, false);
  assert.match(result.reason, /chưa cấu hình/);
  assert.equal(called, 0);
});

test("sendTelegram: gửi đúng Bot API (URL, chat_id, text)", async () => {
  const capture = [];
  const result = await sendTelegram("xin chào", { env: ENV, fetchImpl: okFetch(capture) });
  assert.equal(result.sent, true);
  assert.equal(result.messageId, 42);
  assert.equal(capture.length, 1);
  assert.equal(capture[0].url, "https://api.telegram.org/bot123:ABC/sendMessage");
  assert.equal(capture[0].options.method, "POST");
  const body = JSON.parse(capture[0].options.body);
  assert.equal(body.chat_id, "999");
  assert.equal(body.text, "xin chào");
});

test("sendTelegram: Telegram trả ok=false thì trả lỗi mô tả, không ném", async () => {
  const result = await sendTelegram("x", {
    env: ENV,
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ ok: false, description: "chat not found" }) }),
  });
  assert.equal(result.sent, false);
  assert.equal(result.reason, "chat not found");
});

test("sendTelegram: lỗi mạng không làm ném ra ngoài", async () => {
  const result = await sendTelegram("x", { env: ENV, fetchImpl: async () => { throw new Error("ECONNRESET"); } });
  assert.equal(result.sent, false);
  assert.match(result.reason, /ECONNRESET/);
});

test("sendTelegram: treo quá timeout thì bị AbortController cắt", async () => {
  const fetchImpl = (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => {
      const err = new Error("aborted");
      err.name = "AbortError";
      reject(err);
    });
  });
  const result = await sendTelegram("x", { env: ENV, fetchImpl, timeoutMs: 20 });
  assert.equal(result.sent, false);
  assert.match(result.reason, /timeout 20ms/);
});

test("sendAlert: không bao giờ ném lỗi, luôn trả text đã render", async () => {
  const result = await sendAlert({ title: "Sự cố", lines: ["node-1 unreachable"], level: "error" }, {
    env: ENV,
    fetchImpl: async () => { throw new Error("boom"); },
    log: silent,
  });
  assert.equal(result.sent, false);
  assert.match(result.text, /^🚨 Sự cố/);
  assert.match(result.text, /node-1 unreachable/);
});

// ---- Nội dung 2 alert mới: khách đăng ký máy mới + xác nhận hoá đơn -------------------
test("deviceRegisteredAlert: gộp thông tin máy mới của khách", async () => {
  const { deviceRegisteredAlert } = await import("../src/alerts.js");
  const alert = deviceRegisteredAlert({
    platform: "ios",
    name: "ios-166c028a",
    email: "khach@example.com",
    ip: "10.77.0.47",
    node: "Hanoi 1",
    replaced: "ios-9b0f4747",
  });
  assert.equal(alert.title, "Khách đăng ký máy mới");
  assert.equal(alert.level, "info");
  assert.equal(alert.lines.some((l) => l.includes("ios-166c028a")), true);
  assert.equal(alert.lines.some((l) => l.includes("khach@example.com")), true);
  assert.equal(alert.lines.some((l) => l.includes("Thay thế slot của")), true);
});

test("invoiceConfirmedAlert: gửi được email ⇒ ok; không gửi được ⇒ warn", async () => {
  const { invoiceConfirmedAlert } = await import("../src/alerts.js");
  const ok = invoiceConfirmedAlert({
    orderCode: "1789322708",
    email: "khach@example.com",
    plan: "1 tháng",
    amount: 200000,
    days: 30,
    expiresAt: "2026-10-16T00:00:00.000Z",
    mailSent: true,
  });
  assert.equal(ok.level, "ok");
  assert.equal(ok.lines.some((l) => l.includes("đã gửi email cho khách")), true);
  assert.equal(ok.lines.some((l) => l.includes("200.000đ")), true);

  const bad = invoiceConfirmedAlert({ orderCode: "1", email: "x@y.z", plan: "1 tháng", mailSent: false });
  assert.equal(bad.level, "warn", "khách trả tiền mà không nhận được hoá đơn phải ở mức warn");
  assert.equal(bad.lines.some((l) => l.includes("KHÔNG gửi được")), true);
});
