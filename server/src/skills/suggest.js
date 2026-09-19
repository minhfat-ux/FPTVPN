/**
 * GỢI Ý KỸ NĂNG/CHUYÊN GIA theo câu hỏi người dùng.
 *
 * Vấn đề: chợ có 50 mục nhưng người dùng hỏi "viết content bán hàng cho shop mỹ phẩm" thì fBuddy
 * tự làm luôn, không nói rằng có sẵn kỹ năng chuyên cho việc đó. Mục trong chợ coi như vô hình.
 *
 * Cách làm: chấm điểm từng mục trong chợ theo câu hỏi (từ khoá tên/mô tả + nhóm chủ đề + dấu hiệu
 * công việc), rồi đưa 1–3 mục điểm cao nhất vào ngữ cảnh để trợ lý nhắc tới. Không dùng AI để chấm
 * — chấm bằng từ khoá để nhanh, rẻ, và giải thích được vì sao gợi ý mục đó.
 */
import { listHubSkills } from "./hub.js";

/** Nhóm chủ đề → từ khoá trong câu hỏi. Chỉ để tăng điểm, không phải điều kiện bắt buộc. */
const CATEGORY_HINTS = {
  "Bán hàng": ["bán hàng", "sale", "sales", "chốt đơn", "khách hàng", "doanh số", "cmo", "marketing", "quảng cáo", "chạy ads", "content", "nội dung bán"],
  "Chuyên gia": ["chuyên gia", "cố vấn", "tư vấn", "pháp lý", "thuế", "kế toán", "nhân sự", "tài chính", "du học", "luật"],
  "Văn phòng": ["họp", "biên bản", "hợp đồng", "soát hợp đồng", "email", "công văn", "tài liệu", "văn bản"],
  "Dữ liệu": ["dữ liệu", "excel", "bảng tính", "phân tích", "báo cáo", "số liệu", "biểu đồ", "thống kê", "chi phí"],
  "Nội dung": ["viết", "content", "bài viết", "dịch", "thương hiệu", "mạng xã hội", "seo", "kịch bản"],
  "Giáo dục": ["học", "dạy", "giáo án", "bài giảng", "luyện thi", "gia sư", "sinh viên", "học sinh", "trẻ em", "từ vựng", "toán", "tiếng anh", "du học", "khoá học", "đề cương"],
  "Khác": ["kế toán", "tài chính", "báo cáo tài chính"],
};

/** Dấu hiệu "đây là việc có kỹ năng chuyên" để chỉ gợi ý khi thật sự liên quan. */
const TASK_CUES = [
  "viết", "soạn", "tạo", "làm", "lập", "thiết kế", "phân tích", "kiểm tra", "soát", "dịch", "tóm tắt",
  "luyện", "dạy", "học", "tư vấn", "kế hoạch", "chiến lược", "báo cáo", "slide", "pptx", "excel", "bài giảng",
  "giúp tôi", "giúp mình", "cần", "muốn", "hướng dẫn", "cách",
];

const strip = (text) =>
  String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");

const tokens = (text) =>
  strip(text)
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2);

/**
 * Đếm số mục chứa mỗi từ (document frequency) — để từ phổ biến như "hợp", "nhà", "giúp" không
 * được tính điểm cao như từ đặc thù ("hợp đồng", "giáo án", "từ vựng").
 *
 * Vì sao cần: bản đầu chấm mỗi từ 2–3 điểm, nên câu "soát giúp tôi hợp đồng thuê nhà" lại gợi ý
 * ba chuyên gia Indonesia/Singapore — trùng vài từ thông dụng là qua ngưỡng. Đã gặp thật.
 */
function buildDocumentFrequency(skills) {
  const df = new Map();
  for (const skill of skills) {
    const seen = new Set(tokens(`${skill.name} ${skill.tagline ?? ""} ${skill.description ?? ""} ${skill.category ?? ""}`));
    for (const token of seen) df.set(token, (df.get(token) ?? 0) + 1);
  }
  return df;
}

