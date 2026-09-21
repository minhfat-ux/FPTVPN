// Chuyên gia Vietlott (chủ dự án 21/09/2026: "anh chưa thấy chuyên gia vietlot cho fbuddy").
import "./helpers.js";
import test from "node:test";
import assert from "node:assert/strict";
import { RESEARCHER_PROFILES, pickResearcher } from "../src/researcher.js";

test("có hồ sơ chuyên gia xổ số điện toán (Vietlott)", () => {
  const profile = RESEARCHER_PROFILES.find((p) => p.id === "vietlot");
  assert.ok(profile, "phải có hồ sơ vietlot");
  assert.match(profile.label, /Vietlott|điện toán/i);
  assert.ok(profile.preferDomains.includes("vietlott.vn"), "nguồn chính thức phải là vietlott.vn");
  assert.equal(profile.requiresFresh, true, "kết quả phải là kỳ mới nhất");
});

test("câu hỏi về Vietlott vào đúng chuyên gia (kể cả 'xổ số điện toán')", () => {
  for (const question of [
    "kết quả vietlott mega 6/45 hôm nay",
    "xổ số điện toán power 6/55 kỳ mới nhất",
    "keno có bao nhiêu bậc giải",
    "dò vé vietlott max 4d",
  ]) {
    assert.equal(pickResearcher(question).id, "vietlot", `câu này phải vào chuyên gia vietlot: ${question}`);
  }
  // Không được cướp câu hỏi của chuyên gia khác
  assert.equal(pickResearcher("đạo hàm của x^2").id, "toan-hoc");
});

test("hồ sơ Vietlott CẤM dự đoán con số (an toàn, không hứa trúng thưởng)", () => {
  const note = RESEARCHER_PROFILES.find((p) => p.id === "vietlot").note ?? "";
  assert.match(note, /KHÔNG dự đoán con số/);
  assert.match(note, /không hứa trúng thưởng/i);
  assert.match(note, /ngẫu nhiên/);
  assert.match(note, /vietlott\.vn/);
});
