import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Bảo vệ các phần dễ bị commit của người khác GHI ĐÈ — đã xảy ra thật 14/09/2026: commit
 * "trang buy có link tải IPA" ghi lại index.js từ worktree cũ và làm MẤT toàn bộ route webhook
 * SePay (endpoint trả 404, im lặng, không test nào bắt được).
 *
 * Test này chỉ đọc file nguồn và khẳng định các mảnh quan trọng vẫn còn.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const indexSource = fs.readFileSync(path.join(here, "../src/index.js"), "utf8");

const REQUIRED_IN_INDEX = [
  ["route webhook SePay", "/v1/payments/sepay-webhook"],
  ["giữ raw body cho webhook", "req.rawBody = buf"],
  ["xác thực bằng token trong URL", "SEPAY_URL_TOKEN"],
  ["route đổi ngưỡng kênh Android", "/v1/admin/android-version"],
  ["payload version theo kênh client", "versionPayloadFor(req"],
  ["nhãn gói bản địa hoá trong hoá đơn", "planNameFor(pickMailLang(lang)"],
];

for (const [name, needle] of REQUIRED_IN_INDEX) {
  test(`index.js còn giữ: ${name}`, () => {
    assert.ok(
      indexSource.includes(needle),
      `MẤT "${needle}" trong control-plane/src/index.js — có commit nào ghi đè file này?`,
    );
  });
}

test("sepay.js vẫn export đủ hàm mà index.js dùng", async () => {
  const mod = await import("../src/sepay.js");
  for (const fn of [
    "verifySepaySignature",
    "verifySepayApiKey",
    "verifySepayUrlToken",
    "isIncomingTransfer",
    "extractOrderRef",
    "amountCovers",
  ]) {
    assert.equal(typeof mod[fn], "function", `sepay.js thiếu export ${fn}`);
  }
});
