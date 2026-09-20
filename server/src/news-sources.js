/**
 * NGUỒN TIN MIỄN PHÍ (không cần khoá API) cho researcher.
 *
 * Vì sao cần: đường tìm kiếm web (DuckDuckGo HTML, hoặc Tavily khi có khoá) trả về trang web CHUNG
 * và phần lớn KHÔNG có ngày công bố — hỏi "tin AI mới nhất hôm nay" mà câu trả lời không nói được
 * tin ngày nào thì người dùng không kiểm chứng được độ mới. RSS là kênh các toà soạn TỰ PHÁT cho
 * máy đọc: mỗi mục đều có tiêu đề + link + GIỜ CÔNG BỐ, nên vừa nhanh vừa có ngày thật.
 *
 * Nguồn dùng ở đây:
 *   - Google News RSS (`news.google.com/rss/search`): tìm theo đúng câu hỏi, gộp nhiều báo, có toán
 *     tử `when:Nd` để giới hạn cửa sổ thời gian. Miễn phí, không cần khoá.
 *   - RSS trang chủ của 3 báo lớn VN (VnExpress, Tuổi Trẻ, Thanh Niên): lưới hứng tin nóng. Các
 *     feed này là tin CHUNG nên chỉ giữ mục khớp từ khoá câu hỏi (xem `isRelevantNews`).
 *
 * Không thêm dependency: XML đọc bằng regex — đủ cho RSS 2.0/Atom của các toà soạn này và không kéo
 * theo thư viện ngoài (repo cấm thêm dependency).
 *
 * Nguyên tắc KHÔNG BỊA: mục nào không đọc được ngày công bố thì trả `publishedAt: null`, KHÔNG lấy
 * giờ chạy máy làm giờ đăng — câu hỏi cần độ mới mà gắn ngày giả thì nguy hiểm hơn là nói "không rõ".
 */

const UA = "fBuddy-research/1.0 (+https://fbuddy.meetflowai.site; tracuu)";
const FETCH_TIMEOUT_MS = 6000;

export const GOOGLE_NEWS_ENDPOINT = "https://news.google.com/rss/search";

/** RSS trang chủ các báo lớn VN — đã fetch thật, đều trả 200 và có `pubDate` (đo 2026-09-20). */
export const NEWS_FEEDS = [
  { name: "VnExpress · Tin mới nhất", url: "https://vnexpress.net/rss/tin-moi-nhat.rss" },
  { name: "Tuổi Trẻ · Tin mới nhất", url: "https://tuoitre.vn/rss/tin-moi-nhat.rss" },
  { name: "Thanh Niên · Trang chủ", url: "https://thanhnien.vn/rss/home.rss" },
];

/**
 * Cửa sổ thời gian. "hôm nay" nới thành 2 NGÀY chứ không cắt ở 24 giờ: tin đăng 20h hôm qua vẫn là
 * tin mới nhất người dùng cần, cắt cứng 24h là mất oan.
 */
const WINDOW_DAYS = { d: 2, w: 7, m: 31 };
/** Toán tử lọc thời gian của Google News (phải để nguyên dấu `:` rồi encodeURIComponent cả query). */
const WINDOW_WHEN = { d: "when:2d", w: "when:7d", m: "when:30d" };

/** Cụm từ để hỏi / chỉ thời gian — bỏ khỏi truy vấn vì Google News đã lọc thời gian bằng `when:`. */
const QUESTION_WORDS = [
  "cho tôi", "cho mình", "cho em", "giúp tôi", "giúp mình", "làm ơn", "hãy", "tìm hiểu", "tìm kiếm",
  "tra cứu", "tin tức về", "tin về", "thông tin về", "tình hình", "diễn biến", "cập nhật",
  "mới nhất", "mới đây", "gần đây", "hiện nay", "hiện tại", "hôm nay", "hôm qua", "tuần này",
  "tuần trước", "tháng này", "năm nay", "bây giờ", "thế nào", "ra sao", "là gì", "có gì", "vừa ra",
];

const STOPWORDS = new Set([
  "và", "của", "cho", "về", "là", "có", "các", "những", "một", "nào", "này", "tại", "trên", "dưới",
  "trong", "ngoài", "the", "and", "for", "with", "tin", "tức",
]);

