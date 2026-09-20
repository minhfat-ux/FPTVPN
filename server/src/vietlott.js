/**
 * CHUYÊN GIA VIETLOTT — gợi ý số theo THỐNG KÊ các kỳ quay ĐÃ QUA.
 *
 * NGUYÊN TẮC TRUNG THỰC (không được vi phạm khi sửa file này):
 * xổ số là ngẫu nhiên và các kỳ quay ĐỘC LẬP nhau — không có phương pháp nào làm tăng xác suất
 * trúng. Vì vậy module này chỉ làm đúng một việc: mô tả lại dữ liệu kỳ quay thật đã có (tần suất,
 * số lâu chưa về, phân bố chẵn/lẻ–thấp/cao–tổng) rồi chọn số theo các tiêu chí đó. TUYỆT ĐỐI không
 * có chỗ nào nói "số dễ trúng", "chắc trúng", và không bịa thêm kỳ quay/số liệu.
 *
 * Nguồn dữ liệu: minhngoc.net.vn (trang HTML công khai, không cần key). vietlott.vn bị Cloudflare
 * chặn 403 từ môi trường này nên không dùng được; xem báo cáo handoff để biết nguồn nào hỏng.
 *
 * Cache 45 phút (30–60 phút theo yêu cầu) để mỗi câu hỏi không phải fetch lại; hai lượt hỏi song
 * song dùng CHUNG một promise đang bay (giống researcher.js) chứ không nhân đôi request.
 */

const SOURCE_NAME = "minhngoc.net.vn";
const SOURCE_HOME = "https://www.minhngoc.net.vn";
/** Trình duyệt thật: mặc định của fetch (undici) bị một số site xổ số chặn. */
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";
const FETCH_TIMEOUT_MS = 12000;
/** Trần số trang phải lấy cho một lần làm mới cache (mỗi trang ~10–15 kỳ). */
const MAX_PAGES = 16;
/** Cache 45 phút: kỳ quay mới nhất chỉ có sau 18h mỗi ngày nên không cần tươi hơn. */
const CACHE_TTL_MS = 45 * 60 * 1000;
/** Cửa sổ "nóng" mặc định khi tính tần suất cho gợi ý. */
const HOT_WINDOW = 30;
/** Số ứng viên mỗi dải được xét khi ghép vé (có seed nên vẫn tất định). */
const CANDIDATES_PER_BAND = 4;
/** Số nóng nhất / số lâu chưa về nhất được coi là ứng viên khi ghép vé. */
const HOT_POOL = 10;

/**
 * Cấu hình hai game đang hỗ trợ. `jackpotOdds` là xác suất THẬT của giải đặc biệt
 * (Mega 6/45 = C(45,6); Power 6/55 = C(55,6)) — con số này phải khớp với khối miễn trừ ở agent.js.
 */
export const GAMES = {
  mega645: {
    id: "mega645",
    name: "Mega 6/45",
    size: 6,
    max: 45,
    special: false,
    jackpotOdds: 8145060,
    /** Cỡ mẫu thống kê: 120 kỳ gần nhất (mega quay 3 kỳ/tuần ⇒ ~9 tháng dữ liệu). */
    historyTarget: 120,
    pathFor: (date) =>
      date ? `/ket-qua-xo-so/dien-toan-vietlott/mega-6x45/${date}.html` : "/ket-qua-xo-so/dien-toan-vietlott/mega-6x45.html",
  },
  power655: {
    id: "power655",
    name: "Power 6/55",
    size: 6,
    max: 55,
    special: true,
    jackpotOdds: 28989675,
    /** Cỡ mẫu thống kê: 120 kỳ gần nhất (power quay 3 kỳ/tuần ⇒ ~9 tháng dữ liệu). */
    historyTarget: 120,
    pathFor: (date) => (date ? `/xo-so-dien-toan/power-6x55/${date}.html` : "/xo-so-dien-toan/power-6x55.html"),
  },
};

/** Xác suất trúng Jackpot dạng chữ, dùng cho khối miễn trừ (một nguồn sự thật duy nhất). */
export function jackpotOddsText(gameId) {
  const info = GAMES[gameId];
  if (!info) return null;
  return `1/${info.jackpotOdds.toLocaleString("vi-VN")}`;
}

/** Nhận diện game từ id người dùng/model gõ (mega645, "mega 6/45", 645, power655…). */
export function normalizeGame(value) {
  const text = String(value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!text) return null;
  if (/mega|\b645\b|6\s*\/\s*45|6x45/.test(text)) return "mega645";
  if (/power|\b655\b|6\s*\/\s*55|6x55/.test(text)) return "power655";
  return null;
}

/** Câu hỏi có chạm tới Vietlott không (dùng cho khối luật + khối miễn trừ ở agent.js). */
export function vietlottQuestionLikely(message = "") {
  const text = String(message);
  if (!text) return false;
  return /vietlott|mega\s*6\s*[\/x-]?\s*45|power\s*6\s*[\/x-]?\s*55|max\s*[34]\s*d|xổ số điện toán|xo so dien toan/i.test(text);
}

/** Game mà câu hỏi đang nói tới (null nếu không rõ). */
export function gameFromMessage(message = "") {
  const text = String(message).toLowerCase();
  if (/power|6\s*\/\s*55|6x55|655/.test(text)) return "power655";
  if (/mega|6\s*\/\s*45|6x45|645/.test(text)) return "mega645";
  return null;
}

/** Trạng thái lần lấy dữ liệu gần nhất (để báo cáo/kiểm tra nguồn nào chạy được). */
let lastSourceReport = { at: null, source: SOURCE_NAME, pages: 0, draws: 0, skipped: 0, error: null };

export function vietlottSourceStatus() {
  return { ...lastSourceReport };
}

// ────────────────────────────── LẤY DỮ LIỆU THẬT ──────────────────────────────

const cache = new Map(); // gameId -> { at, draws, skipped, pages, pending?, error? }

