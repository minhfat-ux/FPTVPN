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

test("trang cài iOS: nút itms-services trỏ manifest của mình + cảnh báo dùng Safari", () => {
  const page = indexSrc.slice(indexSrc.indexOf('app.get(["/install/ios"'), indexSrc.indexOf('app.get("/v1/downloads/ios"'));
  assert.ok(page.includes("itms-services://?action=download-manifest"), "phải dùng itms-services mới cài được");
  assert.ok(page.includes("${encodeURIComponent(manifest)}"), "URL manifest phải được encode");
  assert.ok(page.includes("/install/ios/manifest.plist"), "trỏ manifest tự phát");
  assert.ok(/Safari/.test(page), "phải nói rõ phải mở bằng Safari");
  assert.ok(/UDID/.test(page), "phải cảnh báo máy chưa có UDID sẽ không cài được");
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
