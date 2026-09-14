import test from "node:test";
import assert from "node:assert/strict";
import { supportPageHTML } from "../src/support-page.js";

/**
 * Trang hỗ trợ là trang KHÁCH ĐỌC (link từ app và từ trang mua). Từ 14/09/2026 chủ dự án
 * bỏ toàn bộ kênh app store: mọi gói mua trên web, mua một lần, KHÔNG tự động gia hạn.
 * Trước đây trang này vẫn hướng dẫn khách "huỷ trong App Store → Apple ID → Subscriptions"
 * và "hoàn tiền tại reportaproblem.apple.com" — khách làm theo thì không có tác dụng gì.
 *
 * Test này chốt lại: trang không được nhắc tới kênh store nữa, và phải nói đúng cơ chế
 * mua một lần của kênh web, đủ cả 5 ngôn ngữ.
 */

const LANGS = ["en", "vi", "zh", "ja", "ko"];

/** Chữ mà khách đọc, KHÔNG tính khối <style> (CSS không phải nội dung khách thấy). */
function visibleText(html) {
  return html.replace(/<style>[\s\S]*?<\/style>/g, "");
}

const STORE_WORDS = [
  "App Store",
  "app store",
  "reportaproblem",
  "Apple ID",
  "Restore Purchases",
  "恢复购买",
  "購入を復元",
  "구매 복원",
  "Subscriptions",
  "iTunes",
];

/** Mỗi ngôn ngữ phải nói rõ: gói mua trên web là mua một lần, không tự động gia hạn. */
const NO_AUTORENEW = {
  en: "never auto-renew",
  vi: "KHÔNG tự động gia hạn",
  zh: "不会自动续订",
  ja: "自動更新はありません",
  ko: "자동 갱신되지 않습니다",
};

test("trang hỗ trợ không còn nhắc tới kênh app store (5 ngôn ngữ)", () => {
  for (const lang of LANGS) {
    const text = visibleText(supportPageHTML({ lang, product: "vpn" }));
    for (const word of STORE_WORDS) {
      assert.ok(
        !text.includes(word),
        `trang hỗ trợ (${lang}) vẫn còn chữ "${word}" — kênh store đã bị bỏ, khách làm theo sẽ vô ích`,
      );
    }
  }
});

test("trang hỗ trợ nói đúng cơ chế mua một lần, không tự động gia hạn", () => {
  for (const lang of LANGS) {
    const text = visibleText(supportPageHTML({ lang, product: "vpn" }));
    assert.ok(
      text.includes(NO_AUTORENEW[lang]),
      `trang hỗ trợ (${lang}) thiếu câu nói gói web không tự động gia hạn`,
    );
  }
});

test("trang hỗ trợ vẫn giữ hoàn tiền theo kênh web và nút làm mới trạng thái", () => {
  const vi = visibleText(supportPageHTML({ lang: "vi", product: "vpn" }));
  assert.ok(vi.includes("7 ngày"), "thiếu chính sách hoàn tiền 7 ngày của kênh web");
  assert.ok(vi.includes("Làm mới trạng thái gói"), "thiếu hướng dẫn làm mới trạng thái gói");

  const en = visibleText(supportPageHTML({ lang: "en", product: "vpn" }));
  assert.ok(en.includes("7 days"), "thiếu chính sách hoàn tiền 7 ngày (en)");
  assert.ok(en.includes("Refresh Purchase Status"), "thiếu hướng dẫn làm mới trạng thái gói (en)");
});

test("tên app trên trang hỗ trợ là VPNFlow, không phải FlowVPN", () => {
  const vpn = supportPageHTML({ lang: "vi", product: "vpn" });
  assert.ok(vpn.includes("VPNFlow"), "trang hỗ trợ phải hiện tên VPNFlow");
  assert.ok(!vpn.includes("FlowVPN"), "trang hỗ trợ còn tên cũ FlowVPN");
});

test("trang MeetFlow AI cũng không còn nhắc tới kênh app store", () => {
  for (const lang of LANGS) {
    const text = visibleText(supportPageHTML({ lang, product: "ai" }));
    for (const word of STORE_WORDS) {
      assert.ok(!text.includes(word), `trang hỗ trợ AI (${lang}) còn chữ "${word}"`);
    }
    assert.ok(text.includes("MeetFlow AI"), `trang hỗ trợ AI (${lang}) thiếu tên sản phẩm`);
  }
});

test("VPNFlow trỏ tới điều khoản RIÊNG /vpnflow/terms, không dùng trang của MeetFlow AI", () => {
  const vpn = supportPageHTML({
    lang: "vi",
    product: "vpn",
    links: { terms: "https://meetflowai.site/terms" },
  });
  assert.ok(
    vpn.includes('href="https://meetflowai.site/vpnflow/terms"'),
    "trang hỗ trợ VPNFlow phải trỏ tới điều khoản riêng của VPNFlow",
  );
  assert.ok(vpn.includes("Điều khoản sử dụng"), "thiếu nhãn điều khoản tiếng Việt");

  // MeetFlow AI vẫn dùng trang /terms của chính nó — đừng đổi nhầm sản phẩm.
  const ai = supportPageHTML({
    lang: "vi",
    product: "ai",
    links: { terms: "https://meetflowai.site/terms" },
  });
  assert.ok(ai.includes('href="https://meetflowai.site/terms"'), "trang MeetFlow AI phải giữ /terms");
  assert.equal(ai.includes("/vpnflow/terms"), false, "trang MeetFlow AI không được trỏ sang điều khoản VPNFlow");
});

test("links.vpnTerms truyền vào thì thắng mặc định; thiếu terms thì không render link rỗng", () => {
  const overridden = supportPageHTML({
    lang: "en",
    product: "vpn",
    links: { terms: "https://meetflowai.site/terms", vpnTerms: "https://cdn.example.com/vpn-terms" },
  });
  assert.ok(overridden.includes('href="https://cdn.example.com/vpn-terms"'));

  const noTerms = supportPageHTML({ lang: "en", product: "vpn", links: {} });
  assert.equal(noTerms.includes('href=""'), false, "không được render thẻ <a> rỗng");
});
