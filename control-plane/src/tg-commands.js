// Logic thuần cho bot Telegram (kiểm tra quyền, phân tích lệnh, nội dung trả lời).
/**
 * Logic THUẦN cho bot Telegram 2 chiều: kiểm tra quyền, phân tích lệnh, nội dung trả lời.
 *
 * Tách khỏi phần gọi mạng để test được không cần Telegram: bot thật (scripts/tg-bot/bot.mjs)
 * chỉ lo long-poll + gọi control plane API, còn "ai được phép làm gì" nằm ở đây.
 *
 * Nguyên tắc an toàn:
 *  - CHỈ chat id trong danh sách cho phép mới được lệnh (mặc định 1 chat của chủ shop).
 *  - Lệnh ĐỔI TRẠNG THÁI (restart service, mirror, bật/tắt alert) phải xác nhận inline,
 *    trừ khi gọi kèm `force` (dùng cho chính chủ shop đã bấm Xác nhận).
 */

export const READ_ONLY_COMMANDS = ["help", "status", "nodes", "devices", "orders", "ios", "alerts", "log", "ping", "build"];
// /task chạy agent trên server (quyền ngang root) nên cũng phải xác nhận trước khi chạy.
export const MUTATING_COMMANDS = ["report", "mirror", "restart", "task", "deploy", "alerts_off", "alerts_on"];

/** Service được phép restart từ Telegram — danh sách trắng, không nhận tên tuỳ ý. */
export const RESTARTABLE_SERVICES = {
  cp: "flowvpn-cp.service",
  auth: "dhs-auth.service",
  nginx: "nginx.service",
  mirror: "flowvpn-mirror-peers.timer",
};

/** Chat id này có được ra lệnh không? */
export function isAllowedChat(chatId, allowList = []) {
  const id = String(chatId ?? "").trim();
  if (!id) return false;
  return allowList.map((x) => String(x).trim()).filter(Boolean).includes(id);
}

/**
 * Phân tích nội dung tin nhắn thành lệnh.
 * @returns {{name: string, args: string[], unknown?: string, mutating: boolean}}
 */
export function parseCommand(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return { name: "help", args: [], mutating: false };

  // Cho phép cả "/status" lẫn "status", và "/status@TenBot" (Telegram gắn tên bot trong group).
  const first = raw.split(/\s+/)[0].replace(/^\//, "").split("@")[0].toLowerCase();
  const args = raw.split(/\s+/).slice(1);

  if (!READ_ONLY_COMMANDS.includes(first) && !MUTATING_COMMANDS.includes(first)) {
    return { name: "unknown", args, unknown: first, mutating: false };
  }
  return { name: first, args, mutating: MUTATING_COMMANDS.includes(first) };
}

/** Lệnh này có cần bấm xác nhận trước khi chạy? */
export function needsConfirmation(parsed, { force = false } = {}) {
  return Boolean(parsed?.mutating) && !force;
}

/** Nội dung xác nhận + nhãn nút (inline keyboard). */
export function confirmationPrompt(parsed) {
  const detail = parsed.args.length ? ` ${parsed.args.join(" ")}` : "";
  // Telegram giới hạn callback_data 64 byte nên KHÔNG nhét nội dung việc vào nút: với /task
  // chỉ gửi "oktask", bot tra lại nội dung đã lưu (xem pendingTasks trong bot.mjs).
  const callback = parsed.name === "task" ? "oktask" : `ok:${parsed.name}:${parsed.args.join(",")}`;
  const preview = parsed.name === "task" ? `\nViệc: ${parsed.args.join(" ").slice(0, 300)}` : "";
  return {
    // Plain text: bot gửi không dùng parse_mode nên dấu * sẽ hiện nguyên si.
    text: `⚠️ Lệnh ${parsed.name}${detail} sẽ thay đổi hệ thống.${preview}\nBấm Xác nhận để chạy, hoặc Huỷ.`,
    buttons: [
      [{ text: "✅ Xác nhận", callback_data: callback }],
      [{ text: "🚫 Huỷ", callback_data: "cancel" }],
    ],
  };
}

/** Đọc callback_data của nút xác nhận. */
export function parseCallback(data) {
  const raw = String(data ?? "");
  if (raw === "cancel") return { action: "cancel" };
  // /task: nội dung việc dài hơn 64 byte nên nút chỉ mang "oktask"; bot tra lại nội dung đã lưu.
  if (raw === "oktask") return { action: "confirm", name: "task", args: [] };
  const m = raw.match(/^ok:([a-z_]+)(?::(.*))?$/);
  if (!m) return { action: "unknown" };
  return { action: "confirm", name: m[1], args: m[2] ? m[2].split(",").filter(Boolean) : [] };
}

/** Tin nhắn trợ giúp (tiếng Việt, ngắn gọn). */
export function helpText() {
  // Không dùng Markdown: dữ liệu động (tên máy, email) rất dễ làm vỡ parse_mode của Telegram.
  return [
    "🤖 VPNFlow bot — lệnh đọc (không đổi gì):",
    "/status — báo cáo ngay (như tin 08:00 & 20:00)",
    "/nodes — node nào sống, ping, số peer",
    "/devices — thiết bị khách: active / thiếu peer / đăng ký mới 24h",
    "/orders — đơn chờ thanh toán",
    "/ios — khách đang chờ ký IPA",
    "/alerts — kênh alert + mốc giờ báo cáo",
    "/log cp|auth|nginx [số dòng] — log gần nhất",
    "/build — chạy test control plane NGAY TRÊN SERVER",
    "/ping — bot còn sống không",
    "",
    "✍️ Lệnh có thay đổi (phải bấm Xác nhận):",
    "/report — gửi báo cáo ngay vào chat này",
    "/mirror — chạy ngay vòng đồng bộ peer",
    "/restart cp|auth|nginx|mirror — khởi động lại service",
    "/deploy — đẩy thay đổi trong workspace lên bản đang chạy (script tự test + rollback)",
    "",
    "🧠 Việc tự do — agent chạy trên server:",
    "/task <việc cần làm> — ví dụ: /task kiểm tra vì sao node-2 nhiều peer mà ít online",
    "",
    "Anh nhắn /help để xem lại danh sách này.",
  ].join("\n");
}
