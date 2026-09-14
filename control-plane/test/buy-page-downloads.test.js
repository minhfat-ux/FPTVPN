import test from "node:test";
import assert from "node:assert/strict";
import { buyPageHTML } from "../src/payments.js";

// Chủ dự án đã bỏ CẢ HAI kênh store (App Store + Google Play, 14/09/2026): app iOS phát
// bằng IPA từ server mình, Android bằng APK. Nên trang buy KHÔNG được còn quảng cáo
// "App Store" / "Google Play" — sai sự thật thì khách tải nhầm đường và tưởng app có
// trên store.
function page(lang = "vi", links = {}) {
  return buyPageHTML({
    baseUrl: "https://meetflowai.site",
    lang,
    product: "vpn",
    methods: ["bankqr"],
    links,
  });
}

// Lấy ĐÚNG dòng hướng dẫn khách đọc (mục "How to activate"), không soi cả trang: trang
// nhúng cả khối i18n cho JS nên còn khoá từ vựng của kênh cũ nằm trong dữ liệu, không
// phải chữ hiển thị. Kiểm nhầm khối đó là test báo lỗi giả.
function renderedIosLine(html) {
  const m = html.match(/class="plat">iOS<\/span><span>(.*?)<\/span>/s);
  assert.ok(m, "không tìm thấy dòng hướng dẫn iOS trong trang");
  return m[1];
}

test("trang buy: nút iOS trỏ về IPA của mình, và dòng hướng dẫn nói đúng là IPA", () => {
  const html = page("vi", { ios: "https://meetflowai.site/v1/downloads/ios" });
  assert.ok(html.includes('href="https://meetflowai.site/v1/downloads/ios"'), "phải có link tải IPA");
  assert.ok(html.includes("iOS (IPA)"), "nhãn nút phải nói rõ là IPA");
  const line = renderedIosLine(html);
  assert.ok(!line.includes("App Store"), "dòng khách đọc không được nhắc App Store");
  assert.ok(line.includes("IPA"), "dòng khách đọc phải nói tải IPA");
});

test("trang buy: link iOS là link store thật thì vẫn dùng câu App Store (không phá kênh cũ)", () => {
  const html = page("en", { ios: "https://apps.apple.com/app/id123" });
  assert.ok(renderedIosLine(html).includes("App Store"));
});

test("trang buy: nút Android KHÔNG ghi 'Google Play'", () => {
  const html = page("vi", { android: "https://meetflowai.site/v1/downloads/android" });
  assert.ok(html.includes('href="https://meetflowai.site/v1/downloads/android"'));
  assert.ok(!html.includes("Google Play"), "không được còn chữ Google Play");
  assert.ok(html.includes("Tải APK trực tiếp"), "title phải nói tải APK");
});

test("trang buy: nút tải + dòng hướng dẫn đúng ở cả 5 ngôn ngữ", () => {
  for (const lang of ["en", "vi", "zh", "ja", "ko"]) {
    const html = page(lang, { ios: "https://x/v1/downloads/ios", android: "https://x/v1/downloads/android" });
    // Chỉ kiểm CHỮ KHÁCH ĐỌC, không quét cả trang: trang nhúng khối i18n cho JS, trong
    // đó khoá `iosLineStore` được GIỮ có chủ đích cho trường hợp link ios thật sự là
    // link store (đã có test riêng cho nhánh đó).
    const line = renderedIosLine(html);
    assert.ok(!line.includes("App Store"), `${lang}: dòng khách đọc còn App Store`);
    assert.ok(line.includes("IPA"), `${lang}: dòng khách đọc thiếu IPA`);
    assert.ok(html.includes("iOS (IPA)"), `${lang}: thiếu nhãn nút IPA`);
    assert.ok(!html.includes("Google Play"), `${lang}: nút Android còn Google Play`);
  }
});

test("trang buy: bản AI (MeetFlow) không bị ảnh hưởng bởi thay đổi của VPNFlow", () => {
  const html = buyPageHTML({
    baseUrl: "https://meetflowai.site", lang: "vi", product: "ai",
    methods: ["bankqr"], links: { android: "https://meetflowai.site/v1/ai/downloads/android" },
  });
  assert.ok(html.includes("/v1/ai/downloads/android"), "AI vẫn dùng đường tải riêng của nó");
});

test("trang buy: bản iOS Ad Hoc phải hiện các bước + UDID cho khách", () => {
  const html = page("vi", { ios: "https://meetflowai.site/install/ios" });
  assert.ok(html.includes("howto adhoc"), "phải có khối hướng dẫn Ad Hoc");
  const block = html.match(/class="howto adhoc"[\s\S]*?<\/ol>/)[0];
  assert.ok(block.includes("Safari"), "phải nhắc mở bằng Safari");
  assert.ok(/UDID/i.test(block), "phải nói iOS gửi UDID về shop");
  assert.ok(block.includes("Tin cậy") || block.includes("Trust"), "phải có bước Trust certificate");
  assert.ok(html.includes("https://meetflowai.site/install/ios"), "khối phải trỏ tới trang cài");
});

test("trang buy: iOS Ad Hoc có đủ bước ở cả 5 ngôn ngữ", () => {
  for (const lang of ["vi", "en", "zh", "ja", "ko"]) {
    const html = page(lang, { ios: "https://meetflowai.site/install/ios" });
    const m = html.match(/class="howto adhoc"[\s\S]*?<\/ol>/);
    assert.ok(m, `${lang}: thiếu khối Ad Hoc`);
    assert.equal((m[0].match(/<li>/g) ?? []).length, 4, `${lang}: phải đủ 4 bước`);
    assert.ok(/UDID/i.test(m[0]), `${lang}: thiếu UDID`);
    assert.ok(/Safari/.test(m[0]), `${lang}: thiếu Safari`);
  }
});
