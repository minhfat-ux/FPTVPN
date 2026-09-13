#!/usr/bin/env node
/**
 * Kiểm tra nhanh: bản control-plane sắp deploy có đủ các tính năng đã chốt không.
 *
 * Vì sao cần: ngày 14/09/2026 một commit `git add -A` từ worktree chung đã vô tình ghi đè
 * `control-plane/src/*.js` bằng bản cũ, làm mất: tự xác nhận SePay, email đã-thanh-toán/cảnh báo,
 * mã đơn duy nhất, QR theo gói, kiểm tài khoản nhận, whitelist IP, nhật ký đối soát. Trang web vẫn
 * chạy (server đang giữ bản đúng) nên không ai thấy — bản tiếp theo deploy từ HEAD mới lộ.
 *
 * Dùng: node scripts/check-cp-features.mjs [đường-dẫn-index.js ...]
 *   - không tham số: kiểm tra bản trong repo (control-plane/src)
 *   - có tham số: kiểm tra file cụ thể, ví dụ file trên server qua `ssh ... cat`
 * Thoát code 1 nếu thiếu bất kỳ mục nào.
 */
import fs from "node:fs";
import path from "node:path";

const TARGETS = {
  "control-plane/src/index.js": [
    ["tự xác nhận SePay", "sepay-webhook"],
    ["mã đơn duy nhất", "createPendingOrder"],
    ["hàng đợi cấp mã", "withOrderCodeLock"],
    ["email đã-thanh-toán", "firePaidAlert"],
    ["cảnh báo tiền lạc đơn", "fireUnmatchedAlert"],
    ["cổng email đơn mới", "OWNER_ALERT_ON_CREATE"],
    ["kênh thủ công luôn báo", "MANUAL_CHANNELS"],
    ["kiểm tài khoản nhận", "accountMatches"],
    ["whitelist IP SePay", "SEPAY_IP_ALLOWLIST"],
    ["nhật ký đối soát", "logSepayWebhook"],
    ["QR theo gói", "qrForOrder"],
    ["link tải theo cấu hình", 'appConfig.get("ios_ipa_url")'],
    ["xác nhận tay giữ kênh", 'confirmedBy: "manual"'],
  ],
  "control-plane/src/payments.js": [
    ["chọn ảnh QR theo gói/sản phẩm", "export function resolveQrFile"],
    ["số ¥ in trong ảnh", "export function qrAmountsFor"],
    ["ẩn copy khi QR có sẵn tiền", "qrPrefilled"],
    ["trang tình trạng đơn", "export function orderStatusPageHTML"],
  ],
  "control-plane/src/mailer.js": [
    ["email đã-thanh-toán", "export function renderPaidAlert"],
    ["email cảnh báo", "export function renderUnmatchedTransferAlert"],
    ["phân biệt xác nhận tay", "confirmedBy"],
  ],
  "control-plane/src/sepay.js": [
    ["chữ ký HMAC + chống replay", "export function verifySepaySignature"],
    ["kiểm tài khoản nhận", "export function accountMatches"],
    ["whitelist IP", "export function clientIpAllowed"],
  ],
};

const args = process.argv.slice(2);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
let failed = 0;

for (const [rel, checks] of Object.entries(TARGETS)) {
  const file = args.length ? args.shift() : path.join(root, rel);
  if (!file || !fs.existsSync(file)) {
    console.log(`✖ ${file ?? rel}: KHÔNG THẤY FILE`);
    failed += 1;
    continue;
  }
  const text = fs.readFileSync(file, "utf8");
  const missing = checks.filter(([, needle]) => !text.includes(needle));
  if (missing.length === 0) {
    console.log(`✔ ${file} — đủ ${checks.length}/${checks.length} mục`);
  } else {
    failed += 1;
    console.log(`✖ ${file} — THIẾU ${missing.length} mục:`);
    for (const [label, needle] of missing) console.log(`    · ${label} (tìm "${needle}")`);
  }
}

if (failed) {
  console.log(`\nKẾT LUẬN: ${failed} file thiếu tính năng — KHÔNG deploy bản này.`);
  process.exit(1);
}
console.log("\nKẾT LUẬN: đủ tính năng, deploy được.");
