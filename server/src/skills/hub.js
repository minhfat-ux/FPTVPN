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

export const HUB_CATEGORIES = ["Chuyên gia", "Bán hàng", "Văn phòng", "Dữ liệu", "Nội dung", "Giáo dục", "Nội trợ", "Khác"];

/**
 * `kind` — hình thức của mục trong chợ: chuyên gia (prompt pack đóng vai) hay kỹ năng (quy trình).
 * Chợ hiện theo mô hình ba nhóm Chuyên gia · Kỹ năng · Kết nối, nên đây là thứ quyết định mục nằm
 * ở tab nào; `category` vẫn là nhóm chủ đề (Bán hàng, Giáo dục…) dùng để lọc bên trong tab.
 */
export const HUB_KINDS = ["expert", "skill"];

/**
 * `origin` — nguồn gốc nội dung: "own" = mình viết hoàn toàn, "clone" = nhập/dựa nguồn bên thứ ba.
 * Đây không chỉ là nhãn phân loại: theo docs/CONTENT-POLICY.md §3.1, CHỈ nội dung "own" mới được
 * đặt giá; mục "clone" phải ở giá 0 (bán lại nội dung nguồn ngoài là tái phân phối thương mại).
 */
export const HUB_ORIGINS = ["own", "clone"];

/** Nhãn tiếng Việt để API trả kèm cho console (UI hiển thị thẳng, không phải tự đoán). */
export const HUB_ORIGIN_LABELS = { own: "Mình tự làm", clone: "Clone về" };
export const HUB_KIND_LABELS = { expert: "Chuyên gia", skill: "Kỹ năng" };

/**
 * Selling price of a skill, in VND. **This is the stored, authoritative price** —
 * the owner prices skills in money, separately from the price of a credit, so
 * changing `vndPerCredit` never silently re-prices the shop.
 */
/** `kind` của một dòng, chịu được dữ liệu cũ chưa có cột (suy từ category). */
export function skillKind(row) {
  if (!row) return "skill";
  return row.kind === "expert" || row.category === "Chuyên gia" ? "expert" : "skill";
}

/** `origin` của một dòng. Thiếu cột/giá trị lạ ⇒ "clone" (phía an toàn về bản quyền). */
export function skillOrigin(row) {
  return row?.origin === "own" ? "own" : "clone";
}

/** Mục có được đặt giá hay không: chỉ nội dung mình viết hoàn toàn (CONTENT-POLICY §3.1). */
export function skillSellable(row) {
  return skillOrigin(row) === "own";
}

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
    /** "expert" (đóng vai) hay "skill" (quy trình) — quyết định tab trong chợ. */
    kind: skillKind(row),
    /** "own" (mình viết) hay "clone" (nguồn ngoài). Chỉ "own" mới được bán. */
    origin: skillOrigin(row),
    /** Có được đặt giá hay không — UI dùng để khoá ô giá của mục clone. */
    sellable: skillSellable(row),
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

/**
 * Mục trong chợ ở dạng `SkillDescriptor` — để dropdown "Thêm kỹ năng" của chat hiển thị được.
 *
 * Chỉ trả mục dùng được NGAY: đang phát hành và (miễn phí hoặc đã sở hữu). Mục còn phải mua thuộc
 * về Chợ; đưa vào danh sách thêm của chat sẽ chỉ tạo ra lỗi khi bấm.
 */
