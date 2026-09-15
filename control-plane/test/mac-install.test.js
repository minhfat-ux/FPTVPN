import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buyPageHTML } from "../src/payments.js";

const indexSrc = fs.readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
const paySrc = fs.readFileSync(new URL("../src/payments.js", import.meta.url), "utf8");

const macDict = indexSrc
  .slice(indexSrc.indexOf("const MAC_TEXTS = {"), indexSrc.indexOf("function macInstallPageHTML"))
  .split("\n")
  .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
  .join("\n");

test("route /install/mac tồn tại và dựng bằng macInstallPageHTML", () => {
  assert.ok(indexSrc.includes('app.get(["/install/mac"'), "phải có route /install/mac");
  assert.ok(indexSrc.includes('"/v1/install/mac"'), "nên có bí danh /v1/install/mac");
  assert.ok(indexSrc.includes("macInstallPageHTML({"), "phải dựng trang bằng macInstallPageHTML");
  const route = indexSrc.slice(indexSrc.indexOf('app.get(["/install/mac"'), indexSrc.indexOf('app.get(["/install/mac"') + 700);
  assert.ok(route.includes("siteBaseUrl()"), "route phải truyền base URL của site");
  assert.ok(route.includes("requestLang(req)"), "route phải chọn ngôn ngữ theo máy khách");
});

test("trang cài Mac: dùng lại dropdown ngôn ngữ iOS, QR về chính trang, có link hỗ trợ", () => {
  const fn = indexSrc.slice(indexSrc.indexOf("function macInstallPageHTML"), indexSrc.indexOf('app.get(["/install/mac"'));
  assert.ok(fn.includes("iosLangSelectHTML(lang)"), "phải dùng lại dropdown ngôn ngữ của trang iOS");
  assert.ok(fn.includes("/v1/downloads/qr?target=mac"), "QR phải trỏ về trang Mac (target=mac)");
  assert.ok(fn.includes("support@meetflowai.site"), "phải có link hỗ trợ");
  assert.ok(fn.includes('href="/v1/downloads/mac"'), "nút tải phải trỏ endpoint tải Mac");
  assert.ok(fn.includes("INSTALL_PAGE_CSS"), "phải dùng chung khung CSS với trang iOS");
});

test("trang cài Mac có đủ 5 ngôn ngữ", () => {
  for (const lang of ["vi", "en", "zh", "ja", "ko"]) {
    assert.ok(macDict.includes(`  ${lang}: {`), `thiếu ngôn ngữ ${lang}`);
  }
  assert.equal((macDict.match(/downloadBtn:/g) ?? []).length, 5, "mỗi ngôn ngữ có nút tải");
  assert.equal((macDict.match(/directNote:/g) ?? []).length, 5, "mỗi ngôn ngữ có ghi chú cài trực tiếp");
});

// Bản Mac chưa notarize qua Apple ⇒ mỗi ngôn ngữ PHẢI hướng dẫn đúng cách macOS chặn app
// và bước cấp quyền VPN, không được bịa tính năng iOS (UDID, Developer Mode…).
test("trang cài Mac: mỗi ngôn ngữ có Open Anyway + quyền VPN (Allow) + Connect", () => {
  assert.ok((macDict.match(/Open Anyway/g) ?? []).length >= 5, "mỗi ngôn ngữ phải nhắc Open Anyway");
  assert.ok((macDict.match(/Allow/g) ?? []).length >= 5, "mỗi ngôn ngữ phải nhắc cấp quyền VPN (Allow)");
  assert.ok((macDict.match(/Connect/g) ?? []).length >= 5, "mỗi ngôn ngữ phải nhắc nút Connect");
  assert.ok((macDict.match(/Applications/g) ?? []).length >= 5, "mỗi ngôn ngữ phải nói kéo app vào Applications");
  assert.ok((macDict.match(/App Store/g) ?? []).length >= 5, "mỗi ngôn ngữ phải ghi rõ KHÔNG qua App Store");
});

test("trang cài Mac: không lẫn hướng dẫn của iOS", () => {
  assert.ok(!/UDID/.test(macDict), "trang Mac không được nhắc UDID");
  assert.ok(!/Developer Mode/.test(macDict), "trang Mac không được nhắc Developer Mode");
  assert.ok(!/itms-services/.test(macDict), "trang Mac không được dùng itms-services");
  assert.ok(!/Safari/.test(macDict), "trang Mac không cần hướng dẫn mở bằng Safari");
});

