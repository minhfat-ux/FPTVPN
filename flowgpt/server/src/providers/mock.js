/**
 * Mock provider — lets the whole chat/tool/MCP pipeline be exercised, and gives
 * a brand-new install something that answers before an API key is configured.
 * It never touches the network.
 */

const REPLY = [
  "Dạ em là **FlowGpt** (chế độ demo, chưa cấu hình API key).",
  "",
  "Em vẫn chạy được đầy đủ luồng chat, gọi công cụ và trả tệp. Anh vào **Cài đặt → Nhà cung cấp AI** để thêm key thật (Gemini, OpenAI, DeepSeek, OpenRouter… hoặc endpoint OpenAI-compatible bất kỳ) là dùng được ngay.",
].join("\n");

const TOOL_TRIGGERS = [
  { pattern: /(ppt|slide|bài giảng|thuyết trình)/i, name: "generate_pptx" },
  { pattern: /(excel|bảng tính|xlsx|báo cáo chi phí)/i, name: "generate_xlsx" },
  { pattern: /(phân tích|thống kê|dữ liệu|csv|biểu đồ)/i, name: "analyze_data" },
  { pattern: /(sửa ảnh|xóa phông|đổi nền|chỉnh ảnh)/i, name: "edit_image" },
];

function pickTool(text) {
  for (const trigger of TOOL_TRIGGERS) {
    if (trigger.pattern.test(text)) return trigger.name;
  }
  return null;
}

function demoArgs(name, context) {
  if (name === "generate_pptx") {
    return {
      title: "FlowGpt — bản demo",
      subtitle: "Slide tạo tự động bằng chế độ demo",
      slides: [
        { title: "FlowGpt là gì?", bullets: ["Chatbox AI trên web", "Có skill tạo PPT, Excel, phân tích dữ liệu", "Hỗ trợ MCP"] },
        { title: "Bước tiếp theo", bullets: ["Thêm API key trong Cài đặt", "Chọn model", "Bắt đầu trò chuyện thật"] },
      ],
    };
  }
  if (name === "generate_xlsx") {
    return {
      filename: "flowgpt-demo.xlsx",
      sheets: [
        {
          name: "Demo",
          columns: ["Hạng mục", "Số lượng", "Đơn giá", "Thành tiền"],
          rows: [
            ["Gói Pro tháng", 12, 99000, 1188000],
            ["Gói Pro năm", 4, 990000, 3960000],
          ],
          totalsRow: true,
        },
      ],
    };
  }
  if (name === "analyze_data") {
    const fileId = context?.files?.[0]?.id ?? null;
    if (!fileId) return { _needsFile: true };
    return {
      fileId,
      operations: [{ op: "describe" }],
    };
  }
  if (name === "edit_image") {
    const image = context?.files?.find((f) => f.kind === "image");
    if (!image) return { _needsFile: true };
    return { fileId: image.id, instruction: "Làm nét và tăng độ tương phản nhẹ" };
  }
  return {};
}

/** 1×1 transparent PNG — stands in for a real generated image. */
export const MOCK_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";

export async function* streamChat({ messages, tools, toolMode, delayMs = 0 }) {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const text = String(lastUser?.content ?? "");
  // A tool already ran *in this turn* (its result is a `tool` message after the
  // last user message), so answer with prose instead of looping on the tool.
  const lastUserIndex = messages.map((message) => message.role).lastIndexOf("user");
  const toolAlreadyRan = messages
    .slice(lastUserIndex + 1)
    .some((message) => message.role === "tool");
  const wantsTool = !toolAlreadyRan && tools?.length && toolMode !== "off" ? pickTool(text) : null;

  if (delayMs) await sleep(delayMs);
  yield { type: "status", stage: wantsTool ? "calling_tool" : "thinking" };

  const body = wantsTool
    ? `Dạ em sẽ dùng công cụ \`${wantsTool}\` để xử lý yêu cầu này (chế độ demo chưa có API key).`
    : toolAlreadyRan
      ? "Xong rồi ạ! Em đã tạo tệp ở khung bên trên, anh bấm để tải về dùng luôn nhé."
      : REPLY;

  for (const token of body.match(/\S+\s*/g) ?? []) {
    if (delayMs) await sleep(delayMs);
    yield { type: "delta", text: token };
  }

  if (wantsTool) {
    const args = demoArgs(wantsTool, { files: lastUser?.attachments ?? [] });
    if (args._needsFile) {
      yield {
        type: "delta",
        text: "\n\nAnh gửi kèm tệp (ảnh hoặc CSV/Excel) để em chạy thật nhé.",
      };
    } else {
      yield { type: "tool_call", id: `call_mock_${Date.now().toString(36)}`, name: wantsTool, args };
    }
  }

  yield { type: "usage", in: 42, out: 128 };
  yield { type: "done", finishReason: wantsTool ? "tool_calls" : "stop" };
}

export async function listModels() {
  return ["flowgpt-demo"];
}

export async function testConnection() {
  return { latencyMs: 1 };
}

/** Stand-in image "generation": echoes the input image, else the 1×1 PNG. */
export async function generateImage({ image }) {
  return {
    mime: image?.mime ?? "image/png",
    dataBase64: image?.dataBase64 ?? MOCK_PNG,
    note: "demo",
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
