import { generatePptx } from "./pptx.js";
import { generateXlsx } from "./xlsx.js";
import { analyzeData, listFilesForModel } from "./data.js";
import { editImage, transformImage } from "./image.js";
import { readImageContent, xlsxFromImage } from "./vision.js";
import { ApiError } from "../util.js";

/**
 * Built-in skills exposed to the model as tools. `skill` drives which tools are
 * offered for the selected UI chip (`auto` = all of them).
 *
 * Every schema is sent on **every** request, so the wording here is deliberately
 * terse: verbose descriptions were the single biggest part of a turn's token bill
 * (the model pays for them even when it only chats).
 */
export const TOOL_DEFINITIONS = [
  {
    name: "generate_pptx",
    skill: "ppt",
    label: "Tạo slide PowerPoint",
    description: "Tạo tệp .pptx từ dàn ý (slide, bài giảng, thuyết trình, báo cáo).",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Tiêu đề" },
        subtitle: { type: "string", description: "Phụ đề" },
        theme: { type: "string", enum: ["flow", "dark", "warm", "mint"], description: "Bảng màu" },
        slides: {
          type: "array",
          description: "Danh sách slide",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              subtitle: { type: "string" },
              bullets: { type: "array", items: { type: "string" }, description: "Gạch đầu dòng" },
              notes: { type: "string", description: "Ghi chú trình bày" },
            },
            required: ["title"],
          },
        },
      },
      required: ["slides"],
    },
    handler: generatePptx,
  },
  {
    name: "generate_xlsx",
    skill: "excel",
    label: "Tạo bảng tính Excel",
    description: "Tạo tệp .xlsx nhiều sheet, định dạng số, dòng tổng, autofilter.",
    inputSchema: {
      type: "object",
      properties: {
        filename: { type: "string", description: "Tên tệp (bỏ .xlsx)" },
        sheets: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              columns: { type: "array", items: { type: "string" } },
              rows: { type: "array", items: { type: "array", items: {} }, description: "Các dòng dữ liệu" },
              totalsRow: { type: "boolean", description: "Thêm dòng TỔNG (SUM)" },
            },
            required: ["columns", "rows"],
          },
        },
      },
      required: ["sheets"],
    },
    handler: generateXlsx,
  },
  {
    name: "analyze_data",
    skill: "data",
    label: "Phân tích dữ liệu",
    description:
      "Phân tích CSV/Excel/JSON đã tải lên: mô tả cột, lọc, nhóm, top, tương quan, chuỗi thời gian. Trả bảng kết quả và dữ liệu biểu đồ.",
    inputSchema: {
      type: "object",
      properties: {
        fileId: { type: "string", description: "id tệp (từ list_files)" },
        fileName: { type: "string", description: "Tên tệp, nếu không có id" },
        operations: {
          type: "array",
          description: "Các thao tác chạy tuần tự",
          items: {
            type: "object",
            properties: {
              op: {
                type: "string",
                enum: ["describe", "value_counts", "group_by", "timeseries", "correlation", "sort", "filter", "top"],
              },
              column: { type: "string" },
              columns: { type: "array", items: { type: "string" } },
              by: { type: "array", items: { type: "string" } },
              metrics: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    column: { type: "string" },
                    agg: { type: "string", enum: ["sum", "avg", "count", "min", "max", "median", "std", "distinct"] },
                    as: { type: "string" },
                  },
                },
              },
              dateColumn: { type: "string" },
              valueColumn: { type: "string" },
              granularity: { type: "string", enum: ["day", "week", "month", "year"] },
              agg: { type: "string" },
              op_filter: {
                type: "string",
                enum: ["eq", "ne", "gt", "gte", "lt", "lte", "contains", "not_contains", "in", "is_null", "not_null"],
                description: "Toán tử so sánh (op=filter)",
              },
              value: { description: "Giá trị so sánh (op=filter)" },
              n: { type: "number" },
              limit: { type: "number" },
              desc: { type: "boolean" },
              labelColumn: { type: "string" },
            },
            required: ["op"],
          },
        },
      },
      required: ["fileId"],
    },
    handler: analyzeData,
  },
  {
    name: "edit_image",
    skill: "image",
    label: "Sửa ảnh bằng AI",
    description:
      "Sửa/tạo ảnh bằng AI từ ảnh đã tải lên (xoá vật thể, đổi nền, đổi phong cách). Cần provider có model ảnh.",
    inputSchema: {
      type: "object",
      properties: {
        fileId: { type: "string", description: "id ảnh gốc" },
        fileName: { type: "string", description: "Tên ảnh, nếu không có id" },
        instruction: { type: "string", description: "Mô tả cần sửa" },
        model: { type: "string", description: "Ghi đè model ảnh" },
      },
      required: ["fileId", "instruction"],
    },
    handler: editImage,
  },
  {
    name: "open_image_studio",
    skill: "image",
    label: "Gợi ý Image Studio",
    description: "Chỉ đường mở Image Studio khi yêu cầu chỉ là cắt/xoay/filter/chèn chữ.",
    inputSchema: {
      type: "object",
      properties: { fileId: { type: "string" } },
    },
    handler: transformImage,
  },
  {
    name: "read_image",
    skill: "image",
    label: "Đọc chữ trong ảnh (OCR)",
    description:
      "Đọc toàn bộ chữ và bảng trong ảnh người dùng đã tải lên bằng một model có thị giác. Dùng khi model đang chạy không xem được ảnh, hoặc cần trích xuất bảng để tạo Excel.",
    inputSchema: {
      type: "object",
      properties: {
        fileId: { type: "string", description: "id ảnh (lấy từ list_files)" },
        fileName: { type: "string", description: "Tên ảnh, nếu không có id" },
        instruction: { type: "string", description: "Cần lấy gì từ ảnh (tuỳ chọn)" },
      },
      required: ["fileId"],
    },
    handler: readImageContent,
  },
  {
    name: "xlsx_from_image",
    skill: "excel",
    label: "Tạo Excel từ ảnh",
    description:
      "Đọc bảng trong ảnh (chụp bảng, hoá đơn, sổ sách) rồi tạo luôn tệp .xlsx bằng chính dữ liệu đọc được — không cần tự gõ lại số liệu. Dùng khi người dùng muốn đưa dữ liệu trong ảnh vào Excel.",
    inputSchema: {
      type: "object",
      properties: {
        fileId: { type: "string", description: "id ảnh (lấy từ list_files)" },
        fileName: { type: "string", description: "Tên ảnh, nếu không có id" },
        filename: { type: "string", description: "Tên tệp Excel (tuỳ chọn)" },
        sheetName: { type: "string", description: "Tên sheet (tuỳ chọn)" },
        instruction: { type: "string", description: "Cần lấy gì từ ảnh (tuỳ chọn)" },
      },
      required: ["fileId"],
    },
    handler: xlsxFromImage,
  },
  {
    name: "list_files",
    skill: "auto",
    label: "Liệt kê tệp",
    description: "Liệt kê tệp người dùng đã tải lên kèm id cho các công cụ khác.",
    inputSchema: { type: "object", properties: {} },
    handler: listFilesForModel,
  },
];

