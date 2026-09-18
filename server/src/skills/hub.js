import { all, db, getAppSettings, getById, insert, one, remove, update } from "../db.js";
import { ApiError, badRequest, notFound, slugify } from "../util.js";
import { getBalance, spendCredits } from "../credits.js";
import { READY_SKILL_IDS, SKILL_CATALOG } from "./index.js";
import { listInstalledSkillIds, setInstalledSkills, MAX_SELECTABLE_SKILLS } from "./installed.js";

/**
 * Skill Hub — the marketplace where users buy extra skills with credits.
 *
 * A hub skill is a *prompt pack*: a name, an icon, a price and the instructions
 * the agent follows when that skill is selected. That makes new paid skills
 * possible without shipping server code, and it composes with everything else:
 * the built-in toolset is still available, so a bought skill can still create
 * PPTX/XLSX files, analyse data or edit images.
 */

export const HUB_CATEGORIES = ["Chuyên gia", "Bán hàng", "Văn phòng", "Dữ liệu", "Nội dung", "Giáo dục", "Khác"];

/**
 * Selling price of a skill, in VND. **This is the stored, authoritative price** —
 * the owner prices skills in money, separately from the price of a credit, so
 * changing `vndPerCredit` never silently re-prices the shop.
 */
export function skillPriceVnd(row) {
  if (!row) return 0;
  return Math.max(0, Math.trunc(Number(row.price_vnd ?? 0) || 0));
}

/** Credits a user is charged for that price, at the current credit price. */
export function creditsForPriceVnd(priceVnd, vndPerCredit = creditPrice()) {
  const vnd = Math.max(0, Number(priceVnd) || 0);
  if (!vnd) return 0;
  const perCredit = Math.max(0, Number(vndPerCredit) || 0);
  if (!perCredit) return 0;
  // Never round down to free: a paid skill always costs at least one credit.
  return Math.max(1, Math.ceil(vnd / perCredit));
}

function creditPrice() {
  return Math.max(0, Number(getAppSettings().vndPerCredit) || 0);
}

/** Ngôn ngữ chợ kỹ năng hỗ trợ (bản gốc trong cột thường là tiếng Việt). */
export const HUB_LANGS = ["vi", "en", "zh"];

/**
 * Bảng dịch của một hàng `hub_skills`.
 *
 * LƯU Ý: `db.js` bỏ hậu tố `_json` khi đọc và giải mã luôn — cột `i18n_json` trở thành
 * `row.i18n` (giống `tools_json` → `tools`). Nhưng khi GHI thì vẫn dùng tên có `_json`.
 * Đọc cả hai tên để không phụ thuộc chiều nào.
 */
function i18nTable(row) {
  const raw = row?.i18n ?? row?.i18n_json;
  if (!raw) return {};
  if (typeof raw === "string") {
    try { return JSON.parse(raw) ?? {}; } catch { return {}; }
  }
  return typeof raw === "object" ? raw : {};
}

/** Hàng đã đè bản dịch của `lang` lên bản gốc — dùng cho MỌI chỗ trả dữ liệu ra ngoài. */
export function localisedSkill(row, lang = "vi") {
  if (!row || !lang || lang === "vi") return row;
  const entry = i18nTable(row)[lang];
  if (!entry || typeof entry !== "object") return row;
  return {
    ...row,
    name: entry.name ?? row.name,
    tagline: entry.tagline ?? row.tagline,
    description: entry.description ?? row.description,
    instructions: entry.instructions ?? row.instructions,
  };
}

/** Các ngôn ngữ đã có bản dịch cho kỹ năng này (không tính bản gốc). */
export function hubSkillLanguages(row) {
  return Object.keys(i18nTable(row)).filter((lang) => HUB_LANGS.includes(lang));
}

