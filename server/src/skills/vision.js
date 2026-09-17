import { resolveOwnedFile, asImagePayload } from "../files.js";
import { generateXlsx } from "./xlsx.js";
import { isConfirmed, planChoices, planPayload } from "./confirm.js";
import { streamChat } from "../providers/index.js";
import { resolveVisionTarget } from "../settings.js";
import { badRequest, truncate } from "../util.js";

/**
 * `read_image` — OCR / table extraction.
 *
 * Without this, a user on a text-only model (the free `glm-4-flash`, DeepSeek…)
 * who uploads a photo and asks "đưa hết data trong ảnh thành Excel" has nothing
 * the model can work with: the image part is rejected by the gateway, and the
 * assistant either invents numbers or answers "không đọc được ảnh".
 *
 * The tool hands the image to a *vision* provider (auto-resolved, or pinned by
 * `visionProviderId`) and returns plain text plus a parsed table, so the main
 * model can immediately call `generate_xlsx` / `analyze_data` / `generate_pptx`
 * with real data.
 */

const MAX_CHARS = 12000;

const OCR_PROMPT = [
  "Bạn là công cụ OCR chính xác. Trích xuất TOÀN BỘ nội dung nhìn thấy trong ảnh.",
  "Quy tắc:",
  "1. Giữ nguyên ngôn ngữ, số liệu, đơn vị và thứ tự dòng của ảnh. Không bịa, không suy diễn thêm.",
  "2. Nếu ảnh có bảng (kể cả bảng viết tay hoặc chụp màn hình), trả về bảng đó trong một khối ```csv ... ``` với dòng đầu là tiêu đề cột, phân cách bằng dấu phẩy.",
  "3. Ngoài khối csv, ghi phần chữ còn lại dưới dạng gạch đầu dòng ngắn.",
  "4. Nếu ảnh không có chữ nào, trả lời đúng một dòng: KHONG_CO_CHU",
].join("\n");

/** Pulls the first ```csv fenced block out of the model's answer. */
export function parseCsvBlock(text) {
  const match = /```(?:csv)?\s*\n([\s\S]*?)```/i.exec(String(text ?? ""));
  if (!match) return null;
  const lines = match[1]
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return null;
  const split = (line) => {
    const cells = [];
    let current = "";
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"') {
        if (quoted && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else quoted = !quoted;
      } else if (char === "," && !quoted) {
        cells.push(current.trim());
        current = "";
      } else current += char;
    }
    cells.push(current.trim());
    return cells;
  };
  const columns = split(lines[0]);
  const rows = lines.slice(1).map(split).map((row) => columns.map((_, index) => row[index] ?? ""));
  return { columns, rows };
}

