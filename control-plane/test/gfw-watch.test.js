import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import {
  DEFAULT_GFW_HOSTS,
  GFW_STATE,
  GfwWatcher,
  evaluateHysteresis,
  parseGfwHosts,
  probeHost,
} from "../src/gfw-watch.js";

const src = fs.readFileSync(new URL("../src/index.js", import.meta.url), "utf8");

function tempFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gfw-watch-"));
  return path.join(dir, "gfw-history.json");
}

function fakeSocket({ events = [], authorized = true } = {}) {
  const socket = new EventEmitter();
  socket.authorized = authorized;
  socket.authorizationError = authorized ? null : "SELF_SIGNED_CERT_IN_CHAIN";
  socket.destroy = () => {};
  setImmediate(() => {
    for (const [name, payload] of events) socket.emit(name, payload);
  });
  return socket;
}

const dnsOk = { lookup: async () => ({ address: "127.0.0.1" }) };

// ---- evaluateHysteresis: logic THUẦN, chống rung ------------------------------------

test("evaluateHysteresis: fail 1-2 lần chưa đủ ngưỡng ⇒ vẫn OK, KHÔNG alert", () => {
  assert.deepEqual(evaluateHysteresis([false]), { state: GFW_STATE.OK, alert: false });
  assert.deepEqual(evaluateHysteresis([false, false]), { state: GFW_STATE.OK, alert: false });
});

test("evaluateHysteresis: fail đủ 3 liên tiếp ⇒ BLOCKED, alert đúng 1 lần", () => {
  assert.deepEqual(evaluateHysteresis([false, false, false]), { state: GFW_STATE.BLOCKED, alert: true });
});

test("evaluateHysteresis: tiếp tục fail khi đã BLOCKED ⇒ KHÔNG alert lại", () => {
  const r = evaluateHysteresis([false, false, false, false, false, false]);
  assert.equal(r.state, GFW_STATE.BLOCKED);
  assert.equal(r.alert, false, "trạng thái không đổi thì không được spam alert");
});

test("evaluateHysteresis: hồi phục cần đủ ngưỡng ok, alert RECOVERED 1 lần", () => {
  const blocked = [false, false, false];
  assert.deepEqual(evaluateHysteresis([...blocked, true]), { state: GFW_STATE.BLOCKED, alert: false });
  assert.deepEqual(evaluateHysteresis([...blocked, true, true]), { state: GFW_STATE.OK, alert: true });
  assert.deepEqual(evaluateHysteresis([...blocked, true, true, true]), { state: GFW_STATE.OK, alert: false });
});

test("evaluateHysteresis: mẫu UNKNOWN (null) không tính vào chuỗi", () => {
  assert.deepEqual(evaluateHysteresis([false, false, null, false]), { state: GFW_STATE.BLOCKED, alert: true });
  assert.deepEqual(evaluateHysteresis([false, false, null]), { state: GFW_STATE.OK, alert: false });
});

test("evaluateHysteresis: initial=BLOCKED cho phép báo RECOVERED từ lịch sử cũ", () => {
  assert.deepEqual(evaluateHysteresis([true, true], { initial: GFW_STATE.BLOCKED }), { state: GFW_STATE.OK, alert: true });
});

// ---- parseGfwHosts ----------------------------------------------------------------

test("parseGfwHosts: rỗng thì dùng mặc định, có env thì tách theo dấu phẩy", () => {
  assert.deepEqual(parseGfwHosts(""), DEFAULT_GFW_HOSTS);
  assert.deepEqual(parseGfwHosts("   "), DEFAULT_GFW_HOSTS);
  assert.deepEqual(parseGfwHosts("a.example, b.example"), ["a.example", "b.example"]);
});

// ---- probeHost: phân loại OK / BLOCKED / UNKNOWN -----------------------------------

test("probeHost: host không tồn tại ⇒ UNKNOWN, KHÔNG ném lỗi", async () => {
  const r = await probeHost("no-such-host.invalid", { timeoutMs: 3000 });
  assert.equal(r.state, GFW_STATE.UNKNOWN);
  assert.match(r.detail, /DNS/);
});

