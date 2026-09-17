import { generatePptx } from "./pptx.js";
import { generateXlsx } from "./xlsx.js";
import { analyzeData, listFilesForModel } from "./data.js";
import { editImage, transformImage } from "./image.js";
import { ApiError } from "../util.js";

/**
 * Built-in skills exposed to the model as tools. `skill` drives which tools are
 * offered for the selected UI chip (`auto` = all of them).
 */
export const TOOL_DEFINITIONS = [
  {
    name: "generate_pptx",
    skill: "ppt",
    label: "Tạo slide PowerPoint",
    description:
      "Tạo tệp .pptx hoàn chỉnh từ dàn ý. Dùng khi người dùng cần slide, bài giảng, thuyết trình, báo cáo trình bày.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Tiêu đề bộ slide" },
        subtitle: { type: "string", description: "Phụ đề (tuỳ chọn)" },
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
              notes: { type: "string", description: "Ghi chú cho người trình bày" },
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
    description:
      "Tạo tệp .xlsx nhiều sheet, có định dạng số, dòng tổng và autofilter. Dùng khi người dùng cần bảng tính, báo cáo số liệu, danh sách.",
    inputSchema: {
      type: "object",
      properties: {
        filename: { type: "string", description: "Tên tệp (không cần .xlsx)" },
        sheets: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              columns: { type: "array", items: { type: "string" } },
              rows: { type: "array", items: { type: "array", items: {} }, description: "Mảng các dòng" },
              totalsRow: { type: "boolean", description: "Thêm dòng TỔNG (SUM) cho cột số" },
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
      "Phân tích tệp CSV/Excel/JSON đã tải lên: mô tả cột, lọc, nhóm, top, tương quan, chuỗi thời gian. Trả bảng kết quả và dữ liệu biểu đồ.",
    inputSchema: {
      type: "object",
      properties: {
        fileId: { type: "string", description: "id tệp dữ liệu (lấy từ list_files)" },
        operations: {
          type: "array",
          description: "Danh sách thao tác chạy tuần tự",
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
              op_filter: { type: "string" },
            },
          },
          required: ["op"],
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
      "Sửa/tạo ảnh bằng AI từ một ảnh người dùng đã tải lên (xoá vật thể, đổi nền, đổi phong cách…). Cần provider có model ảnh.",
    inputSchema: {
      type: "object",
      properties: {
        fileId: { type: "string", description: "id ảnh gốc" },
        instruction: { type: "string", description: "Mô tả cần sửa (tiếng Việt hoặc tiếng Anh)" },
        model: { type: "string", description: "Ghi đè model ảnh (tuỳ chọn)" },
      },
      required: ["fileId", "instruction"],
    },
    handler: editImage,
  },
  {
    name: "open_image_studio",
    skill: "image",
    label: "Gợi ý Image Studio",
    description:
      "Dùng khi yêu cầu chỉ là cắt/xoay/filter/chèn chữ — chỉ đường cho người dùng mở Image Studio trên web.",
    inputSchema: {
      type: "object",
      properties: { fileId: { type: "string" } },
    },
    handler: transformImage,
  },
  {
    name: "list_files",
    skill: "auto",
    label: "Liệt kê tệp",
    description: "Liệt kê các tệp người dùng đã tải lên (kèm id) để dùng cho các công cụ khác.",
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
    starterPrompts: ["Làm slide 8 trang giới thiệu sản phẩm FlowGpt", "Tạo bài giảng 10 slide về marketing căn bản"],
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

export function publicSkillCatalog() {
  return SKILL_CATALOG.map(({ order: _order, ...skill }) => skill);
}
