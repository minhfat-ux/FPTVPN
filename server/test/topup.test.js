import "./helpers.js";
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { api, apiRaw, bootServer, closeServer } from "./helpers.js";

const { initDb, all, DEFAULT_APP_SETTINGS } = await import("../src/db.js");
initDb();
const { createUser, issueToken } = await import("../src/auth.js");
const settings = await import("../src/settings.js");
const credits = await import("../src/credits.js");
const topup = await import("../src/topup.js");

settings.patchAppSettings({ signupCredits: 0 });

after(async () => {
  await closeServer();
});

function userFor(email, role = "user") {
  const existing = all("users", "email = ?", [email])[0];
  const user = existing ?? createUser({ email, password: "matkhau12345", name: "Topup", role });
  return { user, token: issueToken(user) };
}

test("packages come from settings and are expanded with bonuses", () => {
  const packages = topup.topupPackages();
  assert.ok(packages.length >= 3);
  const pro = packages.find((pkg) => pkg.id === "pro");
  assert.equal(pro.totalTokens, pro.tokens + pro.bonusTokens);
  assert.ok(pro.priceVnd > 0);
  assert.ok(packages.every((pkg) => pkg.totalTokens > 0));
});

test("package prices follow vndPerCredit unless a tier overrides the price", () => {
  settings.patchAppSettings({
    vndPerCredit: 20,
    topupPackages: [
      { id: "a", name: "Gói A", tokens: 10000, bonusTokens: 0, priceVnd: null },
      { id: "b", name: "Gói B", tokens: 50000, bonusTokens: 5000, priceVnd: null },
      // A promo tier keeps its own price even when the rate changes.
      { id: "promo", name: "Khuyến mãi", tokens: 20000, bonusTokens: 0, priceVnd: 99000 },
    ],
  });

  const packages = topup.topupPackages();
  assert.equal(packages[0].priceVnd, 200000, "10.000 credit × 20đ = 200.000đ");
  assert.equal(packages[0].priceSource, "vndPerCredit");
  // Bonus credits are part of what the buyer receives, so they count toward the price.
  assert.equal(packages[1].priceVnd, 1100000, "55.000 credit × 20đ");
  assert.equal(packages[2].priceVnd, 99000);
  assert.equal(packages[2].priceSource, "package");

  // Changing the single knob re-prices every derived tier…
  settings.patchAppSettings({ vndPerCredit: 50 });
  const repriced = topup.topupPackages();
  assert.equal(repriced[0].priceVnd, 500000);
  assert.equal(repriced[1].priceVnd, 2750000);
  assert.equal(repriced[2].priceVnd, 99000, "gói có giá riêng không đổi");

  // …and the helper used by the admin preview agrees.
  assert.equal(topup.priceForCredits(2000), 100000, "1 lượt chat ~2.000 credit ≈ 100.000đ ở mức 50đ/credit");
  assert.equal(topup.priceForCredits(0), 0);

  // Back to the shipped defaults (20đ/credit, auto-priced tiers).
  settings.patchAppSettings({ vndPerCredit: 20, topupPackages: DEFAULT_APP_SETTINGS.topupPackages });
  assert.equal(topup.topupPackages()[0].priceVnd, 200000);
});

test("the VietQR image is only offered when a bank account is configured", () => {
  assert.equal(topup.vietQrUrl({ amountVnd: 50000, note: "X", bank: { bankId: "970436", account: "", accountName: "" } }), null);
  const url = topup.vietQrUrl({
    amountVnd: 50000,
    note: "FBUDDY123456",
    bank: { bankId: "970436", account: "123456789", accountName: "NGUYEN VAN A" },
  });
  assert.match(url, /^https:\/\/img\.vietqr\.io\/image\/970436-123456789-compact2\.png\?/);
  assert.match(url, /amount=50000/);
  assert.match(url, /addInfo=FBUDDY123456/);
});

test("creating an order makes a unique transfer note and reuses the unpaid one", () => {
  const { user } = userFor("topup-create@fbuddy.test");
  const first = topup.createTopupOrder({ user, packageId: "starter" });
  assert.equal(first.reused, false);
  assert.match(first.order.transferNote, /^FBUDDY\d{6}$/);
  assert.equal(first.order.status, "pending");
  assert.equal(first.order.tokens > 0, true);

  // Same package again → the same order, so the owner never sees duplicates.
  const again = topup.createTopupOrder({ user, packageId: "starter" });
  assert.equal(again.reused, true);
  assert.equal(again.order.id, first.order.id);

  // A different package is a separate order.
  const other = topup.createTopupOrder({ user, packageId: "pro" });
  assert.notEqual(other.order.id, first.order.id);
  assert.equal(topup.listTopupOrders({ userId: user.id }).length, 2);

  assert.throws(() => topup.createTopupOrder({ user, packageId: "khong-co" }), /không tồn tại/);
});

test("confirming an order grants the tokens exactly once", () => {
  const { user } = userFor("topup-confirm@fbuddy.test");
  const { order } = topup.createTopupOrder({ user, packageId: "starter" });
  const tokens = order.tokens;

  const result = topup.confirmTopupOrder({ orderId: order.id, confirmedBy: "owner@test" });
  assert.equal(result.alreadyPaid, false);
  assert.equal(result.balance, tokens);
  assert.equal(credits.getBalance(user.id), tokens);
  const ledger = credits.listLedger(user.id);
  assert.equal(ledger[0].reason, "topup");
  assert.match(ledger[0].note, /starter|Gói/);

  const again = topup.confirmTopupOrder({ orderId: order.id });
  assert.equal(again.alreadyPaid, true);
  assert.equal(credits.getBalance(user.id), tokens, "xác nhận lần hai không cộng thêm");

  assert.throws(() => topup.confirmTopupOrder({ orderId: "t_khong_co" }), /Không tìm thấy/);
});