/** Đọc một trang HTML; ném lỗi khi HTTP không OK (để chỗ gọi biết nguồn hỏng). */
async function getText(doFetch, url) {
  const res = await doFetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml", "Accept-Language": "vi,en;q=0.9" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} khi lấy ${url}`);
  return await res.text();
}

/** "YYYY-MM-DD" ± n ngày, tính theo UTC để không lệch ngày vì múi giờ. */
export function shiftDays(iso, days) {
  const [y, m, d] = String(iso).split("-").map(Number);
  const t = Date.UTC(y, m - 1, d) + days * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" → "DD-MM-YYYY" (dạng ngày trong URL của nguồn). */
const toVnDate = (iso) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;

/**
 * Lấy các kỳ quay mới nhất, có cache. KHÔNG bao giờ ném lỗi: nguồn hỏng thì trả bản cũ đã có
 * (kèm `error`/`stale`) hoặc danh sách rỗng — để lượt chat nói thật là chưa lấy được dữ liệu.
 */
export async function getDraws(gameId, { limit = null, force = false, fetchImpl = null } = {}) {
  const info = GAMES[normalizeGame(gameId) ?? "mega645"];
  const hit = cache.get(info.id) ?? null;
  // Còn hạn cache ⇒ dùng luôn, KHÔNG fetch lại cho mỗi câu hỏi.
  if (!force && hit?.draws?.length && Date.now() - hit.at < CACHE_TTL_MS) return hit;
  if (hit?.pending) return hit.pending;
  const target = Number(limit) > 0 ? Number(limit) : info.historyTarget;
  const pending = fetchDraws(info, { target, fetchImpl }).then(
    (report) => {
      const value = { ...report, at: Date.now() };
      cache.set(info.id, value);
      lastSourceReport = {
        at: new Date(value.at).toISOString(),
        source: SOURCE_NAME,
        pages: value.pages,
        draws: value.draws.length,
        skipped: value.skipped,
        error: null,
      };
      return value;
    },
    (error) => {
      const message = String(error?.message ?? error);
      const stale = {
        at: hit?.at ?? 0,
        draws: hit?.draws ?? [],
        skipped: hit?.skipped ?? 0,
        pages: hit?.pages ?? 0,
        error: message,
        ...(hit?.draws?.length ? { stale: true } : {}),
      };
      cache.set(info.id, stale);
      lastSourceReport = { at: null, source: SOURCE_NAME, pages: 0, draws: stale.draws.length, skipped: 0, error: message };
      return stale;
    },
  );
  cache.set(info.id, { at: hit?.at ?? 0, draws: hit?.draws ?? [], skipped: hit?.skipped ?? 0, pages: hit?.pages ?? 0, pending });
  return pending;
}

/** Vòng lấy dữ liệu: trang mới nhất trước, rồi lùi dần theo ngày cho tới khi đủ `target` kỳ. */
async function fetchDraws(info, { target, fetchImpl = null } = {}) {
  const doFetch = fetchImpl ?? globalThis.fetch;
  const seen = new Map(); // date -> draw (giữ bản gặp trước, các trang chồng nhau)
  let skipped = 0;
  let pages = 0;
  let offset = 1; // lùi bao nhiêu ngày so với kỳ cũ nhất đang có
  let url = `${SOURCE_HOME}${info.pathFor(null)}`;
  let previousOldest = null;

  while (seen.size < target && pages < MAX_PAGES) {
    const html = await getText(doFetch, url);
    pages += 1;
    const parsed = parseHtml(html, info);
    skipped += parsed.skipped;
    if (!parsed.draws.length) break;
    const before = seen.size;
    for (const draw of parsed.draws) if (!seen.has(draw.date)) seen.set(draw.date, draw);
    const oldest = parsed.draws[0].date; // parseHtml trả về cũ → mới
    if (seen.size === before) {
      // Trang này không mang thêm kỳ nào (ngày không phải ngày quay) ⇒ lùi xa hơn một chút.
      offset += 1;
      if (offset > 4) break;
    } else {
      offset = 1;
    }
    const nextDate = shiftDays(oldest, -offset);
    // Không lùi được nữa (ngày không đổi) ⇒ dừng, tránh vòng lặp vô hạn.
    if (previousOldest && nextDate >= previousOldest) break;
    previousOldest = nextDate;
    url = `${SOURCE_HOME}${info.pathFor(toVnDate(nextDate))}`;
  }

  const draws = [...seen.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)).slice(-target);
  return { draws, skipped, pages, target };
}

// ────────────────────────────── PARSE (THUẦN) ──────────────────────────────

/** Danh sách bóng số trong một bảng kết quả của nguồn. */
const RESULT_LIST_RE = /<ul class="result-number[^"]*">([\s\S]*?)<\/ul>/g;
const BALL_RE = /<div class="finnish(\d+)\s*bool">\s*(\d{1,2})\s*<\/div>/g;
/** Ngày trong link ngày (`.../20-09-2026.html`) hoặc trong chữ ("Ngày quay thưởng 20/09/2026"). */
const DATE_RE = /(\d{2})-(\d{2})-(\d{4})\.html|(\d{2})\/(\d{2})\/(\d{4})/g;
const DRAW_ID_RE = /<span id="DT[^"]*KY_?VE">\s*#?(\d+)/i;

/** Ngày gần nhất xuất hiện TRƯỚC bảng kết quả (đó là ngày của kỳ đó). */
function dateFromText(text) {
  let last = null;
  DATE_RE.lastIndex = 0;
  let match;
  while ((match = DATE_RE.exec(text))) last = match;
  if (!last) return null;
  const [d, mo, y] = last[1] ? [last[1], last[2], last[3]] : [last[4], last[5], last[6]];
  const year = Number(y);
  if (!Number.isFinite(year) || year < 2010 || year > 2100) return null;
  return `${y}-${mo}-${d}`;
}

