#!/usr/bin/env node
/**
 * Tự test webhook SePay (IPN) — ký payload bằng secret rồi POST như SePay sẽ gọi.
 *
 *   SEPAY_SECRET=spsk_… node scripts/sepay-selftest.mjs --code 123456 [--amount 200000]
 *   SEPAY_SECRET=… node scripts/sepay-selftest.mjs --url https://api.meetflowai.site/v1/payments/sepay-webhook
 *
 * Kiểm 5 ca: chữ ký đúng · API Key đúng · chữ ký sai · không xác thực · giao dịch tiền RA.
 * Ca "chữ ký đúng" trả {"success":true}; nếu mã đơn không có trong hàng chờ thì server chỉ log
 * (không kích hoạt) — đúng thiết kế, tránh cấp gói cho đơn không tồn tại.
 *
 * Test TRỌN luồng (cấp gói + gửi hoá đơn): tạo đơn thật trước rồi truyền mã đơn vào --code:
 *   curl -s -X POST -H 'content-type: application/json' \
 *     -d '{"email":"<email test>","plan":"monthly","method":"bankqr","lang":"vi"}' \
 *     https://api.meetflowai.site/v1/payments/create
 */
import crypto from "node:crypto";

const args = process.argv.slice(2);
const flag = (name, fallback = "") => {
  const withEq = args.find((a) => a.startsWith(`--${name}=`));
  if (withEq) return withEq.slice(name.length + 3);
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] ?? fallback : fallback;
};

const target = flag("url", "https://api.meetflowai.site/v1/payments/sepay-webhook");
const SECRET = process.env.SEPAY_SECRET || flag("secret");
const CODE = flag("code", "999999");
const AMOUNT = Number(flag("amount", "200000"));
const PREFIX = flag("prefix", "VPNFLOW");
// --plain: nội dung KHÔNG dấu gạch, đúng dạng vietqr.app sinh ra (VPNFLOW1789319664THANG)
const PLAIN = args.includes("--plain");

if (!SECRET) {
  console.error("Thiếu secret: đặt SEPAY_SECRET=… hoặc --secret …");
  process.exit(2);
}

const payload = (transferType = "in", amount = AMOUNT) => JSON.stringify({
  id: Math.floor(Date.now() / 1000) % 2147483647,
  gateway: "TPBank",
  transactionDate: new Date().toISOString().slice(0, 19).replace("T", " "),
  accountNumber: "57222538888",
  subAccount: null,
  code: PLAIN ? `${PREFIX}${CODE}` : `${PREFIX}-${CODE}`,
  content: PLAIN ? `${PREFIX}${CODE}THANG` : `${PREFIX}-${CODE} thanh toan don hang`,
  transferType,
  description: "SePay selftest",
  transferAmount: amount,
  referenceCode: `FTSELFTEST${Math.floor(Date.now() / 1000)}`,
  accumulated: 0,
});

function sign(body) {
  const ts = Math.floor(Date.now() / 1000);
  const hex = crypto.createHmac("sha256", SECRET).update(`${ts}.${body}`).digest("hex");
  return { "x-sepay-signature": `sha256=${hex}`, "x-sepay-timestamp": String(ts) };
}

let failed = 0;
async function expect(label, headers, body, want) {
  let status = 0;
  let text = "";
  try {
    const res = await fetch(target, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body,
    });
    status = res.status;
    text = await res.text();
  } catch (err) {
    text = `${err?.name ?? "Error"}: ${err?.message ?? err}`;
  }
  const ok = status === want;
  if (!ok) failed += 1;
  console.log(`  ${ok ? "OK  " : "SAI "} ${label.padEnd(18)} HTTP ${status} (mong đợi ${want})  ${text.slice(0, 120)}`);
}

console.log(`Webhook: ${target}\nMã đơn: ${PREFIX}-${CODE} · số tiền: ${AMOUNT.toLocaleString("vi-VN")}đ\n`);

const good = payload();
const outBody = payload("out");
await expect("chữ ký ĐÚNG", sign(good), good, 200);
await expect("API Key đúng", { authorization: `Apikey ${SECRET}` }, good, 200);
await expect("chữ ký SAI", {
  "x-sepay-signature": `sha256=${"0".repeat(64)}`,
  "x-sepay-timestamp": String(Math.floor(Date.now() / 1000)),
}, good, 401);
await expect("không xác thực", {}, good, 401);
await expect("tiền RA (bỏ qua)", sign(outBody), outBody, 200);

console.log(failed ? `\n${failed} ca SAI kỳ vọng` : "\nTất cả ca đúng kỳ vọng ✅");
process.exit(failed ? 1 : 0);
