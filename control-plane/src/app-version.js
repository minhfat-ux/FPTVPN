/**
 * App-version gate (force update) cho VPNFlow.
 *
 * iOS và Android dùng CHUNG endpoint `/v1/app-version`, và nay cả hai đều phát qua kênh
 * của mình: iOS là file IPA (`meetflowai.site/v1/downloads/ios`), Android là APK sideload
 * (`meetflowai.site/v1/downloads/android`). Không kênh nào dùng app store nữa (chủ dự án bỏ
 * App Store + Google Play 14/09/2026) — vì vậy `store_url` ở CẢ HAI kênh phải là link tải
 * của mình: bản đang cài sẵn chỉ đọc `store_url`, để rỗng thì nút "Cập nhật" trên màn
 * force-update **bấm không mở gì cả**.
 *
 * Kênh được quyết định theo thứ tự: `?platform=android|ios|macos|windows` (bản app mới gửi kèm), rồi
 * mới tới User-Agent — nhờ vậy các bản **đã cài sẵn** (chưa từng gửi tham số) vẫn nhận
 * đúng link: OkHttp gửi `okhttp/x.y`, còn iOS/macOS gửi `CFNetwork/Darwin`.
 */

/** APK sideload clients (OkHttp) và bất kỳ UA Android nào. */
const ANDROID_UA = /android|okhttp|vpnflow-android/i;

/**
 * Client Windows (app .NET/Avalonia gửi `platform=windows`) và UA của trình duyệt/app trên
 * Windows (`Windows NT`). Bộ cài là file .exe Inno Setup phát trực tiếp từ shop.
 */
const WINDOWS_UA = /windows|win32|vpnflow-windows/i;

/**
 * Token nhận biết client macOS qua User-Agent. Đây CHỈ là đường lùi: iOS và macOS cùng gửi
 * `CFNetwork/Darwin` nên KHÔNG thể phân biệt hai kênh bằng UA — bản macOS phải gửi
 * `?platform=macos` (xem `isMacClient`). Regex này để bản macOS nào tự đặt UA riêng
 * (`VPNFlow-mac/1.4.0`…) cũng được nhận đúng kênh.
 */
const MACOS_UA = /vpnflow[-_ ]?mac|flowvpn[-_ ]?mac|vpnflowmacos/i;

/** Client này có phải kênh macOS không? */
export function isMacClient({ platform, userAgent } = {}) {
  const explicit = String(platform ?? "").trim().toLowerCase();
  if (explicit === "macos" || explicit === "mac" || explicit === "darwin" || explicit === "osx") return true;
  if (explicit === "ios" || explicit === "android" || explicit === "windows" || explicit === "win") return false;
  return MACOS_UA.test(String(userAgent ?? ""));
}

/** Client này có phải kênh Windows không? */
export function isWindowsClient({ platform, userAgent } = {}) {
  const explicit = String(platform ?? "").trim().toLowerCase();
  if (explicit === "windows" || explicit === "win32" || explicit === "win") return true;
  if (explicit === "android" || explicit === "ios" || explicit === "macos" || explicit === "mac") return false;
  return WINDOWS_UA.test(String(userAgent ?? ""));
}

