import test from "node:test";
import assert from "node:assert/strict";
import {
  androidVersionPayload,
  iosVersionPayload,
  isAndroidClient,
  versionPayloadFor,
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
  assert.equal(body.store_url, body.apk_url);
  assert.notEqual(body.store_url, "");
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

test("payload iOS giữ nguyên hình dạng cũ (App Store), không lẫn link APK", () => {
  const body = versionPayloadFor(req({ userAgent: "CFNetwork/1494 Darwin/23.4" }), {
    read: reader(CONFIG),
    baseUrl: "https://meetflowai.site",
  });
  assert.deepEqual(body, {
    platform: "ios",
    minimum_version: "1.2.0",
    latest_version: "1.2.6",
    store_url: "https://apps.apple.com/app/id123",
  });
  assert.equal("apk_url" in body, false);
});

test("payload iOS đọc được cả khi header không có get() (request tối giản)", () => {
  const body = versionPayloadFor({ query: { platform: "ios" }, headers: {} }, { read: reader(CONFIG) });
  assert.equal(body.platform, "ios");
  const android = versionPayloadFor({ headers: { "user-agent": "okhttp/4.12.0" } }, { read: reader(CONFIG) });
  assert.equal(android.platform, "android");
});

test("thiếu cấu hình ⇒ giá trị mặc định an toàn, không crash", () => {
  assert.deepEqual(iosVersionPayload(reader({})), {
    platform: "ios",
    minimum_version: "0.0.0",
    latest_version: "0.0.0",
    store_url: "",
  });
});
