/**
 * SkillHub (Tencent) — máy khách gọi Open API `https://api.skillhub.cn`.
 *
 * Vì sao đặt ở server: `X-API-Key` là khoá của team, tài liệu SkillHub yêu cầu chỉ
 * dùng phía server, không nhúng vào frontend. Module này **không** phụ thuộc DB hay
 * config nên `ops/*.mjs` import thẳng được để chạy ngoài tiến trình web.
 *
 * ⚠️ Trạng thái mạng (đo 2026-09-18): `api.skillhub.cn` **timeout** từ cả máy dev
 * lẫn VPS production (DNS ra EdgeOne 43.174.224.202 nhưng TCP 443 không thông),
 * trong khi baidu.com / cloud.tencent.com / npmjs đều 200 từ hai máy ⇒ dịch vụ giới
 * hạn theo vùng/IP chứ không phải lỗi cấu hình. Vì vậy base URL đọc từ
 * `SKILLHUB_BASE_URL` để chỉ cần đổi VPN/relay là dùng được, không phải sửa code.
 *
 * Tài liệu: https://github.com/Tencent/skillhub/tree/main/docs/api
 */

/** Base URL công khai của SkillHub. */
export const SKILLHUB_DEFAULT_BASE = "https://api.skillhub.cn";

/** Trần `instructions` của chợ kỹ năng (`hub_skills.instructions`). */
export const MAX_INSTRUCTIONS = 6000;

const DEFAULT_TIMEOUT_MS = 20_000;

/** Cấu hình lấy từ biến môi trường (không lưu khoá trong DB để khỏi lẫn với secret khác). */
export function skillhubConfig(env = process.env) {
  return {
    baseUrl: String(env.SKILLHUB_BASE_URL ?? SKILLHUB_DEFAULT_BASE).replace(/\/+$/, ""),
    apiKey: env.SKILLHUB_API_KEY ? String(env.SKILLHUB_API_KEY) : null,
    /** `X-Client-User-Id`: giá trị đã che, chỉ để SkillHub thống kê người dùng. */
    clientUserId: env.SKILLHUB_CLIENT_USER_ID ? String(env.SKILLHUB_CLIENT_USER_ID) : null,
    timeoutMs: Math.max(1000, Number(env.SKILLHUB_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS),
  };
}

/**
 * Gọi một endpoint và trả JSON đã parse.
 *
 * `fetchImpl` bơm vào được để test không cần mạng. Lỗi mạng được bọc lại kèm gợi ý
 * chẩn đoán, vì đây đúng là kiểu lỗi sẽ gặp khi chưa có đường sang Trung Quốc.
 */
export async function skillhubRequest(
  path,
  { method = "GET", body, config = skillhubConfig(), fetchImpl = fetch, signal } = {},
) {
  const url = `${config.baseUrl}${path}`;
  const headers = { Accept: "application/json" };
  if (config.apiKey) headers["X-API-Key"] = config.apiKey;
  if (config.clientUserId) headers["X-Client-User-Id"] = config.clientUserId;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let response;
  try {
    response = await fetchImpl(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: signal ?? (typeof AbortSignal?.timeout === "function" ? AbortSignal.timeout(config.timeoutMs) : undefined),
    });
  } catch (err) {
    throw new Error(
      `Không gọi được SkillHub (${url}): ${err?.message ?? err}. ` +
        "Kiểm tra đường mạng tới Trung Quốc (VPN/relay) — dịch vụ chặn theo vùng IP.",
    );
  }

  if (!response.ok) {
    let detail = "";
    try {
      detail = (await response.json())?.error ?? "";
    } catch {
      /* body lỗi không phải JSON thì chỉ dùng mã trạng thái */
    }
    throw new Error(`SkillHub ${path} → ${response.status}${detail ? `: ${detail}` : ""}`);
  }
  return response.json();
}

// ------------------------------------------------------------------ endpoints

/**
 * Tìm skill. Trả `{ total, skills }` (endpoint này bọc trong `data`).
 * `free: true` ⇒ chỉ lấy skill không tính phí (`labels=pricing_type:!paid`).
 */
