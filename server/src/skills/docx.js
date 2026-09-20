/**
 * Word (.docx) generator — báo cáo, công văn, biên bản, hợp đồng, đề xuất.
 *
 * Cùng luật với `generate_pptx`/`generate_xlsx`: **đề xuất kế hoạch trước, chỉ ghi
 * tệp sau khi người dùng xác nhận** (xem `./confirm.js`). Không có bước này thì một
 * model nhỏ sẽ "trả lời bằng văn xuôi" và người dùng thấy y như "làm Word không ra file".
 *
 * Vì sao cần công cụ này: trước 2026-09-20 hệ thống chỉ có `generate_pptx` và
 * `generate_xlsx`, nên mọi yêu cầu "xuất file Word/.docx" đều bị từ chối.
 */
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  LevelFormat,
  PageBreak,
  PageNumber,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { saveBuffer, publicArtifact, normalizeMime } from "../files.js";
import { badRequest } from "../util.js";
import { isConfirmed, planChoices, planPayload } from "./confirm.js";

/** Bảng màu chữ tiêu đề — lấy đúng màu thương hiệu đang dùng ở web/agent. */
const THEMES = {
  flow: "1D4ED8",
  dark: "0F172A",
  warm: "B45309",
  mint: "0F766E",
};

const HEADING_LEVELS = { 1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2, 3: HeadingLevel.HEADING_3 };

function asText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function normalizeBlocks(input) {
  if (!Array.isArray(input) || !input.length) {
    throw badRequest("generate_docx cần `blocks` là mảng có ít nhất 1 phần tử");
  }
  return input.slice(0, 400).map((block) => {
    const type = String(block?.type ?? "paragraph").toLowerCase();
    if (["heading", "h1", "h2", "h3"].includes(type)) {
      const level = type === "heading" ? Math.min(3, Math.max(1, Number(block?.level ?? 1))) : Number(type[1]);
      return { type: "heading", level, text: asText(block?.text ?? block?.title) };
    }
    if (["bullets", "bullet", "list"].includes(type)) {
      return { type: "bullets", items: (Array.isArray(block?.items) ? block.items : []).slice(0, 200).map(asText) };
    }
    if (["numbers", "numbered", "steps"].includes(type)) {
      return { type: "numbers", items: (Array.isArray(block?.items) ? block.items : []).slice(0, 200).map(asText) };
    }
    if (["table", "grid"].includes(type)) {
      const columns = (Array.isArray(block?.columns) ? block.columns : []).slice(0, 12).map(asText);
      const rows = (Array.isArray(block?.rows) ? block.rows : []).slice(0, 400);
      return { type: "table", columns, rows, header: block?.header !== false };
    }
    if (["quote", "note", "callout"].includes(type)) {
      return { type: "quote", text: asText(block?.text) };
    }
    if (["pagebreak", "page-break", "break"].includes(type)) return { type: "pageBreak" };
    return { type: "paragraph", text: asText(block?.text ?? block?.content) };
  }).filter((block) => {
    if (block.type === "heading") return Boolean(block.text);
    if (block.type === "paragraph" || block.type === "quote") return Boolean(block.text);
    if (block.type === "pageBreak") return true;
    return Array.isArray(block.items) ? block.items.length > 0 : block.rows.length > 0 || block.columns.length > 0;
  });
}

function planLine(block, index) {
  switch (block.type) {
    case "heading":
      return `${"#".repeat(block.level)} ${block.text}`;
    case "bullets":
      return `${block.items.length} gạch đầu dòng`;
    case "numbers":
      return `${block.items.length} bước đánh số`;
    case "table": {
      const cols = block.columns.length || (Array.isArray(block.rows[0]) ? block.rows[0].length : 0);
      return `Bảng ${cols} cột · ${block.rows.length} dòng`;
    }
    case "quote":
      return `Ghi chú: ${block.text.slice(0, 80)}`;
    case "pageBreak":
      return "Ngắt trang";
    default:
      return block.text.length > 90 ? `${block.text.slice(0, 90)}…` : block.text;
  }
}

/** Cột bảng canh phải cho cột số — đọc từ chính dữ liệu, không đoán theo tên cột. */
function numericColumns(rows) {
  const columnCount = rows.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 0), 0);
  const numeric = new Set();
  for (let index = 0; index < columnCount; index += 1) {
    const values = rows
      .slice(0, 40)
      .map((row) => (Array.isArray(row) ? row[index] : null))
      .filter((value) => value !== null && value !== undefined && value !== "");
    if (values.length && values.every((value) => typeof value === "number" || /^-?[\d.,]+$/.test(String(value)))) {
      numeric.add(index);
    }
  }
  return numeric;
}