/** Chuẩn hoá bản dịch trước khi ghi: chỉ nhận vi/en/zh, cắt theo trần của chợ. */
export function normaliseI18n(input) {
  if (!input || typeof input !== "object") return null;
  const out = {};
  for (const lang of HUB_LANGS) {
    const entry = input[lang];
    if (!entry || typeof entry !== "object") continue;
    const clean = {};
    if (entry.name !== undefined) clean.name = String(entry.name).slice(0, 120);
    if (entry.tagline !== undefined) clean.tagline = String(entry.tagline ?? "").slice(0, 200);
    if (entry.description !== undefined) clean.description = String(entry.description ?? "").slice(0, 2000);
    if (entry.instructions !== undefined) clean.instructions = String(entry.instructions ?? "").slice(0, 6000);
    if (Object.keys(clean).length) out[lang] = clean;
  }
  return Object.keys(out).length ? out : null;
}

function rowToSkill(
  row,
  { userId = null, owned = new Set(), installed = new Set(), withContent = false, lang = "vi" } = {},
) {
  if (!row) return null;
  // Đè bản dịch NGAY tại đây để mọi trường phía dưới (kể cả `instructions`) tự đúng ngôn ngữ.
  row = localisedSkill(row, lang);
  const priceVnd = skillPriceVnd(row);
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline ?? "",
    description: row.description ?? "",
    category: row.category,
    icon: row.icon,
    /** Money price — what the shop shows and what the buyer pays. */
    priceVnd,
    /** Same price expressed in credits at today's credit price (derived, not stored). */
    price: creditsForPriceVnd(priceVnd),
    state: row.state,
    /** Ngôn ngữ đã có bản dịch (ngoài bản gốc tiếng Việt). */
    languages: hubSkillLanguages(row),
    installs: Number(row.installs ?? 0),
    sortOrder: Number(row.sort_order ?? 0),
    owned: owned.has(row.id),
    installed: installed.has(row.id),
    createdAt: row.created_at,
    // The prompt pack is admin-only: `withContent` is set by the admin routes so
    // the edit form can prefill instructions/tools. Never on public listings.
    ...(withContent ? { instructions: row.instructions ?? "", tools: row.tools ?? [] } : {}),
  };
}

/** Internal fields the agent needs (never sent to the browser as-is). */
export function hubSkillRuntime(row, lang = "vi") {
  if (!row) return null;
  row = localisedSkill(row, lang);
  const priceVnd = skillPriceVnd(row);
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    priceVnd,
    price: creditsForPriceVnd(priceVnd),
    instructions: row.instructions ?? "",
    tools: row.tools ?? [],
    state: row.state,
  };
}

export function listHubSkills({ userId = null, includeHidden = false, withContent = false, lang = "vi" } = {}) {
  const where = includeHidden ? "" : "state != 'hidden'";
  const rows = all("hub_skills", where, [], { order: "sort_order ASC, created_at ASC" });
  const owned = new Set(ownedHubSkillIds(userId));
  const installed = new Set(userId ? listInstalledSkillIds(userId) : []);
  return rows.map((row) => rowToSkill(row, { userId, owned, installed, withContent, lang }));
}

export function getHubSkillRow(idOrSlug) {
  if (!idOrSlug) return null;
  return getById("hub_skills", idOrSlug) ?? one("hub_skills", "slug = ?", [String(idOrSlug)]);
}

export function getHubSkill(idOrSlug, options = {}) {
  const row = getHubSkillRow(idOrSlug);
  if (!row) return null;
  const owned = new Set(ownedHubSkillIds(options.userId));
  const installed = new Set(options.userId ? listInstalledSkillIds(options.userId) : []);
  return rowToSkill(row, {
    userId: options.userId,
    owned,
    installed,
    withContent: Boolean(options.withContent),
    lang: options.lang ?? "vi",
  });
}

export function ownedHubSkillIds(userId) {
  if (!userId) return [];
  return all("hub_purchases", "user_id = ?", [userId]).map((row) => row.hub_skill_id);
}

export function hasPurchased(userId, hubSkillId) {
  if (!userId) return false;
  return Boolean(one("hub_purchases", "user_id = ? AND hub_skill_id = ?", [userId, hubSkillId]));
}

/**
 * Buys a skill: charges credits, records the purchase and installs it in the
 * user's quick list when there is room. Free skills are "bought" for 0 so the
 * ownership record stays uniform.
 */
