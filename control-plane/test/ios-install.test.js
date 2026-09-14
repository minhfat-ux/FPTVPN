import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { iosInstallManifest } from "../src/app-version.js";

const indexSrc = fs.readFileSync(new URL("../src/index.js", import.meta.url), "utf8");

test("manifest OTA: trỏ đúng IPA của mình, đủ khoá Apple yêu cầu", () => {
  const xml = iosInstallManifest({ baseUrl: "https://meetflowai.site", version: "1.3.2", build: "12" });
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), "phải là plist XML");
  assert.ok(xml.includes("<key>kind</key><string>software-package</string>"), "thiếu software-package ⇒ iOS không cài được");
  assert.ok(xml.includes("<string>https://meetflowai.site/v1/downloads/ios</string>"), "phải trỏ file IPA của mình");
  assert.ok(xml.includes("<key>bundle-identifier</key><string>com.privatevpn.app</string>"));
  assert.ok(xml.includes("<key>bundle-version</key><string>12</string>"), "bundle-version lấy theo build của IPA");
  assert.ok(xml.includes("<key>kind</key><string>software</string>"));
  assert.ok(!xml.includes("undefined"), "không được lọt giá trị undefined");
});

test("manifest OTA: không truyền build thì lấy theo version, baseUrl có/không dấu / đều đúng", () => {
  const xml = iosInstallManifest({ baseUrl: "https://meetflowai.site/", version: "1.3.2" });
  assert.ok(xml.includes("<string>https://meetflowai.site/v1/downloads/ios</string>"), "không nhân đôi dấu /");
  assert.ok(xml.includes("<key>bundle-version</key><string>1.3.2</string>"));
});

test("trang cài iOS: nút itms-services + đa ngôn ngữ (vi/en/zh/ja/ko) đều nhắc Safari & UDID", () => {
  const route = indexSrc.slice(indexSrc.indexOf('app.get(["/install/ios"'), indexSrc.indexOf("function iosInstallPageHTML"));
  assert.ok(route.includes("itms-services://?action=download-manifest"), "phải dùng itms-services mới cài được");
  assert.ok(route.includes("encodeURIComponent(manifest)"), "URL manifest phải được encode");
  assert.ok(route.includes("iosInstallPageHTML({ base, itms, version, lang: iosLang(req), token: String(req.query?.token ?? \"\")"),
    "route phải chọn ngôn ngữ theo máy khách và chuyển tiếp token account");
  assert.ok(indexSrc.includes("${tokenQS}"), "nút đăng ký phải mang token sang hồ sơ (không thì UDID không tự map được)");
  assert.ok(indexSrc.includes("const tokenQS = token ?"), "trang cài phải dựng tokenQS khi có token");
  assert.ok(indexSrc.includes("/install/ios/register.mobileconfig?lang=${lang}"), "nút đăng ký mang theo ngôn ngữ");
  const dict = indexSrc.slice(indexSrc.indexOf("const IOS_TEXTS = {"), indexSrc.indexOf("const iosDevices = new IosDeviceStore"));
  for (const lang of ["vi", "en", "zh", "ja", "ko"]) {
    assert.ok(dict.includes(`  ${lang}: {`), `thiếu ngôn ngữ ${lang}`);
  }
  assert.ok((dict.match(/Safari/g) ?? []).length >= 5, "mỗi ngôn ngữ phải nhắc mở bằng Safari");
  assert.ok((dict.match(/UDID/g) ?? []).length >= 5, "mỗi ngôn ngữ phải nói gửi UDID");
  assert.equal((dict.match(/installBtn:/g) ?? []).length, 5, "mỗi ngôn ngữ có nút cài");
  // profile phát cho khách cũng theo ngôn ngữ + callback mang lang để màn hình chờ đúng thứ tiếng
  assert.ok(indexSrc.includes("/install/ios/udid?lang=${lang}"), "callback phải mang theo lang");
  assert.ok(indexSrc.includes("displayName: t.profileName"), "tên hồ sơ theo ngôn ngữ");
});

test("guard: link tải iOS ngoài (Diawi) hết hạn thì tự chuyển về trang cài tự phát", () => {
  assert.ok(indexSrc.includes("async function runIosLinkGuard()"), "phải có bộ tự kiểm link iOS");
  const fn = indexSrc.slice(indexSrc.indexOf("async function runIosLinkGuard()"), indexSrc.indexOf("async function runIosLinkGuard()") + 2000);
  assert.ok(fn.includes('execFileAsync("curl"'), "kiểm link bằng curl (node fetch chết với *.diawi.com trên VPS)");
  assert.ok(fn.includes('appConfig.set("ios_ipa_url"'), "phải tự PATCH lại link tải");
  assert.ok(fn.includes("sendUnmatchedTransferAlert"), "phải báo chủ shop để upload lại");
  assert.ok(fn.includes('current.includes("/install/ios")'), "đang dùng trang tự phát thì không kiểm nữa");
  assert.ok(indexSrc.includes("setInterval(runIosLinkGuard"), "phải chạy định kỳ");
});

test("guard: manifest lấy số build IPA từ cấu hình, và API admin đổi được", () => {
  assert.ok(indexSrc.includes('appConfig.get("ios_ipa_build") || process.env.IOS_IPA_BUILD'),
    "manifest phải đọc số build đang phát (CFBundleVersion), không đoán theo version");
  const admin = indexSrc.slice(indexSrc.indexOf('app.patch("/v1/admin/app-version"'), indexSrc.indexOf('app.patch("/v1/admin/app-version"') + 1400);
  assert.ok(admin.includes("ipa_build"), "API admin phải cho đặt số build khi phát hành IPA mới");
});

test("guard: API App Store Connect có đủ endpoint để tự đăng ký UDID", () => {
  for (const route of [
    '"/v1/admin/ios/apple"',
    '"/v1/admin/ios/apple/credentials"',
    '"/v1/admin/ios/devices/:udid/register-apple"',
    '"/v1/admin/ios/apple/register-pending"',
  ]) {
    assert.ok(indexSrc.includes(route), `thiếu route ${route}`);
  }
  assert.ok(indexSrc.includes("appleAsc.save"), "phải lưu được khoá .p8");
  assert.ok(indexSrc.includes("registerIosDeviceWithApple(device.udid"), "khách đăng ký máy phải tự đẩy UDID lên Apple");
  assert.ok(indexSrc.includes("markAppleError"), "lỗi Apple phải được ghi lại cho dashboard");
});
