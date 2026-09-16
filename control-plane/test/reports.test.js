import test from "node:test";
import assert from "node:assert/strict";
import { formatStatusReport, parseReportTimes, reportDue } from "../src/reports.js";

test("parseReportTimes: nhận 'HH:MM', bỏ giá trị rác, có mặc định", () => {
  const times = parseReportTimes("8:00, 20:30 , rác, 25:00, 12:99");
  assert.deepEqual(times.map((t) => t.label), ["08:00", "20:30"]);
  assert.deepEqual(parseReportTimes("").map((t) => t.label), ["08:00", "20:00"]);
});

test("reportDue: chỉ đúng trong cửa sổ và chưa gửi mốc đó", () => {
  const times = parseReportTimes("08:00,20:00");
  const at = (h, m) => new Date(2026, 8, 16, h, m, 0, 0); // 16/09/2026 giờ máy

  assert.equal(reportDue({ now: at(7, 30), times }).due, false, "trước giờ thì chưa gửi");
  const due = reportDue({ now: at(8, 3), times });
  assert.equal(due.due, true, "trong cửa sổ 10 phút thì gửi");
  assert.equal(reportDue({ now: at(8, 3), times, lastSentAt: at(8, 1).toISOString() }).due, false, "đã gửi mốc này rồi");
  assert.equal(reportDue({ now: at(9, 30), times }).due, false, "quá cửa sổ thì không gửi bù");
  assert.equal(reportDue({ now: at(20, 5), times }).due, true, "mốc tối vẫn gửi");

  // Hôm sau, mốc cũ đã gửi hôm qua ⇒ vẫn gửi bình thường.
  const nextDay = new Date(2026, 8, 17, 8, 2, 0, 0);
  assert.equal(reportDue({ now: nextDay, times, lastSentAt: at(8, 1).toISOString() }).due, true);
});

test("formatStatusReport: gộp số liệu thành các dòng dễ đọc", () => {
  const report = formatStatusReport({
    now: new Date(Date.UTC(2026, 8, 16, 1, 0)),
    nodes: [{ id: "node-1", name: "Hanoi 1", online: true, ms: 5 }, { id: "vietnam-2", name: "Hanoi 2", online: false }],
    peers: { online: 3, total: 51 },
    devices: { active: 12, total: 17, test: 36, byPlatform: { ios: 5, android: 8, macos: 4 }, newLast24h: 2, peerless: 0 },
    ios: { pendingSign: 1 },
    payments: { pending: 4 },
  });
  // Có node không phản hồi + khách iOS đang chờ ký ⇒ báo cáo phải ở mức warn (cần người xử lý).
  assert.equal(report.level, "warn");
  assert.equal(report.issues.length, 2);
  assert.match(report.lines[0], /Hanoi 1 ✓ 5ms/);
  assert.match(report.lines[0], /Hanoi 2 ✗ KHÔNG phản hồi/);
  assert.equal(report.lines.includes("Peer online: 3/51"), true);
  assert.equal(report.lines.includes("Đăng ký mới 24h: 2"), true);
  assert.equal(report.lines.includes("iOS đang chờ ký: 1"), true);
  assert.equal(report.lines.includes("Đơn chờ thanh toán: 4"), true);
  assert.match(report.title, /^Báo cáo VPNFlow/);
});

test("formatStatusReport: mọi thứ bình thường ⇒ mức ok, không có issues", () => {
  const report = formatStatusReport({
    nodes: [{ id: "node-1", name: "Hanoi 1", online: true, ms: 5 }],
    peers: { online: 2, total: 50 },
    devices: { active: 10, total: 10, test: 36, byPlatform: { ios: 5, windows: 2 }, newLast24h: 0, peerless: 0 },
    ios: { pendingSign: 0 },
    payments: { pending: 0 },
  });
  assert.equal(report.level, "ok");
  assert.deepEqual(report.issues, []);
  assert.equal(report.lines.some((l) => l.includes("windows 2")), true, "báo cáo phải có nền tảng windows");
});

test("formatStatusReport: thiết bị thiếu peer ⇒ mức warn + nêu rõ trong issues", () => {
  const report = formatStatusReport({
    devices: { active: 12, total: 17, peerless: 2 },
  });
  assert.equal(report.level, "warn");
  assert.equal(report.issues.some((i) => i.includes("thiếu peer")), true);
  assert.equal(report.lines.some((l) => l.includes("THIẾU peer")), true);
});
