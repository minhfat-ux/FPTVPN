import "./helpers.js";
import test, { after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { api, bootServer, closeServer, registerAdmin } from "./helpers.js";

const { initDb, all } = await import("../src/db.js");
initDb();
const { createUser, issueToken } = await import("../src/auth.js");
const settings = await import("../src/settings.js");
const credits = await import("../src/credits.js");
const topup = await import("../src/topup.js");

settings.patchAppSettings({ signupCredits: 0 });

/**
 * Tài khoản ĐẦU TIÊN của instance là admin — đăng ký trước để mọi user tạo sau
 * bằng `createUser` đều là user thường, đúng như thực tế.
 */
const ADMIN = await registerAdmin("admin-sepay@fbuddy.test");

const SECRET = "spsk_route_test_secret_987654321";

/** Bật SePay ở chế độ webhook với secret đã mã hoá như control panel làm. */
function enableWebhook() {
  settings.applyAppSettingsPatch({ sepayWebhookSecret: SECRET });
  settings.patchAppSettings({ sepayEnabled: true, sepayMode: "webhook", sepayApiTokenEnc: null });
}

after(async () => {
  await closeServer();
});

function userFor(email) {
  const existing = all("users", "email = ?", [email])[0];
  const user = existing ?? createUser({ email, password: "matkhau12345", name: "SePay" });
  return { user, token: issueToken(user) };
}

/**
 * Gọi webhook bằng chuỗi nguyên văn (không qua `api()` vì helper đó tự
 * JSON.stringify — chữ ký phải khớp đúng bytes gửi đi).
 */
async function postWebhook({
  body,
  secret = SECRET,
  timestamp = Math.floor(Date.now() / 1000),
  signature,
  omitSignature = false,
  headers = {},
}) {
  const { baseUrl } = await bootServer();
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const signed = signature ?? crypto.createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex");
  const finalHeaders = { "Content-Type": "application/json", ...headers };
  if (!omitSignature && !headers.Authorization) {
    finalHeaders["X-SePay-Signature"] = `sha256=${signed}`;
    finalHeaders["X-SePay-Timestamp"] = String(timestamp);
  }
  const response = await fetch(`${baseUrl}/api/topup/sepay`, { method: "POST", headers: finalHeaders, body: raw });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: response.status, body: json, text };
}

test("webhook từ chối khi SePay chưa bật trong Cài đặt", async () => {
  settings.patchAppSettings({ sepayEnabled: false });
  const result = await postWebhook({ body: { id: 1, transaction_content: "FBUDDY000001", amount_in: "10000" } });
  assert.equal(result.status, 403);
  assert.equal(result.body.error.code, "sepay_disabled");
});

test("webhook từ chối chữ ký sai, chữ ký cũ và request không ký", async () => {
  enableWebhook();
  const body = { id: 2, transaction_content: "FBUDDY000002", amount_in: "10000" };

  const wrongSecret = await postWebhook({ body, secret: "spsk_sai_hoan_toan" });
  assert.equal(wrongSecret.status, 401, "secret khác thì không được chấp nhận");

  const stale = await postWebhook({ body, timestamp: Math.floor(Date.now() / 1000) - 3600 });
  assert.equal(stale.status, 401, "chữ ký cũ hơn 5 phút phải bị từ chối (chống replay)");

  const unsigned = await postWebhook({ body, omitSignature: true });
  assert.equal(unsigned.status, 401, "thiếu cả chữ ký lẫn Apikey thì bị từ chối");

  const wrongFormat = await postWebhook({ body, signature: "khong-phai-hex" });
  assert.equal(wrongFormat.status, 401);
});

test("chữ ký được kiểm trên NGUYÊN VĂN body, không phải bản serialize lại", async () => {
  enableWebhook();
  // Ký trên bản compact nhưng gửi bản xuống dòng ⇒ phải bị từ chối, chứng minh
  // route dùng đúng bytes gốc (express.raw) chứ không tự JSON.stringify lại.
  const compact = JSON.stringify({ id: 3, transaction_content: "FBUDDY000003", amount_in: "10000" });
  const pretty = JSON.stringify({ id: 3, transaction_content: "FBUDDY000003", amount_in: "10000" }, null, 2);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto.createHmac("sha256", SECRET).update(`${timestamp}.${compact}`).digest("hex");

  const result = await postWebhook({ body: pretty, signature, timestamp });
  assert.equal(result.status, 401, "body khác nguyên văn thì chữ ký không còn hợp lệ");
});

