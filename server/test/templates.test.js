// Thư viện template (yêu cầu chủ dự án 2026-09-20): người dùng tự đưa mẫu Word/Excel/PPT lên
// để fBuddy dùng lại — và với .xlsx thì ĐIỀN SỐ LIỆU VÀO CHÍNH MẪU (giữ định dạng/công thức).
import "./helpers.js";
import test, { after } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { closeServer } from "./helpers.js";

const { initDb } = await import("../src/db.js");
initDb();
const { createUser } = await import("../src/auth.js");
const templates = await import("../src/templates.js");

after(async () => { await closeServer(); });

const user = createUser({ email: `tpl${Date.now()}@fbuddy.test`, password: "matkhau12345", name: "Tpl" });

async function sampleXlsx() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Báo cáo");
  ws.addRow(["Ngày", "Doanh thu", "Ghi chú"]);
  ws.getRow(1).font = { bold: true };
  ws.getCell("C3").value = { formula: "B2*0.1", result: 0 };  // công thức của mẫu phải được giữ
  return Buffer.from(await wb.xlsx.writeBuffer());
}

test("tải mẫu .xlsx lên, liệt kê và đọc lại được", async () => {
  const item = await templates.createTemplate({
    userId: user.id,
    name: "Mẫu báo cáo tháng",
    description: "Bảng doanh thu của phòng",
    buffer: await sampleXlsx(),
    originalName: "bao-cao-thang.xlsx",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  assert.equal(item.kind, "xlsx");
  assert.equal(item.name, "Mẫu báo cáo tháng");
  const list = templates.listTemplates({ userId: user.id });
  assert.ok(list.some((t) => t.id === item.id), "mẫu phải có trong danh sách của chủ sở hữu");
  // Người khác không thấy mẫu riêng tư này
  assert.equal(templates.listTemplates({ userId: "u_ai_do" }).some((t) => t.id === item.id), false);
});

test("từ chối định dạng không phải mẫu văn phòng", async () => {
  await assert.rejects(() => templates.createTemplate({
    userId: user.id, name: "x", buffer: Buffer.from("hello"), originalName: "ghi-chu.txt",
  }), /docx|xlsx|pptx/);
});

test("điền số liệu vào CHÍNH workbook mẫu và giữ công thức", async () => {
  const row = templates.getTemplateRow(
    templates.listTemplates({ userId: user.id }).find((t) => t.name === "Mẫu báo cáo tháng").id,
  );
  const { buffer, written } = await templates.fillXlsxTemplate({
    templateRow: row,
    sheets: [{ name: "Báo cáo", rows: [["2026-09-20", 12500000, "bán lẻ"]] }],
  });
  assert.equal(written, 1);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.getWorksheet("Báo cáo");
  assert.ok(ws, "phải giữ đúng tên sheet của mẫu");
  assert.equal(String(ws.getCell("A2").value), "2026-09-20", "dữ liệu ghi từ dòng 2");
  assert.equal(Number(ws.getCell("B2").value), 12500000);
  // công thức có sẵn trong mẫu vẫn còn
  const c3 = ws.getCell("C3").value;
  assert.ok(c3 && typeof c3 === "object" && "formula" in c3, "công thức của mẫu phải được giữ");
});

test("mô tả mẫu cho model (docx: đọc được cấu trúc)", async () => {
  const zip = new JSZip();
  zip.file("word/document.xml", "<w:document><w:body><w:p><w:r><w:t>MỤC 1: Bối cảnh</w:t></w:r></w:p><w:p><w:r><w:t>MỤC 2: Đề xuất</w:t></w:r></w:p></w:body></w:document>");
  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  const item = await templates.createTemplate({
    userId: user.id, name: "Mẫu công văn", buffer, originalName: "cong-van.docx",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  const row = templates.getTemplateRow(item.id);
  const text = await templates.describeTemplate(row);
  assert.match(text, /Mẫu công văn/);
  assert.match(text, /MỤC 1: Bối cảnh/, "phải trích được nội dung mẫu để model bám theo");
});

test("mẫu dùng chung chỉ admin mới bật được (kiểm ở route), quyền dùng chặt", async () => {
  const item = await templates.createTemplate({
    userId: user.id, name: "Mẫu riêng", buffer: await sampleXlsx(), originalName: "rieng.xlsx",
  });
  const row = templates.getTemplateRow(item.id);
  assert.throws(() => templates.requireTemplateAccess(row, { id: "u_khac", role: "user" }), /không thuộc/);
  assert.doesNotThrow(() => templates.requireTemplateAccess(row, { id: "u_admin", role: "admin" }));
});
