import "./helpers.js";
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { api, apiRaw, bootServer, closeServer } from "./helpers.js";

const { initDb, all } = await import("../src/db.js");
initDb();
const { createUser, issueToken } = await import("../src/auth.js");
const credits = await import("../src/credits.js");
const requests = await import("../src/credit-requests.js");
const settings = await import("../src/settings.js");

// Tests control the welcome grant themselves (the shipped default is 10.000).
settings.patchAppSettings({ signupCredits: 0 });

after(async () => {
  await closeServer();
});

function userFor(email, role = "user", { credits: initial = 0 } = {}) {
  const existing = all("users", "email = ?", [email])[0];
  const user = existing ?? createUser({ email, password: "matkhau12345", name: "Req", role });
  if (!existing && initial) credits.grantCredits({ userId: user.id, amount: initial });
  return { user, token: issueToken(user) };
}

test("a request is stored, signed links are produced and tampering is rejected", () => {
  const { user } = userFor("req-sign@fbuddy.test");
  const request = requests.createCreditRequest({ user, amount: 10000, note: "hết token rồi ạ" });
  assert.equal(request.status, "pending");
  assert.equal(request.amount, 10000);
  assert.equal(request.email, "req-sign@fbuddy.test");
  assert.equal(request.note, "hết token rồi ạ");

  const links = requests.decisionLinks(request.id);
  const approveToken = decodeURIComponent(new URL(links.approve).searchParams.get("t"));
  const rejectToken = decodeURIComponent(new URL(links.reject).searchParams.get("t"));
  assert.equal(requests.verifyDecisionToken(request.id, "approve", approveToken).ok, true);
  assert.equal(requests.verifyDecisionToken(request.id, "reject", rejectToken).ok, true);
  // A signature for "approve" must not authorise "reject" (nor another request).
  assert.equal(requests.verifyDecisionToken(request.id, "reject", approveToken).ok, false);
  assert.equal(requests.verifyDecisionToken("r_khac", "approve", approveToken).ok, false);
  assert.equal(requests.verifyDecisionToken(request.id, "approve", "9999999999999.abc").ok, false);
  assert.equal(requests.verifyDecisionToken(request.id, "approve", "khong-hop-le").ok, false);

  const telegram = requests.buildTelegramPayload(request);
  assert.match(telegram.text, /xin thêm token/i);
  assert.match(telegram.text, /req-sign@fbuddy\.test/);
  assert.match(telegram.text, /10\.000/);
  assert.equal(telegram.reply_markup.inline_keyboard[0].length, 2);
  assert.match(telegram.reply_markup.inline_keyboard[0][0].url, /action=approve/);
});

test("only one pending request per user; a second one is refused with the existing one", () => {
  const { user } = userFor("req-dup@fbuddy.test");
  const first = requests.createCreditRequest({ user, amount: 5000 });
  assert.equal(requests.pendingRequestFor(user.id).id, first.id);
  assert.throws(() => requests.createCreditRequest({ user, amount: 9000 }), /đang chờ duyệt/);
  // Deciding frees the slot for a new request.
  requests.decideCreditRequest({ requestId: first.id, approve: false, decidedBy: "admin@x" });
  const second = requests.createCreditRequest({ user, amount: 9000 });
  assert.equal(second.status, "pending");
});

test("approving grants the tokens and rejecting leaves the balance alone", () => {
  const { user } = userFor("req-decide@fbuddy.test", "user", { credits: 100 });
  const approve = requests.createCreditRequest({ user, amount: 700 });
  const result = requests.decideCreditRequest({ requestId: approve.id, approve: true, decidedBy: "telegram" });
  assert.equal(result.request.status, "approved");
  assert.equal(result.request.grantedAmount, 700);
  assert.equal(result.request.decidedBy, "telegram");
  assert.equal(result.balance, 800);
  assert.equal(credits.getBalance(user.id), 800);
  assert.equal(credits.listLedger(user.id)[0].reason, "request_approved");

  // Idempotent: tapping the link twice must not grant twice.
  const again = requests.decideCreditRequest({ requestId: approve.id, approve: true });
  assert.equal(again.alreadyDecided, true);
  assert.equal(credits.getBalance(user.id), 800);

  const reject = requests.createCreditRequest({ user, amount: 500 });
  const rejected = requests.decideCreditRequest({ requestId: reject.id, approve: false });
  assert.equal(rejected.request.status, "rejected");
  assert.equal(rejected.request.grantedAmount, 0);
  assert.equal(credits.getBalance(user.id), 800);
});

