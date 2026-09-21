// Researcher: bỏ phát hiện TRÙNG URL, không đoán ngày từ chữ trong bài, và RSS chạy song song + cache.
//
// Ba chỗ này đều là lỗi ĐO ĐƯỢC trên bản trước:
//   - nhiều slot trong 8 phát hiện là CÙNG một trang (bài wiki bị lấy hai lần, Google News và RSS
//     trang chủ cùng trỏ về một bài) — người dùng mất chỗ cho nguồn thật;
//   - trang wiki/tin cũ có chữ "hôm nay" bị gắn ngày chạy máy rồi xếp LÊN TRÊN tin thật;
//   - RSS chạy SAU khi tìm kiếm web xong nên mỗi lượt tra tin cộng thêm 1–2 giây.
//
// Bộ test này KHÔNG gọi mạng: `fetch` được thay bằng stub, để kết quả không phụ thuộc việc báo/toà
// soạn có trả lời hay không (DuckDuckGo còn chặn IP máy Mac bằng 202 + captcha).
import test, { after } from "node:test";
import assert from "node:assert/strict";

// Đường tìm kiếm web (Tavily) không được bật trong test: đo đường DuckDuckGo như mặc định của repo.
process.env.SEARCH_API_KEY = "";

const { research, extractDate, normalizeUrl, vnNow } = await import("../src/researcher.js");