test("probeHost: DNS ok + TCP fail ⇒ UNKNOWN (chưa đủ kết luận chặn theo tên)", async () => {
  const r = await probeHost("down.example", {
    timeoutMs: 1000,
    dns: dnsOk,
    net: { connect: () => fakeSocket({ events: [["error", Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" })]] }) },
  });
  assert.equal(r.state, GFW_STATE.UNKNOWN);
  assert.match(r.detail, /TCP 443/);
});

test("probeHost: TCP thông nhưng TLS(SNI) fail ⇒ BLOCKED", async () => {
  const r = await probeHost("blocked.example", {
    timeoutMs: 1000,
    dns: dnsOk,
    net: { connect: () => fakeSocket({ events: [["connect"]] }) },
    tls: { connect: () => fakeSocket({ events: [["error", Object.assign(new Error("ECONNRESET"), { code: "ECONNRESET" })]] }) },
  });
  assert.equal(r.state, GFW_STATE.BLOCKED);
  assert.match(r.detail, /TLS\(SNI=blocked\.example\)/);
});

test("probeHost: DNS + TCP + TLS đều tốt ⇒ OK", async () => {
  const r = await probeHost("ok.example", {
    timeoutMs: 1000,
    dns: dnsOk,
    net: { connect: () => fakeSocket({ events: [["connect"]] }) },
    tls: { connect: () => fakeSocket({ events: [["secureConnect"]], authorized: true }) },
  });
  assert.equal(r.state, GFW_STATE.OK);
});

// ---- GfwWatcher: lịch sử + alert + không chết process ------------------------------

test("GfwWatcher: alert BLOCKED/RECOVERED đúng 1 lần mỗi lần đổi, lưu lịch sử vào file", async () => {
  const file = tempFile();
  let probeState = GFW_STATE.BLOCKED;
  const alerts = [];
  const emails = [];
  const watcher = new GfwWatcher({
    filePath: file,
    hosts: ["a.example"],
    deps: {
      probeHost: async (host) => ({ host, ip: "1.2.3.4", state: probeState, detail: "fake probe" }),
      sendAlert: async (a) => { alerts.push(a); },
      sendEmail: async (i) => { emails.push(i); return { sent: true }; },
    },
  });

  await watcher.runOnce(); // fail 1
  await watcher.runOnce(); // fail 2
  assert.equal(alerts.length, 0, "chưa đủ 3 lần fail thì chưa alert");

  await watcher.runOnce(); // fail 3 -> BLOCKED
  assert.equal(alerts.length, 1);
  assert.match(alerts[0].title, /BLOCKED/);
  assert.equal(alerts[0].level, "error");
  assert.equal(emails.length, 1);

  await watcher.runOnce(); // fail 4 -> vẫn BLOCKED, không alert lại
  assert.equal(alerts.length, 1, "trạng thái không đổi thì không alert lại");

  probeState = GFW_STATE.OK;
  await watcher.runOnce(); // ok 1
  assert.equal(alerts.length, 1);
  await watcher.runOnce(); // ok 2 -> RECOVERED
  assert.equal(alerts.length, 2);
  assert.match(alerts[1].title, /RECOVERED/);
  assert.equal(alerts[1].level, "ok");
  assert.equal(emails.length, 2);

  const saved = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(saved.hosts["a.example"].samples.length, 6);
  assert.equal(saved.hosts["a.example"].state, GFW_STATE.OK);

  const snap = watcher.snapshot();
  assert.equal(snap.hosts.length, 1);
  assert.equal(snap.hosts[0].host, "a.example");
  assert.equal(snap.hosts[0].state, GFW_STATE.OK);
  assert.equal(snap.hosts[0].samples.length, 6);
  assert.ok(snap.hosts[0].lastChangeAt, "phải ghi mốc đổi trạng thái");
  assert.ok(snap.updatedAt);
});

test("GfwWatcher: UNKNOWN không đổi trạng thái và không alert", async () => {
  const file = tempFile();
  const alerts = [];
  const watcher = new GfwWatcher({
    filePath: file,
    hosts: ["b.example"],
    deps: {
      probeHost: async (host) => ({ host, ip: null, state: GFW_STATE.UNKNOWN, detail: "DNS thất bại" }),
      sendAlert: async (a) => { alerts.push(a); },
      sendEmail: async () => ({ sent: true }),
    },
  });
  await watcher.runOnce();
  await watcher.runOnce();
  await watcher.runOnce();
  assert.equal(alerts.length, 0, "không kết luận được thì không được alert");
  assert.equal(watcher.snapshot().hosts[0].state, GFW_STATE.OK);
});

test("GfwWatcher: giữ tối đa maxSamples mẫu mỗi host", async () => {
  const file = tempFile();
  const watcher = new GfwWatcher({
    filePath: file,
    hosts: ["c.example"],
    maxSamples: 3,
    deps: {
      probeHost: async (host) => ({ host, ip: "1.1.1.1", state: GFW_STATE.OK, detail: "fake" }),
      sendAlert: async () => {},
      sendEmail: async () => ({ sent: true }),
    },
  });
  for (let i = 0; i < 5; i += 1) await watcher.runOnce();
  assert.equal(watcher.snapshot().hosts[0].samples.length, 3);
});

test("GfwWatcher.runOnce: probe ném lỗi cũng KHÔNG làm chết watcher", async () => {
  const file = tempFile();
  const watcher = new GfwWatcher({
    filePath: file,
    hosts: ["boom.example"],
    deps: {
      probeHost: async () => { throw new Error("boom"); },
      sendAlert: async () => {},
      sendEmail: async () => ({ sent: true }),
    },
  });
  await assert.doesNotReject(() => watcher.runOnce());
});

// ---- Route admin: tồn tại và có auth ----------------------------------------------

test("route /v1/admin/gfw tồn tại và CÓ requireAdminAuth", () => {
  const marker = 'app.get("/v1/admin/gfw"';
  assert.ok(src.includes(marker), "thiếu route /v1/admin/gfw");
  const body = src.slice(src.indexOf(marker), src.indexOf(marker) + 320);
  assert.ok(/requireAdminAuth/.test(body), "route admin phải có requireAdminAuth");
  assert.ok(body.includes("snapshot()"), "route phải trả snapshot của watcher");
});
