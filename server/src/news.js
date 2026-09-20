/**
 * TIN TỨC ĐÃ LẤY VỀ — mặt đọc của job `ops/news-refresh.mjs`.
 *
 * Job chạy 2 lần/ngày, ghi vào bảng `news_items`. Ở đây chỉ ĐỌC: tra theo từ khoá, theo nhóm, và
 * ghép một khối "tin mới nhất" vào prompt khi câu hỏi của người dùng chạm tới thời sự.
 *
 * Nguyên tắc: tin nào cũng phải kèm NGUỒN + GIỜ ĐĂNG. Trợ lý không được nói "theo tin mới nhất"
 * mà không nói tin của ai, lúc nào — đó là cách chắc chắn nhất để nói sai mà không ai phát hiện.
 */
import { all } from "./db.js";
import { vnNow } from "./researcher.js";

/** Câu hỏi có dấu hiệu cần tin thời sự không. */
const NEWS_RE =
  /tin tức|thời sự|tin mới|mới nhất|hôm nay có gì|tuần này có gì|đang có gì|diễn biến|tình hình|sự kiện|ra mắt|vừa ra|công bố|nổi bật|xu hướng|bản tin|có gì mới/i;

export function newsQuestionLikely(message = "") {
  return NEWS_RE.test(String(message));
}

/**
 * Tin mới nhất trong DB.
 * @param {{ topic?: string|null, query?: string|null, hours?: number, limit?: number }} options
 */
export function latestNews({ topic = null, query = null, hours = 72, limit = 12 } = {}) {
  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
  const clauses = ["published_at >= ?"];
  const params = [since];
  if (topic && ["vn", "ai", "tech", "chung"].includes(topic)) {
    clauses.push("topic = ?");
    params.push(topic);
  }
  if (query) {
    // Tìm thô bằng LIKE trên tiêu đề + tóm tắt: đủ tốt cho vài nghìn tin, không cần FTS.
    const words = String(query).toLowerCase().split(/\s+/).filter((word) => word.length > 2).slice(0, 4);
    for (const word of words) {
      clauses.push("(LOWER(title) LIKE ? OR LOWER(COALESCE(summary,'')) LIKE ?)");
      params.push(`%${word}%`, `%${word}%`);
    }
  }
  try {
    return all("news_items", clauses.join(" AND "), params, { order: "published_at DESC", limit });
  } catch {
    return []; // bảng chưa có (job chưa chạy lần nào) ⇒ coi như không có tin, đừng làm hỏng lượt chat
  }
}

/** Đếm nhanh để biết job có đang chạy không. */
export function newsStats() {
  try {
    const rows = all("news_items", "1 = 1", [], { order: "published_at DESC", limit: 1 });
    const total = all("news_items", "1 = 1", []).length;
    return { total, newest: rows[0]?.published_at ?? null, oldest: null };
  } catch {
    return { total: 0, newest: null, oldest: null };
  }
}

const clean = (text = "") => String(text ?? "").replace(/\s+/g, " ").trim();

/**
 * Khối tin mới nhất để ghép vào system prompt. Trả "" khi câu hỏi không liên quan tin tức.
 */
export function buildNewsBlock({ message = "", limit = 8 } = {}) {
  if (!newsQuestionLikely(message)) return "";
  const stats = newsStats();
  if (!stats.total) return "";
  const clock = vnNow();

  const pick = (topic, count) => latestNews({ topic, hours: 60, limit: count });
  const vn = pick("vn", Math.ceil(limit / 2));
  const ai = [...pick("ai", Math.floor(limit / 2)), ...pick("tech", Math.ceil(limit / 4))];

  const render = (rows) =>
    rows
      .map((row) => {
        const when = new Date(row.published_at);
        const hhmm = new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }).format(when);
        return `   – [${hhmm}] ${clean(row.title)} — ${row.source} · ${row.url}`;
      })
      .join("\n");

  const lines = [
    `TIN ĐÃ LẤY VỀ (job cập nhật tin chạy tự động; bây giờ là ${clock.stamp}; tổng ${stats.total} tin trong DB, mới nhất lúc ${String(stats.newest).slice(11, 16)} UTC ngày ${String(stats.newest).slice(0, 10)}):`,
  ];
  if (vn.length) lines.push("• Việt Nam:", render(vn));
  if (ai.length) lines.push("• AI & công nghệ thế giới:", render(ai));
  lines.push(
    "CÁCH DÙNG:",
    "• Chỉ nói những tin có trong danh sách trên, kèm NGUỒN và GIỜ ĐĂNG. KHÔNG kể tin theo trí nhớ.",
    "• Người dùng hỏi sâu hơn một tin nào đó thì gọi công cụ `tin_moi` để tra thêm, hoặc `tra_cuu` để đọc báo gốc.",
    "• Nếu danh sách không có gì liên quan, nói thẳng là chưa thấy tin mới về việc đó — đừng suy diễn tình hình.",
  );
  return lines.join("\n");
}
