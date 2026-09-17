import "./helpers.js";
import test from "node:test";
import assert from "node:assert/strict";
import { initDb } from "../src/db.js";

initDb();
const { isConfirmed, wantsCompact, planChoices, planPayload, questionPayload } = await import("../src/skills/confirm.js");
const { excelChoices } = await import("../src/skills/vision.js");

test("only a short approval counts as confirmation, not the original request", () => {
  // The request itself must NOT skip the plan step.
  assert.equal(isConfirmed("Tạo file excel dự toán chi phí marketing 3 tháng"), false);
  assert.equal(isConfirmed("Làm slide 8 trang giới thiệu FlowGpt"), false);
  assert.equal(isConfirmed("Đưa hết data trong ảnh thành excel giúp anh"), false);
  assert.equal(isConfirmed(""), false);

  // Real approvals (and every button we render) do.
  for (const value of [
    "OK, tạo luôn theo kế hoạch này (6 trang)",
    "OK, tạo luôn nhưng gọn hơn: chỉ giữ phần chính, bỏ phần phụ",
    "đồng ý",
    "ok bạn",
    "chuẩn luôn",
    "triển khai đi em",
    "theo kế hoạch nhé",
    "bắt đầu tạo",
  ]) {
    assert.equal(isConfirmed(value), true, `phải coi là xác nhận: ${value}`);
  }

  // "Sửa kế hoạch" must not create anything.
  assert.equal(isConfirmed("Chưa tạo — em muốn sửa kế hoạch trước, hỏi em cần đổi gì nhé"), false);
});

test("every generated option is compatible with the confirmation check", () => {
  const ppt = planChoices({ kind: "pptx", detail: "8 trang" });
  const xlsx = planChoices({ kind: "xlsx", detail: "2 sheet" });
  const image = excelChoices("f_1", "IMG_1.jpeg");

  assert.equal(ppt.length, 3);
  assert.equal(xlsx.length, 3);
  assert.equal(image.length, 4);

  // Tapping "create"/"compact" (or a scope button) must be enough to build the file…
  for (const choice of [...ppt, ...xlsx, ...image]) {
    if (choice.id === "edit" || choice.id === "retry") {
      assert.equal(isConfirmed(choice.value), false, `${choice.id} không được tạo tệp`);
    } else {
      assert.equal(isConfirmed(choice.value), true, `${choice.id} phải tạo được tệp: ${choice.value}`);
    }
    assert.ok(choice.label && choice.value && choice.hint !== undefined);
  }
  assert.equal(wantsCompact(ppt[1].value), true);
  assert.equal(wantsCompact(ppt[0].value), false);
});

test("the plan payload carries what the UI needs and tells the model not to create yet", () => {
  const payload = planPayload({
    kind: "pptx",
    title: '"Báo cáo" — 6 trang',
    detail: "6 trang",
    plan: ["1. Mở đầu", "2. Số liệu"],
    notes: ["Nguồn nội dung: ảnh IMG_1.jpeg"],
    choices: planChoices({ kind: "pptx" }),
  });
  assert.equal(payload.ok, true);
  assert.equal(payload.artifacts.length, 0, "chưa được tạo tệp");
  assert.equal(payload.data.needsConfirm, true);
  assert.equal(payload.choices.length, 3);
  assert.match(payload.modelText, /CHƯA tạo tệp/);
  assert.match(payload.modelText, /Nguồn nội dung: ảnh IMG_1\.jpeg/);

  const question = questionPayload({ kind: "xlsx", questions: ["Bạn cần những cột nào?"], choices: [] });
  assert.equal(question.data.needsInput, true);
  assert.match(question.modelText, /thiếu thông tin/i);
  assert.match(question.modelText, /những cột nào/);
});
