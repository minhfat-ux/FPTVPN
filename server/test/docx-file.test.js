// Tệp Word sinh ra phải MỞ ĐƯỢC: đúng OOXML (.docx = zip có word/document.xml),
// có tiêu đề, mục, bảng, gạch đầu dòng — không phải HTML/RTF đội lốt .docx.
import "./helpers.js";
import test, { after } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { closeServer } from "./helpers.js";

const { initDb } = await import("../src/db.js");
initDb();
const { createUser } = await import("../src/auth.js");
const { generateDocx } = await import("../src/skills/docx.js");
const { getFileRow } = await import("../src/files.js").catch(() => ({ getFileRow: null }));

after(async () => {
  await closeServer();
});

const user = createUser({ email: "word@fbuddy.test", password: "matkhau12345", name: "Word" });
const ctx = {
  userId: user.id,
  conversationId: null,
  userMessage: "ok, tạo luôn theo kế hoạch này", // đúng câu xác nhận của nút trên giao diện
};

test("generate_docx tạo .docx hợp lệ và mở được", async () => {
  const result = await generateDocx({
    filename: "bao-cao-tuan",
    title: "Báo cáo tuần 38",
    subtitle: "Nhóm sản phẩm",
    theme: "flow",
    blocks: [
      { type: "heading", level: 1, text: "Báo cáo tuần 38" }, // trùng tiêu đề ⇒ bỏ, không lặp
      { type: "paragraph", text: "Tuần 38 hoàn thành 3 đầu việc chính." },
      { type: "heading", level: 2, text: "Kết quả" },
      { type: "bullets", items: ["Hoàn thành API chat", "Sửa 5 lỗi giao diện"] },
      { type: "numbers", items: ["Thu thập số liệu", "Tổng hợp báo cáo"] },
      { type: "table", columns: ["Đầu việc", "Giờ"], rows: [["API chat", 12], ["Giao diện", 6]] },
      { type: "quote", text: "Số liệu lấy từ bảng chấm công tuần." },
    ],
  }, ctx);

  assert.equal(result.ok, true);
  assert.equal(result.artifacts.length, 1, "phải trả về đúng 1 tệp");
  const artifact = result.artifacts[0];
  assert.match(artifact.name, /\.docx$/);
  assert.equal(artifact.mime, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  assert.equal(artifact.kind, "docx");

  // Đọc lại chính tệp đã lưu (đường dẫn thật trên đĩa) rồi kiểm cấu trúc OOXML.
  const { all } = await import("../src/db.js");
  const row = all("files", "id = ?", [artifact.id])[0];
  assert.ok(row, "tệp phải có trong DB");
  const { buffer: buf } = await (await import("../src/files.js")).readFileBuffer(row);
  assert.equal(buf.subarray(0, 2).toString(), "PK", "docx là zip");

  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files);
  assert.ok(names.includes("[Content_Types].xml"), "thiếu [Content_Types].xml");
  assert.ok(names.includes("word/document.xml"), "thiếu word/document.xml");
  assert.ok(names.includes("word/_rels/document.xml.rels"), "thiếu quan hệ của document");
  assert.ok(names.includes("word/numbering.xml"), "thiếu numbering cho danh sách đánh số");

  const xml = await zip.file("word/document.xml").async("string");
  assert.match(xml, /Báo cáo tuần 38/, "thiếu tiêu đề");
  assert.match(xml, /Kết quả/, "thiếu mục cấp 2");
  assert.match(xml, /Hoàn thành API chat/, "thiếu gạch đầu dòng");
  assert.match(xml, /Thu thập số liệu/, "thiếu bước đánh số");
  assert.match(xml, /Đầu việc/, "thiếu tiêu đề bảng");
  assert.match(xml, /<w:tbl>/, "thiếu bảng thật");
  assert.match(xml, /Số liệu lấy từ bảng chấm công tuần\./, "thiếu ghi chú");
  // Chân trang là part riêng (word/footer1.xml) — document.xml chỉ tham chiếu nó.
  assert.match(xml, /<w:footerReference/, "thiếu tham chiếu chân trang");
  const footerName = names.find((n) => /^word\/footer\d+\.xml$/.test(n));
  assert.ok(footerName, "thiếu part chân trang");
  const footerXml = await zip.file(footerName).async("string");
  assert.match(footerXml, /fBuddy/, "chân trang phải có tên thương hiệu");
  assert.match(footerXml, /PAGE|fldChar/, "chân trang phải có số trang tự động");
  assert.doesNotMatch(xml, /<html/i, "không được là HTML đội lốt");
  // Tiêu đề tài liệu chỉ xuất hiện MỘT lần (heading trùng đã bị bỏ).
  assert.equal(xml.split("Báo cáo tuần 38").length - 1, 1, "tiêu đề không được lặp 2 lần");
});

test("generate_docx: số liệu trong bảng giữ nguyên, cột số canh phải", async () => {
  const result = await generateDocx({
    title: "Bảng lương",
    blocks: [
      {
        type: "table",
        columns: ["Tên", "Lương"],
        rows: [["An", 12000000], ["Bình", 9500000]],
      },
    ],
  }, ctx);
  const { all } = await import("../src/db.js");
  const row = all("files", "id = ?", [result.artifacts[0].id])[0];
  const { buffer: body } = await (await import("../src/files.js")).readFileBuffer(row);
  const zip = await JSZip.loadAsync(body);
  const xml = await zip.file("word/document.xml").async("string");
  assert.match(xml, /12000000/, "số liệu phải giữ nguyên, không format mất giá trị");
  assert.match(xml, /w:jc w:val="right"/, "cột số phải canh phải");
});
