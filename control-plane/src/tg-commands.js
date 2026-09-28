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

// /wakeup chỉ gửi 1 gói Magic Packet Wake-on-LAN: không đổi trạng thái nào trên server, mà
// công dụng của nó là "đánh thức NGAY" — bắt bấm Xác nhận sẽ làm mất đúng công dụng đó.
export const READ_ONLY_COMMANDS = ["help", "status", "nodes", "devices", "orders", "ios", "alerts", "log", "ping", "build", "chat", "reporttasks", "tasks", "guard", "wakeup"];
// /task chạy agent trên server (quyền ngang root) nên cũng phải xác nhận trước khi chạy.
// /approve + /reject ĐỔI TRẠNG THÁI task do flowvpn-guard tạo: chỉ sau khi chủ dự án approve thì
// agent phụ trách mới được phép sửa/publish (xem scripts/guard/guard.py + flowvpn-coord task).
// /vibecode (+ tắt /mac, /win) GIAO VIỆC CHO MÁY KHÁC nên cũng phải xác nhận: gõ nhầm tên máy là
// việc đi sai chỗ. Đích nhận việc xem VIBE_TARGETS.
export const MUTATING_COMMANDS = ["report", "mirror", "restart", "task", "deploy", "alerts_off", "alerts_on", "approve", "reject", "vibecode", "mac", "win"];

/**
 * Máy nhận việc qua `/vibecode`. Khoá là tên gõ trên Telegram, giá trị là tên máy trong hệ
 * giao việc (`scripts/notify/agent-bus.mjs --to`, `ops/task.mjs --to`).
 */
export const VIBE_TARGETS = {
  mac: "mac",
  macos: "mac",
  win: "win",
  windows: "win",
  server: "server",
};

/** Nhãn trạng thái của một việc agent (dùng cho /reporttasks). */
export const TASK_STATUSES = {
  running: "⏳ đang chạy",
  done: "✅ xong",
  failed: "❌ lỗi",
  timeout: "⌛ quá hạn",
};

/**
 * /chat chạy CÙNG agent như /task nhưng ở "chế độ trò chuyện": agent chỉ được tra cứu
 * internet và trả lời, KHÔNG được sửa hệ thống (xem chatPreamble). Vì vậy không cần bấm
 * xác nhận cho từng câu — nếu cần thay đổi thật thì dùng /task.
 */
export const CHAT_HISTORY_MAX_TURNS = 24;
export const CHAT_HISTORY_MAX_CHARS = 12_000;
export const CHAT_PROMPT_MAX_CHARS = 6_000;

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
  // /vibecode: hiện RÕ máy nhận + việc, vì gõ nhầm tên máy là việc đi sai chỗ.
  if (isVibecodeCommand(parsed.name)) {
    const implicit = parsed.name === "mac" || parsed.name === "win" ? parsed.name : "";
    const vibecode = parseVibecodeArgs(parsed.args, implicit);
    const detail =
      vibecode.kind === "task"
        ? `\nGiao cho: ${VIBE_TARGET_LABELS[vibecode.target] ?? vibecode.target}\nViệc: ${vibecode.text.slice(0, 300)}`
        : ` ${parsed.args.join(" ")}`;
    return {
      text: `⚠️ Giao việc cho máy khác?${detail}\nBấm Xác nhận để gửi, hoặc Huỷ.`,
      buttons: [
        [{ text: "✅ Xác nhận", callback_data: "okvibe" }],
        [{ text: "🚫 Huỷ", callback_data: "cancel" }],
      ],
    };
  }

  const detail = parsed.args.length ? ` ${parsed.args.join(" ")}` : "";
  // Telegram giới hạn callback_data 64 byte nên KHÔNG nhét nội dung việc vào nút: với /task chỉ gửi
  // "oktask", bot tra lại nội dung đã lưu (xem pendingTasks trong bot.mjs).
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

/** Lệnh này có phải dạng giao việc cho một máy (/vibecode, /mac, /win)? */
export function isVibecodeCommand(name) {
  return name === "vibecode" || name === "mac" || name === "win";
}

/** Đọc callback_data của nút xác nhận. */
export function parseCallback(data) {
  const raw = String(data ?? "");
  if (raw === "cancel") return { action: "cancel" };
  // /task: nội dung việc dài hơn 64 byte nên nút chỉ mang "oktask"; bot tra lại nội dung đã lưu.
  if (raw === "oktask") return { action: "confirm", name: "task", args: [] };
  // /vibecode (và /mac, /win): cùng lý do — nội dung việc + tên máy lưu ở pendingTasks.
  if (raw === "okvibe") return { action: "confirm", name: "vibecode", args: [] };
  const m = raw.match(/^ok:([a-z_]+)(?::(.*))?$/);
  if (!m) return { action: "unknown" };
  return { action: "confirm", name: m[1], args: m[2] ? m[2].split(",").filter(Boolean) : [] };
}

