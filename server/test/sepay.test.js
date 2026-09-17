import "./helpers.js";
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { initDb } from "../src/db.js";

initDb();
const sepay = await import("../src/sepay.js");

const SECRET = "spsk_test_secret_0123456789";
const TX = {
  id: "tx_1",
  transaction_content: "CT DEN: FBUDDY123456 chuyen tien nap",
  amount_in: "200000",
  transfer_type: "in",
  transaction_date: "2026-09-17 17:05:00",
};

const ORDER = {
  id: "o_1",
  transferNote: "FBUDDY123456",
  amountVnd: 200000,
  tokens: 10000,
  status: "pending",
};

test("chữ ký webhook đúng công thức {timestamp}.{raw_body}", () => {
  const rawBody = JSON.stringify({ id: 1, transferAmount: 200000 });
  const nowSec = 1_800_000_000;
  const signature = crypto.createHmac("sha256", SECRET).update(`${nowSec}.${rawBody}`).digest("hex");

  assert.equal(
    sepay.verifySepaySignature({ rawBody, signature, timestamp: nowSec, secret: SECRET, nowSec }),
    true,
  );
  // Có tiền tố "sha256=" vẫn nhận (SePay gửi kèm).
  assert.equal(
    sepay.verifySepaySignature({ rawBody, signature: `sha256=${signature}`, timestamp: nowSec, secret: SECRET, nowSec }),
    true,
  );
  // Sai chữ ký, thiếu secret, sai chữ ký số, và chữ ký cũ đều bị từ chối.
  assert.equal(sepay.verifySepaySignature({ rawBody, signature: "a".repeat(64), timestamp: nowSec, secret: SECRET, nowSec }), false);
  assert.equal(sepay.verifySepaySignature({ rawBody, signature, timestamp: nowSec, secret: "", nowSec }), false);
  assert.equal(sepay.verifySepaySignature({ rawBody, signature: "khong-phai-hex", timestamp: nowSec, secret: SECRET, nowSec }), false);
  assert.equal(
    sepay.verifySepaySignature({ rawBody, signature, timestamp: nowSec - 3600, secret: SECRET, nowSec }),
    false,
    "chữ ký cũ hơn 5 phút phải bị từ chối (chống replay)",
  );
  // Body đổi một ký tự ⇒ chữ ký không còn hợp lệ.
  assert.equal(
    sepay.verifySepaySignature({ rawBody: `${rawBody} `, signature, timestamp: nowSec, secret: SECRET, nowSec }),
    false,
  );
});

test("kiểu xác thực Apikey của SePay cũng được chấp nhận", () => {
  assert.equal(sepay.verifySepayApiKey({ header: `Apikey ${SECRET}`, secret: SECRET }), true);
  assert.equal(sepay.verifySepayApiKey({ header: SECRET, secret: SECRET }), true);
  assert.equal(sepay.verifySepayApiKey({ header: "Apikey sai", secret: SECRET }), false);
  assert.equal(sepay.verifySepayApiKey({ header: `Apikey ${SECRET}`, secret: "" }), false);
});

test("giao dịch SePay được chuẩn hoá và khớp đúng đơn theo nội dung chuyển khoản", () => {
  const tx = sepay.normalizeTransaction(TX);
  assert.equal(tx.amountIn, 200000);
  assert.equal(tx.transferType, "in");
  assert.match(tx.content, /FBUDDY123456/);

  const match = sepay.matchOrderForTransaction({ transaction: TX, orders: [ORDER] });
  assert.ok(match, "phải khớp đơn theo transferNote");
  assert.equal(match.order.id, "o_1");
  assert.equal(match.exactAmount, true);

  // Nội dung viết thường / có khoảng trắng vẫn khớp.
  const messy = { ...TX, transaction_content: "fbuddy 123456" };
  assert.ok(sepay.matchOrderForTransaction({ transaction: messy, orders: [ORDER] }));

  // Tiền ra thì bỏ qua.
  assert.equal(sepay.matchOrderForTransaction({ transaction: { ...TX, transfer_type: "out" }, orders: [ORDER] }), null);
  // Không có mã đơn thì bỏ qua.
  assert.equal(sepay.matchOrderForTransaction({ transaction: { ...TX, transaction_content: "chuyen tien" }, orders: [ORDER] }), null);
  // Số tiền quá nhỏ (dưới 80%) không khớp, tránh nhận nhầm giao dịch khác.
  assert.equal(sepay.matchOrderForTransaction({ transaction: { ...TX, amount_in: "100000" }, orders: [ORDER] }), null);
  // Thiếu vài nghìn do phí ngân hàng (>= 80%) vẫn nhận.
  assert.ok(sepay.matchOrderForTransaction({ transaction: { ...TX, amount_in: "195000" }, orders: [ORDER] }));
  // Đơn của người khác (mã khác) không bị khớp.
  assert.equal(
    sepay.matchOrderForTransaction({ transaction: TX, orders: [{ ...ORDER, transferNote: "FBUDDY999999" }] }),
    null,
  );
});

