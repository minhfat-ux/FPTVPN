import { db, all, one as get, insert, update } from "./db.js";
import { newId, nowIso } from "./util.js";

/**
 * Bộ nhớ dài hạn của fBuddy.
 *
 * Hai tầng, cố ý không tầng nào tốn thêm lượt gọi AI:
 *   1. `user_memories` — sự thật BỀN VỮNG về người dùng (tên, vai trò, công ty, sở
 *      thích, định dạng ưa thích…) và cách họ tự xưng, do model ghi qua công cụ
 *      `remember_fact` hoặc do hệ thống tự học từ chính câu người dùng gõ.
 *   2. `messages_fts` — chỉ mục toàn văn (FTS5) của mọi tin nhắn, để tìm LẠI ngữ
 *      cảnh cũ theo từ khoá. Đây là "nhớ chuyện cũ" mà không cần embedding.
 *
 * Mọi truy vấn đều lọc theo `user_id`: bộ nhớ của người này không bao giờ lẫn sang
 * người khác. Người dùng xem và xoá được toàn bộ bộ nhớ qua `/api/memory`.
 */

/** Trần an toàn: một người tối đa bao nhiêu mẩu ký ức, và một mẩu dài bao nhiêu. */
const MAX_MEMORIES_PER_USER = 200;
const MAX_KEY_CHARS = 60;
const MAX_VALUE_CHARS = 400;
/** Trần độ dài khối bộ nhớ nhét vào system prompt (giữ hoá đơn token trong tầm tay). */
const MAX_BLOCK_CHARS = 1400;

const KINDS = new Set(["fact", "preference", "pronoun", "profile"]);