export async function searchSkills(
  { keyword, category, page = 1, pageSize = 20, sortBy = "downloads", order = "desc", labels, free = false } = {},
  options = {},
) {
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize), sortBy, order });
  if (keyword) query.set("keyword", String(keyword));
  if (category) query.set("category", String(category));
  const labelFilter = labels ?? (free ? "pricing_type:!paid" : null);
  if (labelFilter) query.set("labels", String(labelFilter));
  const payload = await skillhubRequest(`/api/skills?${query}`, options);
  const data = payload?.data ?? payload ?? {};
  return { total: Number(data.total ?? 0), skills: Array.isArray(data.skills) ? data.skills : [] };
}

/** Chi tiết một skill: `{ skill, latestVersion, owner }` (không bọc `data`). */
export function getSkill(slug, options = {}) {
  return skillhubRequest(`/api/v1/skills/${encodeURIComponent(slug)}`, options);
}

/** Nhiều skill một lượt (tối đa 1000 slug): `{ items, missing }`. */
export function getSkillsBatch(slugs, options = {}) {
  return skillhubRequest("/api/v1/skills/batch", { ...options, method: "POST", body: { slugs } });
}

/** Danh sách tệp của một phiên bản: `{ files: [{ path, size, sha256 }], count, version }`. */
export function getSkillFiles(slug, { version } = {}, options = {}) {
  const query = version ? `?version=${encodeURIComponent(version)}` : "";
  return skillhubRequest(`/api/v1/skills/${encodeURIComponent(slug)}/files${query}`, options);
}

/** Điểm chất lượng TRACE (5 chiều, thang 5) — dùng làm cổng duyệt trước khi bán. */
export function getSkillEvaluation(slug, options = {}) {
  return skillhubRequest(`/api/v1/skills/${encodeURIComponent(slug)}/evaluation`, options);
}

/** Danh mục cấp 1 (khoá dùng được cho tham số `category`). */
export function listCategories(options = {}) {
  return skillhubRequest("/api/v1/categories", options);
}

/**
 * Đọc nội dung một tệp. Endpoint trả **302** sang object storage nên phải đi theo
 * redirect; tệp quá 1MB bị SkillHub trả 413 (khi đó phải tải zip).
 */
export async function readSkillFile(slug, { path, version, config = skillhubConfig(), fetchImpl = fetch, signal } = {}) {
  if (!path) throw new Error("Thiếu đường dẫn tệp (path)");
  const query = new URLSearchParams({ path: String(path) });
  if (version) query.set("version", String(version));
  const url = `${config.baseUrl}/api/v1/skills/${encodeURIComponent(slug)}/file?${query}`;
  const headers = {};
  if (config.apiKey) headers["X-API-Key"] = config.apiKey;
  const response = await fetchImpl(url, {
    headers,
    redirect: "follow",
    signal: signal ?? (typeof AbortSignal?.timeout === "function" ? AbortSignal.timeout(config.timeoutMs) : undefined),
  });
  if (!response.ok) {
    const hint = response.status === 413 ? " (tệp quá 1MB — dùng /api/v1/download để lấy zip)" : "";
    throw new Error(`SkillHub ${slug}/${path} → ${response.status}${hint}`);
  }
  return response.text();
}

// ------------------------------------------------------------------- parsing