/** Chấm điểm một mục trong chợ với câu hỏi. Trả về điểm, lý do, và có khớp nhóm chủ đề không. */
function scoreSkill(skill, messageTokens, rawMessage, df) {
  const target = new Set(tokens(`${skill.name} ${skill.tagline ?? ""} ${skill.description ?? ""} ${skill.category ?? ""}`));
  let score = 0;
  let strongHits = 0;
  const hits = [];

  for (const token of messageTokens) {
    if (!target.has(token)) continue;
    // Từ dài, hiếm ⇒ đặc thù cho mục này. Từ ngắn, xuất hiện ở nhiều mục ⇒ gần như vô nghĩa.
    const rarity = (df.get(token) ?? 1) <= 3 ? 3 : (df.get(token) ?? 1) <= 8 ? 1 : -1;
    const weight = token.length >= 6 ? 3 : token.length >= 4 ? 2 : 1;
    const points = weight + rarity;
    if (points <= 0) continue;
    score += points;
    if (points >= 4) strongHits += 1;
    hits.push(token);
  }

  // So khớp từ khoá GIỮ DẤU: bỏ dấu sẽ gộp "thuê" (thuê nhà) với "thuế" (thuế) — bản trước vì thế
  // mà câu "soát hợp đồng thuê nhà" khớp với cả 14 chuyên gia thuế. Người dùng gõ không dấu thì
  // mới dùng bản bỏ dấu (và chỉ khi cả câu đều không dấu).
  const rawLower = String(rawMessage).toLowerCase();
  const userTypedWithoutAccents = !/[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i.test(rawLower);

  let hintMatched = false;
  for (const [category, keywords] of Object.entries(CATEGORY_HINTS)) {
    if (skill.category !== category) continue;
    for (const keyword of keywords) {
      const keywordLower = String(keyword).toLowerCase();
      const ok = userTypedWithoutAccents ? strip(rawLower).includes(strip(keywordLower)) : rawLower.includes(keywordLower);
      if (!ok) continue;
      score += 5;
      hintMatched = true;
      hits.push(keyword);
      break;
    }
  }

  // Ưu tiên đúng thị trường: người dùng nói tiếng Việt thì mục "Việt Nam" hợp hơn; mục gắn nước
  // khác chỉ hợp khi câu hỏi nhắc tới nước đó.
  const FOREIGN = ["malaysia", "singapore", "indonesia", "thailand", "thái lan", "philippines"];
  const hayName = `${skill.name} ${skill.tagline ?? ""}`.toLowerCase();
  const foreignAsked = FOREIGN.some((country) => rawLower.includes(country));
  if (!foreignAsked) {
    if (hayName.includes("việt nam")) score += 4;
    else if (FOREIGN.some((country) => hayName.includes(country))) score -= 6;
  }

  // Tên mục xuất hiện gần như nguyên văn trong câu hỏi ⇒ gần như chắc chắn đúng mục.
  const nameHit = strip(rawMessage).includes(strip(skill.name));
  if (nameHit) score += 12;

  return { score, hintMatched, strongHits, nameHit, hits: [...new Set(hits)].slice(0, 4) };
}

/**
 * Các mục trong chợ phù hợp với câu hỏi. Trả về tối đa `limit` mục đã sắp theo điểm.
 * Rỗng khi câu hỏi không có dấu hiệu công việc (chào hỏi, cảm ơn, hỏi vu vơ).
 */
/**
 * Vì sao mục này được/không được gợi ý — dùng khi cần soi lại bộ chấm điểm (đã có lần xếp sai mà
 * nhìn kết quả không đoán được nguyên nhân).
 */
export function explainSuggestions({ message = "", lang = "vi", limit = 6 } = {}) {
  const raw = String(message ?? "").trim();
  const messageTokens = tokens(raw);
  const skills = listHubSkills({ userId: null, lang }).filter((skill) => skill.state === "published");
  const df = buildDocumentFrequency(skills);
  return skills
    .map((skill) => ({ slug: skill.slug, name: skill.name, category: skill.category, ...scoreSkill(skill, messageTokens, raw, df) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function suggestHubSkills({ message = "", userId = null, lang = "vi", limit = 3 } = {}) {
  const raw = String(message ?? "").trim();
  if (raw.length < 12) return [];
  const normalized = strip(raw);
  const hasCue = TASK_CUES.some((cue) => normalized.includes(strip(cue)));
  const messageTokens = tokens(raw);
  if (!hasCue && messageTokens.length < 6) return [];

  const skills = listHubSkills({ userId, lang }).filter((skill) => skill.state === "published");
  const df = buildDocumentFrequency(skills);
  const scored = skills
    .map((skill) => ({ skill, ...scoreSkill(skill, messageTokens, raw, df) }))
    // Xếp theo BẬC trước, điểm sau: khớp tên mục > khớp nhóm chủ đề > chỉ trùng từ.
    // Nhờ vậy "soát hợp đồng thuê nhà" chọn được "Soát hợp đồng" (đúng nhóm Văn phòng) thay vì
    // vài chuyên gia tài chính chỉ vì mô tả của họ có chữ "hợp đồng"/"nhà".
    .map((row) => ({ ...row, tier: row.nameHit ? 3 : row.hintMatched ? 2 : 1 }))
    .filter((row) => (row.tier >= 2 ? row.score >= 6 : row.score >= 12 && row.strongHits >= 2))
    .sort((a, b) => b.tier - a.tier || b.score - a.score)
    .slice(0, limit);

  return scored.map((row) => ({
    id: row.skill.id,
    slug: row.skill.slug,
    name: row.skill.name,
    kind: row.skill.kind,
    category: row.skill.category,
    why: row.hits.length ? row.hits.join(", ") : row.skill.category,
  }));
}

/**
 * Khối gợi ý ghép vào system prompt. Kèm luôn cách nói để trợ lý không biến câu trả lời thành
 * một danh sách quảng cáo: tối đa 1–2 mục, nói ngắn, và nêu rõ cách bật.
 */
export function buildSkillSuggestionBlock({ message = "", userId = null, lang = "vi" } = {}) {
  const suggestions = suggestHubSkills({ message, userId, lang });
  if (!suggestions.length) return "";
  const lines = [
    "GỢI Ý KỸ NĂNG/CHUYÊN GIA CÓ SẴN CHO CÂU HỎI NÀY (chợ kỹ năng của fBuddy):",
    ...suggestions.map(
      (item) => `   – ${item.name} (${item.kind === "expert" ? "chuyên gia" : "kỹ năng"}, nhóm ${item.category}) — hợp vì khớp: ${item.why}`,
    ),
    "CÁCH DÙNG KHỐI NÀY:",
    "• BẮT BUỘC: cuối câu trả lời PHẢI có MỘT câu gợi ý nêu tên mục hợp nhất ở trên (kèm mục đó giúp gì",
    "  và cách bật: \"bạn vào Chợ kỹ năng chọn … rồi bấm dùng\"). Không được bỏ qua khối này — người dùng",
    "  không biết chợ có sẵn thứ phù hợp nếu bạn không nói.",
    "• Vẫn trả lời trọn vẹn điều người dùng hỏi TRƯỚC, rồi mới tới câu gợi ý.",
    "• Tối đa 2 mục, đừng liệt kê cả danh sách, đừng lặp lại ở các lượt sau nếu người dùng đã từ chối.",
    "• Nếu người dùng đang dùng đúng kỹ năng đó rồi thì đừng gợi ý lại.",
    "• Câu hỏi không liên quan (chào hỏi, cảm ơn, hỏi cho biết) thì bỏ qua khối này, tuyệt đối không gợi ý.",
  ];
  return lines.join("\n");
}