/**
 * Phân tích tham số của `/vibecode` và hai lệnh tắt `/mac`, `/win`.
 *
 * Vì sao có lệnh này: chủ dự án muốn giao việc cho một máy cụ thể ngay từ Telegram
 * (*"anh cần thêm lệnh có thể giao task trực tiếp cho Mac/Win trên telegram. Ví dụ: /vibecode Mac"*).
 * Việc đi qua hệ giao việc hiện có (bus + sổ `ops/tasks`) chứ không chạy agent tại server — vì
 * mã nguồn/dữ liệu nằm trên máy đích.
 *
 * @param {string[]} args - tham số sau tên lệnh
 * @param {string} [implicitTarget] - đích suy ra từ chính tên lệnh (`/mac` ⇒ "mac")
 * @returns {{kind: "help"} | {kind: "error", message: string} | {kind: "task", target: string, text: string}}
 */
export function parseVibecodeArgs(args, implicitTarget = "") {
  const parts = (Array.isArray(args) ? args : []).map((x) => String(x)).filter((x) => x.length > 0);
  if (!parts.length) return { kind: "help" };

  const implicit = normalizeVibeTarget(implicitTarget);
  let target = implicit;
  let body = parts;

  if (!target) {
    // Không suy ra được từ tên lệnh ⇒ chữ ĐẦU TIÊN phải là tên máy.
    const named = normalizeVibeTarget(parts[0]);
    if (!named) {
      return {
        kind: "error",
        message:
          `❓ Không rõ máy nào nhận việc: "${parts[0]}".\n` +
          `Dùng: /vibecode <${Object.keys(VIBE_TARGETS).join("|")}> <việc cần làm>\n` +
          "hoặc viết tắt: /mac <việc> · /win <việc>",
      };
    }
    target = named;
    body = parts.slice(1);
  }

  const text = body.join(" ").trim();
  if (!text) {
    return {
      kind: "error",
      message: `❓ Thiếu nội dung việc. Dùng: /vibecode ${target} <việc cần làm>`,
    };
  }
  return { kind: "task", target, text };
}

/** Chuẩn hoá tên máy gõ trên Telegram → tên máy trong hệ giao việc; "" nếu không nhận ra. */
export function normalizeVibeTarget(word) {
  const key = String(word ?? "").trim().toLowerCase().replace(/^@/, "");
  return VIBE_TARGETS[key] ?? "";
}

/** Tên hiển thị của máy nhận việc (để bot trả lời cho dễ đọc). */
export const VIBE_TARGET_LABELS = {
  mac: "Mac (macOS + iOS)",
  win: "Windows",
  server: "server",
};

/**
 * Nội dung gửi kèm cho máy nhận việc. Việc đến từ chủ dự án qua Telegram nên ghi rõ nguồn —
 * máy nhận cần biết đây là yêu cầu trực tiếp, không phải suy đoán của agent khác.
 */
export function buildVibeBody(text, { at = new Date() } = {}) {
  return [
    "Việc chủ dự án giao TRỰC TIẾP qua Telegram (/vibecode).",
    `Giao lúc: ${at.toISOString()}`,
    "",
    String(text ?? "").trim(),
    "",
    "Nhận xong: ack trong sổ giao việc rồi làm. Xong thì báo lại kèm bằng chứng (lệnh đã chạy + kết quả thật).",
    "Nếu vướng thì báo NGAY, ghi rõ vướng ở đâu — đừng im lặng.",
  ].join("\n");
}

/**
 * Phân tích tham số của /chat.
 * @returns {{kind: "help"|"reset"|"on"|"off"|"message", text?: string}}
 */
export function parseChatArgs(args) {
  const parts = (Array.isArray(args) ? args : []).map((x) => String(x)).filter(Boolean);
  const text = parts.join(" ").trim();
  if (!text) return { kind: "help" };
  // Lệnh con chỉ khi cả tin chỉ có MỘT chữ — "on the internet" vẫn là câu hỏi bình thường.
  if (parts.length === 1) {
    const word = parts[0].toLowerCase();
    if (word === "reset" || word === "new" || word === "clear") return { kind: "reset" };
    if (word === "on") return { kind: "on" };
    if (word === "off") return { kind: "off" };
  }
  return { kind: "message", text };
}

