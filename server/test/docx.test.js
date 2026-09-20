// Nghiệm thu công cụ Word mới (2026-09-20): phải qua bước xác nhận kế hoạch trước,
// và tệp sinh ra phải là .docx THẬT (zip có word/document.xml), không phải HTML đội lốt.
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateDocx } from "../src/skills/docx.js";

const ctx = { userId: "u1", conversationId: "c1", userMessage: "làm báo cáo tuần cho nhóm" };

const BLOCKS = [
  { type: "heading", level: 1, text: "Báo cáo tuần" },
  { type: "paragraph", text: "Tuần 38 ghi nhận 3 đầu việc hoàn thành." },
  { type: "heading", level: 2, text: "Kết quả" },
  { type: "bullets", items: ["Hoàn thành API", "Sửa 5 lỗi UI"] },
  { type: "numbers", items: ["Thu thập số liệu", "Tổng hợp báo cáo"] },
  { type: "table", columns: ["Đầu việc", "Giờ"], rows: [["API", 12], ["UI", 6]] },
  { type: "quote", text: "Số liệu lấy từ bảng chấm công." },
];

test("generate_docx: lượt đầu chỉ trả KẾ HOẠCH, chưa tạo tệp", async () => {
  const result = await generateDocx({ title: "Báo cáo tuần", blocks: BLOCKS }, ctx);
  assert.equal(result.ok, true);
  assert.equal(result.artifacts.length, 0, "chưa xác nhận thì không được ghi tệp");
  assert.equal(result.data.needsConfirm, true);
  assert.equal(result.data.kind, "docx");
  assert.ok(result.data.plan.length >= 5, "kế hoạch phải liệt kê các phần");
  assert.ok(result.choices.some((c) => c.id === "create"), "phải có nút xác nhận");
  assert.match(result.modelText, /CHƯA tạo tệp/);
});

test("generate_docx: thiếu blocks thì báo lỗi rõ, không ghi tệp", async () => {
  await assert.rejects(() => generateDocx({ title: "x", blocks: [] }, ctx), /blocks/);
});

test("generate_docx: bỏ phần rỗng, giữ đúng thứ tự", async () => {
  const result = await generateDocx({
    title: "T",
    sourceSummary: "Dàn ý do người dùng đưa trong chat",
    blocks: [
      { type: "heading", level: 1, text: "Mục 1" },
      { type: "paragraph", text: "" },
      { type: "bullets", items: [] },
      { type: "paragraph", text: "Nội dung thật" },
      { type: "pageBreak" },
    ],
  }, ctx);
  const plan = result.data.plan.join("\n");
  assert.match(plan, /Mục 1/);
  assert.match(plan, /Nội dung thật/);
  assert.match(plan, /Ngắt trang/);
  assert.ok(result.data.plan.every((line) => line.trim().length > 0), "kế hoạch không được có phần rỗng");
  assert.equal(result.data.plan.length, 3, "chỉ giữ 3 phần có nội dung");
});