const REAL_FETCH = globalThis.fetch;
after(() => {
  globalThis.fetch = REAL_FETCH;
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Trả lời giả giống `Response`: researcher chỉ dùng `ok`, `status`, `text()` và `json()`. */
function reply(status, body) {
  return { ok: status >= 200 && status < 300, status, text: async () => body, json: async () => JSON.parse(body) };
}

const calls = [];

/**
 * Thay `fetch` bằng bảng route theo chuỗi con trong URL. Route không khớp ⇒ 404 — đúng như khi một
 * nguồn ngoài hỏng, và researcher phải chịu được (không được ném ra ngoài).
 */
function stubFetch(routes) {
  calls.length = 0;
  globalThis.fetch = async (url) => {
    const target = String(url);
    calls.push(target);
    for (const [needle, respond] of routes) {
      if (!target.includes(needle)) continue;
      const body = await respond(target);
      if (body === null) return reply(404, "");
      return reply(200, body);
    }
    return reply(404, "");
  };
}

const rssCalls = () => calls.filter((url) => url.includes("/rss") || url.includes("news.google.com")).length;

function rssXml(items) {
  const blocks = items
    .map(
      (item) =>
        `<item><title>${item.title}</title><link>${item.url}</link>` +
        `<pubDate>${item.pubDate ?? new Date(Date.now() - 60000).toUTCString()}</pubDate>` +
        (item.source ? `<source>${item.source}</source>` : "") +
        `<description>${item.description ?? ""}</description></item>`,
    )
    .join("");
  return `<rss version="2.0"><channel><title>Feed</title>${blocks}</channel></rss>`;
}

// Câu hỏi này rơi vào hồ sơ "ai" ⇒ cần độ mới (có "mới nhất"/"hôm nay") và KHÔNG phải loại chỉ dùng
// nguồn chính thống, nên đi đúng đường có RSS.
const QUESTION = "tin AI mới nhất hôm nay";

// Bài wiki CŨ nhưng trong bài có chữ "hôm nay" — bản trước lấy đúng chữ đó làm ngày công bố. Đây là
// ca thật đã gặp: "Thời sự (VTV)", "VTV1" được gắn ngày chạy máy rồi xếp lên trên tin của báo.
const WIKI_EXTRACT =
  "Trí tuệ nhân tạo (AI) là một ngành của khoa học máy tính. Bản tin hôm nay cho thấy các mô hình mới đang được cập nhật liên tục.";

// DuckDuckGo: kết quả KHÔNG có nhãn ngày (`result__timestamp`), chỉ có chữ "hôm nay" trong mô tả.
// Kết quả đầu trỏ về ĐÚNG bài mà RSS cũng trả về ⇒ phải gộp làm một và giữ bản có ngày thật.
const DDG_HTML = `
  <div class="result">
    <a class="result__a" href="https://vnexpress.net/tin-ai-1.html">Mo hinh AI moi nhat</a>
    <a class="result__snippet" href="https://vnexpress.net/tin-ai-1.html">Cap nhat hom nay: mo hinh AI moi nhat</a>
  </div>
  <div class="result">
    <a class="result__a" href="https://example.com/bai-viet">Ban tin hom nay</a>
    <a class="result__snippet" href="https://example.com/bai-viet">Cap nhat hom nay, bai nay khong ghi ngay cong bo</a>
  </div>`;

/**
 * Wikipedia trả hai kiểu: `list=search` cho danh sách kết quả, và `titles=` cho nội dung bài.
 *
 * Trang wiki bị gọi HAI lần cho một lượt tra (một lần theo hồ sơ, một lần theo nguồn "wikipedia") —
 * đúng ca trùng URL đã đo được trên VPS ("Thời sự (VTV)", "VTV1" mỗi cái hai slot).
 */
const wikiRoute = (url) =>
  String(url).includes("list=search")
    ? JSON.stringify({ query: { search: [{ title: "Trí tuệ nhân tạo" }] } })
    : JSON.stringify({ query: { pages: { "1": { title: "Trí tuệ nhân tạo", extract: WIKI_EXTRACT } } } });

test("chuẩn hoá URL để so trùng: bỏ utm/fbclid, http-https, www, dấu / cuối và #neo", () => {
  const page = normalizeUrl("https://vnexpress.net/tin-ai-1.html");
  assert.equal(normalizeUrl("http://vnexpress.net/tin-ai-1.html?utm_source=facebook&utm_medium=social"), page);
  assert.equal(normalizeUrl("https://www.vnexpress.net/tin-ai-1.html/"), page);
  assert.equal(normalizeUrl("https://VnExpress.net/tin-ai-1.html#top"), page);
  assert.equal(normalizeUrl("https://vnexpress.net/tin-ai-1.html?fbclid=abc123"), page);
  // Bài KHÁC thì không được gộp — gộp bừa là mất nguồn thật.
  assert.notEqual(normalizeUrl("https://vnexpress.net/tin-ai-2.html"), page);
  // Tham số THẬT phải giữ: `oc=5` của Google News phân biệt bài này với bài khác.
  assert.notEqual(
    normalizeUrl("https://news.google.com/rss/articles/AAA?oc=5"),
    normalizeUrl("https://news.google.com/rss/articles/BBB?oc=5"),
  );
  assert.equal(normalizeUrl(""), "", "URL rỗng ⇒ khoá rỗng, không được ném lỗi");
});

test("ngày của bài viết: KHÔNG đoán từ chữ tương đối, chỉ nhận ngày ghi đủ ngày–tháng–năm", () => {
  // Đây là lỗi đã đo: chữ "hôm nay"/"mới đăng" trong BÀI không phải ngày công bố của bài.
  assert.equal(extractDate("Giá vàng hôm nay 20/9 tăng mạnh"), null);
  assert.equal(extractDate("Tin mới đăng, cập nhật liên tục"), null);
  assert.equal(extractDate("Cập nhật 3 giờ trước"), null);
  assert.equal(extractDate("Đăng hôm qua"), null);

  // Ngày ghi đủ ngày–tháng–năm thì vẫn nhận, đủ các dạng nguồn VN hay dùng.
  const expected = "2026-09-20T00:00:00.000Z";
  assert.equal(extractDate("Bản tin ngày 20/9/2026").toISOString(), expected);
  assert.equal(extractDate("20-09-2026").toISOString(), expected);
  assert.equal(extractDate("2026-09-20").toISOString(), expected);
  assert.equal(extractDate("20 tháng 9 năm 2026").toISOString(), expected);
  assert.equal(extractDate("20 thg 9, 2026").toISOString(), expected);
  assert.equal(extractDate("Sep 20, 2026").toISOString(), expected);

  // Nhãn thời gian THẬT (RSS, `result__timestamp` của DuckDuckGo) thì mốc tương đối vẫn dùng được —
  // ở đó mốc do chính nguồn sinh ra, không phải chữ trong bài.
  const today = extractDate("hôm nay", { allowRelative: true });
  assert.equal(vnNow().iso, new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" }).format(today));
  const hours = extractDate("3 giờ trước", { allowRelative: true });
  assert.ok(Math.abs(Date.now() - 3 * 3600000 - hours.getTime()) < 5000, "3 giờ trước ⇒ đúng mốc 3 giờ");
});

test("RSS chạy SONG SONG với tìm kiếm web, không đợi search xong", async () => {
  let rssStartedAt = null;
  let searchFinishedAt = null;
  stubFetch([
    [
      "/rss",
      () => {
        rssStartedAt ??= Date.now();
        return rssXml([{ title: "Mo hinh cong nghe moi nhat", url: "https://vnexpress.net/tin-cn-1.html", source: "VnExpress" }]);
      },
    ],
    [
      "html.duckduckgo.com",
      async () => {
        await delay(120);
        searchFinishedAt = Date.now();
        return DDG_HTML;
      },
    ],
    ["wikipedia.org/w/api.php", wikiRoute],
  ]);

  // Câu hỏi KHÁC test dưới (cache tra cứu của researcher giữ kết quả 10 phút theo câu hỏi).
  await research({ question: "tin công nghệ mới nhất hôm nay" });

  assert.ok(rssStartedAt !== null, "lượt tra tin phải gọi RSS");
  assert.ok(searchFinishedAt !== null, "tìm kiếm web vẫn phải chạy");
  assert.ok(
    rssStartedAt < searchFinishedAt,
    `RSS phải BẮT ĐẦU trước khi tìm kiếm web xong (rss=${rssStartedAt}, search=${searchFinishedAt})`,
  );
});

test("một URL chỉ chiếm một slot, và ngày ưu tiên bản có ngày công bố thật", async () => {
  stubFetch([
    [
      "news.google.com/rss/search",
      () => rssXml([{ title: "Mo hinh AI moi", url: "https://vnexpress.net/tin-ai-1.html?utm_source=facebook", source: "VnExpress" }]),
    ],
    [
      "vnexpress.net/rss",
      () => rssXml([{ title: "Mo hinh AI moi nhat", url: "https://vnexpress.net/tin-ai-1.html", source: "VnExpress" }]),
    ],
    ["html.duckduckgo.com", () => DDG_HTML],
    ["wikipedia.org/w/api.php", wikiRoute],
  ]);

  const result = await research({ question: QUESTION });
  const urls = result.findings.map((finding) => normalizeUrl(finding.url));

  assert.ok(result.findings.length > 0, "phải có phát hiện để kiểm tra");
  assert.equal(new Set(urls).size, urls.length, `URL không được trùng slot: ${urls.join(" · ")}`);

  // Bài wiki được lấy hai lần ở bản trước (một lần theo hồ sơ, một lần theo nguồn "wikipedia").
  assert.equal(result.findings.filter((finding) => finding.url.includes("wikipedia.org")).length, 1);

  // Bài có cả bản RSS (có ngày) lẫn bản DuckDuckGo (không ngày), lại thêm `?utm_source`: giữ MỘT bản,
  // và bản giữ được phải là bản có ngày công bố thật.
  const page = result.findings.filter((finding) => normalizeUrl(finding.url) === "https://vnexpress.net/tin-ai-1.html");
  assert.equal(page.length, 1, "Google News + RSS trang chủ + DuckDuckGo cùng một bài ⇒ một slot");
  assert.equal(page[0].detectedAt, vnNow().iso, "giữ bản có ngày công bố thật của RSS");

  // Trang wiki có chữ "hôm nay" và bài DuckDuckGo không có nhãn ngày: KHÔNG được gắn ngày hôm nay.
  const wiki = result.findings.find((finding) => finding.url.includes("wikipedia.org"));
  assert.equal(wiki.detectedAt, null, "bài wiki có chữ 'hôm nay' không được gắn ngày chạy máy");
  const undated = result.findings.find((finding) => finding.url.includes("example.com/bai-viet"));
  assert.equal(undated.detectedAt, null, "bài không có ngày công bố phải để 'không rõ ngày'");
});

test("cache RSS: câu hỏi lặp lại (cùng câu sau chuẩn hoá) không gọi lại nguồn tin", async () => {
  stubFetch([
    ["news.google.com/rss/search", () => rssXml([{ title: "Mo hinh AI moi", url: "https://vnexpress.net/tin-ai-2.html", source: "VnExpress" }])],
    ["html.duckduckgo.com", () => DDG_HTML],
    ["wikipedia.org/w/api.php", wikiRoute],
  ]);

  const first = await research({ question: "tin bóng đá mới nhất hôm nay" });
  assert.ok(rssCalls() > 0, "lượt đầu phải gọi RSS thật");

  calls.length = 0;
  // Cùng câu hỏi, chỉ khác dấu "?" ⇒ sau chuẩn hoá là MỘT câu, phải dùng lại kết quả đã cache.
  const second = await research({ question: "tin bóng đá mới nhất hôm nay?" });

  assert.equal(rssCalls(), 0, "lượt lặp lại không được gọi lại RSS");
  assert.deepEqual(
    second.findings.map((finding) => finding.url),
    first.findings.map((finding) => finding.url),
    "lượt lặp lại phải trả về đúng kết quả đã cache",
  );
});