export async function readImageContent(args, ctx) {
  const fileId = args?.fileId;
  if (!fileId) throw badRequest("read_image cần `fileId` của ảnh (lấy từ list_files)");

  // Accepts a name as well: models often send "IMG_3737.jpeg" instead of the id.
  const fileRow = resolveOwnedFile({
    id: fileId,
    name: args?.fileName ?? null,
    userId: ctx.userId,
    conversationId: ctx.conversationId ?? null,
  });
  if (fileRow.kind !== "image") {
    throw badRequest(`${fileRow.name} không phải ảnh nên không đọc chữ được`);
  }

  const target = ctx.resolveVisionTarget
    ? await ctx.resolveVisionTarget()
    : resolveVisionTarget({});
  if (!target) {
    throw badRequest(
      "Chưa có model nào đọc được ảnh. Vào Cài đặt → Nhà cung cấp AI thêm một provider có model thị giác " +
        "(ví dụ OpenRouter với google/gemini-2.5-flash, hoặc GLM glm-4v-flash), hoặc chọn model đó ở ô chọn model.",
    );
  }

  const image = await asImagePayload(fileRow);
  if (!image) throw badRequest("Ảnh quá lớn để đọc (giới hạn 8MB)");

  const instruction = String(args?.instruction ?? "").trim();
  const messages = [
    { role: "system", content: OCR_PROMPT },
    {
      role: "user",
      content: instruction
        ? `Trích xuất nội dung ảnh "${fileRow.name}". Người dùng cần: ${instruction}`
        : `Trích xuất nội dung ảnh "${fileRow.name}".`,
      images: [image],
    },
  ];

  let text = "";
  for await (const event of streamChat({
    provider: target.provider,
    model: target.model,
    messages,
    tools: [],
    toolMode: "off",
    temperature: 0,
    signal: ctx?.signal,
    acceptsImages: true,
  })) {
    if (event.type === "delta") text += event.text;
  }

  text = truncate(text.trim(), MAX_CHARS);
  const table = parseCsvBlock(text);
  const empty = /^KHONG_CO_CHU\b/i.test(text);

  if (empty) {
    return {
      ok: true,
      summary: `Ảnh ${fileRow.name} không có chữ để đọc`,
      data: { fileId: fileRow.id, text: "", table: null, providerId: target.provider.id, model: target.model },
      artifacts: [],
      modelText: `Ảnh "${fileRow.name}" không chứa chữ/bảng. Hãy nói người dùng biết và đề nghị họ gửi ảnh rõ hơn.`,
    };
  }

  const modelText = [
    `Nội dung đọc được từ ảnh "${fileRow.name}" (nguồn: ${target.provider.name}):`,
    text,
    table ? `\nBảng đã tách sẵn ${table.columns.length} cột × ${table.rows.length} dòng — dùng luôn cho generate_xlsx.` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    ok: true,
    summary: table
      ? `Đọc ảnh ${fileRow.name}: bảng ${table.columns.length} cột × ${table.rows.length} dòng`
      : `Đọc ảnh ${fileRow.name}: ${text.length} ký tự`,
    data: {
      fileId: fileRow.id,
      text,
      table,
      providerId: target.provider.id,
      providerName: target.provider.name,
      model: target.model,
    },
    artifacts: [],
    modelText,
  };
}

/** Lines outside the table block — usually the instructions/notes in the photo. */
export function extraText(text) {
  return String(text ?? "")
    .replace(/```(?:csv)?[\s\S]*?```/gi, " ")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*•]\s*/, "").trim())
    .filter((line) => line.length > 3)
    .join("\n")
    .trim();
}

/** Options offered when the photo holds more than the table. */
export function excelChoices(fileId, fileName) {
  return [
    {
      id: "table+text",
      label: "Tạo Excel: cả bảng và toàn bộ chữ",
      hint: "Sheet 1 là bảng, sheet 2 là phần chữ còn lại trong ảnh",
      value: `OK, tạo luôn file Excel gồm cả bảng và toàn bộ chữ trong ảnh ${fileName} (id: ${fileId})`,
    },
    {
      id: "table",
      label: "Tạo Excel: chỉ lấy bảng",
      hint: "Chỉ dữ liệu dạng bảng, bỏ phần chữ khác",
      value: `OK, tạo luôn file Excel chỉ lấy bảng trong ảnh ${fileName} (id: ${fileId})`,
    },
    {
      id: "text",
      label: "Tạo Excel: chỉ lấy phần chữ",
      hint: "Toàn bộ chữ trong ảnh, mỗi dòng một ô",
      value: `OK, tạo luôn file Excel chỉ lấy phần chữ trong ảnh ${fileName} (id: ${fileId})`,
    },
    {
      id: "retry",
      label: "Gửi ảnh rõ hơn",
      hint: "Ảnh bị mất chữ hoặc mờ",
      value: "Ảnh này chưa rõ, em gửi ảnh khác nhé",
    },
  ];
}

/**
 * What the user themself asked for. The model's `mode` argument is unreliable: to
 * satisfy a forced tool call a small model happily invents `mode: "table"`, which
 * would silently drop the rest of the photo. The user's own words win, and the
 * option buttons send exactly these phrasings.
 */
