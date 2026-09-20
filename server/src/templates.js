/**
 * Thư viện TEMPLATE của người dùng (Word/Excel/PPT) — yêu cầu chủ dự án 2026-09-20:
 * "anh muốn có thêm thư viện templates cho word, excel, ppt mà người dùng tự đưa vào làm
 *  templates để sau này fbuddy dùng lại cho họ".
 *
 * Cách dùng thực tế:
 *  - Người dùng tải mẫu của họ lên (giữ nguyên định dạng của họ).
 *  - Khi tạo tệp, chọn mẫu đó ⇒ fBuddy BÁM THEO mẫu thay vì tạo file trắng.
 *  - `.xlsx`: ĐIỀN SỐ LIỆU THẬT vào đúng workbook mẫu (giữ công thức/định dạng/logo).
 *  - `.docx`/`.pptx`: trích cấu trúc mẫu (tiêu đề, mục, thứ tự) đưa vào prompt để bản tạo ra
 *    đi đúng bố cục mẫu. (Điền placeholder nhị phân là bước nâng cấp tiếp theo.)
 */
import path from "node:path";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { all, getById, insert, remove } from "./db.js";
import { db } from "./db.js";
import { readFileBuffer, saveBuffer } from "./files.js";
import { badRequest, forbidden, notFound } from "./util.js";

const KINDS = { ".docx": "docx", ".xlsx": "xlsx", ".pptx": "pptx" };
const MAX_BYTES = 15 * 1024 * 1024;

export function templateKind(filename) {
  return KINDS[path.extname(String(filename ?? "")).toLowerCase()] ?? null;
}

export function ensureTemplatesTable() {
  db.exec(`
CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  kind TEXT NOT NULL,
  shared INTEGER NOT NULL DEFAULT 0,
  file_id TEXT NOT NULL,
  original_name TEXT,
  size INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_templates_user ON templates(user_id);
`);
}

function publicTemplate(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    kind: row.kind,
    shared: Boolean(row.shared),
    size: row.size,
    createdAt: row.created_at,
    ownerId: row.user_id,
  };
}

export async function createTemplate({ userId, name, description = null, shared = false, buffer, originalName, mime }) {
  ensureTemplatesTable();
  const kind = templateKind(originalName);
  if (!kind) throw badRequest("Chỉ nhận mẫu .docx, .xlsx hoặc .pptx");
  if (!buffer?.length) throw badRequest("Tệp mẫu trống");
  if (buffer.length > MAX_BYTES) throw badRequest(`Mẫu tối đa ${Math.round(MAX_BYTES / 1024 / 1024)}MB`);
  const cleanName = String(name ?? "").trim() || path.basename(String(originalName ?? "mẫu"), path.extname(String(originalName ?? "")));
  const file = await saveBuffer({
    userId,
    conversationId: null,
    name: `template-${cleanName}${path.extname(originalName)}`.slice(0, 120),
    mime: mime ?? null,
    buffer,
    kind: "template",
    origin: "template",
    meta: { template: true },
  });
  const row = insert("templates", {
    user_id: userId,
    name: cleanName.slice(0, 120),
    description: description ? String(description).slice(0, 400) : null,
    kind,
    shared: shared ? 1 : 0,
    file_id: file.id,
    original_name: String(originalName ?? "").slice(0, 200),
    size: buffer.length,
  });
  return publicTemplate(getById("templates", row.id));
}

/** Mẫu của tôi + mẫu dùng chung (admin đưa lên cho cả công ty). */
export function listTemplates({ userId, includeShared = true } = {}) {
  ensureTemplatesTable();
  const rows = all("templates", "", [], { order: "created_at DESC" });
  return rows
    .filter((row) => row.user_id === userId || (includeShared && Number(row.shared) === 1))
    .map(publicTemplate);
}

export function getTemplateRow(id) {
  ensureTemplatesTable();
  const row = getById("templates", id);
  if (!row) throw notFound("Không tìm thấy mẫu");
  return row;
}

/** Chỉ chủ sở hữu (hoặc admin) được dùng/xoá mẫu. */
export function requireTemplateAccess(row, user) {
  if (!row) throw notFound("Không tìm thấy mẫu");
  const isOwner = row.user_id === user?.id;
  const isShared = Number(row.shared) === 1;
  if (!isOwner && !isShared && user?.role !== "admin") throw forbidden("Mẫu này không thuộc tài khoản của bạn");
  return row;
}