export function purchaseHubSkill({ user, idOrSlug }) {
  const row = getHubSkillRow(idOrSlug);
  if (!row) throw notFound("Không tìm thấy kỹ năng này");
  if (row.state === "coming_soon") throw badRequest(`"${row.name}" chưa mở bán — sẽ có trong bản cập nhật tới.`);
  if (row.state === "hidden") throw notFound("Không tìm thấy kỹ năng này");

  const alreadyOwned = hasPurchased(user.id, row.id);
  const priceVnd = skillPriceVnd(row);
  const price = creditsForPriceVnd(priceVnd);
  let balance = getBalance(user.id);

  if (!alreadyOwned) {
    if (price > 0) {
      if (user.role !== "admin" && balance < price) {
        // ApiError (không phải Error thường): handler ở index.js chỉ trả nguyên văn
        // `message` cho ApiError, còn Error thường bị bóp thành "Lỗi hệ thống, vui lòng
        // thử lại" — người mua chỉ thấy lỗi chung chung dù server biết thiếu đúng bao nhiêu.
        // `buyUrl` để giao diện mời nạp ngay tại chỗ.
        throw new ApiError(
          402,
          "insufficient_credits",
          `Cần ${price.toLocaleString("vi-VN")} credit (${priceVnd.toLocaleString("vi-VN")}đ) để mua "${row.name}", ` +
            `số dư hiện tại là ${balance.toLocaleString("vi-VN")} credit. Nạp thêm để mua ngay.`,
          { price, priceVnd, balance, buyUrl: String(getAppSettings().creditBuyUrl ?? "") || null },
        );
      }
      balance = spendCredits({
        userId: user.id,
        amount: price,
        ref: row.id,
        note: `Mua kỹ năng ${row.name} (${priceVnd.toLocaleString("vi-VN")}đ)`,
        reason: "skill_purchase",
      });
    }
    insert("hub_purchases", { user_id: user.id, hub_skill_id: row.id, price_paid: price });
    update("hub_skills", row.id, { installs: Number(row.installs ?? 0) + 1 });
  }

  // Install into the quick list (best effort: the list may already be full).
  let installedNow = false;
  const installed = listInstalledSkillIds(user.id);
  if (!installed.includes(row.id) && installed.length < MAX_SELECTABLE_SKILLS) {
    setInstalledSkills(user.id, [...installed, row.id], { role: user.role });
    installedNow = true;
  }

  return {
    skill: getHubSkill(row.id, { userId: user.id }),
    balance,
    alreadyOwned,
    installed: installedNow,
    pricePaid: alreadyOwned ? 0 : price,
    pricePaidVnd: alreadyOwned ? 0 : priceVnd,
  };
}

// ------------------------------------------------------------------- admin

/**
 * Resolves the money price of a write. `priceVnd` wins; the legacy `price`
 * (credits) is still accepted so older callers and the import script keep
 * working, and is converted at today's credit price.
 */
function resolvePriceVnd(input, fallbackVnd = 0) {
  if (input?.priceVnd !== undefined) return Math.max(0, Math.trunc(Number(input.priceVnd) || 0));
  if (input?.price !== undefined) {
    const credits = Math.max(0, Math.trunc(Number(input.price) || 0));
    return credits * creditPrice();
  }
  return fallbackVnd;
}

export function createHubSkill(input) {
  const name = String(input?.name ?? "").trim();
  if (!name) throw badRequest("Thiếu tên kỹ năng");
  const slug = slugify(input?.slug || name, "skill");
  if (one("hub_skills", "slug = ?", [slug])) throw badRequest(`Slug "${slug}" đã tồn tại`);
  const priceVnd = resolvePriceVnd(input);
  const row = insert("hub_skills", {
    slug,
    name,
    tagline: String(input?.tagline ?? "").slice(0, 200) || null,
    description: String(input?.description ?? "").slice(0, 2000) || null,
    category: HUB_CATEGORIES.includes(input?.category) ? input.category : "Khác",
    icon: String(input?.icon ?? "sparkles").slice(0, 40),
    price_vnd: priceVnd,
    price: creditsForPriceVnd(priceVnd),
    instructions: String(input?.instructions ?? "").slice(0, 6000) || null,
    tools_json: Array.isArray(input?.tools) ? input.tools.map(String) : [],
    i18n_json: normaliseI18n(input?.i18n),
    state: ["published", "coming_soon", "hidden"].includes(input?.state) ? input.state : "published",
    sort_order: Number(input?.sortOrder) || 0,
  });
  return rowToSkill(row, { withContent: true });
}