/**
 * Cắt lịch sử hội thoại cho vừa prompt: giữ các lượt gần nhất, tối đa maxTurns lượt và
 * maxChars ký tự. Giữ nguyên thứ tự cũ → mới.
 */
export function trimChatHistory(history, { maxTurns = CHAT_HISTORY_MAX_TURNS, maxChars = CHAT_HISTORY_MAX_CHARS } = {}) {
  const list = (Array.isArray(history) ? history : []).slice(-Math.max(0, maxTurns));
  const out = [];
  let total = 0;
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const content = String(list[i]?.content ?? "").trim();
    if (!content) continue;
    if (out.length && total + content.length > maxChars) break;
    out.unshift({ role: list[i]?.role === "assistant" ? "assistant" : "user", content });
    total += content.length;
  }
  return out;
}

/** Tiền tố cho agent ở chế độ chat: được tra internet, tuyệt đối không sửa hệ thống. */
export function chatPreamble() {
  return [
    "Bạn là trợ lý trò chuyện riêng của chủ shop VPNFlow, đang trả lời qua Telegram.",
    "Bạn ĐƯỢC dùng công cụ tìm kiếm internet (web_search, web_fetch) để tra cứu thông tin mới,",
    "và được đọc file trong workspace /root/flowvpn-agent khi thật cần.",
    "CHẾ ĐỘ CHAT: CHỈ trò chuyện và tra cứu. TUYỆT ĐỐI KHÔNG sửa/xoá file, KHÔNG chạy lệnh",
    "thay đổi hệ thống, KHÔNG deploy, KHÔNG restart service, KHÔNG đụng dữ liệu khách.",
    "Nếu việc cần thay đổi hệ thống, chỉ giải thích và đề nghị anh dùng /task.",
    "Trả lời ngắn gọn bằng tiếng Việt (trừ khi được hỏi bằng tiếng khác). Khi tra cứu internet",
    "thì nêu nguồn; nếu không tra được thì nói rõ chứ đừng bịa.",
  ].join("\n");
}

/** Dựng prompt một lượt chat từ lịch sử + câu hỏi mới. */
export function buildChatPrompt(history, message) {
  const past = trimChatHistory(history, { maxChars: CHAT_PROMPT_MAX_CHARS });
  const lines = [chatPreamble(), ""];
  if (past.length) {
    lines.push("--- Hội thoại trước ---");
    for (const turn of past) lines.push(`${turn.role === "assistant" ? "Trợ lý" : "Anh"}: ${turn.content}`);
    lines.push("--- Hết hội thoại trước ---", "");
  }
  lines.push(`Anh: ${String(message ?? "").trim()}`, "Trợ lý:");
  return lines.join("\n");
}

/** Hướng dẫn dùng /chat. */
export function chatHelpText() {
  return [
    "🧠 Chat với agent (có tra cứu internet):",
    "/chat <câu hỏi> — ví dụ: /chat giá vàng hôm nay bao nhiêu",
    "/chat on — bật chế độ chat: tin nhắn thường (không bắt đầu bằng /) sẽ được trả lời",
    "/chat off — tắt chế độ chat",
    "/chat reset — xoá ngữ cảnh hội thoại",
    "Trong chat em chỉ trò chuyện + tra cứu internet, không sửa hệ thống; cần sửa thì dùng /task.",
  ].join("\n");
}

