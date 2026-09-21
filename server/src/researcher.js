/**
 * TẦNG RESEARCHER — để fBuddy TRA rồi mới nói, thay vì trả lời nhanh mà sai.
 *
 * Vì sao cần: fBuddy đã trả lời "biển 29A-123.45 ở Hà Nội, cùng nhóm 29,30,31,32,33,40,**41**"
 * — 41 không phải Hà Nội. Mã tỉnh, điều luật, ngày hiệu lực, giá thị trường… là DỮ LIỆU TRA ĐƯỢC;
 * để model nhớ rồi đoán là sai một cách tự tin, tệ hơn là nói "để em tra".
 *
 * Cách làm: mỗi câu hỏi cần dữ kiện được giao cho một RESEARCHER (hồ sơ nguồn theo lĩnh vực).
 * Researcher tìm trên nhiều nguồn, đọc nội dung thật, rồi trả về: phát hiện kèm URL, mức chắc chắn,
 * và cả những chỗ các nguồn MÂU THUẪN nhau. Model chỉ được thuật lại phần có nguồn; không thấy thì
 * phải nói chưa chắc.
 *
 * Nguồn đang dùng:
 *   - Wikipedia (vi/en) qua API chính thức: ổn định, có cấu trúc, ghi rõ nguồn.
 *   - vanban.chinhphu.vn: văn bản pháp luật nhà nước (ưu tiên cho câu hỏi luật/thuế/xử phạt).
 *   - Dữ liệu biển số đã kiểm chứng trong repo (`data/vn-plate-codes.json`).
 *   - Tìm kiếm web: NHIỀU ĐƯỜNG ĐỘC LẬP (`SEARCH_CHANNELS`) chạy SONG SONG, mỗi đường có timeout và
 *     try/catch riêng nên một đường chết KHÔNG làm chết cả lượt tra; đường nào rỗng thì mới rơi
 *     xuống đường dự phòng. Đường nào đã dùng, được bao nhiêu kết quả, vì sao rỗng — ghi hết vào
 *     `result.searchChannels`. Khi KHÔNG có nguồn nào thì câu trả lời phải nêu lý do TỪNG đường,
 *     tuyệt đối không nói chung chung "không tra được nguồn ngoài".
 *       · Tavily — chỉ khi có `SEARCH_API_KEY`.
 *       · DuckDuckGo HTML + biến thể `lite.duckduckgo.com/lite/`. Miễn phí, nhưng IP bị captcha là
 *         chuyện thường gặp: gặp 202/captcha thì đường đó tự khai "bị chặn" chứ không im lặng trả rỗng
 *         rồi để tầng trên kết luận sai là "internet không có gì".
 *       · Bing HTML — miễn phí, không cần khoá; URL thật nằm trong tham số `u=a1…` của link chuyển
 *         hướng. Đo thật: Bing từ IP lạ trả về cả kết quả KHÔNG khớp truy vấn, nên đường này có cổng
 *         lọc liên quan riêng (`isRelevantHit`).
 *       · SearXNG công khai (`search.disroot.org`) — chỉ chạy khi các đường chính đã rỗng; instance
 *         công khai hay bị giới hạn tần suất nên không được để nó nằm trên đường chính.
 *       · Wikipedia API `action=query&list=search` cho câu bách khoa/địa lý/lịch sử.
 *   - Tin tức: `news-sources.js` (Google News RSS + RSS báo lớn VN), miễn phí và KHÔNG cần khoá. Dùng
 *     khi câu hỏi cần độ mới; với hồ sơ CHỈ nhận nguồn chính thống thì dùng thêm Google News
 *     `site:gov.vn` / `site:chinhphu.vn` để lấy tin CÓ NGÀY công bố từ cổng nhà nước. Lượt gọi RSS
 *     chạy SONG SONG với tìm kiếm web (không cộng thêm thời gian chờ) và được cache vài phút.
 *   - ĐỌC NỘI DUNG TRANG (phần "đọc nguồn" giống ChatGPT): lấy 3–4 kết quả đầu, tải SONG SONG, trích
 *     các thẻ `<p>` sau khi bỏ nav/script/style, tối đa ~1.200 ký tự/trang, tổng ngân sách ~6 s. Nhờ
 *     vậy `findings` có DỮ KIỆN để trả lời chứ không chỉ tiêu đề + link.
 *
 * Nguyên tắc: KHÔNG bịa. Không tìm thấy ⇒ trả `confidence: "thap"` kèm lời nhắc nói thẳng là chưa
 * chắc và chỉ người dùng tới nguồn chính thức.
 */

/**
 * Nguồn tin miễn phí (Google News RSS + RSS báo lớn VN) — dùng khi tìm kiếm web không cho được tin
 * có ngày công bố. Xem `news-sources.js` để biết vì sao chọn RSS và vì sao không cần khoá API.
 */
import { fetchNews } from "./news-sources.js";

const UA = "fBuddy-research/1.0 (+https://fbuddy.meetflowai.site; tracuu)";
const FETCH_TIMEOUT_MS = 12000;
/**
 * NGÂN SÁCH THỜI GIAN — mỗi tầng có hạn riêng, vì người dùng không được chờ vô hạn chỉ vì một nguồn
 * ngoài chậm. Tổng cho MỘT câu hỏi bị chặn trần ở `RESEARCH_BUDGET_MS`.
 */
const SEARCH_TIMEOUT_MS = 5500;
const FALLBACK_TIMEOUT_MS = 4000;
const PAGE_TIMEOUT_MS = 3500;
/** Hạn cho cả giai đoạn tìm kiếm (đường chính + đường dự phòng). */
const SEARCH_BUDGET_MS = 6500;
/** Hạn cho giai đoạn đọc nội dung trang (chạy song song, tự cắt). */
const READ_BUDGET_MS = 5500;
/** Hạn CỨNG cho một lượt tra cứu — yêu cầu: không quá ~12 s/câu. */
const RESEARCH_BUDGET_MS = SEARCH_BUDGET_MS + READ_BUDGET_MS;
/** Chưa đủ ngần này kết quả thì mới bỏ thêm thời gian chạy các đường dự phòng. */
const MIN_HITS_BEFORE_FALLBACK = 3;
const SEARCH_RESULT_LIMIT = 5;
/**
 * Ngân sách thời gian cho lượt bổ sung bằng RSS: chạy SONG SONG và tự cắt, vì đây là phần thêm vào
 * chứ không phải đường chính — nguồn tin chậm không được kéo dài thời gian người dùng phải chờ.
 */
const NEWS_TIMEOUT_MS = 6000;
const CACHE_TTL_MS = 10 * 60 * 1000;
/**
 * Cache riêng cho kết quả RSS: ngắn hơn cache tra cứu vì tin thời sự đổi theo giờ, nhưng đủ để câu
 * hỏi lặp lại (người dùng hỏi lại, hoặc model gọi `tra_cuu` cùng câu) trả về tức thì.
 */
const NEWS_CACHE_TTL_MS = 5 * 60 * 1000;
const NEWS_LIMIT = 8;
/** Số trang đọc nội dung cho một lượt tra — yêu cầu: 3–5 kết quả đầu. */
const MAX_FETCH_PAGES = 4;
/** Trần ký tự lấy từ mỗi trang: đủ để có dữ kiện, không nhồi cả bài vào prompt. */
const MAX_PAGE_CHARS = 1200;

/**
 * NGUỒN CHÍNH THỐNG — thông tin về chính phủ, thủ tục, chính sách, luật thì CHỈ được lấy từ đây.
 *
 * `.gov.vn` là tên miền dành riêng cho cơ quan nhà nước Việt Nam (không ai khác đăng ký được), nên
 * đó là tiêu chí lọc đáng tin. Thêm các tổ chức quốc tế có tên miền chính thức để câu hỏi quốc tế
 * cũng có nguồn. Blog, diễn đàn, trang tổng hợp, hay "trang luật" thương mại KHÔNG tính là chính
 * thống — chúng có thể đúng, nhưng câu trả lời về nhà nước phải dựa vào văn bản gốc.
 */
const OFFICIAL_DOMAINS = [
  "chinhphu.vn",
  "quochoi.vn",
  "vbpl.vn",
  "dichvucong.gov.vn",
  "vanban.chinhphu.vn",
  "xaydungchinhsach.chinhphu.vn",
  "congbao.chinhphu.vn",
  "who.int",
  "un.org",
  "worldbank.org",
  "imf.org",
  "oecd.org",
  "europa.eu",
  "gov.uk",
  "usa.gov",
];

