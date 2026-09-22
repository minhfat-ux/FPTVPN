import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  Deduper,
  buildTelegramRequest,
  keyOf,
  pickValue,
  readTelegramCreds,
  redact,
  sendTelegram,
  sendViaSsh,
} from "../lib/notify.mjs";

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function confFile(prefix, extra = "") {
  const dir = tmp(prefix);
  const file = path.join(dir, "tg");
  fs.writeFileSync(file, `TELEGRAM_BOT_TOKEN=1:a\nTELEGRAM_CHAT_ID=9\n${extra}`);
  return file;
}

test("pickValue đọc được cả kiểu KEY=value (file thật trên máy) và KEY: value", () => {
  // Hồi quy 22/09/2026: ~/.vpnflow-telegram dùng dấu `=`, bản cũ chỉ nhận `:`
  // nên MỌI alert Telegram đều im lặng mà không ai biết.
  const text = "TELEGRAM_BOT_TOKEN=123:ABC\nTELEGRAM_CHAT_ID=456\nKHAC: x\n";
  assert.equal(pickValue(text, "TELEGRAM_BOT_TOKEN"), "123:ABC");
  assert.equal(pickValue(text, "TELEGRAM_CHAT_ID"), "456");
  const jsonish = 'TELEGRAM_BOT_TOKEN: "123:ABC"\n"TELEGRAM_CHAT_ID": "456"\n';
  assert.equal(pickValue(jsonish, "TELEGRAM_BOT_TOKEN"), "123:ABC");
  assert.equal(pickValue(jsonish, "TELEGRAM_CHAT_ID"), "456");
  assert.equal(pickValue(text, "KHONG_CO"), null);
});

test("readTelegramCreds trả null khi thiếu file hoặc thiếu khoá", () => {
  const dir = tmp("sd-tg-");
  assert.equal(readTelegramCreds(path.join(dir, "khong-co")), null);
  const partial = path.join(dir, "partial");
  fs.writeFileSync(partial, "TELEGRAM_BOT_TOKEN=1:a\n");
  assert.equal(readTelegramCreds(partial), null);
  const ok = readTelegramCreds(confFile("sd-tg2-"));
  assert.equal(ok.token, "1:a");
  assert.equal(ok.chat, "9");
  assert.ok(ok.relayHost.includes("103.173.155.50"), "mặc định relay là VPS của chủ dự án");
});

test("readTelegramCreds cho phép ghi đè relay host", () => {
  const c = readTelegramCreds(confFile("sd-tg3-", "TELEGRAM_RELAY_HOST=root@10.0.0.9\n"));
  assert.equal(c.relayHost, "root@10.0.0.9");
});

test("redact che token khỏi thông báo lỗi", () => {
  const creds = { token: "SECRET123", chat: "1" };
  assert.equal(redact("loi https://api.telegram.org/botSECRET123/x", creds).includes("SECRET123"), false);
});

test("Deduper chặn gửi trùng trong cửa sổ thời gian", () => {
  const file = path.join(tmp("sd-dedup-"), "dedup.json");
  const d = new Deduper(file, 60000);
  assert.equal(d.shouldSend("k1"), true);
  assert.equal(d.shouldSend("k1"), false);
  assert.equal(d.shouldSend("k2"), true);
  const d2 = new Deduper(file, 60000);
  assert.equal(d2.shouldSend("k1"), false, "trạng thái phải sống sót qua khởi tạo mới");
  const d3 = new Deduper(file, -1);
  assert.equal(d3.shouldSend("k1"), true, "hết hạn thì gửi lại được");
});

test("keyOf ổn định và phân biệt nội dung", () => {
  assert.equal(keyOf("abc"), keyOf("abc"));
  assert.notEqual(keyOf("abc"), keyOf("abd"));
  assert.equal(keyOf("abc").length, 16);
});

test("sendTelegram transport=direct: thành công, lỗi mạng, thiếu cấu hình", async () => {
  const conf = confFile("sd-send-");
  let seenUrl = null;
  const okFetch = async (url, opts) => {
    seenUrl = url;
    assert.equal(opts.method, "POST");
    assert.ok(String(opts.body).includes("chat_id=9"));
    return { ok: true, status: 200 };
  };
  const ok = await sendTelegram("xin chao", { file: conf, fetchImpl: okFetch, transport: "direct" });
  assert.deepEqual({ ok: ok.ok, status: ok.status, transport: ok.transport }, { ok: true, status: 200, transport: "direct" });
  assert.ok(seenUrl.startsWith("https://api.telegram.org/bot1:a/sendMessage"));

  const failFetch = async () => {
    throw new Error("mang loi");
  };
  const r = await sendTelegram("x", { file: conf, fetchImpl: failFetch, transport: "direct" });
  assert.equal(r.ok, false);
  assert.equal(r.error, "mang loi");

  const r2 = await sendTelegram("x", { file: path.join(tmp("sd-no-"), "khong-co"), fetchImpl: okFetch, transport: "direct" });
  assert.equal(r2.ok, false);
  assert.ok(r2.error.includes("thiếu"));
});

test("sendViaSsh đẩy nội dung qua stdin, KHÔNG nhét vào command line của VPS", () => {
  const calls = [];
  const spawn = (bin, args, opts) => {
    calls.push({ bin, args, opts });
    return { status: 0, stdout: '{"ok":true}', stderr: "" };
  };
  const r = sendViaSsh(buildTelegramRequest({ token: "1:a", chat: "9" }, "canh bao ma doc"), { spawn });

  assert.equal(r.ok, true);
  assert.equal(r.transport, "ssh");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].bin, "/usr/bin/ssh");
  const remoteCmd = calls[0].args.at(-1);
  assert.equal(remoteCmd.includes("canh bao ma doc"), false, "nội dung không được nằm trong command line");
  assert.ok(remoteCmd.includes("--data-binary @-"), "phải đọc body từ stdin");
  assert.ok(calls[0].opts.input.includes("chat_id=9"));
  assert.ok(calls[0].opts.input.includes("canh+bao+ma+doc") || calls[0].opts.input.includes("canh%20bao"));
});

test("sendViaSsh không throw khi ssh lỗi", () => {
  const spawn = () => ({ status: 255, stdout: "", stderr: "Permission denied (publickey)" });
  const r = sendViaSsh(buildTelegramRequest({ token: "1:a", chat: "9" }), { spawn });
  assert.equal(r.ok, false);
  assert.ok(r.error.includes("255"));
});

test("transport=auto: direct hỏng thì tự rơi về relay SSH", async () => {
  const conf = confFile("sd-auto-");
  const calls = [];
  const spawn = (bin, args, opts) => {
    calls.push({ bin, args, opts });
    return { status: 0, stdout: '{"ok":true}', stderr: "" };
  };
  const failFetch = async () => {
    throw new Error("fetch failed");
  };
  const r = await sendTelegram("x", { file: conf, fetchImpl: failFetch, transport: "auto", spawn });
  assert.equal(r.ok, true);
  assert.equal(r.transport, "ssh");
  assert.equal(calls.length, 1);
});

test("transport=auto: cả hai đường hỏng thì báo lỗi gộp, không throw", async () => {
  const conf = confFile("sd-auto2-");
  const failFetch = async () => {
    throw new Error("fetch failed");
  };
  const spawn = () => ({ status: 255, stdout: "", stderr: "no route" });
  const r = await sendTelegram("x", { file: conf, fetchImpl: failFetch, transport: "auto", spawn });
  assert.equal(r.ok, false);
  assert.ok(r.error.includes("fetch failed"));
  assert.ok(r.error.includes("no route"));
});
