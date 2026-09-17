import ExcelJS from "exceljs";
import { saveBuffer, publicArtifact, normalizeMime } from "../files.js";
import { badRequest } from "../util.js";
import { isConfirmed, planChoices, planPayload } from "./confirm.js";

function normalizeSheets(input) {
  if (!Array.isArray(input) || !input.length) {
    throw badRequest("generate_xlsx cần `sheets` là mảng có ít nhất 1 sheet");
  }
  return input.slice(0, 20).map((sheet, index) => {
    const columns = Array.isArray(sheet?.columns) ? sheet.columns.map((c) => String(c ?? "")) : [];
    const rows = Array.isArray(sheet?.rows) ? sheet.rows : [];
    if (!columns.length && rows.length) {
      return {
        name: String(sheet?.name ?? `Sheet${index + 1}`).slice(0, 31),
        columns: rows[0].map((_, i) => `Cột ${i + 1}`),
        rows,
        totalsRow: Boolean(sheet?.totalsRow),
        numberFormats: sheet?.numberFormats ?? null,
      };
    }
    return {
      name: String(sheet?.name ?? `Sheet${index + 1}`).slice(0, 31),
      columns,
      rows,
      totalsRow: Boolean(sheet?.totalsRow),
      numberFormats: sheet?.numberFormats ?? null,
    };
  });
}

function toCellValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" || typeof value === "boolean" || value instanceof Date) return value;
  if (typeof value === "object") return JSON.stringify(value);
  return value;
}

const HEADER_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D4ED8" } };
const TOTAL_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF6FF" } };

/** Builds an .xlsx workbook (formatted headers, autofilter, optional totals row). */
export async function generateXlsx(args, ctx) {
  const sheets = Array.isArray(args?.sheets) ? args.sheets : [];
  if (!sheets.length) throw badRequest("generate_xlsx cần `sheets` là mảng có ít nhất 1 phần tử");

  const userText = ctx?.userMessage ?? "";
  // Same rule as the deck: show what will be built (sheets, columns, row counts and
  // where the numbers come from) and wait for a yes before writing the file.
  if (!isConfirmed(userText)) {
    const totalRows = sheets.reduce((total, sheet) => total + (Array.isArray(sheet?.rows) ? sheet.rows.length : 0), 0);
    return planPayload({
      kind: "xlsx",
      title: `${sheets.length} sheet · ${totalRows} dòng`,
      detail: `${sheets.length} sheet`,
      plan: sheets.map((sheet, index) => {
        const columns = Array.isArray(sheet?.columns) ? sheet.columns : [];
        const rows = Array.isArray(sheet?.rows) ? sheet.rows.length : 0;
        return `Sheet ${index + 1} "${sheet?.name ?? "Du lieu"}": ${columns.length} cột (${columns.slice(0, 8).join(", ")}) · ${rows} dòng`;
      }),
      notes: args?.sourceSummary
        ? [`Nguồn dữ liệu: ${String(args.sourceSummary).slice(0, 300)}`]
        : ["Nguồn dữ liệu: nội dung trong yêu cầu của người dùng"],
      choices: planChoices({ kind: "xlsx", detail: `${sheets.length} sheet` }),
    });
  }
  const prepared = normalizeSheets(args?.sheets);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "fBuddy";
  workbook.created = new Date();

  let totalRows = 0;
  for (const sheet of prepared) {
    const ws = workbook.addWorksheet(sheet.name, {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    ws.columns = sheet.columns.map((header) => ({
      header,
      key: header,
      width: Math.min(42, Math.max(12, header.length + 6)),
    }));
    ws.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
      cell.fill = HEADER_FILL;
      cell.alignment = { vertical: "middle", horizontal: "left" };
      cell.border = { bottom: { style: "thin", color: { argb: "FF93C5FD" } } };
    });
    ws.getRow(1).height = 22;

    for (const row of sheet.rows.slice(0, 20000)) {
      const values = Array.isArray(row) ? row.map(toCellValue) : [toCellValue(row)];
      ws.addRow(values);
    }
    totalRows += sheet.rows.length;

    const formats = sheet.numberFormats ?? autoFormats(sheet.columns, sheet.rows);
    if (formats) {
      for (const [columnIndex, format] of Object.entries(formats)) {
        const col = ws.getColumn(Number(columnIndex) + 1);
        if (col) col.numFmt = format;
      }
    }

    if (sheet.totalsRow && sheet.rows.length) {
      const totals = sheet.columns.map((_, columnIndex) => {
        const values = sheet.rows
          .map((row) => (Array.isArray(row) ? row[columnIndex] : null))
          .filter((v) => typeof v === "number" && Number.isFinite(v));
        if (!values.length) return null;
        return { formula: `SUM(${ws.getColumn(columnIndex + 1).letter}2:${ws.getColumn(columnIndex + 1).letter}${sheet.rows.length + 1})` };
      });
      const first = totals.findIndex((t) => t);
      if (first > 0) totals[0] = "TỔNG";
      const row = ws.addRow(totals.map((t) => t ?? null));
      row.eachCell((cell) => {
        cell.font = { bold: true };
        cell.fill = TOTAL_FILL;
      });
    }

    if (sheet.columns.length) {
      ws.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: Math.max(1, sheet.rows.length + 1), column: sheet.columns.length },
      };
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const name = String(args?.filename ?? "fbuddy-data").replace(/\.xlsx?$/i, "");
  const row = await saveBuffer({
    userId: ctx.userId,
    conversationId: ctx.conversationId,
    name: `${safeName(name)}.xlsx`,
    mime: normalizeMime("", "a.xlsx"),
    buffer: Buffer.from(buffer),
    kind: "xlsx",
    origin: "artifact",
    meta: { sheetCount: prepared.length, rowCount: totalRows, tool: "generate_xlsx" },
  });
  const artifact = publicArtifact(row);
  return {
    ok: true,
    summary: `Đã tạo ${sheets.length} sheet (${totalRows} dòng): ${artifact.name}`,
    data: { sheetCount: sheets.length, rowCount: totalRows },
    artifacts: [artifact],
    modelText: `Đã tạo tệp Excel "${artifact.name}" với ${sheets.length} sheet, ${totalRows} dòng dữ liệu (id: ${artifact.id}).`,
  };
}

function autoFormats(columns, rows) {
  const formats = {};
  columns.forEach((_, index) => {
    const sample = rows.slice(0, 50).map((row) => (Array.isArray(row) ? row[index] : null));
    const numbers = sample.filter((v) => typeof v === "number" && Number.isFinite(v));
    if (!numbers.length) return;
    const allInt = numbers.every((n) => Number.isInteger(n));
    const moneyLike = /(tiền|giá|doanh thu|chi phí|amount|price|total|cost|revenue|salary|lương)/i.test(
      String(columns[index] ?? ""),
    );
    if (moneyLike) formats[index] = "#,##0";
    else if (allInt) formats[index] = "#,##0";
    else formats[index] = "#,##0.00";
  });
  return formats;
}

function safeName(name) {
  return (
    String(name)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w\s.-]+/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60) || "fbuddy-data"
  );
}