/** URL này có phải nguồn chính thống không? */
export function isOfficialUrl(url = "") {
  const value = String(url);
  if (/\.gov\.vn(\/|$|\?)/i.test(value)) return true;
  if (/\.gov(\/|$|\?)/i.test(value)) return true;
  if (/\.gov\.[a-z]{2}(\/|$|\?)/i.test(value)) return true;
  if (/\.mil(\/|$|\?)/i.test(value)) return true;
  return OFFICIAL_DOMAINS.some((domain) => value.includes(domain));
}

/**
 * Hồ sơ researcher: nhận diện lĩnh vực và biết phải ưu tiên nguồn nào.
 *
 * Mỗi hồ sơ là một "chuyên viên tra cứu" khác nhau: cùng một câu hỏi nhưng nguồn đáng tin khác
 * nhau. `special` là các nguồn có cấu trúc (API), dùng trước khi đọc web chung.
 */
export const RESEARCHER_PROFILES = [
  {
    id: "bien-so",
    label: "Biển số & đăng ký xe",
    detect: /biển\s*(số|kiểm soát|xe|tỉnh)|bks|bsx|đăng ký xe|mã tỉnh|biển vàng|biển xanh|cà vẹt|đăng kiểm/i,
    wikiTitles: ["Biển xe cơ giới Việt Nam"],
    preferDomains: ["vi.wikipedia.org", "chinhphu.vn", "csgt.vn", "vre.org.vn"],
  },
  {
    id: "dia-ly",
    label: "Địa lý & địa danh",
    detect: /địa lý|địa danh|thủ đô|thành phố nào|tỉnh nào|quốc gia|nước nào|châu lục|sông|núi|biển|diện tích|dân số|toạ độ|vĩ độ|kinh độ|giáp|biên giới|bản đồ|khí hậu|vùng nào/i,
    wikiTitles: [],
    preferDomains: ["vi.wikipedia.org", "en.wikipedia.org"],
    special: ["places", "countries"],
  },
  {
    id: "van-hoa",
    label: "Văn hoá, lịch sử, tín ngưỡng",
    detect: /văn hoá|văn hóa|phong tục|truyền thống|lễ hội|tín ngưỡng|tâm linh|tôn giáo|đạo |phật|chùa|nhà thờ|hồi giáo|kinh thánh|kinh phật|lịch sử|triều đại|ngày lễ|kiêng|may mắn|xui|tử vi|phong thuỷ|phong thủy/i,
    wikiTitles: [],
    preferDomains: ["vi.wikipedia.org", "en.wikipedia.org"],
  },
  {
    id: "giao-duc",
    label: "Giáo dục & học tập",
    detect: /giáo dục|giáo án|chương trình học|sách giáo khoa|sgk|thi |kỳ thi|tuyển sinh|đại học|học sinh|sinh viên|điểm chuẩn|lớp \d|môn học|bài giảng|kiến thức phổ thông|bài tập|đề thi|chứng chỉ|ielts|toefl|ket|pet/i,
    wikiTitles: [],
    preferDomains: ["vi.wikipedia.org", "moet.gov.vn", "en.wikipedia.org"],
    special: ["wikipedia"],
  },
  {
    id: "kinh-te",
    label: "Kinh tế & số liệu thị trường (phải là số mới nhất)",
    detect:
      /kinh tế|gdp|gni|lạm phát|cpi|tỷ giá|tỉ giá|ngoại tệ|lãi suất|ngân hàng|chứng khoán|vn-?index|hose|hnx|cổ phiếu|trái phiếu|giá vàng|vàng sjc|giá xăng|giá dầu|bitcoin|btc|eth|tiền mã hoá|tiền ảo|crypto|doanh thu|lợi nhuận|xuất khẩu|nhập khẩu|cán cân thương mại|thất nghiệp|tăng trưởng|thu nhập bình quân|bình quân đầu người|đầu tư công|fdi|giải ngân|ngân sách|nợ công|giá cả thị trường|bảng giá/i,
    wikiTitles: [],
    // Số liệu kinh tế luôn phải nêu KỲ (năm/quý/ngày) và nguồn; không có số mới thì nói chưa có.
    requiresFresh: true,
    preferDomains: [
      "gso.gov.vn",
      "sbv.gov.vn",
      "mof.gov.vn",
      "gdt.gov.vn",
      "customs.gov.vn",
      "mpi.gov.vn",
      "worldbank.org",
      "imf.org",
      "oecd.org",
      "adb.org",
      "data.un.org",
      "fred.stlouisfed.org",
      "chinhphu.vn",
    ],
    // Nguồn số liệu sống chạy trước: tỷ giá, tiền mã hoá, chỉ số vĩ mô.
    special: ["exchangeRates", "crypto", "worldbank"],
    siteQueries: ["site:gso.gov.vn", "site:sbv.gov.vn"],
  },
  {
    id: "toan-hoc",
    label: "Toán học",
    detect:
      /toán|phương trình|đạo hàm|tích phân|hình học|định lý|công thức|logarit|xác suất|thống kê|số nguyên tố|ma trận|vector|chứng minh|tính toán|bài toán|phần trăm|%|trung bình cộng|chia hết|ước chung|bội chung|lãi suất|tỷ lệ|tỉ lệ/i,
    wikiTitles: [],
    preferDomains: ["vi.wikipedia.org", "en.wikipedia.org", "mathworld.wolfram.com"],
    // Toán thì phép tính phải do công cụ `tinh_toan` làm, không phải do tra web — tra web chỉ để
    // lấy định nghĩa/công thức. Nhắc thẳng trong kết quả để model không "tra ra số rồi chép".
    note: "Phép tính cụ thể phải gọi `tinh_toan`; tra cứu chỉ để lấy định nghĩa, công thức, định lý.",
  },
  {
    id: "ai",
    label: "AI & công nghệ",
    detect: /\bai\b|trí tuệ nhân tạo|mô hình|model|llm|gpt|transformer|học máy|machine learning|deep learning|neural|dataset|benchmark|thuật toán|api|framework|thư viện|lập trình|python|javascript|docker|kubernetes|arxiv|paper/i,
    wikiTitles: [],
    preferDomains: ["arxiv.org", "vi.wikipedia.org", "en.wikipedia.org", "github.com", "huggingface.co"],
    special: ["arxiv", "wikipedia"],
  },
  {
    id: "chinh-phu",
    label: "Chính phủ & thủ tục nhà nước (chỉ nguồn chính thống)",
    detect:
      /chính phủ|thủ tướng|quốc hội|bộ \w+|ubnd|uỷ ban|ủy ban|thủ tục hành chính|hồ sơ|dịch vụ công|nghị định|nghị quyết|quyết định \d|công văn|chính sách|pháp luật|quy định của nhà nước|trợ cấp|bảo hiểm xã hội|bhxh|hộ khẩu|tạm trú|visa|thị thực|xuất nhập cảnh|hải quan|thuế thu nhập|đăng ký kinh doanh|giấy phép|xử phạt hành chính|đất đai|sổ đỏ|hộ chiếu|căn cước|xã |phường|tỉnh uỷ|thành uỷ|cơ quan nhà nước/i,
    wikiTitles: [],
    // CHỈ những miền này mới được dùng — không có thì phải nói chưa tra được nguồn chính thống.
    strictOfficial: true,
    preferDomains: ["chinhphu.vn", "vanban.chinhphu.vn", "vbpl.vn", "dichvucong.gov.vn", "quochoi.vn", "gov.vn"],
    siteQueries: ["site:gov.vn", "site:chinhphu.vn", "site:vbpl.vn"],
  },
  {
    id: "phap-luat",
    label: "Pháp luật & văn bản nhà nước",
    detect: /luật|nghị định|thông tư|nghị quyết|quy định|điều \d+|khoản \d+|xử phạt|mức phạt|thuế|hợp đồng|pháp lý|giấy phép|thủ tục|hồ sơ/i,
    wikiTitles: [],
    preferDomains: ["vanban.chinhphu.vn", "chinhphu.vn", "thuvienphapluat.vn", "luatvietnam.vn", "vi.wikipedia.org"],
  },
  {
    id: "chung",
    label: "Tra cứu chung",
    detect: () => true,
    wikiTitles: [],
    preferDomains: ["vi.wikipedia.org", "en.wikipedia.org"],
    special: ["wikipedia"],
  },
];