/**
 * Tools offered to the model for a turn.
 *
 * Every built-in tool is always offered, whatever chip the user picked: the
 * skill is *steering* (its own system-prompt instruction), not a gate. Gating
 * meant that in the default "Trò chuyện" mode a plain "làm slide giúp anh"
 * produced "công cụ không khả dụng" instead of a deck.
 */
export function toolDefinitionsForSkill(_skill) {
  return TOOL_DEFINITIONS;
}

/** Model-facing tool schema (no handler). */
export function toModelTool(tool) {
  return { name: tool.name, description: tool.description, inputSchema: tool.inputSchema };
}

export async function executeTool(name, args, ctx) {
  const tool = TOOL_DEFINITIONS.find((t) => t.name === name);
  if (!tool) {
    return {
      ok: false,
      summary: `Không có công cụ tên "${name}"`,
      data: {},
      artifacts: [],
      error: `unknown_tool:${name}`,
      modelText: `LỖI: không tồn tại công cụ ${name}.`,
    };
  }
  const started = Date.now();
  try {
    const result = await tool.handler(args ?? {}, ctx);
    return { ...result, durationMs: Date.now() - started };
  } catch (err) {
    const code = err instanceof ApiError ? err.code : "tool_error";
    const message = err?.message ?? String(err);
    return {
      ok: false,
      summary: `Công cụ ${name} lỗi: ${message}`,
      data: {},
      artifacts: [],
      error: `${code}: ${message}`,
      durationMs: Date.now() - started,
      modelText: `LỖI khi chạy ${name}: ${message}`,
    };
  }
}

export const SKILL_DESCRIPTORS = [
  {
    id: "chat",
    label: "Trò chuyện",
    icon: "chat",
    description: "Hỏi đáp, viết lách, dịch, lập trình — không cần công cụ đặc biệt",
    starterPrompts: ["Giải thích MCP là gì trong 5 dòng", "Viết email xin nghỉ phép lịch sự"],
  },
  {
    id: "image",
    label: "Sửa ảnh",
    icon: "image",
    description: "Chỉnh sửa ảnh bằng AI hoặc mở Image Studio (cắt, filter, chữ, vẽ)",
    starterPrompts: ["Xoá phông nền của ảnh này", "Đổi nền thành studio ánh sáng mềm"],
  },
  {
    id: "ppt",
    label: "Làm PPT",
    icon: "ppt",
    description: "Tạo file .pptx nhiều slide có theme, ghi chú trình bày",
    starterPrompts: ["Làm slide 8 trang giới thiệu sản phẩm fBuddy", "Tạo bài giảng 10 slide về marketing căn bản"],
  },
  {
    id: "excel",
    label: "Làm Excel",
    icon: "excel",
    description: "Tạo file .xlsx nhiều sheet, công thức tổng, định dạng số",
    starterPrompts: ["Lập bảng dự toán chi phí marketing 6 tháng", "Tạo bảng theo dõi công việc nhóm 5 người"],
  },
  {
    id: "data",
    label: "Phân tích dữ liệu",
    icon: "data",
    description: "Đọc CSV/Excel, thống kê, nhóm, top, tương quan, vẽ biểu đồ",
    starterPrompts: ["Phân tích file doanh thu này và tìm điểm bất thường", "Top 10 sản phẩm bán chạy nhất"],
  },
];