export function updateHubSkill(id, patch) {
  const existing = getById("hub_skills", id);
  if (!existing) throw notFound("Không tìm thấy kỹ năng");
  const changes = {};
  if (patch.name !== undefined) changes.name = String(patch.name).trim() || existing.name;
  if (patch.tagline !== undefined) changes.tagline = String(patch.tagline ?? "").slice(0, 200) || null;
  if (patch.description !== undefined) changes.description = String(patch.description ?? "").slice(0, 2000) || null;
  if (patch.category !== undefined && HUB_CATEGORIES.includes(patch.category)) changes.category = patch.category;
  if (patch.icon !== undefined) changes.icon = String(patch.icon ?? "sparkles").slice(0, 40);
  if (patch.priceVnd !== undefined || patch.price !== undefined) {
    const priceVnd = resolvePriceVnd(patch, skillPriceVnd(existing));
    changes.price_vnd = priceVnd;
    // Kept as a credits cache for the raw table; readers derive it from price_vnd.
    changes.price = creditsForPriceVnd(priceVnd);
  }
  if (patch.instructions !== undefined) changes.instructions = String(patch.instructions ?? "").slice(0, 6000) || null;
  if (patch.tools !== undefined) changes.tools_json = Array.isArray(patch.tools) ? patch.tools.map(String) : [];
  // Bản dịch: gửi `i18n` (object) để đặt/ghi đè; gửi `i18n: null` để xoá hết bản dịch.
  if (patch.i18n !== undefined) changes.i18n_json = normaliseI18n(patch.i18n);
  if (patch.state !== undefined && ["published", "coming_soon", "hidden"].includes(patch.state)) {
    changes.state = patch.state;
  }
  // Manual correction of the public "installs" counter (test data, migrations).
  if (patch.installs !== undefined) changes.installs = Math.max(0, Math.trunc(Number(patch.installs) || 0));
  if (patch.sortOrder !== undefined) changes.sort_order = Number(patch.sortOrder) || 0;
  return rowToSkill(update("hub_skills", id, changes), { withContent: true });
}

export function deleteHubSkill(id) {
  const existing = getById("hub_skills", id);
  if (!existing) throw notFound("Không tìm thấy kỹ năng");
  db.prepare("DELETE FROM hub_purchases WHERE hub_skill_id = ?").run(id);
  remove("hub_skills", id);
  return { ok: true };
}

// ------------------------------------------------------- agent integration

/**
 * What the agent should know when a conversation uses this skill id.
 * Returns null for built-in ids (they have their own instructions) and for hub
 * skills the user has not bought yet.
 */
/** Ngôn ngữ người dùng đã chọn (cột `users.locale`), mặc định tiếng Việt. */
export function userLocale(userId) {
  if (!userId) return "vi";
  const row = getById("users", userId);
  const lang = String(row?.locale ?? "").trim().toLowerCase();
  return HUB_LANGS.includes(lang) ? lang : "vi";
}

export function hubSkillForUser({ skillId, userId, role = "user", lang = null }) {
  const row = getHubSkillRow(skillId);
  if (!row || row.state !== "published") return null;
  const owned = skillPriceVnd(row) === 0 || role === "admin" || hasPurchased(userId, row.id);
  if (!owned) return null;
  return hubSkillRuntime(row, lang ?? userLocale(userId));
}

/** A skill id is selectable when it is built in, or a published free/owned hub skill. */
export function isSelectableSkill({ skillId, userId, role = "user" }) {
  if (skillId === "auto") return true;
  if (READY_SKILL_IDS.includes(String(skillId))) return true;
  return Boolean(hubSkillForUser({ skillId, userId, role }));
}

// -------------------------------------------------------------------- seed