test("the owner can confirm with a custom token amount", () => {
  const { user } = userFor("topup-custom@fbuddy.test");
  const { order } = topup.createTopupOrder({ user, packageId: "starter" });
  const result = topup.confirmTopupOrder({ orderId: order.id, tokens: 777 });
  assert.equal(result.order.tokens, 777);
  assert.equal(result.balance, 777);
});

test("a user can mark an order transferred and cancel an unpaid one", async () => {
  const { user } = userFor("topup-state@fbuddy.test");
  const { order } = topup.createTopupOrder({ user, packageId: "starter" });
  const moved = await topup.markTopupAsTransferred({ user, orderId: order.id, bankTxnRef: "FT123" });
  assert.equal(moved.order.status, "awaiting_confirmation");
  assert.equal(moved.order.bankTxnRef, undefined); // không lộ ra API công khai
  assert.equal(moved.telegram.sent, false, "chưa cấu hình bot trong test");
  assert.match(moved.telegram.message, /FBUDDY_TELEGRAM/);

  const cancelled = topup.cancelTopupOrder({ orderId: order.id, userId: user.id });
  assert.equal(cancelled.status, "cancelled");

  // A paid order can no longer be cancelled.
  const { order: paidOrder } = topup.createTopupOrder({ user, packageId: "pro" });
  topup.confirmTopupOrder({ orderId: paidOrder.id });
  assert.throws(() => topup.cancelTopupOrder({ orderId: paidOrder.id, userId: user.id }), /đã thanh toán/);
});

test("the confirm token is signed and rejects tampering", () => {
  const { user } = userFor("topup-token@fbuddy.test");
  const { order } = topup.createTopupOrder({ user, packageId: "starter" });
  const url = topup.topupConfirmLink(order.id);
  assert.match(url, /\/api\/topup\/orders\/[^/]+\/confirm\?t=/);
  const token = decodeURIComponent(new URL(url).searchParams.get("t"));
  assert.equal(topup.verifyConfirmToken(order.id, token).ok, true);
  assert.equal(topup.verifyConfirmToken("t_khac", token).ok, false);
  assert.equal(topup.verifyConfirmToken(order.id, "9999999999999.abc").ok, false);
  assert.equal(topup.verifyConfirmToken(order.id, "123.abc").ok, false);
  assert.equal(topup.verifyConfirmToken(order.id, "rac").ok, false);
});

test("the top-up API exposes packages, orders and the admin confirmation", async () => {
  const { token, user } = userFor("topup-api@fbuddy.test");
  const admin = userFor("topup-admin@fbuddy.test", "admin");

  const listing = await api("GET", "/topup", undefined, token);
  assert.ok(listing.packages.length >= 3);
  assert.equal(listing.balance, 0);
  assert.deepEqual(listing.orders, []);

  const created = await api("POST", "/topup/orders", { packageId: "starter" }, token);
  assert.equal(created.order.status, "pending");
  assert.match(created.order.transferNote, /^FBUDDY/);

  const transferred = await api(
    "POST",
    `/topup/orders/${created.order.id}/transferred`,
    { bankTxnRef: "FT999" },
    token,
  );
  assert.equal(transferred.order.status, "awaiting_confirmation");
  assert.equal(transferred.telegram.sent, false);

  const pending = await api("GET", "/admin/topup-orders?status=awaiting_confirmation", undefined, admin.token);
  assert.ok(pending.items.some((item) => item.id === created.order.id));

  // A normal user cannot confirm.
  assert.equal((await apiRaw("POST", `/admin/topup-orders/${created.order.id}/confirm`, {}, token)).status, 403);

  const confirmed = await api("POST", `/admin/topup-orders/${created.order.id}/confirm`, {}, admin.token);
  assert.equal(confirmed.order.status, "paid");
  assert.equal(confirmed.balance, created.order.tokens);
  assert.equal(credits.getBalance(user.id), created.order.tokens);

  // The signed link works without a session and is idempotent.
  const second = await api("POST", "/topup/orders", { packageId: "pro" }, token);
  const { baseUrl } = await bootServer();
  const link = topup.topupConfirmLink(second.order.id);
  const response = await fetch(`${baseUrl}${new URL(link).pathname}${new URL(link).search}`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Đã cộng token/);
  assert.equal(credits.getBalance(user.id), created.order.tokens + second.order.tokens);

  const reused = await fetch(`${baseUrl}${new URL(link).pathname}${new URL(link).search}`);
  assert.match(await reused.text(), /đã được xác nhận/i);

  const forged = await fetch(`${baseUrl}/api/topup/orders/${second.order.id}/confirm?t=9999999999999.abc`);
  assert.equal(forged.status, 403);
});

test("creditBuyUrl points at the in-app top-up page", () => {
  assert.match(settings.readAppSettings().creditBuyUrl, /view=topup/);
  const meta = topup.topupPackages();
  assert.ok(meta.every((pkg) => Number.isInteger(pkg.priceVnd)));
});
