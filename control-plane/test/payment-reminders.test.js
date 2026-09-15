import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AuthStore } from "../src/auth-store.js";
import { runPaymentReminders, PAYMENT_REMINDER_COOLDOWN_MS, PAYMENT_REMINDER_BATCH_MAX } from "../src/payment-reminders.js";
import { renderPaymentReminderEmail } from "../src/mailer.js";

async function makeStore() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "privatevpn-pay-"));
  return {
    store: new AuthStore(path.join(dir, "auth.json")),
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

// ---------------------------------------------------------------- chọn đơn nhắc

test("listPaymentsForReminder: chỉ lấy đơn CHƯA thanh toán và có email hợp lệ", async () => {
  const { store, cleanup } = await makeStore();
  try {
    await store.recordPendingPayment(1001, { email: "a@example.com", plan: "monthly" });
    await store.recordPendingPayment(1002, { email: "khong-phai-email", plan: "monthly" });
    await store.recordPendingPayment(1003, { email: "b@example.com", plan: "yearly" });
    await store.markPendingPaymentPaid(1003); // đã trả tiền -> loại khỏi mọi danh sách

    const { due, skipped } = await store.listPaymentsForReminder();
    assert.deepEqual(due.map((o) => o.orderCode), [1001]);
    assert.deepEqual(skipped.map((o) => o.orderCode), [1002], "đơn thiếu email bị bỏ qua");
  } finally {
    await cleanup();
  }
});

test("cooldown 24h: đơn vừa nhắc bị bỏ qua, quá 24h thì được nhắc lại", async () => {
  const { store, cleanup } = await makeStore();
  try {
    await store.recordPendingPayment(2001, { email: "c@example.com", plan: "monthly" });
    await store.markPaymentReminded(2001);

    let { due, skipped } = await store.listPaymentsForReminder();
    assert.deepEqual(due, []);
    assert.deepEqual(skipped.map((o) => o.orderCode), [2001]);

    // giả lập đã nhắc cách đây hơn 24h
    const data = await store._load();
    data.pendingPayments[0].lastRemindedAt = new Date(
      Date.now() - (PAYMENT_REMINDER_COOLDOWN_MS + 60 * 60 * 1000),
    ).toISOString();
    await store._save(data);

    ({ due, skipped } = await store.listPaymentsForReminder());
    assert.deepEqual(due.map((o) => o.orderCode), [2001]);
    assert.deepEqual(skipped, []);
  } finally {
    await cleanup();
  }
});

// ---------------------------------------------------------------- dry-run / gửi

test("dry-run KHÔNG gọi hàm gửi mail thật và không ghi cooldown", async () => {
  const { store, cleanup } = await makeStore();
  try {
    await store.recordPendingPayment(3001, { email: "d@example.com", plan: "monthly", amount: 99000 });
    let calls = 0;
    const result = await runPaymentReminders({
      store,
      dry: true,
      sendReminder: async () => {
        calls += 1;
        return { sent: true };
      },
      buildBuyUrl: ({ email, plan, lang }) => `https://x/buy?email=${encodeURIComponent(email)}&plan=${plan}&lang=${lang}`,
      langForEmail: async () => "vi",
    });

    assert.equal(calls, 0, "dry-run tuyệt đối không được gọi sendReminder");
    assert.equal(result.dry, true);
    assert.equal(result.sent, 0);
    assert.equal(result.failed, 0);
    assert.equal(result.orders.length, 1);
    assert.equal(result.orders[0].orderCode, 3001);
    assert.match(result.orders[0].buyUrl, /email=d%40example\.com/);

    const { due } = await store.listPaymentsForReminder();
    assert.equal(due.length, 1, "dry-run không được ghi lastRemindedAt");
  } finally {
    await cleanup();
  }
});

test("gửi thật: đếm sent/failed/skipped; chỉ đơn gửi thành công mới vào cooldown", async () => {
  const { store, cleanup } = await makeStore();
  try {
    await store.recordPendingPayment(4001, { email: "e@example.com", plan: "monthly" });
    await store.recordPendingPayment(4002, { email: "f@example.com", plan: "monthly" });
    await store.recordPendingPayment(4003, { email: "khong-email", plan: "monthly" });
    await store.recordPendingPayment(4004, { email: "g@example.com", plan: "monthly" });

    const sentTo = [];
    const result = await runPaymentReminders({
      store,
      sendReminder: async (item) => {
        if (item.orderCode === 4002) return { sent: false, error: "SMTP 550" };
        sentTo.push(item.orderCode);
        return { sent: true };
      },
      langForEmail: async () => "en",
      delayMs: 0,
    });

    assert.deepEqual(sentTo, [4001, 4004]);
    assert.equal(result.sent, 2);
    assert.equal(result.failed, 1);
    assert.equal(result.skipped, 1);
    // đơn gửi lỗi KHÔNG bị cooldown -> lần sau thử lại
    const { due } = await store.listPaymentsForReminder();
    assert.deepEqual(due.map((o) => o.orderCode), [4002]);
  } finally {
    await cleanup();
  }
});

test("chỉ nhắc đúng một đơn khi truyền onlyOrderCode", async () => {
  const { store, cleanup } = await makeStore();
  try {
    await store.recordPendingPayment(4501, { email: "x@example.com", plan: "monthly" });
    await store.recordPendingPayment(4502, { email: "y@example.com", plan: "monthly" });
    const sentTo = [];
    const result = await runPaymentReminders({
      store,
      onlyOrderCode: 4502,
      sendReminder: async (item) => {
        sentTo.push(item.orderCode);
        return { sent: true };
      },
      langForEmail: async () => "vi",
      delayMs: 0,
    });
    assert.deepEqual(sentTo, [4502]);
    assert.equal(result.sent, 1);
  } finally {
    await cleanup();
  }
});

test("giới hạn batch mỗi lần chạy (không vượt limit)", async () => {
  const { store, cleanup } = await makeStore();
  try {
    for (let i = 0; i < 5; i += 1) {
      await store.recordPendingPayment(5000 + i, { email: `u${i}@example.com`, plan: "monthly" });
    }
    let calls = 0;
    const result = await runPaymentReminders({
      store,
      limit: 2,
      delayMs: 0,
      sendReminder: async () => {
        calls += 1;
        return { sent: true };
      },
      langForEmail: async () => "vi",
    });
    assert.equal(calls, 2);
    assert.equal(result.sent, 2);
    assert.ok(PAYMENT_REMINDER_BATCH_MAX >= 2);
  } finally {
    await cleanup();
  }
});

// ---------------------------------------------------------------- xoá đơn

test("deletePendingPayment: pending xoá được, paid bị từ chối và vẫn còn, id lạ not_found", async () => {
  const { store, cleanup } = await makeStore();
  try {
    await store.recordPendingPayment(6001, { email: "h@example.com", plan: "monthly" });
    await store.recordPendingPayment(6002, { email: "i@example.com", plan: "monthly" });
    await store.markPendingPaymentPaid(6002);

    const ok = await store.deletePendingPayment(6001);
    assert.equal(ok.ok, true);
    assert.equal(await store.pendingPaymentByCode(6001), null);

    const paid = await store.deletePendingPayment(6002);
    assert.equal(paid.ok, false);
    assert.equal(paid.reason, "paid");
    assert.ok(await store.pendingPaymentByCode(6002), "đơn đã trả tiền phải còn nguyên");

    const missing = await store.deletePendingPayment(999999);
    assert.equal(missing.ok, false);
    assert.equal(missing.reason, "not_found");
  } finally {
    await cleanup();
  }
});

test("deleteUnpaidPendingPayments: chỉ xoá đơn chưa thanh toán", async () => {
  const { store, cleanup } = await makeStore();
  try {
    await store.recordPendingPayment(7001, { email: "j@example.com", plan: "monthly" });
    await store.recordPendingPayment(7002, { email: "k@example.com", plan: "monthly" });
    await store.recordPendingPayment(7003, { email: "l@example.com", plan: "monthly" });
    await store.markPendingPaymentPaid(7003);

    const { removed } = await store.deleteUnpaidPendingPayments();
    assert.equal(removed, 2);
    assert.equal(await store.pendingPaymentByCode(7001), null);
    assert.ok(await store.pendingPaymentByCode(7003), "đơn đã trả tiền không bị xoá");
  } finally {
    await cleanup();
  }
});

// ---------------------------------------------------------------- nội dung mail

test("email nhắc chuyển tiền bám mẫu vi/en/zh; ja/ko rơi về tiếng Anh", () => {
  const vi = renderPaymentReminderEmail({
    lang: "vi", to: "a@x.com", orderCode: 123, planLabel: "1 tháng", amount: 99000,
    buyUrl: "https://x/buy?email=a%40x.com",
  });
  assert.match(vi.subject, /123/);
  assert.match(vi.html, /99\.000/);
  assert.match(vi.html, /a%40x\.com/);

  const en = renderPaymentReminderEmail({
    lang: "en", to: "a@x.com", orderCode: 123, planLabel: "1 month", amount: 99000,
  });
  assert.match(en.html, /99,000/);

  const zh = renderPaymentReminderEmail({
    lang: "zh", to: "a@x.com", orderCode: 123, planLabel: "1个月", amount: 99000,
  });
  assert.match(zh.html, /付款/);

  const ja = renderPaymentReminderEmail({
    lang: "ja", to: "a@x.com", orderCode: 123, planLabel: "1ヶ月", amount: 99000,
  });
  assert.equal(ja.subject, en.subject, "ja chưa có bản dịch riêng -> dùng tiếng Anh");
});