const SEED = [
  {
    slug: "content-sales",
    name: "Viết content bán hàng",
    tagline: "Bài bán hàng theo công thức AIDA, có hook và CTA",
    description:
      "Nhận sản phẩm + khách hàng mục tiêu, trả về bài bán hàng hoàn chỉnh: hook 2 giây, nỗi đau, lợi ích, bằng chứng, xử lý từ chối và lời kêu gọi hành động. Kèm 3 biến thể tiêu đề để A/B test.",
    category: "Bán hàng",
    icon: "megaphone",
    priceVnd: 50000,
    instructions:
      "Bạn viết content bán hàng theo công thức AIDA. Luôn trả về: (1) Hook 1 câu gây tò mò, (2) Nỗi đau của khách, " +
      "(3) 3 lợi ích cụ thể kèm con số nếu có, (4) Bằng chứng/chứng thực, (5) Xử lý 2 lời từ chối thường gặp, (6) CTA rõ ràng. " +
      "Cuối cùng đưa 3 phương án tiêu đề khác nhau. Giọng văn tự nhiên, tránh sáo rỗng, không dùng từ ngữ đao to búa lớn.",
  },
  {
    slug: "meeting-notes",
    name: "Tóm tắt cuộc họp",
    tagline: "Biên bản họp có quyết định, việc cần làm và người phụ trách",
    description:
      "Đưa file ghi âm đã chuyển thành văn bản (hoặc ghi chú thô), nhận về biên bản gọn: quyết định đã chốt, việc cần làm kèm người phụ trách và hạn, điểm còn tranh luận, rủi ro.",
    category: "Văn phòng",
    icon: "clipboard",
    priceVnd: 50000,
    instructions:
      "Bạn tạo biên bản họp. Đọc nội dung/đính kèm rồi trả về 4 phần: **Quyết định đã chốt**, **Việc cần làm** (bảng: việc | người phụ trách | hạn), " +
      "**Điểm còn tranh luận**, **Rủi ro & lưu ý**. Nếu thiếu người phụ trách hoặc hạn thì ghi rõ 'chưa xác định' — không tự bịa. " +
      "Cuối cùng hỏi người dùng có muốn xuất Excel hoặc PowerPoint không.",
  },
  {
    slug: "doc-translate",
    name: "Dịch tài liệu chuyên ngành",
    tagline: "Dịch giữ định dạng, kèm bảng thuật ngữ",
    description:
      "Dịch tài liệu dài sang ngôn ngữ đích nhưng giữ nguyên cấu trúc, tiêu đề và bảng biểu; trích ra bảng thuật ngữ để dùng lại cho các lần sau.",
    category: "Nội dung",
    icon: "translate",
    priceVnd: 50000,
    instructions:
      "Bạn dịch tài liệu chuyên ngành. Nguyên tắc: giữ nguyên cấu trúc, tiêu đề, bảng biểu và định dạng markdown; " +
      "tên riêng/số liệu/mã sản phẩm giữ nguyên; thuật ngữ chuyên ngành chọn bản dịch phổ biến trong ngành và dùng nhất quán. " +
      "Sau bản dịch, gọi công cụ generate_xlsx để xuất **bảng thuật ngữ** (gốc | dịch | ghi chú) khi tài liệu có từ 10 thuật ngữ trở lên. " +
      "Nếu đoạn nào chưa chắc nghĩa, dịch và đánh dấu [cần kiểm tra] thay vì đoán bừa.",
  },
  {
    slug: "contract-review",
    name: "Soát hợp đồng",
    tagline: "Chỉ ra điều khoản rủi ro và đề xuất câu sửa",
    description:
      "Đọc hợp đồng (PDF/DOCX/ảnh) và trả về bảng rủi ro: điều khoản, mức độ rủi ro, vì sao rủi ro, câu sửa đề xuất. Kèm danh sách thông tin còn thiếu cần bổ sung.",
    category: "Văn phòng",
    icon: "scale",
    priceVnd: 50000,
    instructions:
      "Bạn soát hợp đồng ở góc nhìn bảo vệ người dùng (không thay thế luật sư). Trả về bảng: **Điều khoản | Mức độ (Cao/TB/Thấp) | Rủi ro | Đề xuất sửa**. " +
      "Tập trung vào: thanh toán & phạt, chấm dứt & hoàn tiền, phạm vi trách nhiệm, bảo mật dữ liệu, sở hữu trí tuệ, thay đổi đơn phương, luật áp dụng. " +
      "Cuối cùng liệt kê thông tin còn thiếu cần bổ sung trước khi ký. Luôn nhắc người dùng nên để luật sư xác nhận trước khi ký.",
  },
  {
    slug: "lesson-plan",
    name: "Soạn bài giảng",
    tagline: "Slide bài giảng + mục tiêu + hoạt động lớp học",
    description:
      "Nhập chủ đề và thời lượng, nhận về bài giảng hoàn chỉnh: mục tiêu học tập, dàn slide chi tiết, hoạt động tương tác và bài kiểm tra nhanh cuối giờ.",
    category: "Giáo dục",
    icon: "graduation",
    priceVnd: 50000,
    instructions:
      "Bạn soạn bài giảng cho người dạy. Trả về: mục tiêu học tập (đo lường được), dàn bài theo từng phần kèm thời lượng, " +
      "2 hoạt động tương tác cho học viên, 5 câu hỏi kiểm tra nhanh và 1 bài tập về nhà. " +
      "Sau đó gọi công cụ generate_pptx tạo slide bài giảng (mỗi phần 1 slide, gạch đầu dòng ngắn, thêm ghi chú cho người dạy).",
  },
  {
    slug: "data-story",
    name: "Kể chuyện bằng dữ liệu",
    tagline: "Phân tích + biểu đồ + thông điệp cho người ra quyết định",
    description:
      "Đưa file dữ liệu, nhận về câu chuyện số liệu: 3 phát hiện quan trọng nhất, biểu đồ minh hoạ, điều cần hành động ngay và phần cảnh báo chất lượng dữ liệu.",
    category: "Dữ liệu",
    icon: "chart",
    priceVnd: 50000,
    instructions:
      "Bạn biến dữ liệu thành câu chuyện cho người ra quyết định. Quy trình: gọi analyze_data để có số liệu thật (không bịa số), " +
      "rồi trình bày **Tóm tắt trong 1 câu**, **3 phát hiện quan trọng** (mỗi phát hiện kèm số liệu), **biểu đồ** phù hợp, " +
      "**3 hành động đề xuất**, và **lưu ý về chất lượng dữ liệu** (thiếu, lệch, ngoại lai). Nêu rõ giả định nếu có.",
  },
  {
    slug: "brand-voice",
    name: "Giọng thương hiệu riêng",
    tagline: "Skill riêng của công ty: dạy fBuddy nói đúng giọng của anh",
    description:
      "Đang hoàn thiện: anh mô tả giọng thương hiệu (từ nên dùng, từ cấm, cách xưng hô, ví dụ câu mẫu) và fBuddy sẽ viết mọi nội dung theo đúng giọng đó.",
    category: "Nội dung",
    icon: "sparkles",
    priceVnd: 0,
    state: "coming_soon",
    instructions: null,
  },
];

/** Inserts the default catalogue once (idempotent by slug). */
export function ensureHubSeed() {
  let created = 0;
  for (const [index, entry] of SEED.entries()) {
    if (one("hub_skills", "slug = ?", [entry.slug])) continue;
    const priceVnd = Math.max(0, Math.trunc(Number(entry.priceVnd ?? 0) || 0));
    insert("hub_skills", {
      slug: entry.slug,
      name: entry.name,
      tagline: entry.tagline,
      description: entry.description,
      category: entry.category,
      icon: entry.icon,
      price_vnd: priceVnd,
      price: creditsForPriceVnd(priceVnd),
      instructions: entry.instructions,
      tools_json: entry.tools ?? [],
      state: entry.state ?? "published",
      sort_order: (index + 1) * 10,
    });
    created += 1;
  }
  return created;
}

/** The five built-ins are free and always owned — the hub shows them as included. */
export function builtinCatalogEntries() {
  return SKILL_CATALOG.filter((skill) => skill.state === "ready");
}