/** Chuẩn hoá: bỏ dấu câu, gộp khoảng trắng, hạ chữ thường. */
function normalize(text = "") {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const contentTokens = (text = "") =>
  normalize(text)
    .split(" ")
    .filter((word) => word.length >= 2 && !STOPWORDS.has(word));

/** Bỏ cụm từ để hỏi/chỉ thời gian, rồi bỏ "tin"/"bản tin" ở đầu câu ("tin AI mới nhất" ⇒ "ai"). */
function stripQuestionWords(text = "") {
  let out = ` ${normalize(text)} `;
  for (const phrase of QUESTION_WORDS) out = out.split(` ${phrase} `).join(" ");
  return contentTokens(out.replace(/(^|\s)(bản tin|tin tức|tin)(?=\s|$)/gu, " ")).join(" ");
}

/**
 * Dựng truy vấn cho Google News từ câu hỏi người dùng. Hàm THUẦN (không mạng, không thời gian) để
 * test được.
 *
 * Trả về mảng 1–2 truy vấn: bản "lõi" (đã bỏ từ để hỏi). Lõi từ 2 tiếng trở lên thì đủ rõ nên chỉ
 * dùng 1 truy vấn cho đỡ request; lõi 1 tiếng ("ai", "vàng") thì kèm bản đầy đủ để Google News có
 * thêm ngữ cảnh. Không dựng được gì (câu hỏi rỗng/toàn dấu câu) thì lùi về "tin mới nhất".
 */
export function buildNewsQueries(text = "") {
  const raw = normalize(text);
  const core = stripQuestionWords(raw);
  const candidates = contentTokens(core).length >= 2 ? [core] : [core, raw];
  const queries = [];
  for (const candidate of candidates) if (candidate && !queries.includes(candidate)) queries.push(candidate);
  return queries.length ? queries.slice(0, 2) : ["tin mới nhất"];
}

const clean = (text = "") =>
  String(text ?? "")
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    // Giải mã entity TRƯỚC khi bỏ thẻ. Mô tả của Google News bị escape (`&lt;a href=…&gt;`), nên nếu
    // bỏ thẻ trước thì thẻ vừa được giải mã sẽ nằm lại trong đoạn trích dưới dạng CHỮ — snippet biến
    // thành một chuỗi `a href="https://news.google.com/..."` vô nghĩa (đã gặp thật khi đo).
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function pickTag(block = "", tag = "") {
  const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i").exec(block);
  return match ? match[1] : "";
}

/** Chuỗi ngày của feed → ISO, hoặc null nếu không đọc được (KHÔNG đoán). */
function toIso(value = "") {
  const raw = clean(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function hostOf(url = "") {
  try {
    return new URL(String(url)).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * Đọc RSS 2.0 / Atom bằng regex → `{ title, url, publishedAt, source }`.
 *
 * Chỉ quét trong `<item>`/`<entry>`: thẻ `<title>` của `<channel>` cũng khớp regex nên nếu quét cả
 * tài liệu sẽ sinh ra một "tin" giả là tên feed. Mục thiếu tiêu đề hoặc thiếu link thì BỎ (không
 * dựng link từ tên báo). XML hỏng thì trả mảng rỗng — nguồn ngoài hỏng không được làm hỏng lượt tra.
 */
export function parseRssItems(xml = "") {
  const items = [];
  if (typeof xml !== "string" || !xml.trim()) return items;
  const blocks = xml.match(/<(?:item|entry)(?:\s[^>]*)?>[\s\S]*?<\/(?:item|entry)>/gi) ?? [];
  for (const block of blocks) {
    const title = clean(pickTag(block, "title"));
    // RSS để link trong thẻ có chữ; Atom để trong thuộc tính href của thẻ rỗng.
    const url = clean(pickTag(block, "link")) || /<link[^>]*href="([^"]+)"/i.exec(block)?.[1] || "";
    if (!title || !url) continue;
    const published = pickTag(block, "pubDate") || pickTag(block, "published") || pickTag(block, "updated") || pickTag(block, "dc:date");
    items.push({
      title: title.slice(0, 300),
      url: url.slice(0, 500),
      publishedAt: toIso(published),
      // Google News để tên toà soạn trong `<source>`; feed của báo thì không có ⇒ lấy tên miền.
      source: clean(pickTag(block, "source")).slice(0, 80) || hostOf(url),
      snippet: clean(pickTag(block, "description") || pickTag(block, "summary")).slice(0, 240),
    });
  }
  return items;
}

/** Mục có nằm trong hạn `maxAgeDays` không. Mục KHÔNG có ngày bị loại khi đang lọc theo độ mới. */
export function filterFresh(items = [], maxAgeDays = 0) {
  if (!maxAgeDays) return [...items];
  const cutoff = Date.now() - maxAgeDays * 86400000;
  return items.filter((item) => {
    if (!item?.publishedAt) return false;
    const at = new Date(item.publishedAt).getTime();
    return !Number.isNaN(at) && at >= cutoff;
  });
}

/**
 * Tin này có dính tới câu hỏi không — dùng cho các feed TIN CHUNG (trang chủ báo), vì feed đó không
 * lọc theo câu hỏi nên nhồi hết vào là lạc đề.
 *
 * Khớp theo CỤM trước, rồi mới tới khớp ĐỦ các từ khoá. Hai cái bẫy đã gặp thật khi đo:
 *   - Khớp chuỗi con cho từ khoá ngắn: "ai" là chuỗi con của "hai", "mai", "vai".
 *   - Khớp RỜI từng tiếng: câu hỏi "công nghệ" lại nhận bài "Dịch vụ công ở TP.HCM" vì có tiếng
 *     "công" — tiếng Việt tách bằng dấu cách nên một tiếng không phải một từ.
 */
export function isRelevantNews(item = {}, question = "") {
  const core = buildNewsQueries(question)[0] ?? "";
  const keys = contentTokens(core);
  if (!keys.length) return true;
  const title = String(item.title ?? "").toLowerCase();
  const haystack = `${title} ${String(item.snippet ?? "").toLowerCase()}`;
  // Cụm từ 2 tiếng trở lên thì khớp cả cụm là tín hiệu mạnh nhất ("giá vàng", "công nghệ").
  if (core.includes(" ") && haystack.includes(core)) return true;
  const words = new Set(title.split(/[^\p{L}\p{N}]+/u).filter(Boolean));
  return keys.every((key) => (key.length >= 4 ? haystack.includes(key) : words.has(key)));
}

async function getText(url, timeoutMs) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

/**
 * Lấy tin theo câu hỏi. Trả danh sách gọn, mới nhất trước, mỗi mục có `publishedAt` thật.
 *
 * Chạy song song (Google News theo câu hỏi + 3 feed trang chủ) và KHÔNG ném lỗi: nguồn nào hỏng thì
 * chỉ mất nguồn đó — researcher vẫn phải trả lời được.
 *
 * @param {{ question?: string, limit?: number, timeoutMs?: number, window?: "d"|"w"|"m"|null }} input
 */
export async function fetchNews({ question = "", limit = 8, timeoutMs = FETCH_TIMEOUT_MS, window = null } = {}) {
  const queries = buildNewsQueries(question).slice(0, 2);
  const when = WINDOW_WHEN[window] ?? WINDOW_WHEN.w;
  const maxAgeDays = WINDOW_DAYS[window] ?? WINDOW_DAYS.w;

  const jobs = queries.map((query) =>
    getText(`${GOOGLE_NEWS_ENDPOINT}?q=${encodeURIComponent(`${query} ${when}`)}&hl=vi&gl=VN&ceid=VN:vi`, timeoutMs)
      .then((xml) => parseRssItems(xml))
      .catch(() => []),
  );
  for (const feed of NEWS_FEEDS) {
    jobs.push(
      getText(feed.url, timeoutMs)
        .then((xml) => parseRssItems(xml).map((item) => ({ ...item, source: feed.name })))
        .catch(() => []),
    );
  }

  const groups = await Promise.all(jobs);
  const merged = [];
  const seenUrl = new Set();
  const seenTitle = new Set();
  groups.forEach((group, index) => {
    // Nhóm đầu là Google News (đã tìm đúng theo câu hỏi) ⇒ nhận hết; các nhóm sau là feed tin chung
    // của báo ⇒ phải khớp từ khoá câu hỏi mới nhận.
    const fromSearch = index < queries.length;
    for (const item of group) {
      if (!fromSearch && !isRelevantNews(item, question)) continue;
      const titleKey = normalize(item.title);
      if (!item.url || seenUrl.has(item.url) || seenTitle.has(titleKey)) continue;
      seenUrl.add(item.url);
      seenTitle.add(titleKey);
      merged.push(item);
    }
  });

  return filterFresh(merged, maxAgeDays)
    .sort((a, b) => String(b.publishedAt ?? "").localeCompare(String(a.publishedAt ?? "")))
    .slice(0, limit)
    .map((item) => ({
      title: item.title,
      url: item.url,
      publishedAt: item.publishedAt,
      source: item.source || hostOf(item.url),
      snippet: item.snippet ?? "",
    }));
}
