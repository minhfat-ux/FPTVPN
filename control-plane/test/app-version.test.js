import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  androidVersionPayload,
  iosVersionPayload,
  isAndroidClient,
  versionPayloadFor,
  wantsLegacyApk,
} from "../src/app-version.js";

/** appConfig giả: chỉ trả về key có mặt. */
function reader(values) {
  return (key) => (key in values ? values[key] : undefined);
}

const CONFIG = {
  minimum_ios_version: "1.2.0",
  latest_ios_version: "1.2.6",
  app_store_url: "https://apps.apple.com/app/id123",
  android_minimum_version: "1.2.6",
  android_latest_version: "1.2.6",
};

/** Request giả tối thiểu (Express thu gọn). */
function req({ platform, userAgent } = {}) {
  return {
    query: platform === undefined ? {} : { platform },
    get: (name) => (name.toLowerCase() === "user-agent" ? userAgent : undefined),
  };
}

test("kênh Android: ?platform=android thắng UA", () => {
  assert.equal(isAndroidClient({ platform: "android", userAgent: "CFNetwork/1494 Darwin/23.4" }), true);
  assert.equal(isAndroidClient({ platform: "ios", userAgent: "okhttp/4.12.0" }), false);
});

test("kênh Android: UA OkHttp (bản cũ chưa gửi ?platform) vẫn nhận kênh Android", () => {
  assert.equal(isAndroidClient({ userAgent: "okhttp/4.12.0" }), true);
  assert.equal(isAndroidClient({ userAgent: "VPNFlow-Android/1.2.4" }), true);
});

test("kênh iOS: UA CFNetwork/Darwin không bị nhận nhầm là Android", () => {
  assert.equal(isAndroidClient({ userAgent: "PrivateVPN/1.2.3 CFNetwork/1494.0.7 Darwin/23.4.0" }), false);
  assert.equal(isAndroidClient({ userAgent: "" }), false);
  assert.equal(isAndroidClient({}), false);
});

test("payload Android có link tải APK, store_url KHÔNG được rỗng (nút chết)", () => {
  const body = versionPayloadFor(req({ userAgent: "okhttp/4.12.0" }), {
    read: reader(CONFIG),
    baseUrl: "https://meetflowai.site",
  });
  assert.equal(body.platform, "android");
  assert.equal(body.latest_version, "1.2.6");
  assert.equal(body.minimum_version, "1.2.6");
  assert.equal(body.apk_url, "https://meetflowai.site/v1/downloads/android");
  assert.equal(body.apk_url_legacy, "https://meetflowai.site/v1/downloads/android-legacy");
  assert.equal(body.store_url, body.apk_url);
  assert.notEqual(body.store_url, "");
});

test("payload Android: máy Android 7 cần link legacy riêng (APK minSdk 26 không cài được)", () => {
  const body = androidVersionPayload(reader({}), { baseUrl: "https://meetflowai.site/" });
  assert.equal(body.apk_url_legacy, "https://meetflowai.site/v1/downloads/android-legacy");
  assert.notEqual(body.apk_url_legacy, body.apk_url);
  // cấu hình riêng (CDN) vẫn thắng mặc định
  const custom = androidVersionPayload(reader({ android_apk_url_legacy: "https://cdn.example.com/a7.apk" }), {
    baseUrl: "https://meetflowai.site",
  });
  assert.equal(custom.apk_url_legacy, "https://cdn.example.com/a7.apk");
});

test("payload Android: apk_url riêng trong cấu hình được ưu tiên", () => {
  const body = androidVersionPayload(reader({ android_apk_url: "https://cdn.example.com/v.apk" }), {
    baseUrl: "https://meetflowai.site",
  });
  assert.equal(body.apk_url, "https://cdn.example.com/v.apk");
  assert.equal(body.store_url, "https://cdn.example.com/v.apk");
  // chưa cấu hình gì ⇒ cổng mặc định an toàn, không phải undefined
  assert.equal(body.latest_version, "0.0.0");
  assert.equal(body.minimum_version, "0.0.0");
});

test("payload iOS nay trỏ về file IPA của mình, KHÔNG còn link App Store", () => {
  const body = versionPayloadFor(req({ userAgent: "CFNetwork/1494 Darwin/23.4" }), {
    read: reader(CONFIG),
    baseUrl: "https://meetflowai.site",
  });
  assert.equal(body.platform, "ios");
  assert.equal(body.minimum_version, "1.2.0");
  assert.equal(body.latest_version, "1.2.6");
  assert.equal(body.ipa_url, "https://meetflowai.site/v1/downloads/ios");
  // bản iOS đang cài sẵn chỉ đọc `store_url` ⇒ phải là link tải thật, không được rỗng
  assert.equal(body.store_url, body.ipa_url);
  assert.notEqual(body.store_url, "");
  assert.equal("apk_url" in body, false);
  // app_store_url cũ trong cấu hình KHÔNG được dùng nữa: trỏ vào đó là nút cập nhật đi vào
  // một trang App Store không có app (chủ dự án đã bỏ App Store 14/09/2026)
  assert.equal(/apps\.apple\.com/.test(body.store_url), false);
});

