import { generatePptx } from "./pptx.js";
import { generateXlsx } from "./xlsx.js";
import { analyzeData, listFilesForModel } from "./data.js";
import { editImage, transformImage } from "./image.js";
import { readImageContent, xlsxFromImage } from "./vision.js";
import { rememberFact, searchPastChats } from "../memory.js";
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
  {
    name: "tinh_toan",
    skill: "auto",
    label: "Tính toán chính xác",
    description:
      "Tính một biểu thức số HỌC CHÍNH XÁC (phân số BigInt): cộng trừ nhân chia, luỹ thừa, phần trăm, giai thừa, " +
      "căn/log/lượng giác, và đổi đơn vị. BẮT BUỘC dùng cho mọi phép tính có số cụ thể — KHÔNG tự tính nhẩm rồi trả lời.",
    inputSchema: {
      type: "object",
      properties: {
        expression: { type: "string", description: "Biểu thức, ví dụ \"2.400.000 * 15%\", \"1/3 + 1/6\", \"sqrt(2)\"." },
        convert: {
          type: "object",
          description: "Đổi đơn vị thay vì tính biểu thức: { value, from, to }",
          properties: {
            value: { type: "number" },
            from: { type: "string", description: "mm, cm, m, km, g, kg, tấn, m2, ha, l, m3, s, giờ, kb, mb, gb…" },
            to: { type: "string" },
          },
          required: ["value", "from", "to"],
        },
      },
    },
    handler: async (args) => {
      const math = await import("../math-exact.js");
      if (args?.convert?.from && args?.convert?.to) {
        const { value, from, to } = args.convert;
        const result = math.convertUnits(Number(value), from, to);
        return {
          ok: true,
          summary: `${value} ${from} = ${result.value} ${to}`,
          data: result,
          artifacts: [],
          modelText: `Kết quả đổi đơn vị (chính xác): ${value} ${from} = ${result.value} ${to}.`,
        };
      }
      const expression = String(args?.expression ?? "").trim();
      if (!expression) {
        return { ok: false, summary: "Thiếu biểu thức", data: {}, artifacts: [], error: "bad_request", modelText: "LỖI: cần `expression`." };
      }
      try {
        const result = math.evaluateExpression(expression);
        return {
          ok: true,
          summary: `${expression} = ${result.text}${result.exact ? "" : " (xấp xỉ)"}`,
          data: { expression, value: Number(result.value.n) / Number(result.value.d), exact: result.exact },
          artifacts: [],
          modelText:
            `Kết quả tính (công cụ, ${result.exact ? "CHÍNH XÁC" : "XẤP XỈ"}): ${expression} = ${result.text}. ` +
            (result.exact
              ? "Đây là kết quả chính xác của công cụ — hãy dùng đúng con số này."
              : "Đây là kết quả LÀM TRÒN của công cụ — khi trả lời phải nói rõ là xấp xỉ, đừng trình bày như số đúng tuyệt đối."),
        };
      } catch (error) {
        return {
          ok: false,
          summary: `Không tính được: ${error?.message ?? error}`,
          data: {},
          artifacts: [],
          error: "math_error",
          modelText: `LỖI TÍNH TOÁN: ${error?.message ?? error}. Hãy viết lại biểu thức rõ hơn rồi gọi lại công cụ — đừng tự tính nhẩm.`,
        };
      }
    },
  },
  {
    name: "tra_cuu",
    skill: "auto",
    label: "Tra cứu có nguồn",
    description:
      "Giao câu hỏi cho researcher tra cứu thật (Wikipedia, văn bản chính phủ, tìm kiếm web) rồi trả về đoạn trích kèm URL. " +
      "BẮT BUỘC dùng cho dữ kiện tra được: biển số xe theo tỉnh, điều luật/nghị định/thông tư, mức phạt, ngày hiệu lực, " +
      "giá thị trường, thông số sản phẩm, tin thời sự, số liệu thống kê. Không tra được thì phải nói chưa chắc — KHÔNG đoán.",
    inputSchema: {
      type: "object",
      properties: {
        question: { type: "string", description: "Câu cần tra, viết rõ ràng và đủ ngữ cảnh" },
        domain: {
          type: "string",
          enum: ["bien-so", "dia-ly", "van-hoa", "giao-duc", "toan-hoc", "ai", "phap-luat", "chung"],
          description:
            "Chọn researcher: bien-so (biển số/đăng ký xe) · dia-ly (địa danh, quốc gia, số liệu) · " +
            "van-hoa (văn hoá, lịch sử, tín ngưỡng) · giao-duc (học tập, thi cử) · toan-hoc (định nghĩa, công thức) · " +
            "ai (AI, công nghệ, bài báo) · phap-luat (luật, thuế, xử phạt) · chung (còn lại)",
        },
        depth: { type: "string", enum: ["nhanh", "ky"], description: "ky = tra nhiều truy vấn hơn (chậm hơn)" },
      },
      required: ["question"],
    },
    handler: async (args) => {
      const { research, researchToModelText } = await import("../researcher.js");
      const result = await research({ question: String(args.question ?? ""), domain: args.domain ?? null, depth: args.depth ?? "nhanh" });
      const nguon = result.sources.length;
      return {
        ok: result.findings.length > 0,
        summary: nguon
          ? `Tra cứu (${result.researcher.label}): ${nguon} nguồn · chắc chắn: ${result.confidence}`
          : `Tra cứu (${result.researcher.label}): KHÔNG tìm được nguồn`,
        data: {
          researcher: result.researcher.id,
          confidence: result.confidence,
          sources: result.sources,
          disagreements: result.disagreements,
        },
        artifacts: [],
        modelText: researchToModelText(result),
      };
    },
  },
  {
    name: "remember_fact",
    skill: "auto",
    label: "Ghi nhớ về người dùng",
    description:
      "Ghi nhớ một sự thật bền vững về người dùng (tên, vai trò, công ty, sở thích, cách xưng hô…) để lần sau không hỏi lại. Chỉ ghi khi người dùng nói rõ.",
    inputSchema: {
      type: "object",
      properties: {
        key: { type: "string", description: "Nhãn ngắn, ví dụ 'tên', 'công ty', 'con học lớp'" },
        value: { type: "string", description: "Nội dung ghi nhớ" },
        kind: { type: "string", enum: ["fact", "preference", "profile"], description: "Loại (mặc định fact)" },
      },
      required: ["key", "value"],
    },
    handler: async (args, ctx) => {
      const row = rememberFact({ userId: ctx.userId, key: args.key, value: args.value, kind: args.kind ?? "fact", source: "model" });
      return {
        ok: true,
        summary: row ? `Đã ghi nhớ "${args.key}"` : "Không ghi được (thiếu dữ liệu)",
        data: {},
        artifacts: [],
        modelText: row ? `Đã ghi nhớ: ${args.key} = ${args.value}.` : "Không ghi được mẩu nhớ này.",
      };
    },
  },
  {
    name: "search_past_chats",
    skill: "auto",
    label: "Tìm ngữ cảnh cũ",
    description: "Tìm trong các tin nhắn cũ của chính người dùng theo từ khoá để nhớ lại ngữ cảnh đã nói.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Từ khoá cần tìm" },
      },
      required: ["query"],
    },
    handler: async (args, ctx) => {
      const hits = searchPastChats({ userId: ctx.userId, query: args.query, excludeConversationId: ctx.conversationId ?? null, limit: 5 });
      if (!hits.length) {
        return { ok: true, summary: "Không tìm thấy", data: { results: [] }, artifacts: [], modelText: "Không tìm thấy ngữ cảnh cũ nào khớp." };
      }
      return {
        ok: true,
        summary: `Tìm thấy ${hits.length} đoạn`,
        data: { results: hits },
        artifacts: [],
        modelText: hits.map((h) => `[${h.date} · ${h.title}] ${h.role === "user" ? "người dùng" : "bạn"}: ${h.snippet}`).join("\n"),
      };
    },
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