/** Chọn researcher phù hợp nhất với câu hỏi. */
export function pickResearcher(question = "") {
  for (const profile of RESEARCHER_PROFILES) {
    if (profile.id !== "chung" && profile.detect.test(String(question))) return profile;
  }
  return RESEARCHER_PROFILES[RESEARCHER_PROFILES.length - 1];
}

const cache = new Map();

function cacheKey(question, domain) {
  return `${domain}:${String(question).toLowerCase().replace(/\s+/g, " ").trim()}`;
}

/** Cache kết quả RSS: `key -> { at, value }` (giá trị đã lấy xong) hoặc `{ at, pending }` (đang lấy). */
const newsCache = new Map();

/**
 * Khoá cache RSS theo CÂU HỎI ĐÃ CHUẨN HOÁ (bỏ dấu câu, gộp khoảng trắng, hạ chữ thường) + cửa sổ
 * thời gian: "Giá vàng hôm nay?" và "giá  vàng hôm nay" là cùng một câu hỏi nên phải dùng chung kết
 * quả. Cửa sổ nằm trong khoá vì nó đổi cả truy vấn `when:` lẫn hạn lọc độ mới.
 */
function newsCacheKey(question, window) {
  const normalized = String(question ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `${window ?? "w"}:${normalized}`;
}

/**
 * Gọi RSS có cache. Hai câu hỏi giống nhau trong vòng `NEWS_CACHE_TTL_MS` chỉ tốn ĐÚNG một lượt mạng;
 * lượt đang chạy dở cũng được chia sẻ (lưu `pending`) nên hai lượt tra song song không nhân đôi request.
 *
 * KHÔNG bao giờ ném lỗi (nguồn tin hỏng chỉ được làm giảm dữ liệu, không được làm hỏng lượt tra) —
 * nhờ vậy chỗ gọi có thể bỏ qua promise này mà không sinh unhandled rejection.
 */
function fetchNewsCached({ question = "", window = null } = {}) {
  const key = newsCacheKey(question, window);
  const hit = newsCache.get(key);
  if (hit?.pending) return hit.pending;
  if (hit?.value && Date.now() - hit.at < NEWS_CACHE_TTL_MS) return Promise.resolve(hit.value);
  const pending = fetchNews({ question, window, limit: NEWS_LIMIT, timeoutMs: NEWS_TIMEOUT_MS })
    .catch(() => [])
    .then((items) => {
      newsCache.set(key, { at: Date.now(), value: items });
      return items;
    });
  newsCache.set(key, { at: Date.now(), pending });
  return pending;
}

async function getText(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,application/json" }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

/** HTML → chữ: bỏ script/style/thẻ, gộp khoảng trắng. Đủ tốt để trích đoạn có nội dung. */
function htmlToText(html = "") {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Câu hỏi có cần ĐỘ MỚI không? (giá, tin, sự kiện, "mới nhất", "hiện nay"…)
 * Quyết định: tra theo bộ lọc thời gian, ưu tiên nguồn mới, và KHÔNG để Wikipedia dẫn dắt.
 */
const RECENCY_RE =
  /mới nhất|mới đây|gần đây|hiện nay|hiện tại|hôm nay|hôm qua|tuần này|tháng này|quý này|năm nay|vừa ra|mới ra|cập nhật|thời sự|tin tức|tin mới|giá |giá cả|tỷ giá|tỉ giá|lãi suất|chứng khoán|vn-?index|vàng|xăng|dầu|bitcoin|tỷ số|kết quả|bảng xếp hạng|xếp hạng|doanh thu|ra mắt|phát hành|phiên bản/i;

/**
 * MỐC THỜI GIAN NGƯỜI DÙNG ĐANG HỎI — tính theo giờ Việt Nam (UTC+7), không phải giờ máy chủ.
 *
 * Vì sao quan trọng: server chạy UTC, nên nếu lấy `new Date()` trực tiếp thì 6 giờ sáng ở Việt Nam
 * vẫn là "ngày hôm qua" theo UTC — truy vấn "hôm nay" sẽ tìm sai ngày. Máy chủ đặt ở nước ngoài thì
 * sai càng nặng. Mọi câu hỏi kiểu "hôm nay", "bây giờ", "mới nhất" đều phải dùng mốc này.
 */
export function vnNow() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "long",
    hour12: false,
  }).formatToParts(now);
  const get = (type) => parts.find((part) => part.type === type)?.value ?? "";
  const day = get("day");
  const month = get("month");
  const year = get("year");
  return {
    iso: `${year}-${month}-${day}`,
    /** 20/09/2026 — dạng người Việt viết. */
    date: `${day}/${month}/${year}`,
    /** "20 tháng 9 năm 2026" — dạng dùng để tìm kiếm. */
    longDate: `${Number(day)} tháng ${Number(month)} năm ${year}`,
    time: `${get("hour")}:${get("minute")}`,
    weekday: get("weekday"),
    stamp: `${get("hour")}:${get("minute")} ngày ${day}/${month}/${year} (${get("weekday")}, giờ Việt Nam)`,
  };
}

/**
 * Ngày theo LỊCH VIỆT NAM (UTC+7), dạng `YYYY-MM-DD`.
 *
 * Vì sao không cắt thẳng chuỗi ISO: server chạy UTC, nên một tin đăng 00:30 ngày 20/9 giờ Việt Nam
 * là `2026-09-19T17:30Z` — cắt ISO sẽ ghi thành tin của ngày 19/9, tức là nói SAI ngày công bố đúng
 * một ngày. Đây là chỗ người dùng dựa vào để biết tin mới hay cũ.
 */
function vnDate(date) {
  const parts = new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * Cửa sổ thời gian cần lọc: hỏi "hôm nay" ⇒ lọc trong NGÀY, "tuần này" ⇒ tuần, còn lại ⇒ tháng.
 * DuckDuckGo nhận `df=d|w|m|y`.
 */
function freshnessWindow(question = "") {
  const text = String(question).toLowerCase();
  if (/hôm nay|hôm qua|bây giờ|hiện tại|vừa mới|mới nhất trong ngày|đang /.test(text)) return "d";
  if (/tuần này|tuần trước|7 ngày/.test(text)) return "w";
  return "m";
}

export function needsFreshness(question = "") {
  return RECENCY_RE.test(String(question));
}

/**
 * Trích ngày từ một đoạn văn — để biết nguồn này mới hay cũ.
 *
 * Ngày chỉ có ngày–tháng–năm (không có giờ) được dựng ở mốc **UTC**, không phải nửa đêm giờ máy:
 * `new Date(2026, 8, 20)` là nửa đêm giờ máy, mà máy chủ có thể lệch múi giờ (máy harness ở đây là
 * GMT+8, VPS là UTC) nên khi quy về lịch Việt Nam sẽ ra NGÀY HÔM TRƯỚC. Gặp thật: tin "20 thg 9,
 * 2026" bị ghi thành 2026-09-19 — sai đúng một ngày, mà đây là chỗ người dùng dựa vào để biết tin
 * mới hay cũ.
 *
 * `allowRelative` mặc định TẮT, và đó là chủ ý: chữ "hôm nay"/"mới nhất" trong BÀI VIẾT không phải
 * ngày công bố của bài. Đo thật: trang wiki về "Thời sự (VTV)", "VTV1" — bài cũ nhiều năm — vẫn có
 * câu "hôm nay" nên bị gắn ngày chạy máy, rồi xếp LÊN TRÊN tin thật của báo. Chỉ bật khi nguồn là
 * dữ liệu máy đọc (RSS, nhãn `result__timestamp` của DuckDuckGo) — ở đó mốc tương đối do chính nguồn
 * sinh ra nên là ngày công bố thật.
 *
 * @param {string} text
 * @param {{ allowRelative?: boolean }} [options]
 */
export function extractDate(text = "", { allowRelative = false } = {}) {
  const raw = String(text);
  const now = Date.now();
  if (allowRelative) {
    const relative = /(\d+)\s*(phút|giờ|ngày|tuần|tháng)\s*trước/i.exec(raw);
    if (relative) {
      const amount = Number(relative[1]);
      const unit = relative[2].toLowerCase();
      const ms = { "phút": 60000, "giờ": 3600000, "ngày": 86400000, "tuần": 604800000, "tháng": 2592000000 }[unit] ?? 86400000;
      return new Date(now - amount * ms);
    }
    if (/hôm nay|vừa xong|mới đăng/i.test(raw)) return new Date(now);
    if (/hôm qua/i.test(raw)) return new Date(now - 86400000);
  }
  const dmy = /\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})\b/.exec(raw);
  if (dmy) {
    const date = new Date(Date.UTC(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1])));
    if (!Number.isNaN(date.getTime())) return date;
  }
  const ymd = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(raw);
  if (ymd) {
    const date = new Date(Date.UTC(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3])));
    if (!Number.isNaN(date.getTime())) return date;
  }
  const vn = /\b(\d{1,2})\s*tháng\s*(\d{1,2})\s*năm\s*(\d{4})/i.exec(raw);
  if (vn) {
    const date = new Date(Date.UTC(Number(vn[3]), Number(vn[2]) - 1, Number(vn[1])));
    if (!Number.isNaN(date.getTime())) return date;
  }
  // Ngày công bố của DuckDuckGo: giao diện tiếng Việt in "20 thg 9, 2026", tiếng Anh in "Sep 20, 2026".
  const thgVi = /\b(\d{1,2})\s*thg\s*(\d{1,2}),?\s*(\d{4})/i.exec(raw);
  if (thgVi) {
    const date = new Date(Date.UTC(Number(thgVi[3]), Number(thgVi[2]) - 1, Number(thgVi[1])));
    if (!Number.isNaN(date.getTime())) return date;
  }
  const monthEn = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/i.exec(raw);
  if (monthEn) {
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const date = new Date(Date.UTC(Number(monthEn[3]), months.indexOf(monthEn[1].slice(0, 3).toLowerCase()), Number(monthEn[2])));
    if (!Number.isNaN(date.getTime())) return date;
  }
  return null;
}