function clean(text, max) {
  return String(text ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function normaliseKind(kind) {
  const value = String(kind ?? "fact").toLowerCase();
  if (value === "pref" || value === "preference") return "preference";
  if (value === "pronoun" || value === "pronouns") return "pronoun";
  if (value === "profile" || value === "identity") return "profile";
  return KINDS.has(value) ? value : "fact";
}

// --------------------------------------------------------------- sự thật bền vững

/** Ghi (hoặc cập nhật) một mẩu ký ức. Cùng (user, kind, key) thì ghi đè giá trị cũ. */
/**
 * Ghi nhớ một mẩu về người dùng — CÓ KIỂM CHỨNG.
 *
 * `status`:
 *   - "confirmed": người dùng đã tự nói (kèm `evidence` là nguyên văn câu họ nói) hoặc đã xác nhận.
 *   - "unverified": trợ lý suy ra. Vẫn lưu, nhưng KHÔNG được khẳng định; phải hỏi lại cho chắc.
 *   - "conflict": thông tin mới khác thông tin cũ đã xác nhận ⇒ giữ nguyên giá trị CŨ, đánh dấu
 *     mâu thuẫn để trợ lý hỏi người dùng cái nào đúng, thay vì âm thầm ghi đè.
 *
 * Trả về kèm cờ `conflict` / `unverified` để nơi gọi nói được với trợ lý phải làm gì tiếp.
 */
export function rememberFact({
  userId,
  key,
  value,
  kind = "fact",
  source = "model",
  confidence = 1,
  evidence = null,
  status = null,
}) {
  const cleanKey = clean(key, MAX_KEY_CHARS);
  const cleanValue = clean(value, MAX_VALUE_CHARS);
  if (!userId || !cleanKey || !cleanValue) return null;
  const kindValue = normaliseKind(kind);
  const now = nowIso();
  // Mặc định: có bằng chứng nguyên văn từ người dùng ⇒ đã xác nhận; không thì là suy đoán.
  const resolvedStatus = status ?? (source === "user" && evidence ? "confirmed" : "unverified");
  const existing = get("user_memories", "user_id = ? AND kind = ? AND key = ?", [userId, kindValue, cleanKey]);
  if (existing) {
    if (existing.value === cleanValue) {
      // Cùng giá trị nhưng lần này có bằng chứng ⇒ nâng cấp từ suy đoán lên đã xác nhận.
      if (resolvedStatus === "confirmed" && existing.status !== "confirmed") {
        return { ...update("user_memories", existing.id, { status: "confirmed", evidence, verified_at: now, updated_at: now }), verifiedNow: true };
      }
      return existing; // không ghi lại thứ không đổi
    }
    // Khác giá trị.
    if (existing.status === "confirmed" && resolvedStatus !== "confirmed") {
      // Suy đoán mới KHÔNG được lật một điều người dùng đã xác nhận — đánh dấu mâu thuẫn để hỏi lại.
      return {
        ...update("user_memories", existing.id, {
          status: "conflict",
          evidence: `Trước đây: "${existing.value}". Vừa rồi có thông tin khác: "${cleanValue}".`,
          updated_at: now,
        }),
        conflict: true,
      };
    }
    return update("user_memories", existing.id, {
      value: cleanValue,
      source,
      confidence,
      status: resolvedStatus,
      evidence,
      verified_at: resolvedStatus === "confirmed" ? now : null,
      updated_at: now,
    });
  }
  if (countMemories(userId) >= MAX_MEMORIES_PER_USER) {
    // Bỏ mẩu CŨ NHẤT, ít quan trọng nhất (fact/profile trước, preference/pronoun sau).
    db.prepare(
      `DELETE FROM user_memories WHERE id = (
         SELECT id FROM user_memories WHERE user_id = ?
         ORDER BY CASE kind WHEN 'fact' THEN 0 WHEN 'profile' THEN 1 WHEN 'preference' THEN 2 ELSE 3 END,
                  updated_at ASC LIMIT 1)`,
    ).run(userId);
  }
  return insert("user_memories", {
    id: newId("mem"),
    user_id: userId,
    kind: kindValue,
    key: cleanKey,
    value: cleanValue,
    source,
    confidence,
    status: resolvedStatus,
    evidence,
    verified_at: resolvedStatus === "confirmed" ? now : null,
    created_at: now,
    updated_at: now,
  });
}

/** Người dùng xác nhận một mẩu nhớ là đúng (hoặc sửa giá trị rồi xác nhận). */
export function confirmMemory(userId, id, { value = null } = {}) {
  const row = get("user_memories", "id = ? AND user_id = ?", [id, userId]);
  if (!row) return null;
  const now = nowIso();
  return update("user_memories", id, {
    value: value ? clean(value, MAX_VALUE_CHARS) || row.value : row.value,
    status: "confirmed",
    source: "user",
    verified_at: now,
    updated_at: now,
  });
}

/**
 * Mẩu nhớ nào cần kiểm chứng lại. Cũ quá (mặc định 180 ngày) thì cũng nên hỏi lại — người ta đổi
 * việc, đổi công ty, đổi sở thích; "nhớ" mà không bao giờ soát lại là nhớ sai.
 */
export function memoriesNeedingVerification(userId, { maxAgeDays = 180 } = {}) {
  const cutoff = new Date(Date.now() - maxAgeDays * 86400000).toISOString();
  return listMemories(userId).filter(
    (row) =>
      row.status === "conflict" ||
      row.status === "unverified" ||
      (row.status === "confirmed" && (row.verified_at ?? row.updated_at) < cutoff),
  );
}

export function countMemories(userId) {
  return Number(db.prepare("SELECT COUNT(*) AS n FROM user_memories WHERE user_id = ?").get(userId)?.n ?? 0);
}

export function listMemories(userId, { kind = null } = {}) {
  const rows = kind
    ? all("user_memories", "user_id = ? AND kind = ?", [userId, normaliseKind(kind)])
    : all("user_memories", "user_id = ?", [userId]);
  return rows
    .map((row) => ({
      id: row.id,
      kind: row.kind,
      key: row.key,
      value: row.value,
      source: row.source,
      updatedAt: row.updated_at,
    }))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export function getMemory(userId, kind, key) {
  const row = get("user_memories", "user_id = ? AND kind = ? AND key = ?", [userId, normaliseKind(kind), clean(key, MAX_KEY_CHARS)]);
  return row ? { id: row.id, kind: row.kind, key: row.key, value: row.value } : null;
}

export function forgetMemory(userId, id) {
  const row = get("user_memories", "id = ? AND user_id = ?", [id, userId]);
  if (!row) return false;
  db.prepare("DELETE FROM user_memories WHERE id = ?").run(id);
  return true;
}

export function forgetAllMemories(userId) {
  const result = db.prepare("DELETE FROM user_memories WHERE user_id = ?").run(userId);
  return Number(result.changes ?? 0);
}

// ------------------------------------------------------------- học cách xưng hô

/**
 * Người dùng Việt tự xưng rất khác nhau (anh/chị/em/tôi/mình/con/cháu…). Học từ
 * chính câu họ gõ để lần sau mở hội thoại MỚI là đã xưng đúng vai, không phải đoán.
 *
 * Cố ý thận trọng: chỉ nhận khi có mẫu rõ ràng (đại từ đứng trước động từ, hoặc
 * "giúp/cho + đại từ"), nên "em ơi" (đang GỌI trợ lý) không bị hiểu nhầm là tự xưng.
 * Trả về đại từ vừa học, hoặc null.
 */
const SELF_REFERENCE_PATTERNS = [
  /\b(anh|chị|em|tôi|mình|tớ|con|cháu|bác|cô|chú)\s+(?:muốn|cần|nhờ|đang|là|thấy|thích|sẽ|đã|phải|nghĩ|định|gửi|tạo|làm|hỏi|xem|dùng|ở|tên|thì|vừa|sắp|đang làm)\b/gi,
  /\b(?:giúp|giùm|hộ|cho|gửi cho|hướng dẫn cho|giải thích cho)\s+(anh|chị|em|tôi|mình|tớ|con|cháu)\b/gi,
  /\b(anh|chị|em|tôi|mình|tớ)\s+(?:không|chưa|đã|vẫn)\s+\w+/gi,
];

/** Cặp xưng hô suy ra từ đại từ tự xưng của người dùng. */
export const ADDRESS_PAIRS = {
  anh: { callUser: "anh", botSelf: "em" },
  chị: { callUser: "chị", botSelf: "em" },
  em: { callUser: "em", botSelf: "anh/chị" },
  tôi: { callUser: "bạn", botSelf: "mình" },
  mình: { callUser: "bạn", botSelf: "mình" },
  tớ: { callUser: "bạn", botSelf: "mình" },
  con: { callUser: "con", botSelf: "chú/cô" },
  cháu: { callUser: "cháu", botSelf: "chú/cô" },
  bác: { callUser: "bác", botSelf: "cháu" },
  cô: { callUser: "cô", botSelf: "em/cháu" },
  chú: { callUser: "chú", botSelf: "cháu" },
};

export function learnSelfReference({ userId, text }) {
  const content = String(text ?? "");
  if (!userId || content.length < 4) return null;
  // Người dùng nói thẳng cách gọi ⇒ ưu tiên tuyệt đối.
  const explicit = /\bgọi\s+(?:tôi|mình|anh|chị|em)\s+là\s+([^.,!?\n]{1,30})/i.exec(content);
  if (explicit) {
    const wanted = clean(explicit[1], 30);
    if (wanted) return rememberFact({ userId, kind: "pronoun", key: "address_as", value: wanted, source: "user" });
  }
  const counts = new Map();
  for (const pattern of SELF_REFERENCE_PATTERNS) {
    for (const match of content.matchAll(pattern)) {
      const pronoun = match[1].toLowerCase();
      if (!ADDRESS_PAIRS[pronoun]) continue;
      counts.set(pronoun, (counts.get(pronoun) ?? 0) + 1);
    }
  }
  if (!counts.size) return null;
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  // Hai đại từ khác nhau cùng số lần ⇒ câu mơ hồ, không học để tránh xưng sai về sau.
  if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) return null;
  const [pronoun] = ranked[0];
  const current = getMemory(userId, "pronoun", "self");
  if (current?.value === pronoun) return null;
  return rememberFact({ userId, kind: "pronoun", key: "self", value: pronoun, source: "system" });
}

// ------------------------------------------------------- tìm lại ngữ cảnh đã nói

/** Từ để lại trong câu truy vấn FTS (bỏ hư từ, đại từ, từ quá ngắn). */
const STOPWORDS = new Set([
  "và","là","của","cho","với","một","các","những","thì","mà","này","đó","khi","nếu","thì","hay","hoặc","như","để","trong","trên","dưới","ra","vào","có","không","được","rồi","ạ","nhé","nha","vâng","dạ","ơi","giúp","giùm","hộ","làm","muốn","cần","xem","hỏi","anh","chị","em","tôi","mình","tớ","bạn","con","cháu","cô","chú","bác","the","a","an","of","to","for","and","or","is","are","can","you","me","my","please","help","make",
]);

function ftsQuery(text) {
  const terms = String(text ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !STOPWORDS.has(word))
    .slice(0, 8);
  const unique = [...new Set(terms)];
  if (!unique.length) return null;
  // Mỗi từ là một truy vấn tiền tố, nối bằng OR để còn gì nhớ nấy (bm25 xếp hạng sau).
  return unique.map((term) => `"${term}"*`).join(" OR ");
}

/**
 * Tìm trong tin nhắn CŨ của chính người dùng theo từ khoá. Trả về đoạn trích ngắn
 * kèm tiêu đề + ngày của cuộc trò chuyện, để model dùng lại ngữ cảnh đã nói.
 */
export function searchPastChats({ userId, query, excludeConversationId = null, limit = 5 }) {
  const match = ftsQuery(query);
  if (!match) return [];
  const capped = Math.min(Math.max(Number(limit) || 5, 1), 10);
  try {
    const rows = db
      .prepare(
        `SELECT m.conversation_id AS conversationId,
                m.message_id      AS messageId,
                m.role            AS role,
                m.created_at      AS createdAt,
                snippet(messages_fts, 0, '', '', '…', 18) AS snippet,
                c.title           AS title
           FROM messages_fts m
           LEFT JOIN conversations c ON c.id = m.conversation_id
          WHERE messages_fts MATCH ?
            AND m.user_id = ?
            AND m.role IN ('user', 'assistant')
            ${excludeConversationId ? "AND m.conversation_id <> ?" : ""}
          ORDER BY bm25(messages_fts), m.created_at DESC
          LIMIT ?`,
      )
      .all(...(excludeConversationId ? [match, userId, excludeConversationId, capped] : [match, userId, capped]));
    return rows.map((row) => ({
      conversationId: row.conversationId,
      messageId: row.messageId,
      role: row.role,
      title: clean(row.title, 80) || "(không tiêu đề)",
      date: String(row.createdAt ?? "").slice(0, 10),
      snippet: clean(row.snippet, 240),
    }));
  } catch {
    // Câu truy vấn FTS hỏng không được làm chết lượt chat.
    return [];
  }
}

/** Các cuộc trò chuyện gần đây của người dùng — "đang quan tâm chuyện gì". */
export function recentConversationTopics(userId, { limit = 6, excludeConversationId = null } = {}) {
  const rows = db
    .prepare(
      `SELECT id, title, skill, message_count AS messages, updated_at AS updatedAt
         FROM conversations
        WHERE user_id = ? ${excludeConversationId ? "AND id <> ?" : ""}
        ORDER BY updated_at DESC
        LIMIT ?`,
    )
    .all(...(excludeConversationId ? [userId, excludeConversationId, limit] : [userId, limit]));
  return rows.map((row) => ({
    id: row.id,
    title: clean(row.title, 80) || "(không tiêu đề)",
    skill: row.skill,
    messages: Number(row.messages ?? 0),
    date: String(row.updatedAt ?? "").slice(0, 10),
  }));
}

/** Kỹ năng người dùng dùng nhiều nhất — biết họ thường cần gì. */
export function favouriteSkills(userId, { limit = 3 } = {}) {
  const rows = db
    .prepare(
      `SELECT skill, COUNT(*) AS n FROM conversations
        WHERE user_id = ? AND skill IS NOT NULL AND skill <> 'auto'
        GROUP BY skill ORDER BY n DESC LIMIT ?`,
    )
    .all(userId, limit);
  return rows.filter((row) => Number(row.n) > 0).map((row) => `${row.skill} (${row.n})`);
}

function formatPair(pronoun, custom = null) {
  if (custom) return `người dùng muốn được gọi là "${custom}"`;
  const pair = ADDRESS_PAIRS[pronoun];
  if (!pair) return null;
  return `người dùng tự xưng "${pronoun}" ⇒ gọi họ là "${pair.callUser}", bạn tự xưng "${pair.botSelf}"`;
}

/**
 * Khối bộ nhớ nhét vào system prompt: hồ sơ + ký ức + chủ đề gần đây + đoạn cũ liên
 * quan tới chính câu hỏi đang hỏi. Trả "" khi chưa có gì để nhớ.
 */
export function buildMemoryBlock({ userId, query = "", conversationId = null, accountName = null } = {}) {
  if (!userId) return "";
  const memories = listMemories(userId);
  const pronouns = memories.filter((m) => m.kind === "pronoun");
  const facts = memories.filter((m) => m.kind !== "pronoun");
  const topics = recentConversationTopics(userId, { excludeConversationId: conversationId });
  const skills = favouriteSkills(userId);
  const hits = searchPastChats({ userId, query, excludeConversationId: conversationId, limit: 4 });

  const lines = [];
  if (accountName) lines.push(`• Tên tài khoản: ${clean(accountName, 60)}`);
  const custom = pronouns.find((m) => m.key === "address_as");
  const selfPronoun = pronouns.find((m) => m.key === "self");
  const pair = formatPair(selfPronoun?.value, custom?.value);
  if (pair) lines.push(`• Xưng hô đã học: ${pair}.`);
  // Chia theo mức kiểm chứng: chỉ nhóm ĐÃ XÁC NHẬN mới được khẳng định.
  const confirmed = facts.filter((m) => (m.status ?? "unverified") === "confirmed");
  const unverified = facts.filter((m) => (m.status ?? "unverified") === "unverified");
  const conflicts = facts.filter((m) => m.status === "conflict");
  const staleCutoff = new Date(Date.now() - 180 * 86400000).toISOString();
  const stale = confirmed.filter((m) => (m.verified_at ?? m.updated_at) < staleCutoff);

  if (confirmed.length) {
    lines.push(
      "• Người dùng ĐÃ XÁC NHẬN (dùng được, không cần hỏi lại): " +
        confirmed
          .filter((m) => !stale.includes(m))
          .slice(0, 12)
          .map((m) => `${m.key}: ${m.value}`)
          .join(" · "),
    );
  }
  if (stale.length) {
    lines.push(
      "• Nhớ đã LÂU chưa soát lại (nên hỏi lại cho chắc, đừng khẳng định): " +
        stale.slice(0, 6).map((m) => `${m.key}: ${m.value}`).join(" · "),
    );
  }
  if (conflicts.length) {
    lines.push(
      "• MÂU THUẪN — thông tin mới khác thông tin cũ, PHẢI hỏi người dùng cái nào đúng (đừng tự chọn):\n" +
        conflicts
          .slice(0, 6)
          .map((m) => `   – ${m.key}: đang ghi "${m.value}". ${m.evidence ?? ""}`.trim())
          .join("\n"),
    );
  }
  if (unverified.length) {
    lines.push(
      "• CHƯA XÁC NHẬN — chỉ là điều bạn tự suy ra, TUYỆT ĐỐI không khẳng định; muốn dùng thì hỏi lại một câu ngắn trước: " +
        unverified.slice(0, 8).map((m) => `${m.key}: ${m.value}`).join(" · "),
    );
  }
  if (skills.length) lines.push(`• Kỹ năng hay dùng: ${skills.join(", ")}`);
  if (topics.length) {
    lines.push("• Cuộc trò chuyện gần đây: " + topics.map((t) => `"${t.title}" (${t.date})`).join(" · "));
  }
  if (hits.length) {
    lines.push(
      "• Ngữ cảnh cũ liên quan tới câu hỏi này (tìm theo từ khoá):\n" +
        hits.map((h) => `  - [${h.date} · ${h.title}] ${h.role === "user" ? "người dùng" : "bạn"} đã nói: ${h.snippet}`).join("\n"),
    );
  }
  if (!lines.length) return "";

  const block =
    "BỘ NHỚ VỀ NGƯỜI DÙNG (chỉ của riêng người này; dùng để CÁ NHÂN HOÁ — đừng kể rằng bạn đang tra bộ nhớ):\n" +
    lines.join("\n") +
    "\nCách dùng (có KIỂM CHỨNG — đọc kỹ):\n" +
    "• Nhóm ĐÃ XÁC NHẬN: dùng tự nhiên, KHÔNG hỏi lại.\n" +
    "• Nhóm CHƯA XÁC NHẬN: không được nói như sự thật. Nếu cần dùng thì hỏi một câu ngắn kiểu \"hình như anh làm ở … đúng không ạ?\".\n" +
    "• Nhóm MÂU THUẪN: nêu cả hai và hỏi người dùng cái nào đúng; người dùng chốt thì gọi `verify_memory`.\n" +
    "• Nhóm nhớ đã lâu: coi như cần xác nhận lại, nhất là việc làm, công ty, chức danh, sở thích.\n" +
    "• Khi người dùng nói rõ một điều về họ: gọi `remember_fact` kèm `evidence` là NGUYÊN VĂN câu họ vừa nói — " +
    "có nguyên văn thì mẩu nhớ được đánh dấu ĐÃ xác nhận, không có thì chỉ là suy đoán.\n" +
    "• Đừng tự ghi những điều người dùng không nói (suy luận từ ngữ cảnh, từ tên, từ cách nói) — nếu cần thì ghi nhưng " +
    "phải để trạng thái chưa xác nhận và hỏi lại.\n" +
    "• Cần chi tiết cũ hơn thì gọi `search_past_chats` thay vì đoán.";
  return block.slice(0, MAX_BLOCK_CHARS);
}

/** Tóm tắt cho API/UI: người dùng xem được đúng những gì fBuddy nhớ về mình. */
export function memoryOverview(userId, { conversationId = null } = {}) {
  const memories = listMemories(userId);
  return {
    memories,
    count: memories.length,
    topics: recentConversationTopics(userId, { excludeConversationId: conversationId }),
    limit: MAX_MEMORIES_PER_USER,
  };
}