/** Dựng một kỳ quay đã kiểm tra hợp lệ (đủ số, không trùng, trong dải) — sai thì trả null. */
function buildDraw({ balls, date, id = null, info }) {
  if (!date) return null;
  const extra = balls.length - info.size;
  // Thừa/thiếu bóng ⇒ dòng sai. Chỉ Power 6/55 mới có bóng thứ 7 (bóng đặc biệt).
  if (extra < 0 || extra > 1 || (extra === 1 && !info.special)) return null;
  const numbers = balls.slice(0, info.size);
  const special = extra === 1 ? balls[info.size] : null;
  if (numbers.length !== info.size) return null;
  const unique = new Set(numbers);
  if (unique.size !== info.size) return null;
  for (const n of numbers) {
    if (!Number.isInteger(n) || n < 1 || n > info.max) return null;
  }
  if (special !== null && (!Number.isInteger(special) || special < 1 || special > info.max || unique.has(special))) return null;
  return {
    game: info.id,
    date,
    id: id ? `#${String(id).padStart(5, "0")}` : null,
    numbers: [...numbers].sort((a, b) => a - b),
    special,
  };
}

/** Bóng số từ mảng/chuỗi số (nhánh JSON). */
function toBalls(value) {
  if (Array.isArray(value)) return value.map(Number).filter(Number.isFinite);
  if (typeof value === "number") return [value];
  const text = String(value ?? "").trim();
  if (!text) return [];
  return text
    .split(/[^\d]+/)
    .filter((part) => part !== "")
    .map(Number)
    .filter(Number.isFinite);
}

/** HTML của nguồn ⇒ danh sách kỳ quay hợp lệ + số dòng bị bỏ. */
function parseHtml(input, info) {
  const html = String(input ?? "");
  const found = [];
  let skipped = 0;
  RESULT_LIST_RE.lastIndex = 0;
  let match;
  while ((match = RESULT_LIST_RE.exec(html))) {
    const balls = [...match[1].matchAll(BALL_RE)].map((m) => Number(m[2]));
    const before = html.slice(Math.max(0, match.index - 3000), match.index);
    const idMatch = DRAW_ID_RE.exec(before);
    const draw = buildDraw({ balls, date: dateFromText(before), id: idMatch?.[1] ?? null, info });
    if (draw) found.push(draw);
    else skipped += 1;
  }
  return { draws: mergeDraws(found), skipped };
}

/** JSON (hoặc object) ⇒ danh sách kỳ quay hợp lệ + số dòng bị bỏ. */
function parseJson(input, info) {
  let value = input;
  if (typeof input === "string") {
    try {
      value = JSON.parse(input);
    } catch {
      return { draws: [], skipped: 0 };
    }
  }
  const list = Array.isArray(value)
    ? value
    : [value?.draws, value?.data, value?.results, value?.result].find((item) => Array.isArray(item)) ?? [];
  const found = [];
  let skipped = 0;
  for (const item of list) {
    const balls = toBalls(item?.numbers ?? item?.result ?? item?.balls ?? item?.ketQua);
    const rawDate = String(item?.date ?? item?.drawDate ?? item?.ngay ?? item?.draw_date ?? "");
    const date = /^\d{4}-\d{2}-\d{2}/.test(rawDate)
      ? rawDate.slice(0, 10)
      : dateFromText(rawDate.replace(/^(\d{4})-(\d{2})-(\d{2}).*$/, "$3/$2/$1"));
    const specialRaw = item?.special ?? item?.power ?? item?.powerNumber ?? item?.bongDacBiet ?? null;
    const all =
      specialRaw !== null && specialRaw !== undefined && specialRaw !== "" ? [...balls, Number(specialRaw)] : balls;
    const draw = buildDraw({ balls: all, date, id: item?.id ?? item?.ky ?? null, info });
    if (draw) found.push(draw);
    else skipped += 1;
  }
  return { draws: mergeDraws(found), skipped };
}

