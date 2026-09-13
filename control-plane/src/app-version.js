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

/**
 * UA của máy KHÔNG cài được APK thường (minSdk 26): Android 7.0/7.1 và Fire OS
 * (Fire TV Stick 4K, Kindle) — trình duyệt/DownloadManager của máy đó gửi kèm phiên bản
 * Android hoặc mã model `AFT*`/`Silk/`.
 *
 * Dùng để chọn bản legacy ngay ở endpoint tải, nhờ vậy cả những máy cũ CHƯA có code mới
 * (bản ≤ 1.2.4 chỉ mở `store_url`) vẫn tải được bản cài được, không bị kẹt ở màn ép cập nhật.
 */
const LEGACY_UA = /Android\s+[1-7](?!\d)|AFT[A-Z]|Fire OS|Kindle|Silk\//i;

export function wantsLegacyApk(userAgent) {
  return LEGACY_UA.test(String(userAgent ?? ""));
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
 * màn force-update của họ có nút chết. Bản ≥ 1.2.6 đọc thêm `apk_url`/`apk_url_legacy`.
 *
 * `apk_url_legacy` là bản minSdk 24 cho Android 7.0/7.1 và Fire OS (Fire TV Stick 4K):
 * APK thường (minSdk 26) cài lên máy đó báo "There was a problem parsing the package",
 * nên app phải TỰ CHỌN theo SDK của máy — không thì ép cập nhật sẽ chặn cứng nhóm này.
 */
export function androidVersionPayload(read, { baseUrl = "" } = {}) {
  const site = String(baseUrl ?? "").replace(/\/$/, "");
  const apkUrl = read("android_apk_url") || `${site}/v1/downloads/android`;
  const apkUrlLegacy = read("android_apk_url_legacy") || `${site}/v1/downloads/android-legacy`;
  return {
    platform: "android",
    minimum_version: read("android_minimum_version") ?? "0.0.0",
    latest_version: read("android_latest_version") ?? "0.0.0",
    apk_url: apkUrl,
    apk_url_legacy: apkUrlLegacy,
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