function tableBlock(block, accent) {
  const rows = block.rows.filter((row) => Array.isArray(row) ? row.length : asText(row).length);
  const columnCount = Math.max(
    block.columns.length,
    rows.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 1), 0),
    1,
  );
  const numeric = numericColumns(rows);
  const cellWidth = Math.floor(100 / columnCount);
  const headerRow = block.header && (block.columns.length || rows.length)
    ? [block.columns.length ? block.columns : rows[0].map((_, i) => `Cột ${i + 1}`)]
    : [];
  const bodyRows = headerRow.length && !block.columns.length ? rows.slice(1) : rows;

  const makeCell = (value, { head = false, numericCell = false } = {}) => new TableCell({
    width: { size: cellWidth, type: WidthType.PERCENTAGE },
    shading: head ? { type: ShadingType.CLEAR, fill: accent, color: "auto" } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [
      new Paragraph({
        alignment: numericCell && !head ? AlignmentType.RIGHT : AlignmentType.LEFT,
        children: [new TextRun({ text: asText(value), bold: head, color: head ? "FFFFFF" : "111827", size: 21 })],
      }),
    ],
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: "D7DEEA" },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: "D7DEEA" },
      left: { style: BorderStyle.SINGLE, size: 4, color: "D7DEEA" },
      right: { style: BorderStyle.SINGLE, size: 4, color: "D7DEEA" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: "E7EDF6" },
      insideVertical: { style: BorderStyle.SINGLE, size: 2, color: "E7EDF6" },
    },
    rows: [
      ...headerRow.map((cells) => new TableRow({
        tableHeader: true,
        children: cells.map((value, index) => makeCell(value, { head: true, numericCell: numeric.has(index) })),
      })),
      ...bodyRows.map((row) => {
        const cells = Array.isArray(row) ? row : [row];
        const padded = [...cells, ...Array(Math.max(0, columnCount - cells.length)).fill("")];
        return new TableRow({
          children: padded.slice(0, columnCount).map((value, index) => makeCell(value, { numericCell: numeric.has(index) })),
        });
      }),
    ],
  });
}

function blocksToChildren(blocks, { accent, title }) {
  const children = [];
  let firstHeadingSkipped = false;

  for (const block of blocks) {
    switch (block.type) {
      case "heading": {
        // Tiêu đề tài liệu đã in ở đầu trang ⇒ bỏ heading cấp 1 trùng tên tài liệu.
        if (block.level === 1 && !firstHeadingSkipped) {
          firstHeadingSkipped = true;
          if (block.text.trim().toLowerCase() === String(title ?? "").trim().toLowerCase()) continue;
        }
        children.push(new Paragraph({
          heading: HEADING_LEVELS[block.level],
          spacing: { before: block.level === 1 ? 320 : 240, after: 120 },
          children: [new TextRun({ text: block.text, color: accent })],
        }));
        break;
      }
      case "bullets":
        for (const item of block.items) {
          children.push(new Paragraph({ text: item, bullet: { level: 0 }, spacing: { after: 60 } }));
        }
        break;
      case "numbers":
        for (const item of block.items) {
          children.push(new Paragraph({
            text: item,
            numbering: { reference: "fbuddy-steps", level: 0 },
            spacing: { after: 60 },
          }));
        }
        break;
      case "table":
        children.push(tableBlock(block, accent));
        children.push(new Paragraph({ text: "", spacing: { after: 120 } }));
        break;
      case "quote":
        children.push(new Paragraph({
          spacing: { before: 120, after: 120 },
          indent: { left: 240 },
          border: { left: { style: BorderStyle.SINGLE, size: 12, color: accent } },
          children: [new TextRun({ text: block.text, italics: true, color: "374151" })],
        }));
        break;
      case "pageBreak":
        children.push(new Paragraph({ children: [new PageBreak()] }));
        break;
      default:
        children.push(new Paragraph({ text: block.text, spacing: { after: 140 }, alignment: AlignmentType.JUSTIFIED }));
    }
  }
  return children;
}

function safeName(name) {
  return String(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s.-]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60) || "fbuddy-document";
}

