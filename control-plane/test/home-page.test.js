import test from "node:test";
import assert from "node:assert/strict";
import { homePageHTML, esc, pickHomeLang } from "../src/home-page.js";

/**
 * Trang chủ FlowTech (/): mặt tiền công khai của hệ sinh thái (VPNFlow + MeetFlow AI +
 * FlowTech Harness). Test này chốt những thứ dễ vỡ và dễ nói sai:
 *   - đủ 5 ngôn ngữ, chữ thật khác nhau (không phải bản sao tiếng Việt);
 *   - dữ liệu động (gói, đánh giá, email) phải được escape — không XSS;
 *   - không lọt "undefined"/"[object Object]" ra HTML khách đọc;
 *   - plans rỗng ⇒ KHÔNG có khối bảng giá; reviews rỗng ⇒ KHÔNG có khối đánh giá
 *     (trang không được bịa đánh giá);
 *   - popup quảng cáo chéo có role="dialog" + nút "không hiện lại" + khoá localStorage;
 *   - SEO: canonical/og:title chỉ khi có canonicalUrl.
 */

const LANGS = ["en", "vi", "zh", "ja", "ko"];

/** Gói đúng dạng row của PlanStore (data/plans.json): id/amount/days/label/badge/retired. */
const PLAN_ROWS = [
  { id: "monthly", amount: 200000, days: 30, label: "Monthly (200,000 VND / 30 days)", badge: "Monthly", retired: false },
  { id: "quarterly", amount: 550000, days: 90, label: "3 Months (550,000 VND / 90 days)", badge: "3 Months", retired: false },
  { id: "semiannual", amount: 950000, days: 180, label: "6 Months (950,000 VND / 90 days)", badge: "6 Months", retired: false },
  { id: "yearly", amount: 1800000, days: 365, label: "Yearly", badge: "Yearly", retired: false },
  // Gói đã ngừng bán: phải biến mất khỏi bảng giá (giống trang /buy lọc retired).
  { id: "lifetime", amount: 1500000, days: null, label: "Lifetime", badge: "Lifetime", retired: true },
];

function page(options = {}) {
  return homePageHTML({ lang: "vi", ...options });
}

/** Lấy một khối <section> theo id (không dùng regex "cả trang" để tránh bắt nhầm). */
function section(html, id) {
  const m = html.match(new RegExp(`<section class="section" id="${id}"[\\s\\S]*?</section>`));
  return m ? m[0] : "";
}

function heroTitle(html) {
  const m = html.match(/<h1 id="heroTitle">([\s\S]*?)<\/h1>/);
  assert.ok(m, "trang phải có <h1 id=\"heroTitle\">");
  return m[1].trim();
}

test("(a) trang chủ render đủ 5 ngôn ngữ với chữ thật khác nhau", () => {
  const titles = new Map();
  const expectedNav = { vi: "Mua ngay", en: "Buy now", zh: "立即购买", ja: "今すぐ購入", ko: "지금 구매" };
  for (const lang of LANGS) {
    const html = homePageHTML({ lang, plans: PLAN_ROWS });
    assert.match(html, /^<!doctype html>/i, `${lang}: thiếu doctype`);
    assert.ok(html.includes(`href="?lang=${lang}"`), `${lang}: thiếu link đổi ngôn ngữ ?lang=`);
    assert.ok(html.includes(expectedNav[lang]), `${lang}: thiếu nút CTA "${expectedNav[lang]}"`);
    assert.ok(html.includes("FlowTech"), `${lang}: thiếu brand FlowTech`);
    titles.set(lang, heroTitle(html));
  }
  assert.equal(new Set(titles.values()).size, LANGS.length, "tiêu đề hero phải khác nhau thật giữa 5 ngôn ngữ");
  assert.notEqual(titles.get("vi"), titles.get("en"), "tiếng Việt không được trùng tiếng Anh");
  // <html lang> theo từng ngôn ngữ (zh dùng zh-Hans như trang /buy).
  assert.ok(homePageHTML({ lang: "zh" }).includes('<html lang="zh-Hans">'));
  assert.ok(homePageHTML({ lang: "ja" }).includes('<html lang="ja">'));
});