export function modeFromUserText(text) {
  const value = String(text ?? "").toLowerCase();
  if (/(chỉ|chi)\s*(lấy\s*)?(bảng|table)|table\s*only|only\s*(the\s*)?table/.test(value)) return "table";
  if (/(chỉ|chi)\s*(lấy\s*)?(chữ|phần chữ|text|nội dung chữ)|text\s*only|only\s*(the\s*)?text/.test(value)) return "text";
  if (/(cả bảng|ca bang|bảng (và|\+)\s*chữ|toàn bộ|tất cả|cả hai|table (and|\+)\s*text|both)/.test(value)) return "table+text";
  return null;
}

/**
 * Decides what the workbook should contain. Pure so it can be tested without a
 * provider: `{ table, text, mode }` → `{ needsChoice, choices, sheets }`.
 *
 * The rule that matters: a photo often holds a table *and* other text (a page of
 * a textbook, an invoice header…). Silently exporting only the table loses the
 * rest, so with no explicit `mode` the tool asks instead.
 */
export function planXlsxFromImage({ table = null, text = "", mode = null, fileId = null, fileName = "ảnh" } = {}) {
  const rest = extraText(text);
  const hasTable = Boolean(table?.columns?.length && table?.rows?.length);
  const chosen = ["table", "table+text", "text"].includes(String(mode)) ? String(mode) : null;

  if (!chosen && hasTable && rest.length >= 120) {
    const choices = excelChoices(fileId, fileName);
    return {
      needsChoice: true,
      choices,
      extraChars: rest.length,
      extraPreview: rest.slice(0, 300),
      sheets: [],
    };
  }

  const sheets = [];
  if (chosen === "text" || (!hasTable && rest)) {
    sheets.push({ name: "Noi dung", columns: ["Nội dung"], rows: rest.split("\n").map((line) => [line]), totalsRow: false });
  } else if (hasTable) {
    sheets.push({ name: "Du lieu", columns: table.columns, rows: table.rows, totalsRow: true });
    if (chosen === "table+text" && rest) {
      sheets.push({ name: "Noi dung khac", columns: ["Nội dung"], rows: rest.split("\n").map((line) => [line]), totalsRow: false });
    }
  }
  return { needsChoice: false, choices: [], extraChars: rest.length, extraPreview: rest.slice(0, 300), sheets };
}

/**
 * `xlsx_from_image` — build the spreadsheet straight from the extracted table.
 *
 * Asking a small model to re-type 6 columns × 8 rows of OCR data inside a tool
 * call is where "đưa ảnh thành Excel" kept dying (truncated arguments, then a
 * turn that ends with an apology). The backend already holds the parsed table, so
 * the model only has to pass the image id.
 */