/** Tìm kiếm web: Tavily nếu có khoá, còn không thì HTML DuckDuckGo. */
async function webSearch(query, limit = 5, { fresh = null } = {}) {
  const key = String(process.env.SEARCH_API_KEY ?? "").trim();
  if (key) {
    try {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: key, query, max_results: limit, search_depth: "basic" }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (res.ok) {
        const json = await res.json();
        return (json.results ?? []).map((r) => ({ title: r.title, url: r.url, snippet: String(r.content ?? "").slice(0, 400) }));
      }
    } catch {
      /* rơi xuống DuckDuckGo */
    }
  }
  try {
    // `df` = lọc theo thời gian của DuckDuckGo: d=ngày, w=tuần, m=tháng — CHỈ gắn khi câu hỏi cần độ
    // mới (`needsFreshness`), câu thường vẫn hỏi như trước. Không có `df` thì kết quả trả về bài cũ
    // và câu trả lời "không hề latest" (đúng phản hồi của người dùng).
    // `kl=vn-vn` neo kết quả về Việt Nam: fBuddy phục vụ người Việt, để mặc định (không `kl`) thì
    // hỏi "giá vàng hôm nay" rất dễ nhận bảng giá vàng thế giới thay vì giá SJC/DOJI trong nước.
    const filter = fresh ? `&df=${fresh}` : "";
    const html = await getText(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=vn-vn${filter}`);
    const results = [];
    const re = /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    let match;
    while ((match = re.exec(html)) && results.length < limit) {
      let url = match[1];
      const decoded = /uddg=([^&]+)/.exec(url);
      if (decoded) {
        try { url = decodeURIComponent(decoded[1]); } catch { /* giữ nguyên */ }
      }
      // Đoạn mô tả nằm SAU thẻ tiêu đề nên phải cắt riêng trong khoảng tới kết quả kế tiếp: bản cũ
      // nhét `[\s\S]*?(?:class="result__snippet"…)?` vào cùng một regex, nhưng nhóm tuỳ chọn sau
      // lượng tử lười luôn khớp RỖNG ⇒ snippet không bao giờ lấy được, nên kết quả DuckDuckGo không
      // vào được danh sách phát hiện (`findings` chỉ nhận mục có snippet).
      const raw = html.slice(re.lastIndex, re.lastIndex + 2000);
      // Cắt tại kết quả KẾ TIẾP: không cắt thì ngày của kết quả sau bị gán cho kết quả này.
      const nextAt = raw.search(/class="result__a"/);
      const tail = nextAt > 0 ? raw.slice(0, nextAt) : raw;
      const snippetHtml = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/.exec(tail)?.[1] ?? "";
      const title = htmlToText(match[2]).slice(0, 160);
      const snippet = htmlToText(snippetHtml).slice(0, 400);
      results.push({ title, url, snippet, publishedAt: ddgPublishedAt(tail, `${title} ${snippet}`) });
    }
    return results;
  } catch {
    return [];
  }
}

/**
 * NGÀY CÔNG BỐ của một kết quả DuckDuckGo — chỉ trả khi HTML thật sự có, không thì `null`.
 *
 * DuckDuckGo bọc ngày trong `<span class="result__timestamp">` cho MỘT PHẦN kết quả; phần lớn thì
 * không có ngày nào. Câu hỏi cần độ mới mà gắn ngày chạy máy vào thì người dùng bị lừa về độ mới,
 * nên nguyên tắc ở đây là: không đọc được ⇒ để null và để tầng trên tự nói "không rõ ngày".
 */
function ddgPublishedAt(block = "", text = "") {
  const stamp = /class="result__timestamp"[^>]*>([\s\S]*?)</.exec(String(block))?.[1];
  if (stamp) {
    // Nhãn `result__timestamp` do DuckDuckGo sinh cho ô kết quả ⇒ mốc tương đối ("3 giờ trước") ở
    // đây vẫn là NGÀY CÔNG BỐ thật, khác hẳn chữ "hôm nay" nằm trong tiêu đề bài viết.
    const date = extractDate(stamp, { allowRelative: true });
    if (date) return vnDate(date);
  }
  // Không có nhãn ngày của DuckDuckGo thì chỉ nhận ngày ghi ĐỦ ngày–tháng–năm trong tiêu đề/mô tả.
  // Cố ý KHÔNG dùng các mẫu tương đối ("hôm nay", "3 giờ trước", "hôm qua"): câu hỏi kiểu "tin AI
  // mới nhất hôm nay" hay bài viết tiêu đề "Giá vàng hôm nay" đều chứa đúng mấy chữ đó, gán ngày
  // hôm nay cho chúng là bịa ngày công bố.
  const structured = /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[/.-]\d{1,2}[/.-]\d{4}\b|\b\d{1,2}\s*thg\s*\d{1,2},?\s*\d{4}\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}\b/i.exec(String(text));
  if (!structured) return null;
  const date = extractDate(structured[0]);
  return date ? vnDate(date) : null;
}

const STOPWORDS = new Set([
  "của", "cho", "nào", "này", "the", "and", "là", "gì", "ở", "và", "có", "các", "một", "những",
  "được", "khi", "với", "thì", "hay", "bao", "nhiêu", "tại", "trên", "dưới", "trong", "ngoài",
]);

const contentTokens = (text) =>
  String(text)
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 3 && !STOPWORDS.has(word));

/**
 * Trang này có thật sự liên quan tới câu hỏi không?
 *
 * Vì sao cần: hỏi "Thủ đô của Peru là gì?" mà bộ tra cứu kéo về bài **Hồ Chí Minh** (bài dài nên
 * có chữ "thủ đô") rồi nhồi 10.000 ký tự không liên quan vào prompt. Cổng lọc: tên trang phải chứa
 * từ khoá chính của câu hỏi, hoặc phần đầu bài phải nhắc tới ít nhất 2 từ khoá.
 */
function isRelevantPage(title, text, question) {
  const keys = contentTokens(question);
  if (!keys.length) return true;
  const titleNorm = String(title).toLowerCase();

  // Từ khoá ĐỦ MẠNH: dài từ 4 ký tự trở lên ("peru", "chile"…). Từ ngắn kiểu "thủ", "đô" khớp bừa
  // ("thủ môn", "đô la") nên không được dùng một mình — đã gặp thật: hỏi thủ đô Peru mà kéo về bài
  // một cầu thủ người Peru chỉ vì bài đó có chữ "thủ môn" và "Peru".
  const strongKeys = keys.filter((key) => key.length >= 4);
  if (strongKeys.some((key) => titleNorm.includes(key))) return true;

  // Cụm 2 từ liền nhau ("thủ đô", "biển số", "tỷ giá") là tín hiệu rõ hơn hẳn từng từ rời.
  const bigrams = [];
  for (let index = 0; index + 1 < keys.length; index += 1) bigrams.push(`${keys[index]} ${keys[index + 1]}`);

  if (bigrams.some((phrase) => titleNorm.includes(phrase))) return true;

  const head = String(text).slice(0, 1500).toLowerCase();
  if (bigrams.some((phrase) => head.includes(phrase))) return true;
  return strongKeys.some((key) => head.includes(key));
}

/** Wikipedia: tìm trang khớp nhất rồi lấy toàn văn (plaintext). */
async function wikipediaExtract(titles = [], query = "") {
  const out = [];
  // `reference` PHẢI là câu hỏi gốc, không phải tiêu đề trang: bản trước truyền nhầm nên cổng lọc
  // luôn so trang với chính nó ⇒ mọi trang đều "liên quan" (kéo về cả bài cầu thủ Claudio Pizarro
  // khi hỏi thủ đô Peru).
  const tryTitle = async (title, lang = "vi", reference = null) => {
    try {
      const url = `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&prop=extracts&explaintext=1&redirects=1&titles=${encodeURIComponent(title)}`;
      const json = JSON.parse(await getText(url));
      const page = Object.values(json?.query?.pages ?? {})[0];
      if (!page?.extract) return;
      // Bài không liên quan thì BỎ, đừng nhồi vào prompt — thà ít nguồn mà đúng.
      if (!isRelevantPage(page.title, page.extract, reference || query || title)) return;
      out.push({ title: page.title, url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(page.title)}`, text: page.extract });
    } catch {
      /* bỏ qua */
    }
  };
  for (const title of titles) await tryTitle(title);
  if (!out.length && query) {
    try {
      const searchUrl = `https://vi.wikipedia.org/w/api.php?action=query&format=json&list=search&srlimit=2&srsearch=${encodeURIComponent(query)}`;
      const json = JSON.parse(await getText(searchUrl));
      for (const hit of json?.query?.search ?? []) await tryTitle(hit.title, "vi", query);
    } catch {
      /* bỏ qua */
    }
  }
  return out;
}

