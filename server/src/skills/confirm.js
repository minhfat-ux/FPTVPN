/**
 * "Confirm the plan before generating anything."
 *
 * Every artifact-producing tool (PPT, Excel, Excel-from-image, data analysis) goes
 * through here first: the tool proposes *what* it will build and *where the data
 * comes from*, the web renders the options as buttons, and only a message from the
 * user that actually approves goes on to write the file. When the request does not
 * carry enough input, the tool returns questions instead of guessing.
 *
 * The decision is read from the user's own words (`ctx.userMessage`) — a small
 * model happily invents a confirmation argument to satisfy a forced tool call.
 */

/**
 * The user approved the plan.
 *
 * Deliberately narrow: "tạo file excel dự toán…" is the *request*, not an
 * approval, so the first turn must still show a plan. Only short approvals or
 * explicit references to the proposed plan count — and the option buttons send
 * exactly these phrasings.
 */
export function isConfirmed(text) {
  const value = String(text ?? "").trim();
  if (!value) return false;
  return /(theo (kế hoạch|dàn ý)|đúng rồi|chuẩn luôn|đồng ý|ok(ay)?\b|oke\b|tạo luôn|làm luôn|chốt luôn|chốt\b|triển khai|cứ làm|xác nhận|tiến hành|bắt đầu tạo)/i.test(
    value,
  );
}

/** The user asked for something shorter / fewer pages. */
export function wantsCompact(text) {
  return /(gọn|ngắn|ít (trang|slide|dòng)|rút gọn|chỉ (cần|giữ|lấy)|cô đọng|đừng dài|bớt)/i.test(String(text ?? ""));
}

/** The user wants to change the plan instead of approving it. */
export function wantsEdit(text) {
  return /(sửa dàn ý|đổi dàn ý|sửa lại|thêm nội dung|bổ sung|chưa đúng|không đúng|thiếu)/i.test(String(text ?? ""));
}

/**
 * Standard "confirm the plan" payload — the shape the agent forwards as a tool
 * result and the web turns into buttons (see MessageItem/ChoiceRow).
 */
export function planPayload({ kind, title, detail, plan = [], choices, notes = [] }) {
  return {
    ok: true,
    summary: `${title} — chờ người dùng xác nhận`,
    data: { needsConfirm: true, kind, title, plan, choices },
    artifacts: [],
    choices,
    modelText: [
      `CHƯA tạo tệp. Kế hoạch cho ${
        kind === "pptx" ? "PowerPoint" : kind === "xlsx" ? "Excel" : kind === "docx" ? "tài liệu Word" : "kết quả"
      }: ${title}`,
      plan.length ? `Kế hoạch:\n${plan.map((line, index) => `  ${index + 1}. ${line}`).join("\n")}` : "",
      notes.length ? `Lưu ý về dữ liệu:\n${notes.map((line) => `  - ${line}`).join("\n")}` : "",
      "Hãy trình bày kế hoạch này NGẮN GỌN cho người dùng, nói rõ lấy dữ liệu từ đâu, rồi hỏi xác nhận — giao diện đã hiện nút cho họ bấm.",
      "Chỉ gọi lại công cụ để TẠO TỆP sau khi người dùng đồng ý (hoặc bấm nút). Muốn đổi thì hỏi họ cần sửa gì.",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

/** Buttons for a plan: create · compact · edit. */
export function planChoices({ kind = "file", detail = "" } = {}) {
  const noun = kind === "pptx" ? "slide" : kind === "xlsx" ? "bảng" : kind === "docx" ? "mục" : "kết quả";
  return [
    {
      id: "create",
      label: "OK, tạo theo kế hoạch này",
      hint: detail || "Tạo đúng như đã nêu",
      value: `OK, tạo luôn theo kế hoạch này${detail ? ` (${detail})` : ""}`,
    },
    {
      id: "compact",
      label: `Gọn hơn: ít ${noun} hơn`,
      hint: "Chỉ giữ phần chính",
      value: "OK, tạo luôn nhưng gọn hơn: chỉ giữ phần chính, bỏ phần phụ",
    },
    {
      id: "edit",
      label: "Sửa kế hoạch trước",
      hint: "Đổi nội dung/cách lấy dữ liệu rồi mới tạo",
      value: "Chưa tạo — em muốn sửa kế hoạch trước, hỏi em cần đổi gì nhé",
    },
  ];
}

/**
 * "Not enough input" answer: the tool asks for what is missing instead of
 * inventing content. Questions become buttons when they are yes/no-ish.
 */
export function questionPayload({ kind, questions = [], choices = [] }) {
  return {
    ok: true,
    summary: questions[0] ?? "Cần thêm thông tin trước khi tạo",
    data: { needsInput: true, kind, questions, choices },
    artifacts: [],
    choices,
    modelText: [
      "CHƯA tạo tệp vì thiếu thông tin. Hãy hỏi người dùng đúng những điểm sau (ngắn gọn, có thể hỏi 1–3 câu):",
      ...questions.map((question, index) => `  ${index + 1}. ${question}`),
      "Sau khi có câu trả lời, mới gọi lại công cụ để tạo tệp.",
    ].join("\n"),
  };
}