test("(a2) mã ngôn ngữ lạ ⇒ về vi; esc()/pickHomeLang() đúng hợp đồng", () => {
  assert.equal(pickHomeLang("fr"), "vi");
  assert.equal(pickHomeLang("ko"), "ko");
  assert.equal(esc("<a href=\"x\">'&'</a>"), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  assert.equal(esc(null), "");
});

test("(b) esc() chặn XSS: tên gói / đánh giá / email có <script> đều bị escape", () => {
  const html = page({
    plans: [{ id: "evil", amount: 1000, days: 30, badge: '<script>alert(1)</script>', label: "x" }],
    reviews: [{ name: "<img src=x onerror=alert(2)>", text: "<script>alert(3)</script>", stars: 5 }],
    supportEmail: '"><script>alert(4)</script>@x.test',
  });
  assert.ok(!html.includes("<script>alert("), "không được để <script> thô trong HTML");
  assert.ok(!html.includes("<img src=x onerror="), "không được để thuộc tính onerror thô");
  assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"), "tên gói phải được escape trong HTML");
  assert.ok(html.includes("&lt;script&gt;alert(3)&lt;/script&gt;"), "nội dung đánh giá phải được escape");
  assert.ok(!/<script>\s*alert/.test(html), "không được có script do dữ liệu chèn vào");
});

test("(c) không lọt 'undefined' / '[object Object]' khi dữ liệu thiếu field", () => {
  const cases = [
    page(), // không truyền gì
    page({ plans: [] }),
    page({ plans: [null, {}, { id: "weird" }, "không phải object", { id: "p1", price: "Liên hệ" }] }),
    page({ plans: PLAN_ROWS, downloads: {}, user: null, reviews: undefined }),
    homePageHTML({ lang: "ko", plans: PLAN_ROWS, downloads: { ios: "/v1/downloads/ios", mac: "/install/mac" } }),
    homePageHTML({ lang: "zh", plans: PLAN_ROWS, user: { email: "a@b.test" }, canonicalUrl: "https://meetflowai.site/" }),
  ];
  for (const [i, html] of cases.entries()) {
    assert.ok(!html.includes("undefined"), `case ${i}: lọt chữ "undefined"`);
    assert.ok(!html.includes("[object Object]"), `case ${i}: lọt "[object Object]"`);
    assert.ok(!html.includes("NaN"), `case ${i}: lọt NaN`);
    assert.ok(!/\{[a-zA-Z]+\}/.test(html), `case ${i}: còn chỗ trống {placeholder} chưa điền`);
  }
});

test("(d) plans rỗng ⇒ KHÔNG render khối bảng giá (không có bảng trống)", () => {
  const html = page({ plans: [] });
  assert.equal(section(html, "pricing"), "", "plans rỗng mà vẫn có khối pricing");
  assert.ok(!html.includes('id="pricing"'), "không được có neo #pricing khi không có bảng giá");
  // Có gói đang bán ⇒ khối bảng giá xuất hiện, kèm giá và gói retired bị ẩn.
  const withPlans = page({ plans: PLAN_ROWS });
  const pricing = section(withPlans, "pricing");
  assert.ok(pricing.includes('id="pricingTitle"'), "thiếu khối bảng giá khi có gói");
  assert.ok(pricing.includes("200.000 đ") || pricing.includes("200,000 đ"), "thiếu giá gói monthly");
  assert.ok(!pricing.includes("Lifetime"), "gói retired không được hiện trong bảng giá");
  assert.ok(!pricing.includes("1.500.000"), "gói retired không được hiện giá");
});

test("(e) reviews rỗng ⇒ KHÔNG render khối đánh giá; có reviews thật thì mới render", () => {
  for (const empty of [[], undefined, null, [{ name: "x" }], [{ text: "   " }]]) {
    const html = page({ reviews: empty });
    assert.equal(section(html, "reviews"), "", "không có đánh giá thật thì khối đánh giá phải biến mất");
    assert.ok(!html.includes('id="reviews"'));
  }
  const html = page({ reviews: [{ name: "Nguyễn A", text: "Cài nhanh, kích hoạt sau vài phút.", stars: 5 }] });
  const block = section(html, "reviews");
  assert.ok(block.includes("Nguyễn A"), "thiếu tên người đánh giá");
  assert.ok(block.includes("Cài nhanh"), "thiếu nội dung đánh giá");
  assert.ok(block.includes("★★★★★"), "thiếu sao đánh giá");
});

test("(f) popup quảng cáo chéo: role=dialog, aria-modal, nút 'không hiện lại', khoá localStorage", () => {
  const html = page();
  assert.ok(html.includes('role="dialog"'), "popup phải có role=dialog");
  assert.ok(html.includes('aria-modal="true"'), "popup phải có aria-modal");
  assert.ok(html.includes('aria-labelledby="promoTitle"'), "popup phải gắn aria-labelledby");
  assert.ok(html.includes('id="promoNever"'), "thiếu nút không hiện lại");
  assert.ok(html.includes("Không hiện lại"), "nút không hiện lại thiếu chữ hiển thị");
  assert.ok(html.includes('id="promoClose"'), "thiếu nút đóng popup");
  assert.ok(html.includes("flowtech_promo_never"), "thiếu khoá localStorage cho lựa chọn không hiện lại");
  assert.ok(html.includes("localStorage.setItem") || html.includes("writeFlag(window.localStorage"), "phải ghi localStorage khi chọn không hiện lại");
  assert.ok(html.includes('e.key === "Escape"'), "phải đóng được bằng Esc");
  assert.ok(html.includes("1500"), "popup phải hiện sau ~1.5s");
  // 2 CTA trong popup: mua VPNFlow + dùng MeetFlow AI.
  const popup = html.match(/<div class="promo"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/);
  assert.ok(popup, "không tìm thấy khối popup");
  assert.ok(popup[0].includes('href="/buy"'), "popup thiếu CTA mua VPNFlow");
  assert.ok(popup[0].includes('href="/ai/buy"'), "popup thiếu CTA MeetFlow AI");
});

test("(g) canonical + og:title chỉ khi truyền canonicalUrl", () => {
  const withCanonical = page({ canonicalUrl: "https://meetflowai.site/" });
  assert.ok(withCanonical.includes('<link rel="canonical" href="https://meetflowai.site/">'));
  assert.ok(withCanonical.includes('<meta property="og:title"'), "thiếu og:title");
  assert.ok(withCanonical.includes('<meta property="og:description"'), "thiếu og:description");
  assert.ok(withCanonical.includes('<meta property="og:url" content="https://meetflowai.site/">'));
  assert.ok(withCanonical.includes('<meta name="description"'), "thiếu meta description");
  const withoutCanonical = page();
  assert.ok(!withoutCanonical.includes('rel="canonical"'), "không truyền canonicalUrl thì không render canonical");
  assert.ok(withoutCanonical.includes('<meta property="og:title"'), "og:title vẫn phải có");
});

test("(h) email hỗ trợ xuất hiện ở footer (và trong FAQ)", () => {
  const html = page({ supportEmail: "hotro@flowtech.test" });
  const footer = html.match(/<footer class="footer">[\s\S]*<\/footer>/);
  assert.ok(footer, "thiếu footer");
  assert.ok(footer[0].includes("hotro@flowtech.test"), "footer thiếu email hỗ trợ");
  assert.ok(footer[0].includes('href="mailto:hotro@flowtech.test"'), "footer thiếu mailto");
  assert.ok(html.includes('href="/buy"') && html.includes('href="/ai/buy"'), "footer thiếu link mua");
  for (const path of ["/guide", "/install/ios", "/support", "/privacy", "/terms"]) {
    assert.ok(html.includes(`href="${path}"`), `footer thiếu link ${path}`);
  }
});

test("(i) bảng giá: gói AI trỏ /ai/buy, gói vĩnh viễn ghi rõ không hết hạn", () => {
  const html = page({
    plans: [
      { id: "monthly", amount: 200000, days: 30, badge: "Monthly" },
      { id: "lifetime", amount: 1500000, days: null, badge: "Lifetime" },
      { id: "pass30", amount: 150000, days: 30, badge: "30-Day Pass", product: "ai" },
    ],
    buyUrl: "/buy",
    aiBuyUrl: "/ai/buy",
  });
  const pricing = section(html, "pricing");
  assert.ok(pricing.includes('href="/ai/buy?plan=pass30"'), "gói AI phải trỏ về aiBuyUrl kèm ?plan=");
  assert.ok(pricing.includes('href="/buy?plan=monthly"'), "gói VPN phải trỏ về buyUrl kèm ?plan=");
  assert.ok(pricing.includes("Vĩnh viễn"), "gói days=null phải ghi rõ là vĩnh viễn");
  assert.ok(pricing.includes("30 ngày"), "gói 30 ngày phải hiện số ngày");
});

test("(j) giới hạn thiết bị lấy từ tham số maxDevices (index.js truyền MAX_DEVICES_PER_USER)", () => {
  assert.ok(page({ maxDevices: 3 }).includes("tối đa 3 thiết bị"));
  assert.ok(page({ maxDevices: 5 }).includes("tối đa 5 thiết bị"), "phải theo maxDevices truyền vào");
  assert.ok(!page({ maxDevices: "sai" }).includes("{maxDevices}"), "maxDevices sai phải rơi về mặc định 3");
  assert.ok(page({ maxDevices: "sai" }).includes("tối đa 3 thiết bị"));
});


/**
 * Route `/` phải nằm trong index.js (không chỉ có hàm render): thiếu route thì
 * meetflowai.site/ vẫn 404 như trước, và thiếu tham số thì bảng giá/CTA trỏ sai.
 */
test("index.js: route / gọi homePageHTML với plans thật + fallback khi lỗi render", async () => {
  const fs = await import("node:fs");
  const indexSrc = fs.readFileSync(new URL("../src/index.js", import.meta.url), "utf8");

  assert.ok(indexSrc.includes('import { homePageHTML } from "./home-page.js";'), "thiếu import homePageHTML");
  const route = indexSrc.slice(indexSrc.indexOf('app.get(["/", "/home"]'), indexSrc.indexOf('app.get(["/buy", "/buy/"]'));
  assert.ok(route.length > 0, "không tìm thấy route / trong index.js");
  assert.ok(route.includes("plans: planStore.all()"), "bảng giá phải lấy từ planStore (plans thật)");
  assert.ok(route.includes("lang: buyLang(req)"), "trang chủ phải theo ngôn ngữ khách như trang /buy");
  assert.ok(route.includes("canonicalUrl: `${siteBaseUrl()}/`"), "thiếu canonical cho SEO");
  assert.ok(route.includes("maxDevices: MAX_DEVICES_PER_USER"), "số thiết bị phải lấy từ cấu hình thật");
  assert.ok(route.includes('res.redirect(302, "/buy")'), "lỗi render không được để trang trắng 500");
});
