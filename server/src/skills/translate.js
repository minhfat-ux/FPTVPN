/**
 * Dịch prompt pack của skill sang ngôn ngữ khác, dùng **chính provider đang cấu hình**
 * (Cài đặt → Nhà cung cấp AI). Không gọi dịch vụ ngoài nào khác.
 *
 * Vì sao cần: skill nhập từ SkillHub (Tencent) viết bằng tiếng Trung. Tên/mô tả phải là
 * tiếng Việt thì người mua mới đọc được, còn chỉ dẫn thì dịch để tránh việc model bám
 * theo nền tảng Trung Quốc (小红书, 公众号…) và để chủ dự án đọc/sửa được.
 *
 * Nguyên tắc:
 *  - **Hai lượt gọi cho mỗi ngôn ngữ**: một lượt cho metadata (JSON nhỏ), một lượt cho
 *    phần chỉ dẫn (văn bản dài). Gộp chung dễ bị model trả JSON hỏng hoặc cắt cụt.
 *  - Dịch xong vẫn phải qua `fitInstructions()` của chợ ⇒ bản tiếng Việt dài hơn bản
 *    tiếng Trung nên **có thể bị cắt thêm**; hàm trả về độ dài để nơi gọi cảnh báo.
 *  - `streamImpl` bơm vào được để test không cần mạng.
 */
import { nextUsableProvider } from "../settings.js";
import { streamChat } from "../providers/index.js";

/** Ngôn ngữ đích được hỗ trợ. */
export const TRANSLATION_TARGETS = {
  vi: { label: "tiếng Việt", name: "Vietnamese" },
  en: { label: "English", name: "English" },
};

const MAX_TRANSLATED_CHARS = 60_000;

/** Gom `streamChat` (async generator) thành một câu trả lời trọn vẹn. */
export async function completeOnce({ provider, model, system, user, signal, streamImpl = streamChat }) {
  const messages = [
    ...(system ? [{ role: "system", content: system }] : []),
    { role: "user", content: user },
  ];
  let text = "";
  for await (const event of streamImpl({ provider, model, messages, tools: [], toolMode: "none", signal })) {
    if (event?.type === "delta" && event.text) {
      text += event.text;
      if (text.length > MAX_TRANSLATED_CHARS) break;
    }
    if (event?.type === "error") throw new Error(event.message ?? "Nhà cung cấp trả lỗi khi dịch");
  }
  return text.trim();
}