test("chế độ poll: giao dịch khớp đơn thì cộng credit thật, giao dịch lạ thì bỏ qua", async () => {
  const { createUser } = await import("../src/auth.js");
  const topup = await import("../src/topup.js");
  const credits = await import("../src/credits.js");
  const settings = await import("../src/settings.js");
  settings.patchAppSettings({ signupCredits: 0, bankAccount: "57222538888", vndPerCredit: 20 });

  const email = `sepay-poll-${Date.now()}@fbuddy.test`;
  createUser({ email, password: "matkhau12345" });
  const user = (await import("../src/db.js")).all("users", "email = ?", [email])[0];

  const order = topup.createTopupOrder({ user, packageId: topup.topupPackages()[0].id }).order;
  const balanceBefore = credits.getBalance(user.id);

  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, auth: init?.headers?.Authorization });
    return {
      ok: true,
      json: async () => ({
        transactions: [
          { ...TX, transaction_content: `CT DEN: ${order.transferNote}`, amount_in: String(order.amountVnd) },
          { ...TX, id: "tx_lac", transaction_content: "khong lien quan", amount_in: "5000" },
        ],
      }),
    };
  };

  const result = await sepay.pollOnce({ token: "api-token", fetchImpl });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /transactions\/list/);
  assert.equal(calls[0].auth, "Bearer api-token", "phải gửi Bearer token của SePay");
  assert.equal(result.checked, 2);
  assert.equal(result.applied.length, 1, "chỉ giao dịch khớp mã đơn mới được cộng");
  assert.equal(result.applied[0].orderId, order.id);
  assert.equal(credits.getBalance(user.id), balanceBefore + order.tokens, "credit phải vào đúng số token của đơn");
  assert.equal(topup.listTopupOrders({ userId: user.id, limit: 1 })[0].status, "paid");

  // Chạy lại đúng giao dịch đó: idempotent, không cộng thêm.
  const again = await sepay.pollOnce({ token: "api-token", fetchImpl });
  assert.equal(again.applied.length, 0, "giao dịch đã xử lý không được cộng lần hai");
  assert.equal(credits.getBalance(user.id), balanceBefore + order.tokens);

  sepay.recordPoll(result);
  const status = sepay.sepayStatus();
  assert.equal(status.lastPoll.checked, 2);
  assert.equal(status.lastPoll.applied, 1);
  assert.equal(status.lastPoll.error, null);
});

test("API trả lỗi thì poll báo lỗi rõ ràng, không nuốt", async () => {
  const fetchImpl = async () => ({ ok: false, status: 401, text: async () => "Unauthorized" });
  await assert.rejects(
    () => sepay.fetchTransactions({ token: "sai", fetchImpl }),
    /SePay API 401/,
  );
  await assert.rejects(() => sepay.fetchTransactions({ token: "", fetchImpl }), /Thiếu SePay API token/);
});

test("trạng thái SePay phơi ra cho admin biết đã có credential hay chưa", () => {
  const status = sepay.sepayStatus();
  assert.equal(typeof status.enabled, "boolean");
  assert.ok(["poll", "webhook"].includes(status.mode));
  assert.equal(status.hasApiToken, false, "mặc định chưa có token");
  assert.equal(status.hasWebhookSecret, false);
  assert.ok(status.pollSeconds >= 30);
  assert.equal(typeof status.pendingOrders, "number");
  // `lastPoll` là null trước lần chạy đầu, sau đó là thống kê của vòng gần nhất.
  assert.ok(status.lastPoll === null || typeof status.lastPoll?.at === "string");
});
