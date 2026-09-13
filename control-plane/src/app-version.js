/**
 * App-version gate (force update) cho VPNFlow.
 *
 * iOS và Android dùng CHUNG endpoint `/v1/app-version` nhưng có hai đường phát hành
 * khác nhau: iOS cập nhật qua App Store, Android là APK sideload
 * (`meetflowai.site/v1/downloads/android`). Vì vậy không thể trả lời giống nhau cho cả
 * hai: iPhone phải được đưa tới App Store, còn Android phải nhận link tải APK — nếu
 * `store_url` rỗng thì nút "Cập nhật" trên màn force-update **bấm không mở gì cả**.
 *
 * Kênh được quyết định theo thứ tự: `?platform=android|ios` (bản app mới gửi kèm), rồi
 * mới tới User-Agent — nhờ vậy các bản **đã cài sẵn** (chưa từng gửi tham số) vẫn nhận
 * đúng link: OkHttp gửi `okhttp/x.y`, còn iOS/macOS gửi `CFNetwork/Darwin`.
 */

/** APK sideload clients (OkHttp) và bất kỳ UA Android nào. */
const ANDROID_UA = /android|okhttp|vpnflow-android/i;

/** Client này có phải kênh Android (APK) không? */
export function isAndroidClient({ platform, userAgent } = {}) {
  const explicit = String(platform ?? "").trim().toLowerCase();
  if (explicit === "android") return true;
  if (explicit === "ios") return false;
  return ANDROID_UA.test(String(userAgent ?? ""));
}

/** Kênh iOS/macOS (App Store) — giữ nguyên hình dạng cũ để không phá bản đang chạy. */
export function iosVersionPayload(read) {
  return {
    platform: "ios",
    minimum_version: read("minimum_ios_version") ?? "0.0.0",
    latest_version: read("latest_ios_version") ?? "0.0.0",
    store_url: read("app_store_url") ?? "",
  };
}

/**
 * Kênh Android (APK sideload).
 *
 * `store_url` cố ý bằng `apk_url`: bản cũ (≤ 1.2.4) chỉ đọc `store_url`, nếu để rỗng thì
 * màn force-update của họ có nút chết. Bản ≥ 1.2.6 đọc thêm `apk_url` và có fallback.
 */
export function androidVersionPayload(read, { baseUrl = "" } = {}) {
  const site = String(baseUrl ?? "").replace(/\/$/, "");
  const apkUrl = read("android_apk_url") || `${site}/v1/downloads/android`;
  return {
    platform: "android",
    minimum_version: read("android_minimum_version") ?? "0.0.0",
    latest_version: read("android_latest_version") ?? "0.0.0",
    apk_url: apkUrl,
    store_url: apkUrl,
  };
}

/** Payload trả cho client, chọn theo kênh của chính client đó. */
export function versionPayloadFor(req, { read, baseUrl = "" } = {}) {
  const userAgent = typeof req?.get === "function"
    ? req.get("user-agent")
    : req?.headers?.["user-agent"];
  const android = isAndroidClient({ platform: req?.query?.platform, userAgent });
  return android ? androidVersionPayload(read, { baseUrl }) : iosVersionPayload(read);
}
