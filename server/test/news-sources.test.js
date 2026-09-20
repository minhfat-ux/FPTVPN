// Nguồn tin miễn phí (Google News RSS + RSS báo lớn VN): dựng truy vấn, đọc RSS, lọc theo độ mới.
// Chỉ test hàm THUẦN — không gọi mạng, để bộ test không phụ thuộc việc báo/toà soạn có trả lời hay không.
import test from "node:test";
import assert from "node:assert/strict";

const { buildNewsQueries, parseRssItems, filterFresh, isRelevantNews } = await import("../src/news-sources.js");

test("dựng truy vấn: bỏ từ để hỏi và từ chỉ thời gian, giữ phần cốt lõi", () => {
  assert.deepEqual(buildNewsQueries("giá vàng hôm nay"), ["giá vàng"]);
  assert.deepEqual(buildNewsQueries("tin công nghệ mới nhất"), ["công nghệ"]);
  assert.deepEqual(buildNewsQueries("thời sự Việt Nam hôm nay"), ["thời sự việt nam"]);
  assert.deepEqual(buildNewsQueries("chính sách mới nhất về thuế"), ["chính sách thuế"]);
});

test("dựng truy vấn: lõi 1 từ thì kèm bản đầy đủ để có ngữ cảnh, tối đa 2 truy vấn", () => {
  const queries = buildNewsQueries("tin AI mới nhất hôm nay");
  assert.equal(queries.length, 2);
  assert.equal(queries[0], "ai", "phải rút về đúng từ khoá chính");
  assert.ok(queries.every((query) => query.trim().length > 0));
});

test("dựng truy vấn: câu hỏi rỗng hoặc toàn dấu câu thì lùi về truy vấn mặc định", () => {
  assert.deepEqual(buildNewsQueries(""), ["tin mới nhất"]);
  assert.deepEqual(buildNewsQueries("   "), ["tin mới nhất"]);
  assert.deepEqual(buildNewsQueries("???!!!"), ["tin mới nhất"]);
});

test("đọc RSS 2.0: lấy tiêu đề, link, ngày công bố (ISO) và tên toà soạn", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0"><channel><title>Bản tin - Google Tin tức</title>
      <item>
        <title>Giá vàng hôm nay 20/9: SJC ổn định - Báo Quân đội nhân dân</title>
        <link>https://news.google.com/rss/articles/CBMiABC?oc=5</link>
        <pubDate>Sun, 20 Sep 2026 09:39:00 GMT</pubDate>
        <source url="https://www.qdnd.vn">Báo Quân đội nhân dân</source>
        <description>&lt;a href="https://x.vn"&gt;Giá vàng SJC ổn định&lt;/a&gt;</description>
      </item>
    </channel></rss>`;
  const items = parseRssItems(xml);
  assert.equal(items.length, 1, "tiêu đề của <channel> KHÔNG được tính là một tin");
  assert.equal(items[0].title, "Giá vàng hôm nay 20/9: SJC ổn định - Báo Quân đội nhân dân");
  assert.equal(items[0].url, "https://news.google.com/rss/articles/CBMiABC?oc=5");
  assert.equal(items[0].publishedAt, "2026-09-20T09:39:00.000Z");
  assert.equal(items[0].source, "Báo Quân đội nhân dân", "lấy tên báo từ thẻ <source> của Google News");
});

test("đọc RSS báo VN: CDATA, link dạng chữ, không có <source> thì lấy tên miền", () => {
  const xml = `<rss version="2.0"><channel><title>VnExpress</title><item>
      <title><![CDATA[Mật độ tinh trùng thấp, điều trị thế nào?]]></title>
      <description><![CDATA[<a href="https://vnexpress.net/a.html"><img src="x.png"></a> Nội dung tóm tắt.]]></description>
      <pubDate>Sun, 20 Sep 2026 15:00:00 +0700</pubDate>
      <link>https://vnexpress.net/a-5122372.html</link>
    </item></channel></rss>`;
  const items = parseRssItems(xml);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Mật độ tinh trùng thấp, điều trị thế nào?");
  assert.equal(items[0].url, "https://vnexpress.net/a-5122372.html");
  assert.equal(items[0].source, "vnexpress.net");
  assert.equal(items[0].snippet, "Nội dung tóm tắt.", "phải bóc được chữ khỏi CDATA + thẻ HTML");
});

test("mô tả bị escape (Google News): giải mã entity TRƯỚC khi bỏ thẻ, snippet không còn thẻ thừa", () => {
  const xml = `<rss><channel><item>
      <title>Tin AI mới - Báo X</title>
      <link>https://news.google.com/rss/articles/CBMiABC?oc=5</link>
      <pubDate>Sun, 20 Sep 2026 09:39:00 GMT</pubDate>
      <description>&lt;ol&gt;&lt;li&gt;&lt;a href="https://news.google.com/rss/articles/CBMiABC"&gt;Tin AI mới&lt;/a&gt;&lt;/li&gt;&lt;/ol&gt;</description>
    </item></channel></rss>`;
  const items = parseRssItems(xml);
  assert.equal(items.length, 1);
  assert.equal(items[0].snippet, "Tin AI mới", "snippet phải là CHỮ, không phải 'a href=\"https://…'");
  assert.doesNotMatch(items[0].snippet, /href|<|>/);
});

test("đọc Atom: link nằm trong thuộc tính href, ngày ở <published>", () => {
  const xml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
    <entry><title>Ra mắt mô hình mới</title>
      <link href="https://example.com/bai-viet"/>
      <published>2026-09-20T08:30:00Z</published>
    </entry></feed>`;
  const items = parseRssItems(xml);
  assert.equal(items.length, 1);
  assert.equal(items[0].url, "https://example.com/bai-viet");
  assert.equal(items[0].publishedAt, "2026-09-20T08:30:00.000Z");
});