/** Các đoạn văn trong `text` có chứa từ khoá của câu hỏi (ưu tiên đoạn chứa cả số/mã). */
function relevantPassages(text = "", question = "", limit = 4) {
  const terms = String(question)
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 2 && !["của", "cho", "nào", "này", "the", "and", "là", "gì", "ở", "và", "có"].includes(word));
  const codes = String(question).match(/\b\d{2,4}[a-z]?\b/gi) ?? [];
  const paragraphs = String(text).split(/\n{2,}|(?<=\.)\s{2,}/).map((p) => p.trim()).filter((p) => p.length > 40);
  const scored = paragraphs.map((paragraph) => {
    const low = paragraph.toLowerCase();
    let score = 0;
    for (const term of terms) if (low.includes(term)) score += 2;
    for (const code of codes) if (low.includes(String(code).toLowerCase())) score += 6;
    if (/^\s*(=+)/.test(paragraph)) score += 1;
    return { paragraph, score };
  });
  return scored
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.paragraph.slice(0, 1200));
}

/**
 * NGUỒN CÓ CẤU TRÚC theo lĩnh vực — tra bằng API nên kết quả có cấu trúc và truy được nguồn.
 * Tất cả đều bọc try/catch: nguồn ngoài hỏng KHÔNG được làm hỏng câu trả lời, chỉ làm giảm
 * mức chắc chắn (và như vậy thì model phải nói là chưa chắc).
 */
const SPECIAL_SOURCES = {
  /** Địa danh: Nominatim của OpenStreetMap (1 truy vấn/lần, có UA theo yêu cầu của họ). */
  async places(question) {
    try {
      const place = String(question).replace(/[?？]/g, " ").slice(0, 160);
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=3&addressdetails=1&q=${encodeURIComponent(place)}`;
      const json = JSON.parse(await getText(url));
      return (json ?? []).map((item) => ({
        title: `OpenStreetMap/Nominatim: ${item.display_name}`,
        url: `https://www.openstreetmap.org/${item.osm_type}/${item.osm_id}`,
        text: `Địa danh: ${item.display_name}. Loại: ${item.type ?? item.category ?? "?"}. Toạ độ: ${item.lat}, ${item.lon}.`,
      }));
    } catch {
      return [];
    }
  },

  /** Dữ liệu quốc gia: REST Countries (thủ đô, dân số, diện tích, tiền tệ, ngôn ngữ, múi giờ). */
  async countries(question) {
    try {
      const words = String(question).match(/[\p{Lu}][\p{L}]+/gu) ?? [];
      const out = [];
      for (const word of words.slice(0, 3)) {
        const json = JSON.parse(await getText(`https://restcountries.com/v3.1/name/${encodeURIComponent(word)}?fields=name,capital,population,area,currencies,languages,region,subregion,timezones,borders`));
        for (const country of (Array.isArray(json) ? json : []).slice(0, 2)) {
          out.push({
            title: `REST Countries: ${country.name?.common ?? word}`,
            url: `https://restcountries.com/v3.1/name/${encodeURIComponent(country.name?.common ?? word)}`,
            text:
              `Quốc gia: ${country.name?.common ?? "?"} (${country.name?.official ?? "?"}). Thủ đô: ${(country.capital ?? []).join(", ")}. ` +
              `Dân số: ${country.population ?? "?"}. Diện tích: ${country.area ?? "?"} km². Khu vực: ${country.region ?? "?"}/${country.subregion ?? "?"}. ` +
              `Tiền tệ: ${Object.values(country.currencies ?? {}).map((c) => c.name).join(", ") || "?"}. Ngôn ngữ: ${Object.values(country.languages ?? {}).join(", ") || "?"}. ` +
              `Múi giờ: ${(country.timezones ?? []).join(", ")}. Giáp: ${(country.borders ?? []).join(", ") || "không"}.`,
          });
        }
      }
      return out;
    } catch {
      return [];
    }
  },

  /** Tỷ giá: open.er-api (miễn phí, không cần khoá) — số liệu sống, kèm ngày cập nhật. */
  async exchangeRates() {
    try {
      const json = JSON.parse(await getText("https://open.er-api.com/v6/latest/USD"));
      const rates = json?.rates ?? {};
      const wanted = ["VND", "EUR", "JPY", "CNY", "KRW", "THB", "SGD", "GBP", "AUD"];
      const picked = wanted.filter((code) => rates[code]).map((code) => `1 USD = ${rates[code]} ${code}`);
      if (!picked.length) return [];
      return [{
        title: `Tỷ giá (open.er-api, cập nhật ${json.time_last_update_utc ?? "?"})`,
        url: "https://open.er-api.com/v6/latest/USD",
        text: `Tỷ giá tham khảo ngày ${String(json.time_last_update_utc ?? "").slice(0, 16)}: ${picked.join(" · ")}. Nguồn: open.er-api.com (tỷ giá tham khảo, không phải tỷ giá giao dịch của ngân hàng).`,
      }];
    } catch {
      return [];
    }
  },

  /** Tiền mã hoá: CoinGecko (miễn phí). */
  async crypto() {
    try {
      const json = JSON.parse(await getText("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,tether&vs_currencies=usd,vnd&include_last_updated_at=true"));
      const rows = Object.entries(json ?? {}).map(([coin, price]) => {
        const when = price.last_updated_at ? new Date(price.last_updated_at * 1000).toISOString().slice(0, 16).replace("T", " ") : "?";
        return `${coin}: ${price.usd} USD (${price.vnd} VND) lúc ${when} UTC`;
      });
      if (!rows.length) return [];
      return [{ title: "Giá tiền mã hoá (CoinGecko)", url: "https://www.coingecko.com", text: `Giá mới nhất: ${rows.join(" · ")}.` }];
    } catch {
      return [];
    }
  },

  /** Chỉ số kinh tế vĩ mô: World Bank API (miễn phí) — có KỲ số liệu, không phải số nhớ. */
  async worldbank() {
    const indicators = [
      ["NY.GDP.MKTP.CD", "GDP (USD hiện hành)"],
      ["NY.GDP.PCAP.CD", "GDP bình quân đầu người (USD)"],
      ["FP.CPI.TOTL.ZG", "Lạm phát (%)"],
      ["SL.UEM.TOTL.ZS", "Thất nghiệp (%)"],
      ["SP.POP.TOTL", "Dân số"],
    ];
    const out = [];
    for (const [code, label] of indicators) {
      try {
        const json = JSON.parse(await getText(`https://api.worldbank.org/v2/country/VN/indicator/${code}?format=json&per_page=6&mrnev=3`));
        const rows = (json?.[1] ?? []).filter((row) => row?.value != null).slice(0, 3);
        if (!rows.length) continue;
        out.push({
          title: `World Bank · ${label} (Việt Nam)`,
          url: `https://data.worldbank.org/indicator/${code}?locations=VN`,
          text: rows.map((row) => `${row.date}: ${Number(row.value).toLocaleString("vi-VN")}`).join(" · ") + `. Nguồn: World Bank, mã chỉ tiêu ${code}.`,
        });
      } catch {
        /* chỉ tiêu này lỗi thì bỏ, không làm hỏng cả lượt tra */
      }
    }
    return out;
  },

  /** Bài báo khoa học cho câu hỏi AI/công nghệ: arXiv API (miễn phí, không cần khoá). */
  async arxiv(question) {
    try {
      const query = encodeURIComponent(String(question).replace(/[^\p{L}\p{N}\s]/gu, " ").trim().slice(0, 120));
      const xml = await getText(`http://export.arxiv.org/api/query?search_query=all:${query}&start=0&max_results=4&sortBy=relevance`);
      const entries = [...String(xml).matchAll(/<entry>([\s\S]*?)<\/entry>/g)].slice(0, 4);
      return entries.map((match) => {
        const block = match[1];
        const pick = (tag) => (new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(block)?.[1] ?? "").replace(/\s+/g, " ").trim();
        const title = pick("title");
        const summary = pick("summary").slice(0, 700);
        const id = pick("id");
        const published = pick("published").slice(0, 10);
        return { title: `arXiv: ${title} (${published})`, url: id, text: `${title}. ${summary}` };
      });
    } catch {
      return [];
    }
  },

  /** Wikipedia lấy theo tiêu đề tìm được — nguồn nền cho hầu hết lĩnh vực. */
  async wikipedia(question) {
    return wikipediaExtract([], question);
  },
};