test("payload iOS: ios_ipa_url riêng trong cấu hình được ưu tiên", () => {
  const body = iosVersionPayload(reader({ ios_ipa_url: "https://cdn.example.com/VPNFlow.ipa" }), {
    baseUrl: "https://meetflowai.site",
  });
  assert.equal(body.ipa_url, "https://cdn.example.com/VPNFlow.ipa");
  assert.equal(body.store_url, "https://cdn.example.com/VPNFlow.ipa");
});

test("payload iOS đọc được cả khi header không có get() (request tối giản)", () => {
  const body = versionPayloadFor({ query: { platform: "ios" }, headers: {} }, { read: reader(CONFIG) });
  assert.equal(body.platform, "ios");
  const android = versionPayloadFor({ headers: { "user-agent": "okhttp/4.12.0" } }, { read: reader(CONFIG) });
  assert.equal(android.platform, "android");
});

test("thiếu cấu hình ⇒ giá trị mặc định an toàn, không crash", () => {
  // Không có baseUrl thì chỉ còn đường dẫn tương đối — giống hệt kênh Android, không rỗng.
  // `ipa_manifest_url` + `install_page_url` để app cài cập nhật TRỰC TIẾP (itms-services),
  // không phải mở trang cài rồi bấm thêm bước nào.
  assert.deepEqual(iosVersionPayload(reader({})), {
    platform: "ios",
    minimum_version: "0.0.0",
    latest_version: "0.0.0",
    ipa_url: "/v1/downloads/ios",
    store_url: "/v1/downloads/ios",
    ipa_manifest_url: "/install/ios/manifest.plist",
    install_page_url: "/install/ios",
  });
  assert.deepEqual(iosVersionPayload(reader({}), { baseUrl: "https://meetflowai.site/" }), {
    platform: "ios",
    minimum_version: "0.0.0",
    latest_version: "0.0.0",
    ipa_url: "https://meetflowai.site/v1/downloads/ios",
    store_url: "https://meetflowai.site/v1/downloads/ios",
    ipa_manifest_url: "https://meetflowai.site/install/ios/manifest.plist",
    install_page_url: "https://meetflowai.site/install/ios",
  });
});

test("chọn bản legacy cho máy Android 7 / Fire OS (endpoint tải APK)", () => {
  // Máy quá cũ để cài APK minSdk 26 → phải nhận bản legacy
  assert.equal(wantsLegacyApk("Mozilla/5.0 (Linux; Android 7.1.2; AFTMM Build/NS6265) Chrome/70"), true);
  assert.equal(wantsLegacyApk("Mozilla/5.0 (Linux; Android 7.0; SM-G930F) Chrome/70"), true);
  assert.equal(wantsLegacyApk("AndroidDownloadManager/7.1.2 (Linux; U; Android 7.1.2; AFTMM)"), true);
  // Máy cài được bản thường → KHÔNG được trả bản legacy
  assert.equal(wantsLegacyApk("Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120"), false);
  assert.equal(wantsLegacyApk("Mozilla/5.0 (Linux; Android 10; SM-G973F)"), false, "Android 10 không phải Android 1");
  assert.equal(wantsLegacyApk("okhttp/4.12.0"), false);
  assert.equal(wantsLegacyApk("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605"), false);
  assert.equal(wantsLegacyApk("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"), false);
  assert.equal(wantsLegacyApk(undefined), false);
});

test("link tải: cấu hình trong dashboard thắng env, và luôn có đường lùi tự phát", () => {
  const indexSrc = fs.readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  const block = indexSrc.slice(indexSrc.indexOf("function storeLinks(product)"), indexSrc.indexOf("function storeLinks(product)") + 1800);
  assert.ok(block.includes('appConfig.get("ios_ipa_url") || process.env.IOS_IPA_URL'), "iOS: cấu hình trước, rồi env, rồi file tự phát");
  assert.ok(block.includes('appConfig.get("android_apk_url") || `${base}/v1/downloads/android`'), "Android: cấu hình trước, rồi file tự phát");
  assert.ok(block.includes('appConfig.get("android_apk_url_legacy")'), "Android 7: cấu hình được link legacy");
  assert.ok(block.includes('appConfig.get("ai_android_apk_url")'), "MeetFlow AI: link APK cấu hình được");
  // Bật/tắt Diawi không cần sửa code, chỉ cần PATCH cấu hình
  const admin = indexSrc.slice(indexSrc.indexOf('app.patch("/v1/admin/app-version"'), indexSrc.indexOf('app.patch("/v1/admin/app-version"') + 1200);
  assert.ok(admin.includes("ipa_url"), "API admin phải cho đổi link IPA");
});