/** Frontmatter YAML phẳng của `SKILL.md` (`name`, `description`, `tools`, …). */
export function parseSkillMarkdown(source) {
  const text = String(source ?? "").replace(/^\uFEFF/, "");
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!match) return { data: {}, body: text.trim() };
  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const entry = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line.trim());
    if (!entry) continue;
    let value = entry[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (value.startsWith("[") && value.endsWith("]")) {
      data[entry[1]] = value
        .slice(1, -1)
        .split(",")
        .map((part) => part.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    } else {
      data[entry[1]] = value;
    }
  }
  // Bỏ tiêu đề H1 trùng với tên skill ở đầu thân bài.
  return { data, body: text.slice(match[0].length).replace(/^\s*#\s+.*\r?\n+/, "").trim() };
}

/**
 * Cắt chỉ dẫn cho vừa trần của chợ, cắt ở ranh giới đoạn và **nói rõ đã cắt** —
 * im lặng cắt sẽ khiến prompt pack trông như bản gốc mà thiếu mất phần cuối.
 */
export function fitInstructions(body, max = MAX_INSTRUCTIONS) {
  const text = String(body ?? "").trim();
  if (text.length <= max) return { text, truncated: false, originalLength: text.length };
  const note = `\n\n[… chỉ dẫn gốc dài ${text.length.toLocaleString("vi-VN")} ký tự, đã lược bớt cho vừa ${max.toLocaleString("vi-VN")} ký tự của chợ kỹ năng …]`;
  const room = Math.max(0, max - note.length);
  let cut = text.slice(0, room);
  const boundary = cut.lastIndexOf("\n\n");
  if (boundary > room * 0.6) cut = cut.slice(0, boundary);
  return { text: `${cut.trimEnd()}${note}`, truncated: true, originalLength: text.length };
}

const TOOL_ALIASES = {
  ppt: "generate_pptx",
  pptx: "generate_pptx",
  powerpoint: "generate_pptx",
  slides: "generate_pptx",
  excel: "generate_xlsx",
  xlsx: "generate_xlsx",
  spreadsheet: "generate_xlsx",
  data: "analyze_data",
  analysis: "analyze_data",
  image: "edit_image",
  files: "list_files",
};

/** Công cụ fBuddy thực sự chạy được (khớp `skills/index.js`). */
export const KNOWN_TOOLS = ["generate_pptx", "generate_xlsx", "analyze_data", "edit_image", "open_image_studio", "list_files"];

/** Chuẩn hoá tên tool: nhận cả tên thật lẫn bí danh (`excel` → `generate_xlsx`). */
export function normaliseTools(raw) {
  const list = Array.isArray(raw) ? raw : String(raw ?? "").split(",");
  const out = [];
  for (const entry of list) {
    const key = String(entry).trim().toLowerCase();
    if (!key) continue;
    const name = KNOWN_TOOLS.includes(key) ? key : TOOL_ALIASES[key];
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

const CATEGORY_MAP = {
  "business-ops": "Bán hàng",
  "office-efficiency": "Văn phòng",
  "knowledge-management": "Văn phòng",
  "data-analysis": "Dữ liệu",
  "content-creation": "Nội dung",
  "design-media": "Nội dung",
  education: "Giáo dục",
};

/** Danh mục của SkillHub (tiếng Trung) → danh mục cố định của chợ kỹ năng. */
export function mapCategory(skillhubCategory, fallback = "Khác") {
  return CATEGORY_MAP[String(skillhubCategory ?? "").toLowerCase()] ?? fallback;
}

/** Slug ổn định để lần nhập sau khớp đúng dòng cũ. */
export function slugify(value, max = 60) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max);
}

function firstSentence(text, max = 200) {
  const flat = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!flat) return "";
  const stop = flat.search(/[.!?。！？]\s/);
  const cut = stop === -1 ? flat : flat.slice(0, stop + 1);
  return cut.length <= max ? cut : `${cut.slice(0, max - 1)}…`;
}

/**
 * Lấy chỉ dẫn của một skill: tìm `SKILL.md` trong danh sách tệp rồi đọc nội dung.
 * Trả kèm `files` để nơi gọi biết skill có tài nguyên gì.
 */
export async function readSkillInstructions(slug, options = {}) {
  const listing = await getSkillFiles(slug, { version: options.version }, options);
  const files = Array.isArray(listing?.files) ? listing.files : [];
  const entry = files.find((file) => /^skill\.md$/i.test(String(file.path ?? ""))) ??
    files.find((file) => /(^|\/)skill\.md$/i.test(String(file.path ?? "")));
  if (!entry) {
    return { instructions: "", data: {}, files, version: listing?.version ?? null, found: false };
  }
  const source = await readSkillFile(slug, { path: entry.path, version: listing?.version, ...options });
  const { data, body } = parseSkillMarkdown(source);
  return { instructions: body, data, files, version: listing?.version ?? null, found: true };
}

/**
 * Những thứ fBuddy **không** chạy được: skill kèm script/thư viện hoặc cần API key
 * riêng. Chợ chỉ lưu prompt pack + 6 công cụ dựng sẵn, nên các skill này chỉ nên
 * vào ở trạng thái `coming_soon` thay vì bán như đang chạy được.
 */
export function skillLimitations({ files = [], labels = null, data = {} } = {}) {
  const warnings = [];
  const scriptFiles = files.filter((file) => /^(scripts?|bin|lib)\//i.test(String(file.path ?? "")));
  if (scriptFiles.length) {
    warnings.push(
      `skill kèm ${scriptFiles.length} tệp script (${scriptFiles.slice(0, 3).map((f) => f.path).join(", ")}) — fBuddy không chạy được script, chỉ nhập phần chỉ dẫn`,
    );
  }
  const referenceFiles = files.filter((file) => /^(references?|docs?)\//i.test(String(file.path ?? "")));
  if (referenceFiles.length) {
    warnings.push(`skill có ${referenceFiles.length} tệp tham chiếu — chợ chỉ lưu một khối chỉ dẫn nên các tệp này bị bỏ`);
  }
  const needsKey = String(labels?.requires_api_key ?? "").toLowerCase() === "true";
  if (needsKey) warnings.push("skill cần API key riêng của nó — fBuddy không có chỗ cấu hình key cho từng skill");
  return { warnings, needsApiKey: needsKey, hasScripts: scriptFiles.length > 0, needsRuntime: scriptFiles.length > 0 || needsKey };
}

/**
 * Ghép một skill SkillHub thành bản nháp để đưa vào chợ kỹ năng của fBuddy.
 * Hàm thuần (không I/O) nên test được mà không cần mạng.
 */
export function toHubDraft(
  { skill, content } = {},
  { priceVnd = 50000, category, icon = "sparkles", state, slugPrefix = "", now } = {},
) {
  const source = skill ?? {};
  const slug = String(source.slug ?? "").trim();
  const instructions = fitInstructions(content?.instructions ?? "");
  const { warnings, needsRuntime, needsApiKey } = skillLimitations({
    files: content?.files ?? [],
    labels: source.labels ?? null,
    data: content?.data ?? {},
  });
  const summary = String(source.summary_zh ?? source.summary ?? content?.data?.description ?? "").trim();
  const name = String(source.displayName ?? source.name ?? content?.data?.name ?? slug).trim();
  const derivedState = state ?? (instructions.text ? (needsRuntime ? "coming_soon" : "published") : "coming_soon");
  return {
    slug: slugPrefix ? slugify(`${slugPrefix}-${slug}`) : slugify(slug || name),
    /** Slug gốc bên SkillHub — giữ lại để lần nhập sau vẫn khớp và để truy vết nguồn. */
    skillhubSlug: slug,
    name: name.slice(0, 120),
    tagline: firstSentence(summary).slice(0, 200),
    description: summary.slice(0, 2000),
    category: category ?? mapCategory(source.category),
    icon: String(icon).slice(0, 40),
    priceVnd: Math.max(0, Math.trunc(Number(priceVnd) || 0)),
    state: derivedState,
    instructions: instructions.text,
    instructionsTruncated: instructions.truncated,
    originalLength: instructions.originalLength,
    version: content?.version ?? null,
    tools: normaliseTools(content?.data?.tools ?? source.tools),
    warnings,
    needsApiKey,
    downloads: Number(source.downloads ?? source.stats?.downloads ?? 0) || 0,
    source: "skillhub",
    ...(now ? { importedAt: now } : {}),
  };
}

/** Một lần gọi đủ để nhập: chi tiết + tệp + chỉ dẫn → bản nháp cho chợ. */
export async function fetchSkillDraft(slug, draftOptions = {}, requestOptions = {}) {
  const [detail, content] = await Promise.all([
    getSkill(slug, requestOptions),
    readSkillInstructions(slug, requestOptions),
  ]);
  return toHubDraft({ skill: detail?.skill, content }, draftOptions);
}