test("webhook hợp lệ cộng credit đúng một lần, gửi lại không cộng thêm", async () => {
  enableWebhook();
  const { user } = userFor("sepay-webhook@fbuddy.test");
  settings.patchAppSettings({ bankAccount: "57222538888", bankAccountName: "NGUYEN MINH" });

  const order = topup.createTopupOrder({ user, packageId: "starter" }).order;
  const balanceBefore = credits.getBalance(user.id);
  const transaction = {
    id: "tx_route_1",
    transaction_content: `CT DEN: ${order.transferNote} chuyen tien nap`,
    amount_in: String(order.amountVnd),
    transfer_type: "in",
    transaction_date: "2026-09-17 17:05:00",
  };

  const first = await postWebhook({ body: transaction });
  assert.equal(first.status, 200);
  assert.equal(first.body.ok, true);
  assert.equal(first.body.checked, 1);
  assert.equal(first.body.applied, 1);
  assert.equal(first.body.orders[0].orderId, order.id);
  assert.equal(credits.getBalance(user.id), balanceBefore + order.tokens, "credit phải vào đúng số của đơn");
  assert.equal(topup.listTopupOrders({ userId: user.id, limit: 1 })[0].status, "paid");

  // SePay gửi lại cùng giao dịch (retry) — không được cộng lần hai.
  const again = await postWebhook({ body: transaction });
  assert.equal(again.status, 200);
  assert.equal(again.body.applied, 0, "giao dịch đã xử lý không cộng lại");
  assert.equal(credits.getBalance(user.id), balanceBefore + order.tokens);
});

test("webhook chấp nhận kiểu xác thực Apikey của SePay", async () => {
  enableWebhook();
  const { user } = userFor("sepay-apikey@fbuddy.test");
  const order = topup.createTopupOrder({ user, packageId: "starter" }).order;
  const balanceBefore = credits.getBalance(user.id);

  const result = await postWebhook({
    body: { transaction_content: order.transferNote, amount_in: String(order.amountVnd), transfer_type: "in" },
    omitSignature: true,
    headers: { Authorization: `Apikey ${SECRET}` },
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.applied, 1);
  assert.equal(credits.getBalance(user.id), balanceBefore + order.tokens);

  // Apikey sai thì vẫn bị chặn.
  const wrong = await postWebhook({
    body: { transaction_content: order.transferNote, amount_in: String(order.amountVnd) },
    omitSignature: true,
    headers: { Authorization: "Apikey sai-be-bet" },
  });
  assert.equal(wrong.status, 401);
});

test("giao dịch không khớp đơn nào: 200 nhưng không cộng credit", async () => {
  enableWebhook();
  const { user } = userFor("sepay-nomatch@fbuddy.test");
  const before = credits.getBalance(user.id);

  const result = await postWebhook({
    body: { id: "tx_lac", transaction_content: "chuyen tien mua ve may bay", amount_in: "150000", transfer_type: "in" },
  });
  assert.equal(result.status, 200, "tiền vào vì việc khác là bình thường, không trả lỗi cho SePay");
  assert.equal(result.body.applied, 0);
  assert.equal(credits.getBalance(user.id), before, "không được cộng credit cho giao dịch lạ");
});

test("body không phải JSON hợp lệ bị trả 400 kèm hướng dẫn", async () => {
  enableWebhook();
  const result = await postWebhook({ body: "khong-phai-json" });
  assert.equal(result.status, 400);
  assert.match(result.body.error.message, /JSON/);
});

test("admin: trạng thái SePay chỉ admin xem được và phơi đúng credential", async () => {
  enableWebhook();
  const normal = userFor("sepay-user@fbuddy.test");

  const forbidden = await fetch(`${(await bootServer()).baseUrl}/api/admin/sepay/status`, {
    headers: { Authorization: `Bearer ${normal.token}` },
  });
  assert.equal(forbidden.status, 403, "user thường không được xem cấu hình thanh toán");

  const status = await api("GET", "/admin/sepay/status", undefined, ADMIN.token);
  assert.equal(status.enabled, true);
  assert.equal(status.mode, "webhook");
  assert.equal(status.hasWebhookSecret, true, "secret đã lưu thì trạng thái phải thấy");
  assert.equal(status.hasApiToken, false);
  assert.equal(typeof status.pendingOrders, "number");
  assert.ok(status.pollSeconds >= 30);
});

test("admin: poll khi chưa có API token thì báo lỗi rõ, không gọi mạng", async () => {
  enableWebhook();

  const response = await fetch(`${(await bootServer()).baseUrl}/api/admin/sepay/poll`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ADMIN.token}` },
    body: JSON.stringify({}),
  });
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.match(body.error.message, /API token/, "phải nói rõ thiếu token ở đâu");
});