/** Bỏ rào markdown và lấy khối JSON đầu tiên (model hay bọc ```json … ```). */
function parseJsonLoosely(text) {
  const cleaned = String(text ?? "").replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Dịch một skill sang `target` (`vi` | `en`).
 *
 * Trả `{ target, name, tagline, description, instructions, model, warnings, lengths }`.
 * Lỗi mạng/provider được ném ra ngoài để nơi gọi quyết định (giữ nguyên bản gốc).
 */
export async function translateSkillFields(
  { name = "", tagline = "", description = "", instructions = "" } = {},
  { target, providerId = null, model = null, signal, streamImpl = streamChat, concise = false, chooseProvider = nextUsableProvider } = {},
) {
  const lang = TRANSLATION_TARGETS[target];
  if (!lang) throw new Error(`Ngôn ngữ đích không hỗ trợ: ${target} (chỉ có ${Object.keys(TRANSLATION_TARGETS).join(", ")})`);
  const chosen = chooseProvider({ providerId, model });
  if (!chosen) {
    throw new Error("Chưa có nhà cung cấp AI nào dùng được — vào Cài đặt → Nhà cung cấp AI dán key rồi thử lại.");
  }

  const warnings = [];
  const lengths = { source: { name: name.length, tagline: tagline.length, description: description.length, instructions: instructions.length } };

  // 1) metadata — một lượt, trả JSON
  const metaUser = JSON.stringify({ name, tagline, description }, null, 1);
  const metaRaw = await completeOnce({
    provider: chosen.provider,
    model: chosen.model,
    system:
      `Bạn là biên dịch viên sản phẩm. Dịch sang ${lang.label}. ` +
      "Giữ tên riêng, tên thương hiệu, tên nền tảng; nếu là tên tiếng Trung thì thêm chú thích ngắn trong ngoặc ở lần xuất hiện đầu. " +
      "Giữ giọng văn tiếp thị ngắn gọn, tự nhiên, không thêm lời giải thích. " +
      'CHỈ trả về JSON thuần dạng {"name":"…","tagline":"…","description":"…"} — không thêm chữ nào ngoài JSON.',
    user: metaUser,
    signal,
    streamImpl,
  });
  const meta = parseJsonLoosely(metaRaw);
  if (!meta) warnings.push(`model không trả JSON hợp lệ cho phần tên/mô tả — giữ nguyên bản gốc (nhận được: ${metaRaw.slice(0, 80)}…)`);

  // 2) chỉ dẫn — một lượt, văn bản thuần
  let translatedInstructions = "";
  if (instructions.trim()) {
    translatedInstructions = await completeOnce({
      provider: chosen.provider,
      model: chosen.model,
      system:
        `Dịch sang ${lang.label}, giữ NGUYÊN cấu trúc markdown (tiêu đề, danh sách, bảng, thứ tự mục). ` +
        "Dịch hết mọi phần, không tóm tắt, không bỏ mục, không thêm lời dẫn. " +
        "Giữ nguyên tên riêng/tên nền tảng, thêm chú thích ngắn trong ngoặc ở lần xuất hiện đầu nếu là tiếng Trung. " +
        (concise ? "Diễn đạt súc tích để bản dịch không dài hơn bản gốc quá 30%. " : "") +
        "Chỉ trả về bản dịch, không mở đầu bằng câu nào.",
      user: instructions,
      signal,
      streamImpl,
    });
  } else {
    warnings.push("skill không có chỉ dẫn để dịch");
  }

  const result = {
    target,
    name: String(meta?.name ?? "").trim() || name,
    tagline: String(meta?.tagline ?? "").trim() || tagline,
    description: String(meta?.description ?? "").trim() || description,
    instructions: translatedInstructions.trim() || instructions,
    model: `${chosen.provider.name ?? chosen.row?.name ?? "?"} / ${chosen.model}`,
    warnings,
    lengths: {
      ...lengths,
      translated: {
        name: (meta?.name ?? "").length,
        tagline: (meta?.tagline ?? "").length,
        description: (meta?.description ?? "").length,
        instructions: translatedInstructions.length,
      },
    },
  };
  if (result.lengths.translated.instructions > lengths.source.instructions * 1.3 && lengths.source.instructions > 0) {
    result.warnings.push(
      `bản dịch dài hơn bản gốc ${Math.round((result.lengths.translated.instructions / lengths.source.instructions - 1) * 100)}% ` +
        `(${lengths.source.instructions} → ${result.lengths.translated.instructions} ký tự) — sẽ bị trần 6.000 của chợ cắt thêm`,
    );
  }
  return result;
}

/**
 * Dịch một skill sang nhiều ngôn ngữ, chạy song song có giới hạn.
 * Trả `{ translations: { vi: {...}, en: {...} }, warnings: [] }` — ngôn ngữ nào lỗi thì
 * bị bỏ khỏi kết quả kèm cảnh báo, không làm hỏng cả lần nhập.
 */
export async function translateSkill(fields = {}, { targets = ["vi", "en"], concurrency = 2, ...options } = {}) {
  const wanted = targets.filter((t) => TRANSLATION_TARGETS[t]);
  const skipped = targets.filter((t) => !TRANSLATION_TARGETS[t]);
  const warnings = skipped.map((t) => `bỏ qua ngôn ngữ không hỗ trợ: ${t}`);
  const translations = {};
  const queue = [...wanted];
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, queue.length || 1)) }, async () => {
    while (queue.length) {
      const target = queue.shift();
      try {
        translations[target] = await translateSkillFields(fields, { target, ...options });
      } catch (err) {
        warnings.push(`dịch ${target} lỗi: ${err?.message ?? err}`);
      }
    }
  });
  await Promise.all(workers);
  return { translations, warnings };
}