// ---------------------------------------------- theo dõi việc agent (/reporttasks)
/** Rút gọn văn bản dài cho vừa một dòng Telegram. */
function clip(text, max) {
  const s = String(text ?? "").replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Định dạng khoảng thời gian ngắn gọn: 45s, 3m05s, 1h07m. */
export function formatDuration(ms) {
  const total = Math.max(0, Math.floor(Number(ms) || 0));
  const seconds = Math.floor(total / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m${String(seconds % 60).padStart(2, "0")}s`;
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}m`;
}

/**
 * Báo cáo trạng thái các việc agent (lệnh /reporttasks).
 *
 * Việc ĐANG CHẠY luôn xếp lên đầu (để nhìn phát biết agent nào còn làm), sau đó tới việc
 * mới nhất. Sổ này bot giữ trong RAM nên restart bot sẽ quên các mục cũ.
 *
 * @param {Array<{id:number|string, kind?:string, prompt?:string, status:string,
 *                startedAt?:number, endedAt?:number, error?:string}>} tasks
 * @returns {string} nội dung gửi Telegram (không Markdown để khỏi vỡ parse_mode)
 */
export function reportTasks(tasks, { now = Date.now(), limit = 10 } = {}) {
  const list = (Array.isArray(tasks) ? tasks : []).filter((t) => t && t.id != null);
  if (!list.length) return "🤖 Chưa có việc agent nào được ghi nhận trong phiên này.";

  const rank = (t) => (t.status === "running" ? 0 : 1);
  const sorted = [...list].sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    return (b.startedAt ?? 0) - (a.startedAt ?? 0);
  });

  const max = Math.max(1, Number(limit) || 10);
  const shown = sorted.slice(0, max);
  const running = sorted.filter((t) => t.status === "running").length;
  const lines = shown.map((t) => {
    const label = TASK_STATUSES[t.status] ?? String(t.status ?? "?");
    const end = t.status === "running" ? now : (t.endedAt ?? now);
    const duration = formatDuration(end - (t.startedAt ?? end));
    const parts = [`${label} #${t.id}`, t.kind ? `(${t.kind})` : "", `· ${duration}`, t.prompt ? `· ${clip(t.prompt, 70)}` : ""];
    const err = t.error && (t.status === "failed" || t.status === "timeout") ? `\n  ↳ ${clip(t.error, 90)}` : "";
    return `• ${parts.filter(Boolean).join(" ")}${err}`;
  });

  const head = `🤖 Việc agent: ${running} đang chạy / ${sorted.length} gần đây`;
  const more = sorted.length > shown.length ? `\n… và ${sorted.length - shown.length} việc cũ hơn` : "";
  return [head, ...lines].join("\n") + more;
}

/**
 * Cắt tin dài thành nhiều mảnh vừa giới hạn Telegram (mặc định 3800 ký tự).
 *
 * Vì sao không dùng `text.match(/[\s\S]{1,3800}/g)`: cách đó cắt theo UTF-16 code unit nên có thể
 * **cắt đôi một emoji** — mảnh trước kết thúc bằng surrogate cao (\ud83d), mảnh sau mở đầu bằng
 * surrogate thấp. Telegram nhận surrogate lẻ ⇒ hiện ký tự vỡ (chữ "không ăn unicode") giữa tin.
 * Hàm này duyệt theo CODE POINT nên cặp surrogate luôn đi cùng nhau.
 *
 * Ưu tiên cắt ở ranh giới xuống dòng/khoảng trắng gần cuối (trong 20% cuối) để không vỡ từ.
 *
 * @param {string} text - nội dung cần gửi.
 * @param {number} [max] - số code unit tối đa mỗi mảnh.
 * @returns {string[]} các mảnh, mỗi mảnh <= max code unit.
 */
export function chunkMessage(text, max = 3800) {
  const value = String(text ?? "");
  const limit = Number.isSafeInteger(max) && max > 0 ? max : 3800;
  if (!value) return [""];

  const out = [];
  let buf = "";
  for (const ch of value) {
    if (buf.length + ch.length > limit) {
      const cut = Math.max(buf.lastIndexOf("\n"), buf.lastIndexOf(" "));
      if (cut > limit * 0.8) {
        out.push(buf.slice(0, cut + 1));
        buf = buf.slice(cut + 1);
      } else {
        out.push(buf);
        buf = "";
      }
    }
    buf += ch;
  }
  if (buf) out.push(buf);
  return out;
}

/**
 * Timeout của client cho một lời gọi Telegram Bot API.
 *
 * `getUpdates` là long-poll: Telegram giữ kết nối tới `payload.timeout` giây rồi mới trả về
 * rỗng. Timeout client PHẢI lớn hơn, nếu không mỗi vòng poll đều bị cắt ngang rồi thử lại vô
 * ích (đã xảy ra thật: log bot 17/09 đầy dòng "getUpdates lỗi lần 1/3: timeout 12s").
 *
 * @param {string} method - tên method Bot API, ví dụ "getUpdates" hoặc "sendMessage".
 * @param {number} [pollTimeoutSeconds] - `timeout` truyền cho getUpdates (giây).
 * @returns {number} timeout tính bằng ms.
 */