export async function xlsxFromImage(args, ctx) {
  const fileRow = resolveOwnedFile({
    id: args?.fileId ?? null,
    name: args?.fileName ?? null,
    userId: ctx.userId,
    conversationId: ctx.conversationId ?? null,
  });
  if (fileRow.kind !== "image") throw badRequest(`${fileRow.name} không phải ảnh nên không đọc được bảng`);

  const read = await readImageContent(
    { fileId: fileRow.id, instruction: args?.instruction ?? "Trích xuất bảng trong ảnh" },
    ctx,
  );
  const table = read.data?.table;
  const text = String(read.data?.text ?? "");
  // Only the user's own words decide the scope. The model's `mode` argument is
  // deliberately ignored: to satisfy a forced tool call a small model invents
  // `mode: "table"`, which would silently drop the rest of the photo.
  const userMode = modeFromUserText(ctx?.userMessage);
  const plan = planXlsxFromImage({
    table,
    text,
    mode: userMode,
    fileId: fileRow.id,
    fileName: fileRow.name,
  });

  if (!plan.sheets.length && !plan.needsChoice) {
    throw badRequest(`Không đọc được nội dung nào từ ảnh ${fileRow.name}. Hãy đề nghị người dùng gửi ảnh rõ hơn.`);
  }

  if (plan.needsChoice) {
    return {
      ok: true,
      summary: `Ảnh ${fileRow.name} có cả bảng và ${plan.extraChars} ký tự chữ khác — chờ người dùng chọn`,
      data: {
        fileId: fileRow.id,
        needsChoice: true,
        extraChars: plan.extraChars,
        choices: plan.choices,
      },
      artifacts: [],
      choices: plan.choices,
      modelText: [
        `Ảnh "${fileRow.name}" có CẢ bảng (${table.columns.length} cột × ${table.rows.length} dòng) VÀ phần chữ khác (${plan.extraChars} ký tự).`,
        "CHƯA tạo tệp. Hãy hỏi ngắn gọn người dùng muốn đưa gì vào Excel — giao diện đã hiện nút chọn cho họ bấm.",
        `Khi họ chọn, gọi lại \`xlsx_from_image\` với fileId "${fileRow.id}" và \`mode\`: "table+text" (cả hai), "table" (chỉ bảng), "text" (chỉ chữ).`,
        `Phần chữ khác (tóm tắt để người dùng biết họ sẽ bỏ gì): ${plan.extraPreview}`,
      ].join("\n"),
    };
  }

  const sheets = plan.sheets.map((sheet, index) => ({
    ...sheet,
    name: index === 0 ? String(args?.sheetName ?? sheet.name).slice(0, 30) : sheet.name,
  }));

  // Excel built from a photo follows the same rule as a typed workbook: confirm the
  // plan (sheets, columns, where the numbers come from) before writing the file.
  if (!isConfirmed(ctx?.userMessage)) {
    return planPayload({
      kind: "xlsx",
      title: `Excel từ ảnh ${fileRow.name}`,
      detail: `${sheets.length} sheet`,
      plan: sheets.map(
        (sheet, index) =>
          `Sheet ${index + 1} "${sheet.name}": ${sheet.columns.length} cột (${sheet.columns.slice(0, 8).join(", ")}) · ${sheet.rows.length} dòng`,
      ),
      notes: [
        `Nguồn: ảnh "${fileRow.name}" đọc bằng ${read.data.providerName ?? "model thị giác"}.`,
        plan.extraChars && mode !== "table+text"
          ? `Còn ${plan.extraChars} ký tự chữ khác trong ảnh chưa đưa vào (chọn "cả bảng và chữ" nếu muốn lấy hết).`
          : "",
      ].filter(Boolean),
      choices: planChoices({ kind: "xlsx", detail: `${sheets.length} sheet` }),
    });
  }

  const generated = await generateXlsx(
    { filename: args?.filename ?? defaultSheetName(fileRow.name), sheets },
    { userId: ctx.userId, conversationId: ctx.conversationId },
  );

  const artifact = generated.artifacts?.[0] ?? null;
  const mode =
    userMode ?? (plan.sheets.length > 1 ? "table+text" : plan.sheets[0]?.columns.length > 1 ? "table" : "text");
  const tableSheet = sheets.find((sheet) => sheet.columns.length > 1);
  return {
    ok: true,
    summary: `Tạo Excel từ ảnh ${fileRow.name}: ${sheets.length} sheet${artifact ? ` — ${artifact.name}` : ""}`,
    data: {
      fileId: fileRow.id,
      mode,
      sheetCount: sheets.length,
      rowCount: sheets.reduce((total, sheet) => total + sheet.rows.length, 0),
      columns: tableSheet?.columns ?? ["Nội dung"],
      text,
      providerName: read.data.providerName ?? null,
      skippedExtraChars: mode === "table" ? plan.extraChars : 0,
    },
    artifacts: generated.artifacts ?? [],
    modelText:
      `Đã tạo tệp Excel từ ảnh "${fileRow.name}" với ${sheets.length} sheet` +
      `${artifact ? ` ("${artifact.name}", id: ${artifact.id})` : ""}` +
      `${mode === "table" && plan.extraChars ? ` (theo yêu cầu chỉ lấy bảng; còn ${plan.extraChars} ký tự chữ khác chưa đưa vào)` : ""}. ` +
      "Hãy mô tả ngắn gọn nội dung và nêu vài số liệu chính — KHÔNG gọi generate_xlsx nữa.",
  };
}

function defaultSheetName(name) {
  return String(name).replace(/\.[a-z0-9]+$/i, "").slice(0, 40) || "du-lieu-tu-anh";
}