export function deleteTemplate(id, user) {
  const row = requireTemplateAccess(getTemplateRow(id), user);
  if (row.user_id !== user?.id && user?.role !== "admin") throw forbidden("Chỉ chủ sở hữu mới xoá được mẫu");
  remove("templates", id);
  return { ok: true };
}

/** Đọc tệp mẫu (buffer) để dùng khi tạo tài liệu. */
export async function readTemplateBuffer(row) {
  const file = getById("files", row.file_id);
  if (!file) throw notFound("Tệp mẫu không còn trong kho");
  const { buffer } = await readFileBuffer(file);
  return buffer;
}

/** Lấy toàn bộ chữ trong zip OOXML (docx/pptx) để mô tả cấu trúc mẫu cho model. */
async function ooxmlText(buffer, prefix) {
  try {
    const zip = await JSZip.loadAsync(buffer);
    const names = Object.keys(zip.files).filter((n) => n.startsWith(prefix) && n.endsWith(".xml")).sort();
    const chunks = [];
    for (const name of names.slice(0, 40)) {
      const xml = await zip.file(name).async("string");
      const text = xml
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (text) chunks.push(text.slice(0, 600));
    }
    return chunks;
  } catch {
    return [];
  }
}

/**
 * Mô tả mẫu để đưa vào system prompt: model phải bám theo bố cục/văn phong của mẫu.
 * Trả về chuỗi rỗng nếu không đọc được (khi đó lượt chat vẫn chạy bình thường).
 */
export async function describeTemplate(row) {
  if (!row) return "";
  const header = `MẪU NGƯỜI DÙNG CHỌN: "${row.name}" (${row.kind}${row.description ? ` · ${row.description}` : ""}). Phải bám đúng bố cục, thứ tự mục và văn phong của mẫu này.`;
  try {
    const buffer = await readTemplateBuffer(row);
    if (row.kind === "docx") {
      const parts = await ooxmlText(buffer, "word/");
      return `${header}\nNội dung mẫu (giữ đúng các mục này, thay nội dung bằng dữ liệu thật):\n${parts.join("\n").slice(0, 3000)}`;
    }
    if (row.kind === "pptx") {
      const parts = await ooxmlText(buffer, "ppt/slides/");
      return `${header}\nCác slide trong mẫu (giữ đúng thứ tự và tiêu đề):\n${parts.join("\n").slice(0, 3000)}`;
    }
    if (row.kind === "xlsx") {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer);
      const sheets = wb.worksheets.map((ws) => {
        const headers = [];
        ws.getRow(1).eachCell((cell) => headers.push(String(cell.value ?? "").trim()));
        return `Sheet "${ws.name}" · cột: ${headers.filter(Boolean).join(" | ") || "(trống)"} · ${ws.rowCount} dòng`;
      });
      return `${header}\nWorkbook mẫu:\n${sheets.join("\n")}\nSố liệu sẽ được ĐIỀN VÀO CHÍNH workbook này (giữ công thức, định dạng, logo).`;
    }
  } catch {
    return header;
  }
  return header;
}

/**
 * Điền dữ liệu vào WORKBOOK MẪU (.xlsx) — giữ nguyên định dạng/công thức của người dùng.
 *
 * Quy tắc: ghi từ dòng 2 (dòng 1 là tiêu đề của mẫu), theo đúng thứ tự cột có sẵn; nếu sheet
 * trong mẫu chưa có, tạo thêm sheet mới ở cuối.
 */
export async function fillXlsxTemplate({ templateRow, sheets }) {
  const buffer = await readTemplateBuffer(templateRow);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  let written = 0;
  const usedSheets = [];
  for (const sheet of sheets) {
    const target =
      wb.getWorksheet(sheet.name) ??
      wb.worksheets[usedSheets.length] ??
      wb.addWorksheet(sheet.name || `Sheet${wb.worksheets.length + 1}`);
    usedSheets.push(target.name);
    const rows = Array.isArray(sheet.rows) ? sheet.rows : [];
    rows.forEach((row, index) => {
      const values = Array.isArray(row) ? row : [row];
      values.forEach((value, columnIndex) => {
        const cell = target.getCell(index + 2, columnIndex + 1);
        // Chỉ ghi khi ô trống hoặc là ô dữ liệu: KHÔNG ghi đè ô có công thức của mẫu.
        const existing = cell.value;
        const hasFormula = existing && typeof existing === "object" && "formula" in existing;
        if (!hasFormula) cell.value = value ?? null;
      });
      written += 1;
    });
  }
  const out = await wb.xlsx.writeBuffer();
  return { buffer: Buffer.from(out), written };
}
