import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_CONFIG } from "../selfdefense.mjs";

/**
 * Các test này khoá lại những mặc định đã phải trả giá mới rút ra được (29/09/2026):
 * chúng tồn tại chỉ để KHÔNG bật lại hộp thoại xin quyền mang tên "node".
 */

test("mặc định KHÔNG đọc TCC.db — tránh hộp thoại 'node … access data from other apps'", () => {
  // Đọc ~/Library/Application Support/com.apple.TCC/TCC.db là truy cập dữ liệu của app khác;
  // `sandboxd` sẽ hỏi quyền SystemPolicyAppData cho `node`. `log show` cho cùng tín hiệu.
  assert.equal(DEFAULT_CONFIG.tcc.source, "log");
});

test("mặc định KHÔNG đọc login items — tránh hộp thoại AppleEvents gán cho node", () => {
  // osascript 'tell System Events' khiến macOS gán quyền Automation cho tiến trình chịu trách
  // nhiệm là `node`, và hộp thoại hiện lại mỗi lần gọi.
  assert.equal(DEFAULT_CONFIG.startup.checkLoginItems, false);
});

test("không còn config chết allow.labels", () => {
  assert.equal(DEFAULT_CONFIG.allow.labels, undefined);
  assert.ok(Array.isArray(DEFAULT_CONFIG.allow.pathPrefixes));
});

test("allowlist mặc định phủ Xcode/CoreSimulator và Microsoft updater", () => {
  assert.ok(DEFAULT_CONFIG.allow.pathPrefixes.includes("/Library/Developer/"));
  assert.ok(DEFAULT_CONFIG.allow.pathPrefixes.some((p) => p.includes("Microsoft")));
});
