/**
 * Test cho luật đánh thức của watcher (`ops/lib/wake-policy.mjs`).
 *
 *   node --test ops/wake-policy.test.mjs
 *
 * Ca quan trọng nhất là hồi quy của lỗi thật ngày 23/09/2026: T-20260923-03 bị `blocked` do
 * CHÍNH WIN ghi, watcher vẫn đánh thức WIN lại sau mỗi cooldown ⇒ vòng lặp bất tận
 * (blocked 12:07/12:20/12:36 → woken 12:16/12:27/12:37), mỗi vòng mở một phiên harness vô ích.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { wakeReason } from "./lib/wake-policy.mjs";

/** Việc giao cho WIN, bên giao là owner. `last` mặc định là mới nhất. */
const entry = (last, task = {}) => ({
  id: "T-20260923-03",
  task: { id: "T-20260923-03", title: "việc thử", from: "owner", to: "win", ...task },
  last,
});

test("blocked do CHÍNH TÔI ghi thì KHÔNG tự đánh thức (hồi quy 23/09)", () => {
  assert.equal(wakeReason(entry({ type: "blocked", actor: "win" }), "WIN"), null);
  // .trim()/khác hoa thường vẫn phải nhận ra chính mình.
  assert.equal(wakeReason(entry({ type: "blocked", actor: " win " }), "win"), null);
});

test("blocked do BÊN GIAO ghi thì đánh thức tôi", () => {
  assert.equal(
    wakeReason(entry({ type: "blocked", actor: "owner" }), "WIN"),
    "bên giao vừa ghi chú vào việc của tôi",
  );
  assert.equal(
    wakeReason(entry({ type: "blocked", actor: "mac" }), "WIN"),
    "bên giao vừa ghi chú vào việc của tôi",
  );
});

test("blocked cũ không có actor: giữ nguyên hành vi cũ (đánh thức)", () => {
  assert.equal(
    wakeReason(entry({ type: "blocked" }), "WIN"),
    "bên giao vừa ghi chú vào việc của tôi",
  );
});

test("việc mới giao, bị trả lại thì đánh thức", () => {
  assert.equal(wakeReason(entry({ type: "sent", actor: "owner" }), "WIN"), "có việc mới được giao");
  assert.equal(
    wakeReason(entry({ type: "verified", result: "fail", actor: "owner" }), "WIN"),
    "bị trả lại, phải làm lại",
  );
  // verified pass thì không.
  assert.equal(wakeReason(entry({ type: "verified", result: "pass", actor: "owner" }), "WIN"), null);
});

test("sự kiện của tôi (ack/progress/done/blocked/woken) không tự réo tôi", () => {
  for (const type of ["ack", "progress", "done", "blocked", "woken"]) {
    assert.equal(wakeReason(entry({ type, actor: "win" }), "WIN"), null, `type=${type}`);
  }
});

test("tôi là bên giao: chỉ đánh thức khi đối tác done hoặc blocked", () => {
  const theirs = entry({ type: "done", actor: "mac" }, { from: "win", to: "mac" });
  assert.equal(wakeReason(theirs, "WIN"), "đối tác báo xong — cần nghiệm thu");
  assert.equal(
    wakeReason(entry({ type: "blocked", actor: "mac" }, { from: "win", to: "mac" }), "WIN"),
    "đối tác đang vướng, cần gỡ",
  );
  // ack/progress của đối tác không réo bên giao.
  assert.equal(wakeReason(entry({ type: "ack", actor: "mac" }, { from: "win", to: "mac" }), "WIN"), null);
  assert.equal(wakeReason(entry({ type: "progress", actor: "mac" }, { from: "win", to: "mac" }), "WIN"), null);
});

test("thiếu last hoặc thiếu task thì không đánh thức", () => {
  assert.equal(wakeReason({ task: { to: "win" } }, "WIN"), null);
  assert.equal(wakeReason(entry(undefined), "WIN"), null);
});