/** Chạy các nguồn có cấu trúc của hồ sơ. */
async function runSpecialSources(profile, question) {
  const out = [];
  for (const name of profile.special ?? []) {
    const fn = SPECIAL_SOURCES[name];
    if (!fn) continue;
    try {
      out.push(...(await fn(question)));
    } catch {
      /* nguồn hỏng thì bỏ qua */
    }
  }
  return out;
}

/** Dữ liệu biển số đã kiểm chứng trong repo (nếu có). */
async function plateData() {
  try {
    const { buildVnPlateKnowledge } = await import("./vn-plates.js");
    const block = buildVnPlateKnowledge({ full: true });
    return block ? [{ title: "Dữ liệu biển số trong fBuddy (đã kiểm chứng)", url: "repo:server/src/data/vn-plate-codes.json", text: block }] : [];
  } catch {
    return [];
  }
}

/**
 * Tham số chỉ dùng để ĐO/ĐẾM lượt truy cập, không bao giờ là nội dung của bài viết.
 * `utm_*` là của Google Analytics, `fbclid`/`gclid`/`yclid` là mã theo dõi quảng cáo.
 */
const TRACKING_PARAMS = /^(utm_.+|fbclid|gclid|yclid|igshid|mc_cid|mc_eid|_ga|_gl)$/i;

/**
 * Chuẩn hoá URL để SO TRÙNG — không dùng để hiển thị (nguồn vẫn giữ URL gốc cho người dùng mở).
 *
 * Vì sao cần: cùng một bài báo xuất hiện nhiều lần dưới các dạng URL khác nhau (`?utm_source=…`,
 * `http` vs `https`, `www.` vs không, có/không dấu `/` cuối) nên bản cũ đếm chúng thành nhiều phát
 * hiện riêng. Đo thật: 4 slot trong 8 là cùng một trang (Đài Truyền hình Việt Nam / VTV1 lặp 2 lần),
 * tức là người dùng mất chỗ cho nguồn thật.
 *
 * Cố ý KHÔNG sắp xếp lại tham số truy vấn (thứ tự tham số có thể mang nghĩa với vài trang) và KHÔNG
 * bỏ tham số thật — `?oc=5` của Google News phải giữ vì nó là phần phân biệt bài.
 */
export function normalizeUrl(url = "") {
  const raw = String(url ?? "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    // `#top` chỉ là vị trí cuộn trong cùng một trang.
    parsed.hash = "";
    // http/https khác giao thức chứ không phải khác nguồn.
    parsed.protocol = "https:";
    for (const param of [...parsed.searchParams.keys()]) {
      if (TRACKING_PARAMS.test(param)) parsed.searchParams.delete(param);
    }
    parsed.hostname = parsed.hostname.replace(/^www\./, "");
    // `toString()` thêm `/` cho URL không có đường dẫn; bỏ để "x.vn" và "x.vn/" là một.
    return parsed.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    // URL hỏng (không parse được): chuẩn hoá thô để vẫn so được phần còn lại.
    return raw.replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
  }
}

/**
 * Điểm "đầy đủ" của một phát hiện. Khi hai phát hiện cùng URL thì giữ bản có NGÀY CÔNG BỐ thật
 * (quan trọng hơn hẳn — đó là thứ người dùng dùng để biết tin mới hay cũ), rồi mới tới bản có đoạn
 * trích dài hơn.
 */
function findingScore(finding = {}) {
  const text = (finding.passages ?? []).join(" ").length;
  return (finding.publishedAt ? 1000 : 0) + Math.min(text, 999);
}

/**
 * Bỏ phát hiện TRÙNG URL, giữ đúng một bản cho mỗi nguồn (bản đầy đủ hơn) và giữ nguyên thứ tự
 * xuất hiện của lần đầu — thứ tự này là cơ sở xếp hạng phía dưới nên không được xáo.
 */
function dedupeFindings(findings = []) {
  const picked = new Map();
  const order = [];
  findings.forEach((finding, index) => {
    // Phát hiện không có URL (hiếm) không gộp với nhau: khoá riêng theo vị trí.
    const key = normalizeUrl(finding.url) || `#${index}`;
    const current = picked.get(key);
    if (!current) {
      picked.set(key, finding);
      order.push(key);
      return;
    }
    if (findingScore(finding) > findingScore(current)) picked.set(key, finding);
  });
  return order.map((key) => picked.get(key));
}

/**
 * Tra cứu một câu hỏi. Trả về phát hiện + nguồn + độ chắc chắn + chỗ mâu thuẫn.
 *
 * @param {{ question: string, domain?: string, depth?: "nhanh"|"ky" }} input
 */