test("the owner can approve with a different amount", () => {
  const { user } = userFor("req-amount@fbuddy.test", "user", { credits: 10 });
  const request = requests.createCreditRequest({ user, amount: 100000 });
  const result = requests.decideCreditRequest({ requestId: request.id, approve: true, amount: 25000 });
  assert.equal(result.request.grantedAmount, 25000);
  assert.equal(result.balance, 25010);
});

test("invalid amounts are refused", () => {
  const { user } = userFor("req-invalid@fbuddy.test");
  assert.throws(() => requests.createCreditRequest({ user, amount: 0 }), /lớn hơn 0/);
  assert.throws(() => requests.createCreditRequest({ user, amount: -5 }), /lớn hơn 0/);
  assert.throws(() => requests.createCreditRequest({ user, amount: 99_000_000 }), /tối đa/);
  assert.throws(() => requests.decideCreditRequest({ requestId: "r_khong_co", approve: true }), /Không tìm thấy/);
});

test("the API lets a user ask and the owner approve (Telegram not configured in tests)", async () => {
  const { token, user } = userFor("req-api@fbuddy.test");
  const admin = userFor("req-admin@fbuddy.test", "admin");

  // No bot token in the test env → the request is still stored, and we say so.
  const created = await api("POST", "/credits/request", { amount: 10000, note: "cần thêm để làm slide" }, token);
  assert.equal(created.request.status, "pending");
  assert.equal(created.telegram.sent, false);
  assert.match(created.telegram.message, /FBUDDY_TELEGRAM/);

  const again = await apiRaw("POST", "/credits/request", { amount: 10000 }, token);
  assert.equal(again.status, 409);

  const mine = await api("GET", "/credits/requests", undefined, token);
  assert.equal(mine.items.length, 1);
  assert.equal(mine.items[0].id, created.request.id);

  const pending = await api("GET", "/admin/credit-requests?status=pending", undefined, admin.token);
  const ours = pending.items.find((item) => item.id === created.request.id);
  assert.ok(ours, "yêu cầu phải nằm trong danh sách chờ duyệt");
  assert.equal(ours.email, "req-api@fbuddy.test");

  // A normal user cannot list or decide.
  assert.equal((await apiRaw("GET", "/admin/credit-requests", undefined, token)).status, 403);
  assert.equal(
    (await apiRaw("POST", `/admin/credit-requests/${created.request.id}/decide`, { approve: true }, token)).status,
    403,
  );

  const decided = await api(
    "POST",
    `/admin/credit-requests/${created.request.id}/decide`,
    { approve: true },
    admin.token,
  );
  assert.equal(decided.request.status, "approved");
  assert.equal(decided.balance, 10000);
  assert.equal(credits.getBalance(user.id), 10000);
});

test("the signed Telegram link approves without a session and shows a page", async () => {
  const { user } = userFor("req-link@fbuddy.test");
  const request = requests.createCreditRequest({ user, amount: 12000 });
  const links = requests.decisionLinks(request.id);
  // In production these point at FBUDDY_PUBLIC_URL; the test server listens on a
  // random port, so keep the signed path and swap only the origin.
  assert.match(links.approve, /\/api\/credits\/requests\/[^/]+\/decide\?action=approve&t=/);
  const { baseUrl } = await bootServer();
  const toTestServer = (url) => `${baseUrl}${new URL(url).pathname}${new URL(url).search}`;

  const response = await fetch(toTestServer(links.approve));
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Đã duyệt/);
  assert.match(html, /12\.000/);
  assert.equal(credits.getBalance(user.id), 12000);

  // Reusing the link is harmless.
  const second = await fetch(toTestServer(links.approve));
  assert.match(await second.text(), /đã được xử lý/i);

  // A forged link is refused (far-future expiry, wrong signature → 403; a past
  // expiry would legitimately answer 410 "expired").
  const forged = await fetch(`${baseUrl}/api/credits/requests/${request.id}/decide?action=approve&t=9999999999999.abc`);
  assert.equal(forged.status, 403);
  const expired = await fetch(`${baseUrl}/api/credits/requests/${request.id}/decide?action=approve&t=123.abc`);
  assert.equal(expired.status, 410);

  // The reject link for a fresh request works too.
  const other = requests.createCreditRequest({ user, amount: 1000 });
  const rejected = await fetch(toTestServer(requests.decisionLinks(other.id).reject));
  assert.match(await rejected.text(), /Đã từ chối/);
  assert.equal(credits.getBalance(user.id), 12000);
});