export function telegramCallTimeoutMs(method, pollTimeoutSeconds = 25) {
  const poll = Number(pollTimeoutSeconds) > 0 ? Number(pollTimeoutSeconds) : 25;
  return method === "getUpdates" ? (poll + 15) * 1000 : 12_000;
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
    "/reporttasks — việc agent đang chạy / vừa xong (kèm thời gian)",
    "",
    "✍️ Lệnh có thay đổi (phải bấm Xác nhận):",
    "/report — gửi báo cáo ngay vào chat này",
    "/mirror — chạy ngay vòng đồng bộ peer",
    "/restart cp|auth|nginx|mirror — khởi động lại service",
    "/deploy — đẩy thay đổi trong workspace lên bản đang chạy (script tự test + rollback)",
    "",
    "💬 Chat + tra cứu internet (không đổi hệ thống):",
    "/chat <câu hỏi> — nói chuyện với agent, tự tìm thông tin trên internet",
    "/chat on|off|reset — bật/tắt chế độ chat, xoá ngữ cảnh hội thoại",
    "",
    "🩺 Guard — tự phát hiện khách chưa cài/chưa chạy được:",
    "/guard — task đang chờ anh approve (kèm bằng chứng + khách bị ảnh hưởng)",
    "",
    "🧠 Việc tự do — agent chạy trên server:",
    "/task <việc cần làm> — ví dụ: /task kiểm tra vì sao node-2 nhiều peer mà ít online",
    "",
    "🖥️ Giao việc cho MÁY KHÁC (phải bấm Xác nhận) — việc đi vào hệ giao việc của máy đó:",
    "/vibecode mac <việc> — giao cho máy Mac (macOS + iOS)",
    "/vibecode win <việc> — giao cho máy Windows",
    "/vibecode server <việc> — giao cho agent trên server",
    "/mac <việc> · /win <việc> — viết tắt của /vibecode",
    "  Ví dụ: /mac sửa lỗi mất mạng khi connect VPN trên iOS rồi cài lên iPhone để test",
    "",
    "😴 Trạng thái máy Mac + đánh thức (chạy ngay, không đổi trạng thái):",
    "/wakeup — Mac đang THỨC hay đang NGỦ, kèm nguồn điện và trạng thái khoá ngủ",
    "  Máy đang ngủ thì gửi kèm Magic Packet; cách đó CHỈ chạy khi router của mạng đó",
    "  forward cổng UDP 9 (mạng công ty thường không cho) và Mac đang cắm sạc",
    "",
    "✅ Duyệt việc guard đề xuất (phải bấm Xác nhận):",
    "/approve <id> — cho phép agent phụ trách sửa + publish bản mới",
    "/reject <id> <lý do> — không sửa (guard ghi lý do vào task)",
    "",
    "Anh nhắn /help để xem lại danh sách này.",
  ].join("\n");
}

// -------------------------------------------------------------------------- nhịp tim máy Mac

/** Nhịp tim cũ hơn mức này thì coi như máy đã ngủ (poller chạy mỗi 60s). */
export const MAC_ALIVE_STALE_MS = 180_000;

/**
 * Diễn giải "nhịp tim" mà poller trên Mac ghi lên node-2 sau mỗi vòng poll (~60s).
 *
 * Vì sao cần: Mac ngủ thì không tiến trình nào chạy được, và trên mạng công ty KHÔNG có cách
 * nào đánh thức nó từ VPS (không có quyền forward cổng ở router). Nên thay vì hứa "sẽ đánh
 * thức được", bot nói thẳng máy đang thức hay đang ngủ — người gửi biết việc có được xử lý
 * ngay hay phải chờ mở nắp.
 *
 * @param {{epoch?: number, ac?: boolean, nosleep?: boolean, host?: string}|null} beat
 * @returns {string} một dòng trạng thái
 */
export function isMacAlive(beat, nowMs = Date.now(), { staleMs = MAC_ALIVE_STALE_MS } = {}) {
  const epoch = Number(beat?.epoch);
  if (!Number.isFinite(epoch) || epoch <= 0) return false;
  return nowMs - epoch * 1000 <= staleMs;
}

export function describeMacAlive(beat, nowMs = Date.now(), { staleMs = MAC_ALIVE_STALE_MS } = {}) {
  if (!beat || !Number.isFinite(Number(beat.epoch)) || Number(beat.epoch) <= 0) {
    return "❔ Chưa từng nhận nhịp tim từ Mac — poller có thể chưa chạy lần nào.";
  }

  const ageMs = Math.max(0, nowMs - Number(beat.epoch) * 1000);
  const age = ageMs < 90_000 ? `${Math.floor(ageMs / 1000)}s` : `${Math.floor(ageMs / 60_000)} phút`;
  const power = beat.ac ? "đang cắm sạc" : "đang dùng pin";
  const sleepKey = beat.nosleep ? "đã khoá không ngủ" : "chưa khoá ngủ";

  if (ageMs <= staleMs) {
    return `🟢 Mac ĐANG THỨC — nhịp tim cách ${age}, ${power}, ${sleepKey}. Việc sẽ được nhận trong ~60s.`;
  }
  return `🔴 Mac ĐANG NGỦ — nhịp tim cuối cách ${age}, ${power}, ${sleepKey}. Việc vẫn nằm nguyên trên node-2 và sẽ về đủ khi Mac thức.`;
}