export async function research({ question = "", domain = null, depth = "nhanh" } = {}) {
  const profile = domain ? RESEARCHER_PROFILES.find((p) => p.id === domain) ?? pickResearcher(question) : pickResearcher(question);
  const key = cacheKey(question, profile.id);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return { ...hit.value, cached: true };

  const fresh = needsFreshness(question);
  const clock = vnNow();
  const window = fresh ? freshnessWindow(question) : null;
  const queries = [question];
  if (profile.id === "bien-so" && !/biển/i.test(question)) queries.push(`biển số xe ${question}`);
  // Câu hỏi cần độ mới: hỏi kèm ĐÚNG NGÀY người dùng đang hỏi (không chỉ năm) — máy tìm kiếm xếp
  // bài của ngày đó lên trước, và bài cũ cùng chủ đề sẽ bị đẩy xuống.
  if (fresh) {
    queries.push(`${question} ${clock.longDate}`);
    if (!String(question).includes(String(clock.iso.slice(0, 4)))) queries.push(`${question} ${clock.iso.slice(0, 4)}`);
  }
  // Hồ sơ chính thống: hỏi thẳng vào kho văn bản nhà nước trước, để kết quả không bị lẫn blog/diễn đàn.
  for (const site of profile.siteQueries ?? []) queries.push(`${question} ${site}`);
  /**
   * BỔ SUNG BẰNG RSS khi tìm kiếm web không cho được TIN CÓ NGÀY.
   *
   * Vì sao: DuckDuckGo trả về trang web chung và phần lớn không có ngày công bố — hỏi "tin AI mới
   * nhất hôm nay" mà câu trả lời không nói được tin ngày nào thì người dùng không kiểm chứng được
   * độ mới. RSS của toà soạn (và Google News gộp nhiều báo) thì mục nào cũng có giờ đăng.
   *
   * KHỞI ĐỘNG TRƯỚC tìm kiếm web để chạy SONG SONG: bản trước chờ search xong mới gọi RSS nên mỗi
   * lượt tra tin cộng thêm 1–2 giây chờ vô ích (đo thật: 6 câu, trung bình 17,1 s/câu). Ở đây chỉ
   * khởi động; kết quả vẫn chỉ được DÙNG khi tìm kiếm web không trả về mục nào có ngày (điều kiện cũ)
   * — nếu search đã có ngày thì không chờ RSS nữa, mà lượt lấy RSS đang chạy vẫn đổ vào cache cho
   * câu hỏi lặp lại.
   *
   * Điều kiện chạy: (a) câu hỏi cần độ mới, (b) hồ sơ không phải loại CHỈ dùng nguồn chính thống —
   * RSS ở đây là báo chí, không phải .gov.vn, nên với hồ sơ "chinh-phu" mọi tin lấy thêm đều bị lọc
   * bỏ: tra làm gì cho chậm. Câu hỏi thường giữ nguyên luồng cũ, không tốn thêm thời gian.
   */
  const newsJob = fresh && !profile.strictOfficial ? fetchNewsCached({ question, window }) : null;

  const searches = [];
  for (const query of queries.slice(0, depth === "ky" ? 3 : 2)) {
    searches.push(...(await webSearch(query, 5, window ? { fresh: window } : {})));
  }
  // Vẫn thử bản không lọc để không mất nguồn tốt vì bộ lọc quá chặt, nhưng xếp sau.
  if (fresh) searches.push(...(await webSearch(queries[0], 4)));

  // `fetchNewsCached` không bao giờ ném lỗi nên chỗ này không cần try/catch (nguồn tin hỏng thì thôi,
  // không làm hỏng lượt tra).
  let news = [];
  if (newsJob && !searches.some((item) => item.publishedAt)) news = await newsJob;

  const sources = [];
  if (profile.id === "bien-so") sources.push(...(await plateData()));
  // Wikipedia là bách khoa, KHÔNG phải nguồn tin — với câu hỏi cần độ mới thì để xuống cuối.
  const wiki = await wikipediaExtract(profile.wikiTitles, question);
  sources.push(...wiki);
  // Nguồn có cấu trúc của lĩnh vực (địa danh, quốc gia, arXiv…) — chạy song song cho nhanh.
  const specialResults = await Promise.all((profile.special ?? []).map((name) => (SPECIAL_SOURCES[name] ? SPECIAL_SOURCES[name](question) : Promise.resolve([]))));
  for (const group of specialResults) sources.push(...group);

  // Đọc thêm tối đa vài trang web hứa hẹn nhất (ưu tiên miền đáng tin của hồ sơ).
  const ranked = [...searches].sort((a, b) => {
    const rank = (item) => (profile.preferDomains.some((d) => item.url.includes(d)) ? 0 : 1);
    return rank(a) - rank(b);
  });
  for (const item of ranked.slice(0, MAX_FETCH_PAGES)) {
    try {
      const text = htmlToText(await getText(item.url));
      if (text.length > 400) sources.push({ title: item.title, url: item.url, text });
    } catch {
      /* trang chặn thì thôi, vẫn giữ snippet từ kết quả tìm kiếm */
    }
  }

  const findings = [];
  /** Phát hiện đến từ RSS — nơi mốc thời gian tương đối là dữ liệu của nguồn, không phải chữ trong bài. */
  const fromFeed = new WeakSet();
  for (const source of sources) {
    const passages = relevantPassages(source.text ?? "", question, 3);
    if (passages.length) findings.push({ title: source.title, url: source.url, passages });
  }
  for (const item of searches.filter((s) => s.snippet)) {
    findings.push({ title: item.title, url: item.url, passages: [item.snippet], publishedAt: item.publishedAt ?? null });
  }
  // Tin từ RSS: tiêu đề + mô tả đã có sẵn ngày công bố thật, nên giữ `publishedAt` để tầng dưới nói
  // rõ "tin ngày nào" thay vì đoán ngày từ chữ trong bài.
  for (const item of news) {
    const passages = [item.snippet, item.title].filter((text) => String(text ?? "").trim());
    const finding = { title: item.source ? `${item.title} (${item.source})` : item.title, url: item.url, passages, publishedAt: item.publishedAt };
    fromFeed.add(finding);
    findings.push(finding);
  }

  // Một URL chỉ được chiếm MỘT slot: cùng bài báo có thể về từ nhiều đường (bài trên wiki được lấy
  // hai lần, Google News và RSS trang chủ cùng trỏ một bài…) với URL khác nhau chút ít.
  const unique = dedupeFindings(findings);

  // Thông tin chính phủ: BỎ mọi nguồn không chính thống. Thà nói "chưa tra được nguồn chính thống"
  // còn hơn trả lời đúng nội dung nhưng nguồn là blog — người dùng sẽ mang đi làm thủ tục thật.
  let dropped = 0;
  let kept = unique;
  if (profile.strictOfficial) {
    kept = unique.filter((finding) => isOfficialUrl(finding.url));
    dropped = unique.length - kept.length;
  }

  // Mâu thuẫn: nếu hai nguồn khác nhau nói khác nhau về cùng con số/mã trong câu hỏi thì phải nêu ra.
  const codes = question.match(/\b\d{2,4}\b/g) ?? [];
  const mentions = new Map();
  for (const finding of kept) {
    const text = finding.passages.join(" ");
    for (const code of codes) {
      if (!text.includes(code)) continue;
      const province = /([A-ZÀ-Ỹ][\p{L}]+(?:\s+[A-ZÀ-Ỹ][\p{L}]+){0,3})/u.exec(text.slice(Math.max(0, text.indexOf(code) - 80), text.indexOf(code) + 80));
      if (province) {
        if (!mentions.has(code)) mentions.set(code, new Map());
        const table = mentions.get(code);
        table.set(province[1], (table.get(province[1]) ?? 0) + 1);
      }
    }
  }
  const disagreements = [];
  for (const [code, table] of mentions) {
    if (table.size > 1) disagreements.push(`Mã ${code} được các nguồn gắn với nhiều nơi: ${[...table.keys()].join(" / ")}`);
  }

  // Gắn ngày cho từng phát hiện rồi xếp MỚI NHẤT LÊN ĐẦU khi câu hỏi cần độ mới.
  for (const finding of kept) {
    const haystack = `${finding.title} ${finding.passages.join(" ")}`;
    // Nguồn RSS cho NGÀY CÔNG BỐ thật ⇒ ưu tiên nó. Nguồn khác chỉ được nhận ngày ghi ĐỦ
    // ngày–tháng–năm trong bài (`allowRelative` TẮT) — chữ "hôm nay"/"mới nhất" trong bài viết không
    // phải ngày công bố, gán ngày chạy máy cho nó là bịa và còn đẩy bài cũ lên trên tin thật.
    const date = finding.publishedAt
      ? new Date(finding.publishedAt)
      : extractDate(haystack, { allowRelative: fromFeed.has(finding) });
    const valid = date && !Number.isNaN(date.getTime()) ? date : null;
    finding.detectedAt = valid ? vnDate(valid) : null;
    finding.ageDays = valid ? Math.round((Date.now() - valid.getTime()) / 86400000) : null;
  }
  if (fresh) {
    kept.sort((a, b) => {
      const left = a.ageDays ?? 9999;
      const right = b.ageDays ?? 9999;
      return left - right;
    });
  }

  const newest = kept.reduce((best, item) => (item.ageDays !== null && (best === null || item.ageDays < best) ? item.ageDays : best), null);
  const confidence = kept.length === 0 ? "thap" : disagreements.length ? "trung-binh" : kept.length >= 3 ? "cao" : "trung-binh";
  const value = {
    researcher: { id: profile.id, label: profile.label },
    note: profile.note ?? null,
    question,
    confidence,
    askedAt: clock.stamp,
    askedDate: clock.date,
    timeWindow: window,
    strictOfficial: Boolean(profile.strictOfficial),
    requiresFresh: Boolean(profile.requiresFresh) || fresh,
    needsFreshness: fresh,
    newestSourceAgeDays: newest,
    checkedAtIso: new Date().toISOString(),
    droppedUnofficial: dropped,
    findings: kept.slice(0, 8),
    disagreements,
    sources: [...new Set(kept.map((f) => f.url))].slice(0, 8),
    checkedAt: new Date().toISOString(),
  };
  cache.set(key, { at: Date.now(), value });
  return value;
}