/**
 * The skill catalogue the dropdown and the (future) skill marketplace read from.
 *
 * `state: "ready"` skills work today; `state: "coming_soon"` entries exist so the
 * marketplace has a shape to grow into — they are visible but cannot be installed.
 * New skills (MCP-backed, company-specific, third-party) will be added here with
 * `builtin: false` without touching the UI.
 */
export const SKILL_CATALOG = [
  ...SKILL_DESCRIPTORS.map((skill, index) => ({
    ...skill,
    category: "Cơ bản",
    state: "ready",
    builtin: true,
    order: index,
  })),
  {
    id: "mcp_skill",
    label: "Kỹ năng từ MCP server",
    icon: "mcp",
    category: "Sắp có",
    state: "coming_soon",
    builtin: false,
    order: 100,
    description: "Mỗi MCP server anh cắm vào sẽ tự sinh một kỹ năng riêng (đang hoàn thiện)",
    starterPrompts: [],
  },
  {
    id: "document",
    label: "Xử lý tài liệu",
    icon: "document",
    category: "Sắp có",
    state: "coming_soon",
    builtin: false,
    order: 101,
    description: "Đọc PDF/DOCX dài, tóm tắt, trích xuất bảng biểu (chờ chợ kỹ năng)",
    starterPrompts: [],
  },
  {
    id: "translate",
    label: "Dịch tài liệu",
    icon: "translate",
    category: "Sắp có",
    state: "coming_soon",
    builtin: false,
    order: 102,
    description: "Dịch giữ nguyên định dạng, có bảng thuật ngữ riêng của công ty",
    starterPrompts: [],
  },
  {
    id: "org_skill",
    label: "Kỹ năng riêng của công ty",
    icon: "org",
    category: "Sắp có",
    state: "coming_soon",
    builtin: false,
    order: 103,
    description: "Anh định nghĩa prompt + công cụ, phát hành cho cả tổ chức dùng",
    starterPrompts: [],
  },
];

/** Skills that can actually be selected today (plus the virtual `auto`). */
export const READY_SKILL_IDS = SKILL_CATALOG.filter((skill) => skill.state === "ready").map((s) => s.id);

export function isKnownSkill(skillId) {
  return skillId === "auto" || READY_SKILL_IDS.includes(String(skillId));
}

/**
 * Nhãn/mô tả của kỹ năng dựng sẵn theo ngôn ngữ. Bản gốc trong `SKILL_CATALOG` là tiếng
 * Việt; đây là bản dịch cho giao diện tiếng Anh / tiếng Trung. Kỹ năng nào thiếu bản
 * dịch thì rơi về tiếng Việt (không bao giờ hiện khoá i18n thô ra giao diện).
 */
const CATALOG_I18N = {
  chat: {
    en: { label: "Chat", description: "Trò chuyện tự do với trợ lý" },
    zh: { label: "聊天", description: "与助手自由对话" },
  },
  image: {
    en: { label: "Edit images", description: "Sửa, cắt và tạo ảnh theo yêu cầu" },
    zh: { label: "图片编辑", description: "按需求编辑、裁剪与生成图片" },
  },
  ppt: {
    en: { label: "Make slides", description: "Tạo bộ slide hoàn chỉnh từ yêu cầu" },
    zh: { label: "制作 PPT", description: "根据需求生成完整幻灯片" },
  },
  excel: {
    en: { label: "Make spreadsheets", description: "Tạo bảng tính có công thức" },
    zh: { label: "制作表格", description: "生成带公式的电子表格" },
  },
  data: {
    en: { label: "Analyse data", description: "Phân tích dữ liệu và trực quan hoá" },
    zh: { label: "数据分析", description: "分析数据并可视化" },
  },
  mcp_skill: {
    en: { label: "Skills from MCP servers" },
    zh: { label: "来自 MCP 服务器的技能" },
  },
  document: {
    en: { label: "Document processing" },
    zh: { label: "文档处理" },
  },
  translate: {
    en: { label: "Document translation" },
    zh: { label: "文档翻译" },
  },
  org_skill: {
    en: { label: "Your company's own skills" },
    zh: { label: "企业自有技能" },
  },
};

/** Danh mục kỹ năng cho giao diện, đã dịch nhãn/mô tả theo `lang` (mặc định tiếng Việt). */
export function publicSkillCatalog(lang = "vi") {
  return SKILL_CATALOG.map(({ order: _order, ...skill }) => {
    const translated = CATALOG_I18N[skill.id]?.[lang];
    return translated ? { ...skill, ...translated } : skill;
  });
}