test("RSS thiếu field: thiếu tiêu đề hoặc thiếu link thì BỎ, và ngày không đọc được để null (không bịa)", () => {
  const xml = `<rss><channel>
    <item><title>Chỉ có tiêu đề, không có link</title><pubDate>Sun, 20 Sep 2026 09:39:00 GMT</pubDate></item>
    <item><link>https://vnexpress.net/khong-tieu-de.html</link></item>
    <item><title>Ngày rác</title><link>https://x.vn/c.html</link><pubDate>không-phải-ngày</pubDate></item>
    <item><title>Không có ngày</title><link>https://x.vn/d.html</link></item>
  </channel></rss>`;
  const items = parseRssItems(xml);
  assert.deepEqual(items.map((item) => item.title), ["Ngày rác", "Không có ngày"]);
  assert.equal(items[0].publishedAt, null);
  assert.equal(items[1].publishedAt, null);
});

test("XML hỏng hoặc đầu vào rỗng ⇒ trả mảng rỗng, không ném lỗi", () => {
  assert.deepEqual(parseRssItems(""), []);
  assert.deepEqual(parseRssItems("   "), []);
  assert.deepEqual(parseRssItems(null), []);
  assert.deepEqual(parseRssItems("<rss><channel><title>Feed còn dở"), []);
  assert.deepEqual(parseRssItems("<item><title>Thiếu thẻ đóng"), []);
});

test("lọc theo độ mới: bỏ tin cũ và tin KHÔNG có ngày, giữ tin trong hạn", () => {
  const now = Date.now();
  const items = [
    { title: "hôm nay", publishedAt: new Date(now - 2 * 3600 * 1000).toISOString() },
    { title: "hôm qua", publishedAt: new Date(now - 30 * 3600 * 1000).toISOString() },
    { title: "tuần trước", publishedAt: new Date(now - 9 * 86400 * 1000).toISOString() },
    { title: "không rõ ngày", publishedAt: null },
  ];
  assert.deepEqual(filterFresh(items, 2).map((item) => item.title), ["hôm nay", "hôm qua"]);
  assert.deepEqual(filterFresh(items, 30).map((item) => item.title), ["hôm nay", "hôm qua", "tuần trước"]);
  assert.equal(filterFresh(items, 0).length, 4, "không truyền hạn thì không lọc");
});

test("lọc theo câu hỏi cho feed TIN CHUNG: khớp theo TỪ, không khớp chuỗi con", () => {
  assert.equal(isRelevantNews({ title: "Giá vàng SJC tăng mạnh" }, "giá vàng hôm nay"), true);
  assert.equal(isRelevantNews({ title: "Thời tiết Hà Nội" }, "giá vàng hôm nay"), false);
  // "ai" là chuỗi con của "Hai", "Mai", "vai" ⇒ không được coi là liên quan.
  assert.equal(isRelevantNews({ title: "Hai người nhập viện sau va chạm" }, "tin AI mới nhất hôm nay"), false);
  assert.equal(isRelevantNews({ title: "OpenAI ra mắt mô hình AI mới" }, "tin AI mới nhất hôm nay"), true);
  // Tiếng Việt tách bằng dấu cách nên một TIẾNG không phải một từ: "công" không đủ để nhận bài về
  // "dịch vụ công" khi câu hỏi là "công nghệ".
  assert.equal(isRelevantNews({ title: "Dịch vụ công ở TP.HCM đến tận khu phố" }, "tin công nghệ mới nhất"), false);
  assert.equal(isRelevantNews({ title: "Quảng Ninh phát triển công nghiệp bán dẫn, công nghệ cao" }, "tin công nghệ mới nhất"), true);
});