/** Bỏ kỳ trùng ngày (các trang chồng nhau) rồi sắp CŨ → MỚI (mọi hàm thống kê dựa vào thứ tự này). */
function mergeDraws(draws) {
  const byDate = new Map();
  for (const draw of draws) if (!byDate.has(draw.date)) byDate.set(draw.date, draw);
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * Parse dữ liệu kỳ quay từ HTML của nguồn hoặc từ JSON (chuỗi/object/array).
 * Hàm THUẦN, không mạng, không đọc file — nhận `game` để biết dải số và số bóng mỗi kỳ.
 * Kết quả: mảng kỳ quay hợp lệ, sắp CŨ → MỚI, mỗi kỳ `{ game, date, id, numbers, special }`.
 */
export function parseDraws(input, { game = "mega645" } = {}) {
  return parseDrawsDetailed(input, { game }).draws;
}

/** Bản "có số liệu" của parseDraws (nội bộ khi fetch: biết đã bỏ bao nhiêu dòng hỏng). */
export function parseDrawsDetailed(input, { game = "mega645" } = {}) {
  const info = GAMES[normalizeGame(game) ?? "mega645"];
  if (input && typeof input === "object") return parseJson(input, info);
  const text = String(input ?? "");
  if (/^\s*[[{]/.test(text)) return parseJson(text, info);
  return parseHtml(text, info);
}

// ────────────────────────────── THỐNG KÊ (THUẦN) ──────────────────────────────

/** Sắp lại cũ → mới (bản sao) để hàm thống kê không phụ thuộc thứ tự đầu vào. */
function ensureOrder(draws) {
  return [...(Array.isArray(draws) ? draws : [])]
    .filter((draw) => draw && Array.isArray(draw.numbers) && draw.numbers.length)
    .sort((a, b) => (String(a.date) < String(b.date) ? -1 : String(a.date) > String(b.date) ? 1 : 0));
}

/** Cấu hình game suy từ chính dữ liệu (mọi kỳ trong một lần gọi phải cùng game). */
function gameOf(rows) {
  return GAMES[rows[0]?.game] ?? GAMES.mega645;
}

/** `window` kỳ gần nhất (mặc định: tất cả). */
function windowRows(rows, window) {
  const n = Number(window);
  if (!Number.isFinite(n) || n <= 0) return rows;
  return rows.slice(Math.max(0, rows.length - Math.floor(n)));
}

/**
 * Tần suất xuất hiện của từng số (chỉ tính 6 số chính, KHÔNG tính bóng Power).
 * Trả về mảng đủ `numbers` phần tử, sắp theo số lần giảm dần rồi theo số tăng dần.
 */
export function frequency(draws, { numbers = null, window = null } = {}) {
  const rows = windowRows(ensureOrder(draws), window);
  const info = gameOf(rows);
  const ceiling = Number(numbers) > 0 ? Math.floor(Number(numbers)) : info.max;
  const counts = new Map();
  for (const draw of rows) for (const n of draw.numbers) counts.set(n, (counts.get(n) ?? 0) + 1);
  const total = rows.length;
  return Array.from({ length: ceiling }, (_, index) => {
    const number = index + 1;
    const count = counts.get(number) ?? 0;
    return { number, count, rate: total ? Number((count / total).toFixed(4)) : 0 };
  }).sort((a, b) => b.count - a.count || a.number - b.number);
}

/**
 * Số kỳ "chưa về" của từng số tính tới kỳ mới nhất:
 * 0 = vừa về ở kỳ gần nhất, k = đã k kỳ liên tiếp không về, = tổng số kỳ nếu chưa về lần nào.
 */
export function gaps(draws) {
  const rows = ensureOrder(draws);
  const info = gameOf(rows);
  const lastSeen = new Map();
  rows.forEach((draw, index) => {
    for (const n of draw.numbers) lastSeen.set(n, index);
  });
  const total = rows.length;
  return Array.from({ length: info.max }, (_, index) => {
    const number = index + 1;
    const at = lastSeen.get(number);
    return {
      number,
      gap: at === undefined ? total : total - 1 - at,
      lastDate: at === undefined ? null : rows[at].date,
    };
  }).sort((a, b) => b.gap - a.gap || a.number - b.number);
}

/** Các cặp số về cùng nhau nhiều nhất trong dữ liệu đã có (chỉ để tham khảo, không phải dự đoán). */
export function pairs(draws, { limit = 20 } = {}) {
  const rows = ensureOrder(draws);
  const counts = new Map();
  for (const draw of rows) {
    const ns = [...draw.numbers].sort((a, b) => a - b);
    for (let i = 0; i < ns.length; i += 1) {
      for (let j = i + 1; j < ns.length; j += 1) {
        const key = `${ns[i]}-${ns[j]}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }
  return [...counts.entries()]
    .map(([key, count]) => {
      const [a, b] = key.split("-").map(Number);
      return { a, b, count };
    })
    .sort((x, y) => y.count - x.count || x.a - y.a || x.b - y.b)
    .slice(0, Math.max(0, Math.floor(Number(limit) || 20)));
}

/** Phân vị kiểu "nearest-rank" để kết quả tất định (không nội suy). */
function percentile(sortedValues, p) {
  if (!sortedValues.length) return null;
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil((p / 100) * sortedValues.length) - 1));
  return sortedValues[index];
}

/**
 * Phân bố của cửa sổ dữ liệu: chẵn/lẻ, thấp/cao (chia đôi dải số), và tổng
 * (kèm `sum.band` = khoảng phổ biến p25–p75 — dùng làm tiêu chí khi ghép vé).
 */
export function distribution(draws, { max = null } = {}) {
  const rows = ensureOrder(draws);
  const info = gameOf(rows);
  const ceiling = Number(max) > 0 ? Math.floor(Number(max)) : info.max;
  const all = rows.flatMap((draw) => draw.numbers);
  const sums = rows.map((draw) => draw.numbers.reduce((total, n) => total + n, 0)).sort((a, b) => a - b);
  const even = all.filter((n) => n % 2 === 0).length;
  const threshold = Math.floor(ceiling / 2);
  const low = all.filter((n) => n <= threshold).length;
  const avg = sums.length ? Number((sums.reduce((total, n) => total + n, 0) / sums.length).toFixed(2)) : null;
  const median = sums.length
    ? sums.length % 2
      ? sums[(sums.length - 1) / 2]
      : Number(((sums[sums.length / 2 - 1] + sums[sums.length / 2]) / 2).toFixed(1))
    : null;
  const bandLow = percentile(sums, 25) ?? 0;
  const bandHigh = percentile(sums, 75) ?? 0;
  const bandSize = Math.ceil(ceiling / 3);
  return {
    draws: rows.length,
    max: ceiling,
    evenOdd: { even, odd: all.length - even, evenRate: all.length ? Number((even / all.length).toFixed(4)) : 0 },
    lowHigh: {
      threshold,
      low,
      high: all.length - low,
      lowRate: all.length ? Number((low / all.length).toFixed(4)) : 0,
    },
    sum: {
      min: sums[0] ?? null,
      max: sums[sums.length - 1] ?? null,
      avg,
      median,
      q1: bandLow,
      q3: bandHigh,
      band: [bandLow, bandHigh],
    },
    bands: Array.from({ length: Math.ceil(ceiling / bandSize) }, (_, index) => {
      const from = index * bandSize + 1;
      const to = Math.min(ceiling, from + bandSize - 1);
      const count = all.filter((n) => n >= from && n <= to).length;
      return { from, to, count, rate: all.length ? Number((count / all.length).toFixed(4)) : 0 };
    }),
  };
}

// ────────────────────────────── GỢI Ý VÉ (THUẦN, TẤT ĐỊNH) ──────────────────────────────

const pad2 = (n) => String(n).padStart(2, "0");

/** PRNG có seed (mulberry32) — cùng seed ⇒ cùng dãy số, nên vé gợi ý lặp lại được. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Băm dữ liệu + tuỳ chọn thành seed: có kỳ mới ⇒ vé mới, cùng dữ liệu ⇒ y nguyên. */
function seedFrom(draws, options) {
  const text = `${draws.map((d) => `${d.date}:${d.numbers.join(",")}:${d.special ?? ""}`).join("|")}#${options.strategy}#${options.count}#${options.size}`;
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Chia dải số thành 3 khối đều nhau: 1–15/16–30/31–45 (mega) và 1–19/20–38/39–55 (power). */
function bandRanges(max) {
  const size = Math.ceil(max / 3);
  const out = [];
  for (let from = 1; from <= max; from += size) out.push([from, Math.min(max, from + size - 1)]);
  return out;
}

/** Thống kê riêng cho bóng Power (chỉ Power 6/55 mới có). */
function specialStats(rows, info) {
  const seen = new Map();
  rows.forEach((draw, index) => {
    if (draw.special === null || draw.special === undefined) return;
    const row = seen.get(draw.special) ?? { number: draw.special, count: 0, lastIndex: -1 };
    row.count += 1;
    row.lastIndex = index;
    seen.set(draw.special, row);
  });
  const total = rows.length;
  return Array.from({ length: info.max }, (_, index) => {
    const number = index + 1;
    const row = seen.get(number);
    return { number, count: row?.count ?? 0, gap: row ? total - 1 - row.lastIndex : total };
  });
}

/**
 * Gợi ý vé theo THỐNG KÊ kỳ quay đã qua — TẤT ĐỊNH (cùng dữ liệu + cùng tuỳ chọn ⇒ cùng vé).
 *
 * Tiêu chí chọn (giống nhau cho mọi vé):
 *   1. trải đều 3 dải số (mỗi dải 2 số) — không dồn số vào một khúc;
 *   2. mỗi dải lấy 1 số "nóng" (về nhiều trong `HOT_WINDOW` kỳ gần nhất) + 1 số "lâu chưa về";
 *   3. tổng 6 số nằm trong khoảng phổ biến p25–p75 của chính dữ liệu (nếu chỉnh được);
 *   4. có cả chẵn và lẻ, không có 3 số liên tiếp, không trùng vé khác.
 * KHÔNG có tiêu chí nào làm tăng xác suất trúng — đây chỉ là cách chọn số có cơ sở thống kê.
 */
export function suggestTickets(
  draws,
  { count = 3, size = 6, strategy = "can_bang", seed = null, window = HOT_WINDOW } = {},
) {
  const rows = ensureOrder(draws);
  if (!rows.length) return [];
  const info = gameOf(rows);
  const ticketCount = Math.min(Math.max(Math.floor(Number(count) || 3), 1), 10);
  // Vé không bao giờ vượt dải số hợp lệ: nhiều nhất là `size` bóng của game (6 với cả hai game).
  const ticketSize = Math.min(Math.max(Math.floor(Number(size) || info.size), 3), info.size);
  const mode = ["can_bang", "nong", "lau_chua_ve"].includes(strategy) ? strategy : "can_bang";

  const freq = frequency(rows, { numbers: info.max, window });
  const gapRows = gaps(rows);
  const dist = distribution(rows);
  const hotRank = new Map(freq.map((row, index) => [row.number, index]));
  const coldRank = new Map(gapRows.map((row, index) => [row.number, index]));
  const hotPool = new Set(freq.slice(0, HOT_POOL).map((row) => row.number));
  const coldPool = new Set(gapRows.slice(0, HOT_POOL).map((row) => row.number));
  const bands = bandRanges(info.max);
  const perBand = Math.max(1, Math.floor(ticketSize / bands.length));
  const seedValue = Number.isFinite(Number(seed))
    ? Number(seed)
    : seedFrom(rows, { strategy: mode, count: ticketCount, size: ticketSize });
  const rand = mulberry32(seedValue >>> 0);

  /**
   * Ứng viên của một dải số, xếp theo VAI TRÒ:
   *  - `nong`: chỉ gồm số nằm trong top `HOT_POOL` về tần suất (về nhiều trong `window` kỳ),
   *  - `lau`:  chỉ gồm số nằm trong top `HOT_POOL` về số kỳ chưa về,
   *  - `mix`:  mọi số của dải (dùng khi vá mà hai danh sách trên hết ứng viên).
   * Nhờ vậy câu giải thích của mỗi vé ("3 số nóng + 3 số lâu chưa về") luôn ĐÚNG với cách chọn thật.
   */
  const bandCandidates = (range, role) => {
    const inside = [];
    for (let n = range[0]; n <= range[1]; n += 1) {
      if (role === "nong" ? hotPool.has(n) : role === "lau" ? coldPool.has(n) : true) inside.push(n);
    }
    const score = (n) => {
      if (role === "nong") return hotRank.get(n) ?? 999;
      if (role === "lau") return coldRank.get(n) ?? 999;
      return Math.min(hotRank.get(n) ?? 999, coldRank.get(n) ?? 999);
    };
    return inside.sort((a, b) => score(a) - score(b) || a - b);
  };
  const ranked = bands.map((range) => ({
    range,
    nong: bandCandidates(range, "nong"),
    lau: bandCandidates(range, "lau"),
    mix: bandCandidates(range, "mix"),
  }));

  const sumLow = dist.sum.q1 ?? 0;
  const sumHigh = dist.sum.q3 ?? 0;
  const inSumBand = (sum) => sum >= sumLow && sum <= sumHigh;
  const done = [];
  const used = new Set();

  for (let t = 0; t < ticketCount; t += 1) {
    let ticket = null;
    for (let attempt = 0; attempt < 6 && !ticket; attempt += 1) {
      /**
       * Mỗi "khe" giữ đúng vai trò của nó; khi phải vá (tổng/chẵn lẻ/liên tiếp) cũng chỉ đổi trong
       * danh sách của chính khe đó (ưu tiên ứng viên đúng vai trò, hết mới rơi xuống `mix`).
       */
      const slots = [];
      for (let bandIndex = 0; bandIndex < bands.length && slots.length < ticketSize; bandIndex += 1) {
        const pool = ranked[bandIndex];
        for (let k = 0; k < perBand && slots.length < ticketSize; k += 1) {
          const role = mode === "nong" ? "nong" : mode === "lau_chua_ve" ? "lau" : k % 2 === 0 ? "nong" : "lau";
          slots.push({ role, list: pool[role], mix: pool.mix });
        }
      }
      while (slots.length < ticketSize) {
        const bandIndex = slots.length % bands.length;
        slots.push({ role: "mix", list: ranked[bandIndex].mix, mix: ranked[bandIndex].mix });
      }
      /** Lấy số từ danh sách của vai trò trước; hết ứng viên mới rơi xuống danh sách cả dải. */
      const pickFrom = (list, offset) => {
        if (!list.length) return null;
        const start = Math.floor(rand() * Math.min(CANDIDATES_PER_BAND, list.length));
        for (let step = 0; step < list.length; step += 1) {
          const candidate = list[(start + step + offset) % list.length];
          if (!slots.some((other) => other.value === candidate)) return candidate;
        }
        return null;
      };
      for (const slot of slots) {
        slot.value = pickFrom(slot.list, t + attempt) ?? pickFrom(slot.mix, t + attempt);
      }
      const filled = slots.filter((slot) => slot.value !== null);
      if (filled.length !== ticketSize) continue;

      repairSlots(filled, { sumLow, sumHigh });
      const sorted = filled.map((slot) => slot.value).sort((a, b) => a - b);
      const key = sorted.join("-");
      if (used.has(key)) continue; // vé trùng ⇒ thử lại với mốc lệch khác
      used.add(key);
      ticket = sorted;
    }
    if (!ticket) continue;

    const sum = ticket.reduce((total, n) => total + n, 0);
    const hotUsed = ticket.filter((n) => hotPool.has(n));
    const coldUsed = ticket.filter((n) => coldPool.has(n));
    const bandsUsed = bands.filter((range) => ticket.some((n) => n >= range[0] && n <= range[1]));
    const windowUsed = Math.min(Number(window) > 0 ? Math.floor(Number(window)) : rows.length, rows.length);
    const reasonParts = [
      `${hotUsed.length} số về nhiều trong ${windowUsed} kỳ gần nhất${hotUsed.length ? ` (${hotUsed.map(pad2).join(", ")})` : ""}`,
      `${coldUsed.length} số lâu chưa về${coldUsed.length ? ` (${coldUsed.map(pad2).join(", ")})` : ""}`,
      `trải đều ${bandsUsed.length}/${bands.length} dải (${bandsUsed.map((r) => `${r[0]}–${r[1]}`).join(" · ")})`,
      inSumBand(sum)
        ? `tổng ${sum} nằm trong khoảng phổ biến ${sumLow}–${sumHigh}`
        : `tổng ${sum} (ngoài khoảng phổ biến ${sumLow}–${sumHigh} của ${rows.length} kỳ đã có)`,
    ];
    const entry = {
      numbers: ticket,
      special: null,
      sum,
      strategy: mode,
      reason: `${reasonParts.join("; ")}.`,
    };
    if (info.special) {
      // Bóng Power của các vé trước bị loại khỏi danh sách chọn ⇒ mỗi vé một bóng khác nhau.
      const usedSpecials = done.map((row) => row.special).filter((n) => n !== null);
      const special = pickSpecial({ rows, info, exclude: [...ticket, ...usedSpecials], rand, det: done.length });
      entry.special = special.number;
      entry.reason += ` Bóng Power ${pad2(special.number)}: ${special.gap} kỳ chưa ra ở vị trí bóng đặc biệt.`;
    }
    done.push(entry);
  }
  return done;
}

const clampToBand = (value, low, high) => (value < low ? low : value > high ? high : value);

/**
 * Vá một vé cho đủ tiêu chí: có cả chẵn lẫn lẻ, không 3 số liên tiếp, tổng nằm trong khoảng phổ
 * biến. Mọi bước TẤT ĐỊNH và chỉ đổi số trong danh sách ứng viên của chính khe đó (cùng dải, ưu
 * tiên đúng vai trò) nên không phá tiêu chí "trải đều 3 dải" và "3 nóng + 3 lâu chưa về".
 */
function repairSlots(slots, { sumLow, sumHigh }) {
  const usedNow = () => slots.map((slot) => slot.value);
  const reassign = (slot, predicate) => {
    const next = [...slot.list, ...slot.mix].find((n) => !usedNow().includes(n) && predicate(n));
    if (next === undefined) return false;
    slot.value = next;
    return true;
  };

  // (1) chẵn/lẻ: vé toàn chẵn hoặc toàn lẻ là khuôn mẫu hiếm gặp trong dữ liệu ⇒ đổi một số.
  const evenCount = slots.filter((slot) => slot.value % 2 === 0).length;
  if (evenCount === 0 || evenCount === slots.length) {
    const want = evenCount === 0 ? 0 : 1;
    for (const slot of slots) {
      if (slot.value % 2 === want) continue;
      if (reassign(slot, (n) => n % 2 === want)) break;
    }
  }

  // (2) tổng: chọn nước đổi kéo tổng về gần khoảng phổ biến nhất.
  for (let round = 0; round < 12; round += 1) {
    const sum = slots.reduce((total, slot) => total + slot.value, 0);
    if (sum >= sumLow && sum <= sumHigh) break;
    const tooHigh = sum > sumHigh;
    const distance = (value) => Math.abs(clampToBand(value, sumLow, sumHigh) - value);
    const options = slots
      .map((slot) => {
        const candidatesList = [...slot.list, ...slot.mix]
          .filter((n) => !usedNow().includes(n) && (tooHigh ? n < slot.value : n > slot.value))
          .map((n) => ({ slot, n, distance: distance(sum - slot.value + n) }))
          .filter((row) => row.distance < distance(sum))
          .sort((a, b) => a.distance - b.distance);
        return candidatesList[0] ?? null;
      })
      .filter(Boolean)
      .sort((a, b) => a.distance - b.distance);
    if (!options.length) break;
    options[0].slot.value = options[0].n;
  }

  // (3) không để 3 số liên tiếp (khuôn mẫu dễ nhận ra, không phải cơ sở thống kê).
  const sorted = [...slots].sort((a, b) => a.value - b.value);
  for (let i = 0; i + 2 < sorted.length; i += 1) {
    if (sorted[i].value + 1 === sorted[i + 1].value && sorted[i + 1].value + 1 === sorted[i + 2].value) {
      if (reassign(sorted[i + 1], (n) => !usedNow().includes(n - 1) && !usedNow().includes(n + 1))) break;
    }
  }
  return slots;
}

/** Chọn bóng Power: số còn lại lâu chưa ra ở vị trí bóng đặc biệt nhất (tất định, có seed). */
function pickSpecial({ rows, info, exclude, rand, det = 0 }) {
  const stats = specialStats(rows, info)
    .filter((row) => !exclude.includes(row.number))
    .sort((a, b) => b.gap - a.gap || a.count - b.count || a.number - b.number);
  const top = stats.slice(0, Math.min(3, stats.length));
  const pick = top.length ? top[(Math.floor(rand() * top.length) + det) % top.length] : null;
  return pick ?? { number: 1, gap: 0, count: 0 };
}

// ────────────────────────────── CÔNG CỤ CHO MODEL ──────────────────────────────

const fmt = (n) => String(n).padStart(2, "0");
const vnDate = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "?");

/**
 * Dựng câu trả lời cho công cụ từ DANH SÁCH KỲ QUAY ĐÃ CÓ — hàm THUẦN (không mạng, không đọc file),
 * nên test được offline và số liệu trong `modelText` luôn khớp đúng dữ liệu truyền vào.
 */
export function vietlottReport({ game = "mega645", draws = [], count = 3, strategy = "can_bang", stale = false } = {}) {
  const info = GAMES[normalizeGame(game) ?? "mega645"];
  const rows = ensureOrder(draws);
  if (!rows.length) return null;
  const newest = rows[rows.length - 1];
  const oldest = rows[0];
  /**
   * CỠ MẪU: mọi số liệu trong câu trả lời tính trên CHÍNH cỡ mẫu này (không trộn cửa sổ khác), để con
   * số nêu trong phần "Thống kê nổi bật" khớp đúng với lý do của từng bộ số.
   */
  const window = rows.length;
  const freq = frequency(rows, { numbers: info.max, window });
  const gapRows = gaps(rows);
  const dist = distribution(rows);
  const tickets = suggestTickets(rows, {
    // Khuôn trả lời của chủ dự án: đề xuất 3–5 bộ.
    count: Math.min(Math.max(Math.floor(Number(count) || 3), 3), 5),
    size: info.size,
    strategy,
    window,
  });

  /** Tần suất quan sát của một số = số kỳ có số đó / cỡ mẫu (đơn vị %). */
  const pct = (count) => `${((count / window) * 100).toFixed(1)}%`;
  const hotRows = freq.slice(0, 3);
  const coldRows = gapRows.slice(0, 3);
  const pairRows = pairs(rows, { limit: 3 });
  const hotText = hotRows.map((row) => `${fmt(row.number)} (${row.count} lần · ${pct(row.count)})`).join(", ");
  const coldText = coldRows.map((row) => `${fmt(row.number)} (${row.gap} kỳ)`).join(", ");
  // Bóng Power đã nằm trong `reason` (kèm số kỳ chưa ra) nên KHÔNG lặp lại ở đầu dòng.
  const ticketLines = tickets.map(
    (ticket, index) => `${index + 1}. ${ticket.numbers.map(fmt).join(" ")} — ${ticket.reason}`,
  );
  /** Bảng thống kê dựng sẵn: model chỉ việc bê nguyên số liệu, không tự tính lại (tránh sai số). */
  const statsTable = [
    "| Nhóm | Số | Số liệu |",
    "|---|---|---|",
    `| Về nhiều nhất | ${hotRows.map((row) => fmt(row.number)).join(", ")} | ${hotRows.map((row) => `${row.count} lần (${pct(row.count)})`).join(" · ")} |`,
    `| Lâu chưa về | ${coldRows.map((row) => fmt(row.number)).join(", ")} | ${coldRows.map((row) => `${row.gap} kỳ`).join(" · ")} |`,
    `| Cặp về cùng nhau | ${pairRows.map((row) => `${fmt(row.a)}–${fmt(row.b)}`).join(", ")} | ${pairRows.map((row) => `${row.count} kỳ`).join(" · ")} |`,
    `| Chẵn / lẻ | ${dist.evenOdd.even} / ${dist.evenOdd.odd} | ${((dist.evenOdd.even / (window * info.size)) * 100).toFixed(1)}% / ${((dist.evenOdd.odd / (window * info.size)) * 100).toFixed(1)}% |`,
    `| Thấp / cao (≤${dist.lowHigh.threshold}) | ${dist.lowHigh.low} / ${dist.lowHigh.high} | ${((dist.lowHigh.low / (window * info.size)) * 100).toFixed(1)}% / ${((dist.lowHigh.high / (window * info.size)) * 100).toFixed(1)}% |`,
    `| Tổng mỗi kỳ | p25–p75: ${dist.sum.band[0]}–${dist.sum.band[1]} | min ${dist.sum.min} · TB ${dist.sum.avg} · max ${dist.sum.max} |`,
  ].join("\n");

  return {
    ok: true,
    summary: `${info.name}: cỡ mẫu ${rows.length} kỳ (${vnDate(oldest.date)}–${vnDate(newest.date)}), đề xuất ${tickets.length} bộ số theo thống kê`,
    // Nguồn thật để lượt chat gắn khối "Nguồn tra cứu" như mọi công cụ tra cứu khác.
    sources: [
      { kind: "web", label: `Kết quả ${info.name} — ${SOURCE_NAME}`, url: `${SOURCE_HOME}${info.pathFor(null)}` },
    ],
    data: {
      game: info.id,
      gameName: info.name,
      source: { name: SOURCE_NAME, url: `${SOURCE_HOME}${info.pathFor(null)}` },
      draws: { count: rows.length, from: oldest.date, to: newest.date, newestId: newest.id },
      window,
      hot: freq.slice(0, 8),
      overdue: gapRows.slice(0, 8),
      pairs: pairs(draws, { limit: 5 }),
      distribution: dist,
      tickets,
      jackpotOdds: jackpotOddsText(info.id),
      /** Khối miễn trừ do SERVER ghép ở agent.js — model không phải (và không được) tự viết. */
      disclaimerAttachedByServer: true,
      ...(stale ? { stale: true } : {}),
    },
    artifacts: [],
    modelText:
      `DỮ LIỆU THẬT ${info.name.toUpperCase()} — nguồn ${SOURCE_NAME}, CỠ MẪU ${rows.length} kỳ gần nhất (${vnDate(oldest.date)}–${vnDate(newest.date)}).\n` +
      `Kỳ gần nhất ${newest.id ? `${newest.id} ` : ""}ngày ${vnDate(newest.date)}: ${newest.numbers.map(fmt).join(" ")}${newest.special ? ` | Bóng Power ${fmt(newest.special)}` : ""}.\n\n` +
      `BẢNG SỐ LIỆU (dùng nguyên các con số này, KHÔNG tự tính lại):\n${statsTable}\n\n` +
      `BỘ SỐ ĐỀ XUẤT (đúng ${tickets.length} bộ, mỗi bộ kèm 1 dòng lý do theo tiêu chí đã chọn):\n${ticketLines.join("\n")}\n\n` +
      `KHUÔN TRẢ LỜI BẮT BUỘC (giọng CHUYÊN GIA PHÂN TÍCH DỮ LIỆU: khô, rõ, đi thẳng vào số liệu; KHÔNG hô hào, KHÔNG cảm tính, KHÔNG từ marketing):\n` +
      `1) **Kỳ quay gần nhất** — ngày ${vnDate(newest.date)}: ${newest.numbers.map(fmt).join(" ")}${newest.special ? ` | Bóng Power ${fmt(newest.special)}` : ""}. Nêu rõ cỡ mẫu đang phân tích: "dựa trên ${rows.length} kỳ gần nhất (${vnDate(oldest.date)}–${vnDate(newest.date)})".\n` +
      `2) **Thống kê nổi bật** — chép bảng số liệu ở trên (Markdown table, tối đa 7 dòng): số về nhiều nhất kèm số lần/tần suất, số lâu chưa về kèm số kỳ, nhận xét 1 câu về phân bố chẵn/lẻ, thấp/cao và tổng.\n` +
      `3) **Đề xuất bộ số** — ${tickets.length} bộ (3–5 bộ), mỗi bộ MỘT dòng: bộ số + lý do ngắn theo tiêu chí (nóng / lâu chưa về / trải dải / tổng). Không thêm bộ nào ngoài danh sách trên.\n` +
      `4) **Ghi chú xác suất** — do server tự gắn ở cuối câu trả lời: em KHÔNG viết lại, chỉ cần nói 1 câu rằng đây là mô tả thống kê của mẫu quá khứ.\n\n` +
      `GIỌNG VĂN & NGÔN NGỮ (bắt buộc): dùng ngôn ngữ xác suất chuẩn — "xác suất", "kỳ vọng toán học", "cỡ mẫu", "các kỳ độc lập", "không làm thay đổi xác suất". ` +
      `Tần suất trong mẫu chỉ là mô tả quá khứ, KHÔNG phải kỳ vọng cho kỳ tới; mọi bộ 6 số đều có cùng xác suất. ` +
      `CẤM: "số dễ trúng", "chắc trúng", "chắc ăn", "tăng khả năng trúng", "bí kíp", "cầu đẹp", "đảm bảo", "vào bờ", "may mắn", "thần tài", "phát tài". ` +
      `KHÔNG doạ nạt, KHÔNG bịa thêm kỳ quay hay số liệu ngoài dữ liệu trên. Xưng hô theo đúng cách người dùng đang dùng (họ xưng "anh" ⇒ gọi "anh" và tự xưng "em"; xưng "chị" ⇒ gọi "chị"; xưng "em"/"mình" thì theo luật xưng hô chung của fBuddy). ` +
      `Độ dài: phần lời khuyên tối đa ~250 từ; số liệu để trong bảng/danh sách cho dễ đọc. Xác suất Jackpot ${info.name} là ${jackpotOddsText(info.id)}.`,
  };
}

/**
 * Handler của công cụ `vietlott`: lấy dữ liệu THẬT (có cache) rồi dựng câu trả lời bằng
 * `vietlottReport`. Không bao giờ ném lỗi; không lấy được dữ liệu thì nói thật, KHÔNG bịa kỳ quay.
 */
export async function vietlottAdvice(args = {}, ctx = {}) {
  const requested = normalizeGame(args?.game ?? args?.gameId ?? "") ?? gameFromMessage(ctx?.userMessage ?? "");
  if (!requested) {
    return {
      ok: false,
      summary: "Cần biết người dùng hỏi xổ số nào",
      data: { games: Object.values(GAMES).map((info) => ({ id: info.id, name: info.name })) },
      artifacts: [],
      error: "game_required",
      modelText:
        "Chưa rõ người dùng hỏi Mega 6/45 hay Power 6/55. Hãy hỏi lại MỘT câu ngắn cho rõ rồi gọi lại công cụ với `game` — KHÔNG tự chọn hộ và KHÔNG đoán số khi chưa có dữ liệu thật.",
    };
  }
  const info = GAMES[requested];
  const report = await getDraws(info.id, {});
  if (!report.draws.length) {
    return {
      ok: false,
      summary: `Chưa lấy được kết quả ${info.name} từ ${SOURCE_NAME}`,
      data: { game: info.id, source: SOURCE_NAME, error: report.error ?? null },
      artifacts: [],
      error: "source_unavailable",
      modelText:
        `LỖI NGUỒN: hiện chưa lấy được kết quả ${info.name} thật từ ${SOURCE_NAME}` +
        (report.error ? ` (${report.error})` : "") +
        ". Hãy nói THẬT với người dùng là chưa lấy được dữ liệu kỳ quay nên chưa gợi ý số, và đề nghị thử lại sau — TUYỆT ĐỐI không bịa số liệu, không bịa kỳ quay.",
    };
  }
  return {
    ok: true,
    artifacts: [],
    ...vietlottReport({
      game: info.id,
      draws: report.draws,
      count: args?.count,
      strategy: args?.strategy ?? "can_bang",
      stale: Boolean(report.stale),
    }),
  };
}