/** Builds a .docx (title block, headings, bullets, numbered steps, tables, footer). */
export async function generateDocx(args, ctx) {
  const blocks = Array.isArray(args?.blocks) ? args.blocks : [];
  if (!blocks.length) throw badRequest("generate_docx cần `blocks` là mảng có ít nhất 1 phần tử");

  const userText = ctx?.userMessage ?? "";
  if (!isConfirmed(userText)) {
    const preview = normalizeBlocks(blocks);
    const tables = preview.filter((block) => block.type === "table");
    return planPayload({
      kind: "docx",
      title: `${preview.filter((b) => b.type === "heading").length} mục · ${preview.length} phần`,
      detail: "theo dàn ý trên",
      plan: preview.slice(0, 24).map((block, index) => planLine(block, index)),
      notes: [
        args?.sourceSummary
          ? `Nguồn nội dung: ${String(args.sourceSummary).slice(0, 300)}`
          : "Nguồn nội dung: yêu cầu của người dùng trong hội thoại này",
        tables.length ? `Có ${tables.length} bảng — số liệu giữ nguyên như đã nêu, không tự thêm.` : "",
      ].filter(Boolean),
      choices: planChoices({ kind: "docx", detail: "theo dàn ý trên" }),
    });
  }

  const prepared = normalizeBlocks(blocks);
  // `accent` PHẢI là hex 6 ký tự (docx ném lỗi nếu nhận tên theme).
  const themeName = String(args?.theme ?? "flow").toLowerCase();
  const accent = THEMES[themeName] ?? THEMES.flow;
  const title = asText(args?.title) || "Tài liệu";
  const subtitle = asText(args?.subtitle);
  const author = asText(args?.author) || "fBuddy";

  const heading = [
    new Paragraph({
      spacing: { after: 80 },
      children: [new TextRun({ text: title, bold: true, size: 44, color: accent })],
    }),
    subtitle
      ? new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: subtitle, size: 26, color: "4B5563" })] })
      : null,
    new Paragraph({
      spacing: { after: 240 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "D7DEEA" } },
      children: [
        new TextRun({
          text: author === "fBuddy"
            ? `fBuddy · ${new Date().toLocaleDateString("vi-VN")}`
            : `${author} · fBuddy · ${new Date().toLocaleDateString("vi-VN")}`,
          size: 18,
          color: "6B7280",
        }),
      ],
    }),
  ].filter(Boolean);

  const doc = new Document({
    creator: "fBuddy",
    title,
    description: subtitle || title,
    styles: {
      default: {
        document: { run: { font: "Calibri", size: 22 } },
      },
    },
    numbering: {
      config: [
        {
          reference: "fbuddy-steps",
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: "%1.",
              alignment: AlignmentType.START,
              style: { paragraph: { indent: { left: 420, hanging: 260 } } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } },
        },
        footers: args?.footer === false
          ? undefined
          : {
              default: new Footer({
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [
                      new TextRun({ text: `${title} · fBuddy · trang `, size: 16, color: "9CA3AF" }),
                      new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "9CA3AF" }),
                    ],
                  }),
                ],
              }),
            },
        children: [...heading, ...blocksToChildren(prepared, { accent, title })],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const name = String(args?.filename ?? title).replace(/\.docx?$/i, "");
  const row = await saveBuffer({
    userId: ctx.userId,
    conversationId: ctx.conversationId,
    name: `${safeName(name)}.docx`,
    mime: normalizeMime("", "a.docx"),
    buffer: Buffer.from(buffer),
    kind: "docx",
    origin: "artifact",
    meta: {
      blockCount: prepared.length,
      tableCount: prepared.filter((block) => block.type === "table").length,
      tool: "generate_docx",
    },
  });
  const artifact = publicArtifact(row);
  const tableCount = prepared.filter((block) => block.type === "table").length;
  return {
    ok: true,
    summary: `Đã tạo tài liệu Word: ${artifact.name}`,
    data: { blockCount: prepared.length, tableCount },
    artifacts: [artifact],
    modelText: `Đã tạo tệp Word "${artifact.name}" (${prepared.length} phần${tableCount ? `, ${tableCount} bảng` : ""}) — id: ${artifact.id}. Nói ngắn gọn nội dung chính và mời người dùng tải hoặc yêu cầu chỉnh sửa.`,
  };
}

export const __test__ = { normalizeBlocks, planLine, safeName, numericColumns };
