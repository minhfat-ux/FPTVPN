import test from "node:test";
import assert from "node:assert/strict";
import { seedOrder, seedUser } from "./helpers.js";

const { entitlementFor, entitlementStatus, paidOrder, userByEmail, userById } = await import("../src/entitlement.js");

seedUser({ id: "u_paid", email: "paid@example.com", name: "Khách đã trả" });
seedUser({ id: "u_pending", email: "pending@example.com" });
seedOrder({ id: "ord_paid_1", userId: "u_paid", status: "paid", amountVnd: 50000 });
seedOrder({ id: "ord_pending", userId: "u_pending", status: "pending" });
seedOrder({ id: "ord_cancelled", userId: "u_pending", status: "cancelled" });

test("đọc được DB đơn hàng của fBuddy", () => {
  const status = entitlementStatus();
  assert.equal(status.available, true);
  assert.equal(status.error, null);
});

test("user có đơn paid ⇒ được quyền", () => {
  const decision = entitlementFor({ userId: "u_paid" });
  assert.equal(decision.entitled, true);
  assert.equal(decision.order.id, "ord_paid_1");
  assert.equal(decision.order.amountVnd, 50000);
  assert.equal(decision.reason, null);
});

test("user chỉ có đơn pending ⇒ bị từ chối, nêu rõ lý do", () => {
  const decision = entitlementFor({ userId: "u_pending" });
  assert.equal(decision.entitled, false);
  assert.equal(decision.reason, "no_paid_order");
});

test("user không tồn tại ⇒ bị từ chối", () => {
  const decision = entitlementFor({ userId: "u_khong_co" });
  assert.equal(decision.entitled, false);
  assert.equal(decision.reason, "no_paid_order");
});

test("orderId không thuộc user ⇒ bị từ chối (không mượn đơn người khác)", () => {
  const decision = entitlementFor({ userId: "u_pending", orderId: "ord_paid_1" });
  assert.equal(decision.entitled, false);
  assert.equal(decision.reason, "order_not_paid");
});

test("đơn paid gần nhất được chọn khi có nhiều đơn", () => {
  seedOrder({ id: "ord_paid_2", userId: "u_paid", status: "paid", amountVnd: 120000 });
  const order = paidOrder({ userId: "u_paid" });
  assert.equal(order.id, "ord_paid_2");
});

test("đơn cancelled không mở quyền", () => {
  const decision = entitlementFor({ userId: "u_pending", orderId: "ord_cancelled" });
  assert.equal(decision.entitled, false);
  assert.equal(decision.reason, "order_not_paid");
});

test("tra user theo email không phân biệt hoa thường", () => {
  assert.equal(userByEmail("PAID@example.com")?.id, "u_paid");
  assert.equal(userById("u_paid")?.email, "paid@example.com");
});