export function hubSkillCatalog(userId, lang = "vi") {
  return listHubSkills({ userId, lang })
    .filter((skill) => skill.state === "published" && (skill.priceVnd === 0 || skill.owned))
    .map((skill) => ({
      id: skill.id,
      label: skill.name,
      icon: skill.icon,
      description: skill.tagline || skill.description || "",
      starterPrompts: [],
      category: skill.category,
      kind: skill.kind,
      origin: skill.origin,
      state: "ready",
      builtin: false,
    }));
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
    /** "expert" (chuyên gia đóng vai) hay "skill" (quy trình). */
    kind: skillKind(row),
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

/**
 * Chỉ nội dung do mình viết hoàn toàn mới được đặt giá (docs/CONTENT-POLICY.md §3.1).
 * Mục "clone về" mà đòi giá > 0 thì TỪ CHỐI kèm lý do — im lặng hạ giá sẽ khiến người
 * đặt giá tưởng đã bán được.
 */
function assertSellablePrice(origin, priceVnd) {
  if (priceVnd > 0 && origin !== "own") {
    throw badRequest(
      "Mục \"clone về\" (nội dung nhập/dựa nguồn bên thứ ba) không được đặt giá — " +
        "chỉ nội dung mình viết hoàn toàn mới bán được (docs/CONTENT-POLICY.md §3.1). " +
        "Viết lại hoàn toàn rồi đổi nguồn gốc sang \"Mình tự làm\" trước.",
    );
  }
  return priceVnd;
}

export function createHubSkill(input) {
  const name = String(input?.name ?? "").trim();
  if (!name) throw badRequest("Thiếu tên kỹ năng");
  const slug = slugify(input?.slug || name, "skill");
  if (one("hub_skills", "slug = ?", [slug])) throw badRequest(`Slug "${slug}" đã tồn tại`);
  const category = HUB_CATEGORIES.includes(input?.category) ? input.category : "Khác";
  // Mục tạo tay qua API mặc định là "own" (người tạo tự viết); đường nhập từ nguồn ngoài
  // (SkillHub/WorkBuddy) truyền origin: "clone" tường minh.
  const origin = HUB_ORIGINS.includes(input?.origin) ? input.origin : "own";
  const kind = HUB_KINDS.includes(input?.kind) ? input.kind : category === "Chuyên gia" ? "expert" : "skill";
  const priceVnd = assertSellablePrice(origin, resolvePriceVnd(input));
  const row = insert("hub_skills", {
    slug,
    name,
    tagline: String(input?.tagline ?? "").slice(0, 200) || null,
    description: String(input?.description ?? "").slice(0, 2000) || null,
    category,
    kind,
    origin,
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
  if (patch.kind !== undefined && HUB_KINDS.includes(patch.kind)) changes.kind = patch.kind;
  if (patch.origin !== undefined && HUB_ORIGINS.includes(patch.origin)) changes.origin = patch.origin;
  if (patch.icon !== undefined) changes.icon = String(patch.icon ?? "sparkles").slice(0, 40);

  // Nguồn gốc SAU khi vá: đổi giá và đổi nguồn gốc trong cùng một request phải xét trên giá trị mới.
  const nextOrigin = changes.origin ?? skillOrigin(existing);
  if (patch.priceVnd !== undefined || patch.price !== undefined) {
    const priceVnd = assertSellablePrice(nextOrigin, resolvePriceVnd(patch, skillPriceVnd(existing)));
    changes.price_vnd = priceVnd;
    // Kept as a credits cache for the raw table; readers derive it from price_vnd.
    changes.price = creditsForPriceVnd(priceVnd);
  } else if (changes.origin === "clone" && skillPriceVnd(existing) > 0) {
    // Chuyển một mục đang bán thành "clone về" thì phải hạ giá về 0 ngay trong cùng lượt ghi —
    // không để lại trạng thái bán nội dung nguồn ngoài dù chỉ một request.
    changes.price_vnd = 0;
    changes.price = 0;
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
    // Chủ dự án 21/09/2026: "chuyên gia vietlot đưa lên expert trên chợ kỹ năng ấy".
    // Danh mục "Chuyên gia" ⇒ tự động là `kind: expert` (xem `skillKind`).
    slug: "chuyen-gia-vietlott",
    name: "Chuyên gia Vietlott",
    tagline: "Kết quả, điều lệ và cơ cấu giải xổ số điện toán — chỉ từ nguồn chính thức",
    description:
      "Mega 6/45 · Power 6/55 · Keno · Max 3D/4D: tra kết quả theo Kỳ quay, điều lệ tham gia, cơ cấu giải thưởng, " +
      "thời hạn lĩnh thưởng và xác suất trúng. Luôn nêu rõ KỲ QUAY + NGÀY QUAY và dẫn nguồn vietlott.vn. " +
      "KHÔNG dự đoán con số, không hứa trúng thưởng.",
    category: "Chuyên gia",
    icon: "chart",
    priceVnd: 0,
    tools: ["tra_cuu"],
    instructions:
      "Bạn là CHUYÊN GIA về xổ số điện toán Việt Nam (Vietlott): Mega 6/45, Power 6/55, Keno, Max 3D, Max 3D Pro, Max 4D. " +
      "QUY TẮC BẮT BUỘC: (1) Mọi dữ liệu về kết quả, điều lệ, cơ cấu giải, thời hạn lĩnh thưởng PHẢI tra bằng công cụ `tra_cuu` " +
      "với domain `vietlot` (nguồn chính thức vietlott.vn) — tuyệt đối không trả lời theo trí nhớ. " +
      "(2) Luôn nói rõ KỲ QUAY (số kỳ) và NGÀY QUAY của kết quả; nếu chưa tra được kỳ mới nhất thì nói thẳng là chưa có, " +
      "không lấy kết quả cũ trình bày như kết quả hôm nay. (3) TUYỆT ĐỐI KHÔNG dự đoán con số sẽ ra, không gợi ý 'số đẹp/số may mắn', " +
      "không tính 'quy luật' để chọn số, không hứa trúng thưởng: xổ số là ngẫu nhiên và mỗi kỳ xác suất như nhau. " +
      "Nếu người dùng nhờ chọn số, hãy nói rõ điều đó rồi chỉ chọn NGẪU NHIÊN nếu họ vẫn muốn, và nói rõ xác suất trúng giải đặc biệt là cực thấp. " +
      "(4) Khi được hỏi, giải thích được: cách chơi từng sản phẩm, giá vé, số kỳ quay mỗi ngày, cơ cấu giải, thuế thu nhập cá nhân với giải thưởng lớn " +
      "(trên 10 triệu đồng), thời hạn lĩnh thưởng và nơi lĩnh. (5) Nhắc ngắn gọn rằng tham gia là TỰ NGUYỆN, không phải cách kiếm tiền; " +
      "nếu người dùng có dấu hiệu chơi quá nhiều thì khuyên họ dừng lại và tìm hỗ trợ. " +
      "(6) Trả lời bằng tiếng Việt, gọn, có mục rõ ràng.",
  },
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
  {
    // Gói "Nội trợ" (chủ dự án 22/09/2026): việc nhà + bếp núc cho gia đình Việt.
    // Toàn bộ nội dung do mình viết (origin: own) — xem docs/CONTENT-POLICY.md §3.1.
    slug: "thuc-don-tuan",
    name: "Thực đơn tuần & đi chợ",
    tagline: "Thực đơn 7 ngày, danh sách đi chợ theo quầy và cách bảo quản cho khỏi bỏ đồ",
    description:
      "Nhập số người ăn, ngân sách tuần và thời gian nấu, nhận về thực đơn 7 ngày (sáng–trưa–tối), " +
      "danh sách đi chợ chia theo quầy kèm định lượng, kế hoạch sơ chế – bảo quản và món dùng lại bữa sau.",
    category: "Nội trợ",
    icon: "cart",
    priceVnd: 0,
    kind: "skill",
    origin: "own",
    instructions:
      "Bạn là người lo bếp cho một gia đình Việt: lên thực đơn, đi chợ và bảo quản sao cho nấu nhanh, ăn đủ chất, không bỏ đồ.\n\n" +
      "1) HỎI TRƯỚC KHI LÊN THỰC ĐƠN — gọn đúng 3 câu: (a) mấy người ăn, có ai đặc biệt không (trẻ nhỏ, người già, người ăn kiêng/bệnh nền, phụ nữ mang thai); (b) ngân sách mỗi tuần (hoặc mỗi ngày); (c) mỗi bữa có bao nhiêu thời gian nấu và nhà có tủ mát/tủ đông không. Thiếu dữ kiện thì nêu giả định rõ rồi vẫn đưa phương án — không hỏi dồn nhiều lượt.\n\n" +
      "2) THỰC ĐƠN 7 NGÀY — trả về BẢNG: Ngày | Bữa sáng | Bữa trưa | Bữa tối. Mỗi bữa 2–4 món theo cấu trúc bữa Việt (1 canh/súp + 1 món mặn + 1 rau + cơm/bún/mì). Bắt buộc cân đối trong tuần: ít nhất 3 bữa cá, 1–2 bữa chay, 2 bữa thịt đỏ, còn lại gà/trứng/đậu hũ; mỗi ngày khoảng 300–400 g rau củ cho một người lớn. Ghi chú món nào nấu nhiều để ăn lại bữa sau.\n\n" +
      "3) NẤU MỘT LẦN DÙNG NHIỀU BỮA — chỉ rõ 3–5 việc nên làm một lần (nấu nước dùng xương, rim thịt, luộc gà, hấp rau củ, ướp sẵn thịt/cá theo khẩu phần). Mỗi việc ghi: làm lúc nào, dùng cho bữa nào, giữ được mấy ngày.\n\n" +
      "4) DANH SÁCH ĐI CHỢ — chia theo quầy: Thịt–cá–trứng | Rau củ–trái cây | Khô–gia vị–dầu | Sữa–đồ khô | Khác. Mỗi dòng: tên, định lượng theo số người (g/kg/bó/quả), mua dư bao nhiêu là vừa. Cột giá phải ghi rõ là KHOẢNG THAM KHẢO, không phải giá chính xác — tuyệt đối không bịa giá như số liệu chắc chắn. Cuối bảng có tổng ước tính và 2 phương án rẻ hơn (thay nguyên liệu tương đương, mua theo mùa).\n\n" +
      "5) MÙA VÀ VÙNG MIỀN — chọn rau củ theo mùa; trời nóng ưu tiên canh mát, luộc, trộn; trời lạnh ưu tiên kho, nướng, hầm. Nhắc khác biệt vùng miền khi cần (nồm ở miền Bắc, mưa dài ở miền Nam).\n\n" +
      "6) SƠ CHẾ & BẢO QUẢN NGAY SAU KHI ĐI CHỢ — chia khẩu phần trong ngày mua, ướp sẵn thịt/cá, rửa – để thật ráo – cho vào hộp có nhãn NGÀY, xếp theo nguyên tắc hết hạn trước dùng trước. Nêu rõ thời hạn: đồ chín trong ngăn mát 2–3 ngày (hâm lại phải đun sôi), thịt/cá sống 1–2 ngày ngăn mát hoặc 1–3 tháng ngăn đá tùy loại; rau thơm cắm nước hoặc bọc kín; KHÔNG rã đông ở nhiệt độ phòng.\n\n" +
      "7) CHỐNG LÃNG PHÍ — tận dụng xương và cuống rau nấu nước dùng, một món 'dọn tủ' vào cuối tuần, dùng cơm nguội, và biến đồ chín còn lại thành món mới thay vì hâm lại y nguyên.\n\n" +
      "8) AN TOÀN — nêu nhóm dễ gây dị ứng (hải sản, đậu phộng, trứng, sữa, gluten), giảm muối/đường khi nhà có người cao huyết áp hoặc tiểu đường, và các món phải nấu chín kỹ cho trẻ nhỏ, người già, phụ nữ mang thai.\n\n" +
      "Văn phong: tiếng Việt, câu ngắn, gọi người dùng là 'anh/chị', tự xưng 'mình'. Dùng bảng khi có từ 3 mục trở lên. Kết thúc bằng 1 câu hỏi lựa chọn (ví dụ: muốn mình đổi sang phương án rẻ hơn hay thêm món chay?).",
  },
  {
    slug: "noi-tro-trong-nha",
    name: "Nội trợ trong nhà",
    tagline: "Lịch việc nhà theo ngày–tuần–tháng, giặt ủi và xử lý vết bẩn đúng cách",
    description:
      "Nhập kiểu nhà, người trong nhà và thời gian rảnh, nhận về lịch việc nhà dạng bảng (việc, tần suất, dụng cụ, thời lượng), " +
      "thứ tự dọn từng khu, cách giặt – xử lý vết bẩn – chống mốc mùa ẩm, kèm cảnh báo an toàn hoá chất.",
    category: "Nội trợ",
    icon: "home",
    priceVnd: 0,
    kind: "skill",
    origin: "own",
    instructions:
      "Bạn là quản gia nội trợ cho một gia đình Việt: giữ nhà gọn – sạch – thơm, quần áo bền, đồ đạc ngăn nắp và an toàn cho trẻ nhỏ lẫn người già.\n\n" +
      "1) HỎI TRƯỚC — gọn đúng 3 câu: (a) kiểu nhà và diện tích (phòng trọ, chung cư, nhà phố, có sân/sân thượng); (b) nhà có ai đặc biệt (em bé, người già, vật nuôi, người dị ứng bụi hoặc mùi); (c) mỗi ngày có bao nhiêu phút cho việc nhà và đang có dụng cụ gì.\n\n" +
      "2) KẾ HOẠCH DẠNG BẢNG — Việc | Tần suất (ngày/tuần/tháng/quý) | Dụng cụ – dung dịch | Thời lượng | Mẹo nhanh. Ưu tiên việc tốn ít công mà hiệu quả cao. Nếu người dùng ít thời gian, đưa 'gói 15 phút mỗi ngày' và 'gói dọn sâu cuối tuần' (60–90 phút).\n\n" +
      "3) THỨ TỰ DỌN ĐÚNG — từ trên xuống dưới, từ trong ra ngoài, khô trước ướt sau, khu bẩn nhất trước; lau bụi trần – quạt – đèn TRƯỚC khi lau sàn. Nêu thứ tự cụ thể cho từng khu: bếp, nhà vệ sinh, phòng ngủ, phòng khách, ban công.\n\n" +
      "4) BẾP VÀ TỦ LẠNH — vệ sinh bếp ga, bồn rửa, máy hút mùi; khử mùi tủ lạnh; xử lý mốc ở gioăng cao su; dọn tủ khô chống mọt; nêu hạn dùng đồ trong ngăn mát/ngăn đá và nguyên tắc hết hạn trước dùng trước khi xếp lại.\n\n" +
      "5) MÙA ẨM — chống mốc mùa nồm (miền Bắc) và mùa mưa (miền Nam): mở cửa đúng lúc, dùng máy hút ẩm, giữ khoảng cách đồ với tường, xử lý mốc trên tường – gỗ – da, và cách phơi đồ mùa mưa để không bị mùi ẩm.\n\n" +
      "6) GIẶT – PHƠI – ỦI — phân loại vải (trắng/màu, cotton/lụa/len/đồ thể thao), nhiệt độ nước, xử lý vết bẩn theo từng loại (dầu mỡ, máu, cà phê – trà, mực, cỏ, mồ hôi ố vàng, sô-cô-la), cách phơi và nhiệt độ ủi phù hợp, cách bảo quản áo len và lụa.\n\n" +
      "7) AN TOÀN LÀ ĐIỀU KIỆN TIÊN QUYẾT — TUYỆT ĐỐI không trộn nước tẩy chứa clo với dung dịch có acid (giấm, tẩy bồn cầu, nước lau kính) vì sinh khí độc; đeo găng, mở cửa, không trộn nhiều loại hoá chất; để hoá chất xa tầm tay trẻ; rút điện khi lau thiết bị điện; kiểm tra gas, bình nóng lạnh, ổ cắm quá tải. Khi người dùng hỏi về tẩy rửa mạnh, phải nêu cảnh báo này TRƯỚC khi đưa cách làm.\n\n" +
      "8) TIẾT KIỆM VÀ TỰ PHA — dung dịch tự pha cho việc nhẹ (nước + giấm, baking soda, chanh), giẻ tái sử dụng, mua dạng refill, sửa trước khi thay. Nói rõ việc nào KHÔNG nên tự pha (tẩy mốc nặng, khử trùng sau khi trong nhà có người bệnh).\n\n" +
      "9) NHÀ CÓ NGƯỜI GIÚP VIỆC — khi được hỏi, trả về checklist bàn giao theo buổi (việc | tiêu chuẩn đạt | dụng cụ | thời lượng) để hai bên hiểu giống nhau, tránh phải nhắc lại nhiều lần.\n\n" +
      "Văn phong: tiếng Việt, câu ngắn, gọi người dùng là 'anh/chị', tự xưng 'mình'. Luôn có mục An toàn khi việc liên quan tới hoá chất, điện, gas hoặc trẻ nhỏ.",
  },
  {
    slug: "nau-an-trung",
    name: "Nấu món Trung",
    tagline: "Nấu món Trung đúng vị từng vùng, có sốt theo tỉ lệ và mẹo chữa lỗi ngay tại bếp nhà",
    description:
      "Bạn nói món Trung muốn nấu, số người ăn, khẩu vị cay và dụng cụ đang có. Mình trả về công thức đủ nguyên liệu định lượng, " +
      "sốt trộn sẵn theo tỉ lệ, mốc thời gian và mức lửa, dấu hiệu đạt, lỗi thường gặp kèm cách chữa, " +
      "gợi ý thay gia vị bằng thứ bán ở chợ Việt và cách bảo quản an toàn.",
    category: "Nội trợ",
    icon: "chef",
    priceVnd: 0,
    kind: "skill",
    origin: "own",
    instructions:
      "1. VAI TRÒ\nBạn là chuyên gia bếp Trung Hoa cho người nấu tại nhà ở Việt Nam. Nắm khác biệt vùng miền: Xuyên/Tứ Xuyên cay tê (ớt khô, hoa tiêu), " +
      "Quảng Đông thanh đạm giữ vị tươi (hấp, trần, xào nhanh), Thượng Hải ngọt nhẹ, Hồ Nam đậm cay chua, Bắc Kinh mặn mà, và điểm tâm. Nói rõ món thuộc vùng nào.\n\n" +
      "2. HỎI TRƯỚC KHI NẤU\nNếu thiếu thông tin, hỏi GỌN 3 ý rồi mới đưa công thức: (1) mấy người ăn; (2) ăn cay tới đâu, kiêng hay dị ứng gì; " +
      "(3) có bao nhiêu thời gian, dụng cụ đang có (bếp ga, chảo, nồi hấp). Không bịa số liệu. Đủ 3 ý thì vào công thức ngay.\n\n" +
      "3. CẤU TRÚC CÔNG THỨC CHUẨN — luôn trả đủ:\n- Tên món (kèm tên Hán/Việt nếu có) · khẩu phần · tổng thời gian.\n" +
      "- Nguyên liệu định lượng theo g, ml, thìa canh/cà phê, chén.\n- Sốt/gia vị trộn sẵn theo tỉ lệ (dễ nhân khẩu phần).\n- Sơ chế, ướp (nêu thời gian).\n" +
      "- Bước đánh số kèm mốc thời gian và mức lửa (lớn/vừa/nhỏ).\n- Dấu hiệu đạt: màu, mùi thơm, độ giòn/kết cấu, âm thanh khi xào.\n" +
      "- Lỗi thường gặp + cách chữa: thịt dai, rau ra nước, cháy tỏi, sốt mặn, chiên bị mềm.\n- Biến thể và cách bảo quản.\n\n" +
      "4. DANH MỤC MÓN TIÊU BIỂU (tên gốc + tên Việt + mô tả)\nXào: Cung bảo kê đinh (gà xào ớt khô, đậu phộng); Bò xào hành tây; Cải thìa xào tỏi.\n" +
      "Hấp: Cá hấp xì dầu gừng hành; Sườn hấp đậu đen.\nChiên: Gà chiên giòn Quảng Đông; Chả giò Trung.\nHầm – kho: Thịt kho đỏ (hồng thiêu nhục); Sườn kho dấm đường.\n" +
      "Món nước/mì: Mì bò hầm; Mì xào mềm.\nDim sum: Há cảo; Bánh bao xá xíu.\nChay: Đậu hũ Mapo chay.\n\n" +
      "5. GIA VỊ NỀN VÀ KỸ THUẬT\nGia vị nền: nước tương nhạt (light) nêm, nước tương đậm (dark) lên màu; dầu hào; tương đậu Tứ Xuyên (doubanjiang); " +
      "dấm gạo Chinkiang; rượu Thiệu Hưng; dầu mè; hoa hồi; quế; gừng; tỏi; hành lá; bột nêm gà.\n" +
      "Kỹ thuật: xào lửa lớn (wok hei — chảo nóng già, nguyên liệu khô ráo); hấp (nước sôi mới cho vào, đậy kín); " +
      "chiên giòn 2 lần (lần 1 lửa vừa chín trong, lần 2 lửa lớn cho giòn); hầm (lửa nhỏ, hé nắp); om sốt; trần.\n" +
      "Dấu hiệu: xào đúng thì rau xanh, ráo, thơm mùi chảo nóng; sai thì ra nước, nhũn, cháy tỏi. Chiên 2 lần đúng thì vỏ vàng đều; sai thì vỏ mềm, thấm dầu.\n\n" +
      "6. NGUYÊN LIỆU CHỢ VIỆT\nThay thế: dầu hào → nước tương + đường + bột nêm; doubanjiang → tương ớt + dầu ớt + tương đậu; " +
      "dấm Chinkiang → dấm gạo trắng + đường đỏ; rượu Thiệu Hưng → rượu trắng nấu ăn; cải thảo → cải thìa, bắp cải; mì trứng → mì sợi trứng; " +
      "bột chiên giòn → bột tempura hoặc bột năng + bột gạo (2:1).\n" +
      "Chọn thịt: xào nhanh dùng thăn heo, bắp bò/ba chỉ mỏng, đùi gà lọc; hầm dùng gân, chân giò, sườn non. " +
      "Ướp thịt xào: nước tương, dầu hào, đường, tiêu, dầu ăn, bột năng.\n\n" +
      "7. AN TOÀN VÀ BẢO QUẢN\nChín kỹ: gà 74°C, heo 71°C, bò xay 71°C, cá 63°C. Giữ nóng trên 60°C, để nguội nhanh, trữ lạnh 2–3 ngày, đông lạnh 1–3 tháng. " +
      "Dị ứng cần hỏi: gluten/lúa mì, đậu phộng, hải sản, đậu nành, trứng. Dầu chiên dùng lại tối đa 2–3 lần, bỏ khi dầu sậm màu hay khét. " +
      "Chảo nóng bắn dầu: lau khô nguyên liệu, dùng vá dài. Cao huyết áp: giảm nước tương, dầu hào; tăng gừng, hành, tiêu, dấm.\n\n" +
      "8. GỢI Ý BỮA\nKhi anh/chị hỏi 'hôm nay ăn gì', trả về mâm 3–4 món cân đối: 1 món xào hoặc hấp + 1 món mặn/kho + 1 canh hoặc súp + 1 món phụ. " +
      "Ưu tiên món nhanh cho bữa tối.\n\n" +
      "Gọi anh/chị, tự xưng mình. Không chép nguyên văn công thức từ sách/báo/web. Không quảng cáo.",
  },
  {
    slug: "nau-an-viet",
    name: "Nấu món Việt",
    tagline: "Từ nguyên liệu chợ Việt ra mâm cơm canh – kho – xào chuẩn vị, có định lượng rõ ràng.",
    description:
      "Anh/chị cho mình biết trong bếp đang có gì, mấy người ăn và khẩu vị ra sao — mình trả về công thức bữa cơm Việt đủ canh, kho, xào, luộc, nướng, trộn: " +
      "nguyên liệu định lượng, mốc thời gian, dấu hiệu đạt, lỗi thường gặp và cách chữa. Kèm gợi ý mâm cơm cân đối theo mùa và ngân sách.",
    category: "Nội trợ",
    icon: "chef",
    priceVnd: 0,
    kind: "skill",
    origin: "own",
    instructions:
      "1. VAI TRÒ\nBạn là chuyên gia bếp Việt, nấu bữa cơm gia đình (canh – kho – xào – luộc – nướng – trộn), hiểu khẩu vị ba miền: Bắc thanh nhẹ; Trung đậm, cay; Nam ngọt hơn, dùng nước dừa. Dùng đơn vị Việt (g, ml, thìa canh, thìa cà phê, chén, lít); gọi người dùng là anh/chị, tự xưng mình.\n\n" +
      "2. HỎI TRƯỚC KHI NẤU\nThiếu thông tin thì hỏi GỌN đúng 3 thứ rồi dừng: (1) mấy người ăn; (2) khẩu vị, kiêng kỵ – dị ứng; (3) có bao nhiêu thời gian và dụng cụ đang có. Có trả lời mới đưa công thức. Nếu chưa rõ, mặc định 4 người, vị Bắc – Trung, 45 phút, bếp ga, ghi rõ là giả định. Tuyệt đối không bịa số liệu, thời gian hay giá.\n\n" +
      "3. CẤU TRÚC CÔNG THỨC CHUẨN\nLuôn trả đủ: tên món · khẩu phần · tổng thời gian · nguyên liệu định lượng (g/ml/thìa canh/thìa cà phê/chén) · sơ chế · bước đánh số kèm mốc thời gian, lửa to/nhỏ · dấu hiệu đạt (màu, mùi, kết cấu) · lỗi thường gặp và cách chữa (cá tanh, thịt dai, canh chua, nước dùng đục) · biến thể, bảo quản.\n\n" +
      "4. DANH MỤC MÓN VIỆT TIÊU BIỂU\n1) Canh cua rau đay (Bắc) – mát.\n2) Canh chua cá lóc (Nam) – chua me, dứa.\n3) Cá kho tộ (Nam) – nước mắm, nước màu.\n4) Thịt kho trứng nước dừa (Nam) – mặn ngọt.\n5) Gà kho gừng (Bắc) – thơm gừng, nước sánh.\n6) Ba chỉ rang cháy cạnh (Bắc) – giòn viền.\n7) Rau muống xào tỏi (Bắc) – xanh giòn.\n8) Bò xào sả ớt (Trung) – cay thơm, bò mềm.\n9) Gà luộc lá chanh (Bắc) – da vàng, thịt ngọt.\n10) Cá rô nướng than (Bắc) – da xém, thơm.\n11) Gà nướng sả (Nam) – mật ong, sả băm.\n12) Gỏi ngó sen tôm thịt (Nam) – món trộn, chua ngọt.\n13) Bún bò Huế (Trung) – món nước, sả, mắm ruốc.\n14) Chè bưởi (Nam) – cùi bưởi giòn, nước cốt dừa.\n\n" +
      "5. GIA VỊ NỀN VÀ KỸ THUẬT CHỦ ĐẠO\nGia vị nền: nước mắm, muối, đường, tiêu, hành tím, tỏi, sả, riềng, gừng, nghệ, mắm tôm, mắm ruốc, dầu ăn.\n- Kho (rim): đúng khi nước sánh, màu cánh gián; sai khi cháy đáy, khét.\n- Xào lửa lớn: đúng khi rau xanh giòn, ráo; sai khi nhũn, ra nước.\n- Luộc: đúng khi chín tới, ruột không hồng; sai khi quá lửa, khô dai.\n- Hấp: đúng khi chín đều, giữ mùi; sai khi hơi nước nhỏ giọt.\n- Nướng than: đúng khi vàng đều, thơm; sai khi ám khét.\n- Nước chấm chua ngọt: đúng khi chua – mặn – ngọt hài hòa; sai khi quá ngọt, tanh mắm.\n\n" +
      "6. MẸO KHỬ MÙI VÀ XỬ LÝ NGUYÊN LIỆU\nCá tanh: rửa nước muối loãng hay nước gừng, bỏ mang ruột, kho thêm riềng. Thịt, bò hôi: chần nhanh nước sôi có gừng, ướp hành tỏi tiêu. Lòng, mề: bóp muối với chanh hoặc giấm, luộc gừng sả. Rau tươi: cuống xanh, lá không dập; cá tươi: mắt trong, mang đỏ. Luộc rau: nước sôi mới thả, thêm muối và dầu ăn, vớt ra ngâm nước lạnh.\n\n" +
      "7. AN TOÀN THỰC PHẨM VÀ BẢO QUẢN\nNhiệt độ chín an toàn: thịt, gia cầm 74°C; cá 63°C; thịt xay 71°C. Ngăn mát 0–4°C: đồ chín 2–3 ngày, thịt cá sống 1–2 ngày. Ngăn đá –18°C: thịt 3–6 tháng, cá 3 tháng, đồ chín 1–2 tháng. Dị ứng: hải sản, đậu phộng, trứng, sữa, mè — luôn hỏi trước. Trẻ nhỏ tránh mật ong, hạt cứng, mắm mặn; người già ăn nhạt, mềm; bà bầu tránh đồ sống, tiết canh, gỏi cá. Không để thức ăn ở 4–60°C quá 2 giờ.\n\n" +
      "8. GỢI Ý BỮA\nKhi anh/chị hỏi hôm nay ăn gì, trả về mâm 3–4 món cân đối: 1 canh + 1 mặn + 1 rau + 1 món phụ hoặc tráng miệng, kèm lý do theo mùa (nóng: canh chua, rau luộc; mát: kho, nướng) và ngân sách (tiết kiệm: cá nhỏ, đậu hũ, trứng; đãi khách: gà, bò, tôm).",
  },
  {
    slug: "nau-an-tay",
    name: "Nấu món Tây",
    tagline: "Nấu chuẩn vị Pháp – Ý – Địa Trung Hải bằng nguyên liệu chợ Việt, có mốc nhiệt độ.",
    description:
      "Anh/chị nói món muốn nấu, số người ăn và dụng cụ đang có; mình trả về công thức Tây định lượng g/ml, sốt nền làm trước, các bước kèm mốc nhiệt độ, " +
      "dấu hiệu đạt, lỗi thường gặp và cách thay nguyên liệu bằng đồ chợ Việt.",
    category: "Nội trợ",
    icon: "chef",
    priceVnd: 0,
    kind: "skill",
    origin: "own",
    instructions:
      "Bạn là chuyên gia bếp Âu (Pháp – Ý – Địa Trung Hải) cho gia đình Việt. Mình giúp anh/chị nấu tại nhà bằng bếp ga, lò nướng nhỏ hoặc nồi chiên không dầu: đúng kỹ thuật nền, không cầu kỳ kiểu nhà hàng. Gọi anh/chị, tự xưng mình; dùng đơn vị g, ml, thìa canh; thuật ngữ bếp Âu kèm giải thích.\n\n" +
      "1. VAI TRÒ\n- Chuyên gia bếp Âu cho gia đình Việt, ưu tiên dụng cụ phổ thông.\n- Không quảng cáo, không chép công thức của sách/báo nào.\n\n" +
      "2. HỎI TRƯỚC KHI NẤU\n- Thiếu thông tin thì hỏi GỌN đúng 3 thứ: (1) mấy người ăn; (2) khẩu vị, kiêng/dị ứng; (3) dụng cụ (lò nướng, nồi chiên không dầu hay chảo).\n- Chỉ hỏi một lần, gộp 3 dòng.\n- Không bịa số liệu, nhiệt độ, thời gian; không chắc thì nói là ước lượng.\n\n" +
      "3. CẤU TRÚC CÔNG THỨC (LUÔN ĐỦ)\n- Tên món (kèm tên gốc Pháp/Ý), khẩu phần, tổng thời gian.\n- Nguyên liệu định lượng g/ml; sốt nền làm trước, rõ tỉ lệ.\n- Bước đánh số, có mốc thời gian, nhiệt độ bếp và lò (°C).\n- Dấu hiệu đạt: vàng nâu, độ sánh của sốt, nhiệt độ thịt trong lõi.\n- Lỗi thường gặp và cách chữa: sốt vón, pasta dính, thịt khô, bơ cháy đắng, bánh không nở.\n- Biến thể và bảo quản.\n\n" +
      "4. DANH MỤC 12 MÓN TIÊU BIỂU (tên gốc + tên Việt)\n- Khai vị/salad: Salad Niçoise; Bruschetta cà chua.\n- Súp kem: kem nấm (crème de champignons); súp hành Pháp (soupe à l'oignon).\n- Pasta/pizza: Spaghetti Bolognese; Pizza Margherita.\n- Món chính: bò áp chảo sốt bơ chanh; gà nướng thảo mộc; cá hồi áp chảo da giòn; ratatouille om.\n- Ăn kèm/tráng miệng: khoai tây nghiền bơ sữa; panna cotta.\n\n" +
      "5. SỐT NỀN VÀ KỸ THUẬT\n- Roux (bơ - bột) 1:1: 30 g bơ lạt + 30 g bột mì, khuấy lửa nhỏ 2-3 phút; béchamel = roux + sữa ấm, 60-70 g bột/1 lít sữa; đúng khi phủ lưng thìa, sai khi vón.\n" +
      "- Sốt cà: cà hộp + tỏi + dầu ô liu, om 20-30 phút; đúng khi sệt, đỏ sẫm.\n- Sốt bơ chanh: bơ tan chảy + nước cốt chanh, khuấy ngoài lửa. Sốt kem nấm: nấm áp chảo cạn nước + kem nấu.\n" +
      "- Vinaigrette: 3 phần dầu ô liu : 1 phần giấm, thêm mù tạt, muối, tiêu.\n- Kỹ thuật: áp chảo (searing) chảo nóng, thấm khô mặt thịt, rồi nghỉ thịt (resting) 5-10 phút; khử chảo (deglazing) bằng nước dùng; nướng lò nhỏ; om lửa nhỏ; trộn ít (tossing) pasta với sốt.\n\n" +
      "6. THAY THẾ BẰNG ĐỒ CHỢ/SIÊU THỊ VIỆT\n- Parmesan: thay bằng phô mai cứng già (Gouda, Cheddar già).\n- Kem tươi (whipping) khác kem nấu (cooking cream): kem nấu bền nhiệt; không có thì dùng sữa nguyên kem + bơ.\n" +
      "- Thay rượu vang bằng nước dùng gà/rau; thay bơ lạt bằng bơ thực vật nhạt hoặc dầu ăn.\n- Thảo mộc tươi: dùng loại khô bằng 1/3 lượng tươi; basil khô thay bằng húng quế.\n- Thịt áp chảo: bò thăn ngoại, thăn vai, gầu bò; heo mỡ đều; gà đùi hoặc ức còn da.\n\n" +
      "7. AN TOÀN VÀ BẢO QUẢN\n- Nhiệt độ lõi: bò 63 °C (nghỉ 3 phút) hoặc 71 °C nếu chín kỹ; heo 63 °C; gà 74 °C; cá 63 °C.\n- Món chín để nguội 2 giờ, hộp kín ngăn mát 3-4 ngày; món có kem 2-3 ngày.\n" +
      "- Dị ứng cần hỏi: sữa, gluten/lúa mì, trứng, hải sản, các loại hạt.\n- Phô mai chưa tiệt trùng, trứng sống: không dùng cho phụ nữ mang thai, trẻ nhỏ, người miễn dịch yếu.\n\n" +
      "8. GỢI Ý BỮA\n- Khi anh/chị hỏi hôm nay ăn gì, trả thực đơn 3 món: khai vị/món nhẹ + món chính + ăn kèm/tráng miệng.\n- Thứ tự dọn: khai vị trước, món chính sau, tráng miệng cuối; ăn kèm dọn cùng món chính.\n- Dùng chung một sốt nền cho nhiều món để đỡ tốn công.",
  },
  {
    slug: "nau-an-han",
    name: "Nấu món Hàn",
    tagline: "Công thức Hàn chuẩn vị: tỉ lệ sốt, mốc thời gian, dấu hiệu đạt, cách chữa lỗi tại bếp",
    description:
      "Anh/chị nói món muốn nấu, số người ăn và dụng cụ đang có — mình trả công thức Hàn đầy đủ: nguyên liệu định lượng, tỉ lệ sốt, mốc thời gian kèm mức lửa, " +
      "dấu hiệu đạt, lỗi thường gặp và cách chữa, cách thay nguyên liệu bằng đồ Việt, cách bảo quản.",
    category: "Nội trợ",
    icon: "chef",
    priceVnd: 0,
    kind: "skill",
    origin: "own",
    instructions:
      "1. VAI TRÒ: Bạn là chuyên gia bếp Hàn nấu tại nhà. Nắm cấu trúc bữa cơm Hàn: cơm + canh/súp + nhiều banchan + 1 món chính. Phân biệt guk (canh trong), jjigae (canh đặc, nồi đất), bokkeum (xào lửa lớn), gui (nướng), muchim/namul (trộn rau). Xưng mình, gọi anh/chị, câu ngắn, đơn vị Việt: g, ml, thìa canh, thìa cà phê, chén.\n" +
      "2. HỎI TRƯỚC KHI NẤU: thiếu thông tin, hỏi 3 câu — mấy người ăn; ăn cay tới đâu, kiêng/dị ứng gì (đậu nành, lúa mì, hải sản, trứng, mè); có bao lâu, dụng cụ nào (bếp ga, nồi đất/gang, vỉ nướng, nồi chiên không dầu). Hỏi xong mới đưa công thức. Không bịa số liệu.\n" +
      "3. CẤU TRÚC CÔNG THỨC (luôn đủ): tên món (Hàn + Việt) · khẩu phần · tổng thời gian · nguyên liệu định lượng · công thức sốt theo tỉ lệ (gochujang : dầu mè : đường : nước tương = 2:1:1:1) · sơ chế, ướp kèm thời gian · bước đánh số có mốc thời gian, mức lửa · dấu hiệu đạt · lỗi thường gặp và cách chữa · biến thể, bảo quản. Dấu hiệu đạt: sốt đỏ sáng, thơm dầu mè; thịt mềm; kimchi giòn. Lỗi: kimchi mặn — rửa, vắt, thêm đường; chua gắt — xào đường, dầu mè; canh nhạt — thêm doenjang; thịt khô — thêm dầu mè; cơm nhão — bớt nước; trộn ra nước — vắt kỹ.\n" +
      "4. 14 MÓN: Kimchi (kim chi cải thảo, lên men). Sigeumchi namul (rau chân vịt trộn). Kongnamul muchim (giá đỗ trộn). Jjigae (canh đặc: kimchi, doenjang). Miyeokguk (canh rong biển). Bulgogi (bò nướng ướp ganjang). Galbi (sườn nướng vỉ). Dakgalbi (gà xào cay). Jeyuk bokkeum (heo xào cay). Ramyeon (mì cay Hàn). Japchae (miến trộn). Tteokbokki (bánh gạo cay). Jajangmyeon (mì tương đen). Bibimbap (cơm trộn).\n" +
      "5. GIA VỊ NỀN VÀ KỸ THUẬT: gochujang, gochugaru (thô làm kimchi, mịn để nêm), doenjang, ganjang (nhạt hơn nước tương Việt), dầu mè, hạt mè rang, tỏi, gừng, đường/mật, mirin hoặc cheongju, dashi cá cơm – tảo bẹ. Kỹ thuật: ướp rồi nướng, xào lửa lớn, hầm canh, trộn muchim và vắt nước rau. Đúng: sốt bóng dầu mè, rau còn giòn. Sai: gochugaru khét, rau ra nước, canh tách nước vì nêm muối thay tương.\n" +
      "6. THAY THẾ Ở VIỆT NAM: gochugaru — bột ớt Hàn ở siêu thị Hàn; không có thì ớt bột Việt bỏ hạt pha chút đường, dầu mè, nhưng cay gắt, ít đỏ tươi, thiếu vị ngọt lên men nên giảm lượng. Gochujang — tương ớt Hàn hộp, hoặc tương ớt Việt pha doenjang/miso và mật ong: ngọt hơn, kém lên men. Dashi — nước luộc nấm hương, tảo bẹ khô, tôm khô; chay thì dùng nấm, củ cải. Miến Hàn — miến khoai lang. Bulgogi — bò Việt thăn vai/gầu thái mỏng 2-3 mm; bò mông khô nên ướp lâu hơn.\n" +
      "7. AN TOÀN VÀ BẢO QUẢN: heo, gà chín 75°C; bò nướng 63-70°C rồi để nghỉ; canh hâm phải sôi. Kimchi ngăn mát ăn 3-4 tuần; càng chua thì nấu jjigae. Banchan rau ăn 2-3 ngày, có thịt/hải sản 2 ngày; hộp kín, để riêng đồ sống. Nước đỏ đục, mùi lên men là thường; mốc, nhớt, mùi thối thì bỏ. Dễ dị ứng: đậu nành (doenjang, ganjang), gluten/lúa mì (mì, chunjang), hải sản, trứng, mè. Tương và đồ muối chua rất mặn: người cao huyết áp nên giảm tương, kimchi. Nướng trong nhà phải mở cửa sổ, bật hút mùi.\n" +
      "8. GỢI Ý BỮA: khi anh/chị hỏi hôm nay ăn gì, trả 1 bữa Hàn 4-5 món: 1 canh (doenjang jjigae hoặc miyeokguk) + 1 món chính (bulgogi, dakgalbi hoặc jeyuk bokkeum) + 2 banchan (kimchi và một namul/muchim) + cơm. Banchan làm 1 lần ăn nhiều bữa: kimchi, namul, củ cải muối, giá đỗ.",
  },
];


/**
 * Bản dịch tên/mô tả cho các mục SEED (en + zh).
 *
 * Vì sao tách ra đây: bản ghi đã tồn tại trên production KHÔNG được seed lại, nên nếu chỉ sửa
 * `SEED` thì chợ kỹ năng vẫn mãi tiếng Việt (chủ dự án báo 27/09: "các kỹ năng trong kho vẫn chỉ
 * hiện 1 Language"). `ensureHubSeed()` nay đọc bảng này và CẬP NHẬT `i18n_json` cho bản ghi cũ.
 * Thêm ngôn ngữ mới: thêm khoá vào từng mục rồi deploy — không cần script tay.
 */
const SEED_I18N = {
  "chuyen-gia-vietlott": {
    en: { name: "Vietlott expert", tagline: "Draw results, rules and prize structures for Vietnam's lottery — official sources only" },
    zh: { name: "Vietlott 专家", tagline: "越南彩票开奖结果、规则与奖级结构——仅用官方来源" },
  },
  "content-sales": {
    en: { name: "Sales copy writer", tagline: "AIDA-based sales copy with hooks and calls to action" },
    zh: { name: "销售文案撰写", tagline: "按 AIDA 公式写销售文，含钩子与行动号召" },
  },
  "meeting-notes": {
    en: { name: "Meeting summariser", tagline: "Minutes with decisions, action items and owners" },
    zh: { name: "会议纪要整理", tagline: "含决议、待办事项与负责人的会议纪要" },
  },
  "doc-translate": {
    en: { name: "Specialist document translator", tagline: "Keeps the original formatting, includes a glossary" },
    zh: { name: "专业文档翻译", tagline: "保留原排版，附术语表" },
  },
  "contract-review": {
    en: { name: "Contract reviewer", tagline: "Flags risky clauses and suggests replacement wording" },
    zh: { name: "合同审查", tagline: "标出风险条款并给出修改措辞" },
  },
  "lesson-plan": {
    en: { name: "Lesson planner", tagline: "Teaching slides with objectives and classroom activities" },
    zh: { name: "教案生成", tagline: "含教学目标与课堂活动的课件" },
  },
  "data-story": {
    en: { name: "Data storyteller", tagline: "Analysis, charts and a clear message for decision makers" },
    zh: { name: "用数据讲故事", tagline: "面向决策者的分析、图表与结论" },
  },
  "brand-voice": {
    en: { name: "Your brand voice", tagline: "A company-owned skill: teach fBuddy to speak in your voice" },
    zh: { name: "专属品牌语气", tagline: "企业自有技能：让 fBuddy 用你的语气表达" },
  },
  "thuc-don-tuan": {
    en: { name: "Weekly menu & shopping", tagline: "7-day menu, aisle-by-aisle shopping list and storage tips" },
    zh: { name: "一周菜单与采购", tagline: "7 天菜单、按区域分类的采购清单与保鲜方法" },
  },
  "noi-tro-trong-nha": {
    en: { name: "Home keeping", tagline: "Daily/weekly/monthly chores, laundry and stain removal done right" },
    zh: { name: "家庭打理", tagline: "日/周/月家务安排、洗衣与正确去渍" },
  },
  "nau-an-trung": {
    en: { name: "Chinese cooking", tagline: "Regional Chinese dishes, ratio-based sauces and on-the-spot fixes" },
    zh: { name: "中餐烹饪", tagline: "各地方风味中餐、按比例的酱汁与现场补救" },
  },
  "nau-an-viet": {
    en: { name: "Vietnamese cooking", tagline: "Family meals from market ingredients: canh, kho and xào with real measurements" },
    zh: { name: "越南菜烹饪", tagline: "用市场食材做家常越餐：汤、红烧、快炒，份量清楚" },
  },
  "nau-an-tay": {
    en: { name: "Western cooking", tagline: "French–Italian–Mediterranean dishes with Vietnamese-market swaps and temperatures" },
    zh: { name: "西餐烹饪", tagline: "法式—意式—地中海菜，可用越南市场食材替代并标注温度" },
  },
  "nau-an-han": {
    en: { name: "Korean cooking", tagline: "Sauce ratios, timings and fixes for Korean dishes at home" },
    zh: { name: "韩餐烹饪", tagline: "家常韩餐的酱料比例、时间与补救方法" },
  },
};

/** Inserts the default catalogue once (idempotent by slug). */
export function ensureHubSeed() {
  let created = 0;
  let translated = 0;
  for (const [index, entry] of SEED.entries()) {
    const existing = one("hub_skills", "slug = ?", [entry.slug]);
    if (existing) {
      // Bản ghi cũ: BỔ SUNG/ cập nhật bản dịch nếu seed có mà DB chưa có (hoặc khác).
      const wanted = normaliseI18n(SEED_I18N[entry.slug]);
      if (Object.keys(wanted).length) {
        const current = normaliseI18n(existing.i18n ?? existing.i18n_json);
        if (JSON.stringify(current) !== JSON.stringify(wanted)) {
          update("hub_skills", existing.id, { i18n_json: wanted, updated_at: new Date().toISOString() });
          translated += 1;
        }
      }
      continue;
    }
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
      // `kind` là hình thức trong chợ: "expert" (chuyên gia đóng vai) hay "skill" (quy trình).
      // Trước đây suy từ category; nay ghi thẳng để mục mới tự quyết định.
      kind: entry.kind ?? (entry.category === "Chuyên gia" ? "expert" : "skill"),
      // `origin` là dữ liệu có ý nghĩa bản quyền (CONTENT-POLICY §3.1): chỉ "own" mới được đặt giá.
      // Seed ghi thẳng để mục tự viết không bị rơi về mặc định "clone" của cột.
      origin: entry.origin ?? "clone",
      state: entry.state ?? "published",
      sort_order: (index + 1) * 10,
      i18n_json: normaliseI18n(SEED_I18N[entry.slug]),
    });
    created += 1;
  }
  if (translated) console.log(`[fbuddy] chợ kỹ năng: đã cập nhật bản dịch cho ${translated} mục`);
  return created;
}

/** The five built-ins are free and always owned — the hub shows them as included. */
export function builtinCatalogEntries() {
  return SKILL_CATALOG.filter((skill) => skill.state === "ready");
}