/** Client này có phải kênh Android (APK) không? */
export function isAndroidClient({ platform, userAgent } = {}) {
  const explicit = String(platform ?? "").trim().toLowerCase();
  if (explicit === "android") return true;
  if (explicit === "ios" || explicit === "macos" || explicit === "mac") return false;
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

/** Kênh iOS/macOS — nay cũng phát bằng file IPA của mình, KHÔNG còn App Store.
 *
 * Trước 14/09/2026 iOS trả `store_url` = `app_store_url` (link App Store). Chủ dự án đã bỏ
 * App Store nên link đó trỏ vào một trang KHÔNG có app — nút "Cập nhật" bấm vào là đi đâu
 * mất. Giờ trả link tải IPA (`/v1/downloads/ios`), vẫn đặt vào `store_url` vì các bản iOS
 * đang cài sẵn CHỈ đọc khoá đó; để rỗng là nút chết y như cảnh báo ở đầu file.
 */
export function iosVersionPayload(read, { baseUrl = "" } = {}) {
  const site = String(baseUrl ?? "").replace(/\/$/, "");
  const ipaUrl = read("ios_ipa_url") || `${site}/v1/downloads/ios`;
  return {
    platform: "ios",
    minimum_version: read("minimum_ios_version") ?? "0.0.0",
    latest_version: read("latest_ios_version") ?? "0.0.0",
    ipa_url: ipaUrl,
    store_url: ipaUrl,
    // Cập nhật NGAY TRONG APP: app mở `itms-services://…download-manifest&url=<manifest này>`
    // ⇒ iOS tải IPA có UDID của máy và cài luôn, khách không phải vào lại trang /install/ios.
    ipa_manifest_url: `${site}/install/ios/manifest.plist`,
    install_page_url: `${site}/install/ios`,
  };
}

/**
 * Kênh Windows — bộ cài 1-click (Inno Setup) phát trực tiếp từ shop.
 *
 * `store_url` cố ý bằng `installer_url` (giống iOS/Android): app đang cài sẵn chỉ đọc
 * `store_url`, để rỗng thì nút "Cập nhật" trong app bấm không mở gì.
 */
export function windowsVersionPayload(read, { baseUrl = "" } = {}) {
  const site = String(baseUrl ?? "").replace(/\/$/, "");
  const installerUrl = read("windows_installer_url") || `${site}/dl/VPNFlow-Setup-latest.exe`;
  return {
    platform: "windows",
    minimum_version: read("windows_minimum_version") ?? "0.0.0",
    latest_version: read("windows_latest_version") ?? "0.0.0",
    installer_url: installerUrl,
    store_url: installerUrl,
    install_page_url: `${site}/buy`,
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
/**
 * Kênh macOS — file .dmg (hoặc .zip) phát trực tiếp từ `/v1/downloads/mac`.
 *
 * Vì sao phải có nhánh riêng: trước đây `/v1/app-version` chỉ có ios/android/windows nên client
 * macOS rơi vào payload **iOS** — app Mac (dùng chung `ControlAPIClient` với iOS) so phiên bản của
 * mình với `latest_version` của iOS, và nút cập nhật mở `install_page_url` = **trang cài iOS**.
 * Hệ quả: khách Mac không bao giờ được nhắc cập nhật (bản macOS phát lại nhiều lần vẫn cùng số
 * 1.4.0), mà nếu iOS lên số mới thì khách Mac bị nhắc rồi mở nhầm trang iOS.
 *
 * `minimum_mac_version` KHÔNG tồn tại trong app_config ⇒ mặc định "0.0.0" = không ép cập nhật,
 * chỉ nhắc. `store_url` cố ý = link tải vì bản đang cài sẵn chỉ đọc khoá đó.
 */
export function macVersionPayload(read, { baseUrl = "" } = {}) {
  const site = String(baseUrl ?? "").replace(/\/$/, "");
  const downloadUrl = read("mac_download_url") || `${site}/v1/downloads/mac`;
  return {
    platform: "macos",
    minimum_version: read("minimum_mac_version") ?? "0.0.0",
    latest_version: read("latest_mac_version") ?? "0.0.0",
    download_url: downloadUrl,
    store_url: downloadUrl,
    install_page_url: `${site}/install/mac`,
  };
}

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
  const platform = req?.query?.platform;
  if (isWindowsClient({ platform, userAgent })) {
    return windowsVersionPayload(read, { baseUrl });
  }
  // macOS TRƯỚC iOS: hai kênh dùng chung UA `CFNetwork/Darwin`, nên chỉ phân biệt được bằng
  // `?platform=macos`. Không có nhánh này thì client Mac rơi vào payload iOS (xem macVersionPayload).
  if (isMacClient({ platform, userAgent })) {
    return macVersionPayload(read, { baseUrl });
  }
  const android = isAndroidClient({ platform, userAgent });
  return android ? androidVersionPayload(read, { baseUrl }) : iosVersionPayload(read, { baseUrl });
}

/**
 * Manifest cho cài iOS qua OTA. iOS KHÔNG cài được từ link .ipa trực tiếp — Safari chỉ tải file
 * về — nên trang cài phải trỏ `itms-services://` vào manifest này (đúng cách Diawi làm). Tự phát
 * để màn ép cập nhật trong app không phụ thuộc link ngoài có hạn (Diawi: 15 ngày / 50 lượt).
 *
 * Apple yêu cầu manifest nằm trên HTTPS có chứng chỉ hợp lệ; `software-package` là link IPA của mình.
 */
export function iosInstallManifest({ baseUrl = "", bundleId = "com.privatevpn.app", version = "1.0", build = null, title = "VPNFlow" } = {}) {
  const site = String(baseUrl ?? "").replace(/\/$/, "");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>items</key>
  <array>
    <dict>
      <key>assets</key>
      <array>
        <dict>
          <key>kind</key><string>software-package</string>
          <key>url</key><string>${site}/v1/downloads/ios</string>
        </dict>
      </array>
      <key>metadata</key>
      <dict>
        <key>bundle-identifier</key><string>${bundleId}</string>
        <key>bundle-version</key><string>${build ?? version}</string>
        <key>kind</key><string>software</string>
        <key>title</key><string>${title}</string>
      </dict>
    </dict>
  </array>
</dict>
</plist>
`;
}