/**
 * Khối chữ để đưa lại cho model sau khi tra cứu. Cố ý nhắc thẳng: chỉ được nói phần có nguồn,
 * không thấy thì phải nói chưa chắc — đây là điểm khác biệt so với "trả lời theo trí nhớ".
 */
export function researchToModelText(result, { maxChars = 7000 } = {}) {
  const lines = [
    `KẾT QUẢ TRA CỨU (researcher: ${result.researcher.label} · mức chắc chắn: ${result.confidence})`,
    `Câu hỏi tra: ${result.question}`,
    `MỐC THỜI GIAN: người dùng hỏi lúc ${result.askedAt ?? "?"}${result.timeWindow ? ` · lọc nguồn trong ${result.timeWindow === "d" ? "ngày" : result.timeWindow === "w" ? "tuần" : "tháng"} gần nhất` : ""}.`,
    "Khi trả lời phải nói rõ số liệu tính tới lúc nào (ngày/giờ), và TUYỆT ĐỐI không trình bày dữ liệu cũ như thông tin của hôm nay.",
  ];
  if (!result.findings.length) {
    if (result.strictOfficial) {
      lines.push(
        `ĐÂY LÀ CÂU HỎI VỀ CHÍNH PHỦ/NHÀ NƯỚC: chỉ được dùng nguồn chính thống (tên miền .gov.vn,`,
        `chinhphu.vn, vbpl.vn, quochoi.vn, dichvucong.gov.vn). Lần tra này KHÔNG tìm được nguồn chính thống nào` +
          (result.droppedUnofficial ? ` (đã bỏ ${result.droppedUnofficial} nguồn không chính thống).` : "."),
        "⇒ Phải nói thẳng là CHƯA TRA ĐƯỢC NGUỒN CHÍNH THỐNG, đừng trả lời theo trí nhớ, đừng lấy blog/trang tổng hợp,",
        "và chỉ người dùng tới cổng chính thức: dichvucong.gov.vn (thủ tục), vanban.chinhphu.vn / vbpl.vn (văn bản),",
        "hoặc hỏi trực tiếp cơ quan có thẩm quyền.",
      );
      return lines.join("\n");
    }
    lines.push(
      "KHÔNG tìm được nguồn nào trả lời câu này. Hãy nói thẳng với người dùng là bạn chưa tra được và CHƯA CHẮC,",
      "đề nghị họ kiểm tra nguồn chính thức (văn bản luật, cơ quan nhà nước, nhà sản xuất). TUYỆT ĐỐI không đoán.",
    );
    return lines.join("\n");
  }
  if (result.strictOfficial) {
    lines.push("NGUỒN ĐÃ LỌC: chỉ giữ nguồn chính thống của nhà nước; trả lời phải nêu rõ tên văn bản/cổng thông tin.");
  }
  for (const finding of result.findings) {
    // Nói NGÀY CỤ THỂ, không chỉ "N ngày trước": người dùng cần đối chiếu được tin với báo gốc, và
    // model cần con số ngày để không trình bày tin cũ như tin hôm nay.
    const when =
      finding.detectedAt
        ? `${finding.detectedAt}${finding.ageDays === 0 ? " (hôm nay)" : `, ${finding.ageDays} ngày trước`}`
        : "không rõ ngày";
    lines.push(`• Nguồn (${when}): ${finding.title} — ${finding.url}`);
    for (const passage of finding.passages) lines.push(`   “${passage}”`);
  }
  if (result.needsFreshness && result.newestSourceAgeDays !== null && result.newestSourceAgeDays > 30) {
    lines.push(
      `CẢNH BÁO ĐỘ CŨ: nguồn MỚI NHẤT tìm được đã ${result.newestSourceAgeDays} ngày tuổi ⇒ phải nói rõ với người dùng`,
      "là số liệu có thể chưa cập nhật, đừng trình bày như thông tin mới nhất.",
    );
  }
  if (result.requiresFresh) {
    lines.push(
      `SỐ LIỆU PHẢI MỚI: lần tra này lúc ${result.checkedAt}. Khi trả lời BẮT BUỘC nêu KỲ số liệu (năm/quý/ngày) và nguồn;`,
      "số liệu vĩ mô thường công bố chậm nên phải nói rõ đó là số của kỳ nào. Nếu kết quả không có số mới, hãy nói thẳng là",
      "chưa lấy được số cập nhật và chỉ người dùng tới nguồn chính thức (Tổng cục Thống kê, Ngân hàng Nhà nước, World Bank) —",
      "TUYỆT ĐỐI không đọc số theo trí nhớ, không đoán giá vàng/tỷ giá/lãi suất.",
    );
  }
  if (result.note) lines.push(`LƯU Ý CỦA RESEARCHER: ${result.note}`);
  if (result.disagreements.length) {
    lines.push("CÁC NGUỒN MÂU THUẪN NHAU (phải nói rõ với người dùng là chưa thống nhất, đừng chọn bừa một bên):");
    for (const item of result.disagreements) lines.push(`   ! ${item}`);
  }
  lines.push(
    "CÁCH DÙNG: chỉ khẳng định những gì có trong đoạn trích trên và nói rõ nguồn khi người dùng cần độ chính xác.",
    "Phần KHÔNG có trong kết quả tra cứu thì đừng thêm vào — kể cả khi bạn 'nhớ' là đúng.",
  );
  const text = lines.join("\n");
  // Prompt có hạn: khối tra cứu dài quá thì cắt bớt và nói rõ là đã cắt, để model không tưởng
  // mình đã có đủ dữ liệu.
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n… (kết quả tra cứu đã được cắt bớt cho vừa ngữ cảnh — phần bị cắt KHÔNG có nghĩa là không tồn tại; cần thì gọi lại công cụ tra_cuu với câu hỏi hẹp hơn.)`;
  
}

/**
 * TRA TRƯỚC khi model trả lời — không phụ thuộc việc model có chịu gọi công cụ hay không.
 *
 * Vì sao cần: đã gặp thật — hỏi "thủ đô của Peru" thì model trả lời luôn theo trí nhớ dù luật đã
 * ghi rõ phải tra. Với dữ kiện tra được thì không thể để "may là model chịu gọi công cụ": server
 * tự tra trước rồi đưa kết quả vào ngữ cảnh, còn công cụ `tra_cuu` vẫn để model tra sâu thêm.
 *
 * Trả về null khi: câu hỏi không thuộc lĩnh vực cần tra, hoặc tra quá lâu (không được để người
 * dùng chờ vô hạn chỉ vì một nguồn ngoài chậm).
 */
export async function maybePreResearch({ message = "", timeoutMs = 15000 } = {}) {
  const text = String(message ?? "").trim();
  if (text.length < 6) return null;
  const profile = pickResearcher(text);
  // Hồ sơ "chung" thường bị bỏ qua, NHƯNG câu hỏi cần độ mới (giá, tin, sự kiện, "mới nhất") thì
  // phải tra — đó đúng là loại câu trả lời sai nếu lấy từ trí nhớ.
  if (profile.id === "chung" && !needsFreshness(text)) return null;
  let timer = null;
  try {
    const result = await Promise.race([
      research({ question: text, domain: profile.id }),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
    if (!result) return null;
    return {
      researcher: profile.id,
      label: profile.label,
      confidence: result.confidence,
      text: researchToModelText(result),
      // Giữ lại danh sách nguồn (có URL) để lượt chat NÓI RÕ đã tra ở đâu — yêu cầu chủ dự án
      // 2026-09-20: "cần fbuddy nói rõ các nguồn tra cứu thông tin của nó".
      findings: (result.findings ?? []).slice(0, 8).map((f) => ({
        title: String(f.title ?? "").slice(0, 140),
        url: String(f.url ?? "").slice(0, 300),
      })).filter((f) => f.url),
    };
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