test("endpoint /v1/downloads/mac: đọc env, mặc định đúng, 404 kèm liên hệ", () => {
  assert.ok(indexSrc.includes('app.get("/v1/downloads/mac"'), "phải có route tải Mac");
  const fn = indexSrc.slice(indexSrc.indexOf('app.get("/v1/downloads/mac"'), indexSrc.indexOf('app.get("/v1/downloads/mac"') + 900);
  assert.ok(fn.includes("MAC_APP_ZIP_PATH") && fn.includes("MAC_DMG_PATH"), "phải đọc đường dẫn từ env");
  assert.ok(fn.includes("/root/flowvpn-mac/VPNFlow-mac.zip"), "phải có đường dẫn mặc định đúng");
  assert.ok(fn.includes("404") && fn.includes("support@meetflowai.site"), "thiếu file phải trả 404 kèm liên hệ");
  assert.ok(fn.includes("res.download("), "phải phục vụ file cài");
});

test("route QR target=mac trỏ về trang /install/mac", () => {
  assert.ok(indexSrc.includes("mac: `${siteBaseUrl()}/install/mac`"), "QR Mac phải trỏ về trang cài");
});

test("dropdown ngôn ngữ của trang cài dùng window.URL, không dùng new URL trần", () => {
  const fn = indexSrc.slice(indexSrc.indexOf("function iosLangSelectHTML"), indexSrc.indexOf("const iosDevices = new IosDeviceStore"));
  const code = fn.split("\n").filter((line) => !line.trim().startsWith("//")).join("\n");
  assert.ok(code.includes("new window.URL(location.href)"), "phải dùng window.URL để không bị document.URL che");
  assert.ok(!/(^|[^.\w])new URL\(/.test(code), "không được dùng new URL(...) trần trong inline handler");
});

// ---- Trang bán hàng ----

function page(lang = "vi", links = {}) {
  return buyPageHTML({ baseUrl: "https://meetflowai.site", lang, product: "vpn", methods: ["bankqr"], links });
}

test("trang buy: badge macOS trỏ về /install/mac khi không có link store", () => {
  const html = page("vi", { ios: "https://meetflowai.site/install/ios" });
  assert.ok(html.includes('href="https://meetflowai.site/install/mac"'), "badge Mac phải trỏ /install/mac");
  assert.ok(html.includes("macOS"), "phải có nhãn macOS");
});

test("trang buy: link store Mac (nếu cấu hình) vẫn thắng mặc định", () => {
  const html = page("vi", { ios: "https://meetflowai.site/install/ios", mac: "https://apps.apple.com/app/id1" });
  assert.ok(html.includes('href="https://apps.apple.com/app/id1"'), "link store phải được ưu tiên");
  assert.ok(!html.includes('href="https://meetflowai.site/install/mac"'), "không render thêm badge ad hoc khi có link store");
});

test("trang buy: khối hướng dẫn Mac có đủ 4 bước ở cả 5 ngôn ngữ", () => {
  for (const lang of ["vi", "en", "zh", "ja", "ko"]) {
    const html = page(lang, { ios: "https://meetflowai.site/install/ios" });
    const blocks = html.match(/class="howto adhoc"[\s\S]*?<\/ol>/g) ?? [];
    const mac = blocks.find((b) => b.includes("💻"));
    assert.ok(mac, `${lang}: thiếu khối hướng dẫn Mac`);
    assert.equal((mac.match(/<li>/g) ?? []).length, 4, `${lang}: phải đủ 4 bước`);
    assert.ok(mac.includes("Open Anyway"), `${lang}: thiếu bước Open Anyway`);
    assert.ok(/\bAllow\b/.test(mac), `${lang}: thiếu bước cấp quyền VPN (Allow)`);
    assert.ok(mac.includes("Connect"), `${lang}: thiếu bước Connect`);
    assert.ok(html.includes("https://meetflowai.site/install/mac"), `${lang}: khối phải trỏ tới trang cài`);
  }
});

test("trang buy mở TRONG app (paywall): không có khối/badge Mac", () => {
  const inApp = buyPageHTML({
    baseUrl: "https://meetflowai.site", lang: "vi", product: "vpn", methods: ["bankqr"],
    links: { ios: "https://meetflowai.site/install/ios" }, inApp: true,
  });
  assert.ok(!inApp.includes('href="https://meetflowai.site/install/mac"'), "trong app không được có link tải Mac");
});

test("trang buy bản AI không tự thêm badge Mac của VPNFlow", () => {
  const html = buyPageHTML({
    baseUrl: "https://meetflowai.site", lang: "vi", product: "ai", methods: ["bankqr"],
    links: { android: "https://meetflowai.site/v1/ai/downloads/android" },
  });
  assert.ok(!html.includes('href="https://meetflowai.site/install/mac"'), "AI không được trỏ sang trang cài Mac của VPNFlow");
});

test("payments.js có đủ khoá mac cho 5 ngôn ngữ", () => {
  for (const key of ["macTop:", "macBadge:", "macAdhocTitle:", "macAdhocSteps:"]) {
    assert.equal((paySrc.match(new RegExp(key, "g")) ?? []).length, 5, `thiếu khoá ${key} ở đủ 5 ngôn ngữ`);
  }
});
