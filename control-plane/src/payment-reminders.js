import { pickMailLang } from "./mailer.js";

/**
 * Nhắc khách chuyển tiền cho các đơn web CHƯA thanh toán.
 *
 * Tách khỏi index.js để test được phần chọn đơn + cooldown + dry-run mà không
 * phải dựng cả HTTP server. Mọi phụ thuộc (store, hàm gửi mail, đồng hồ, sleep)
 * đều bơm vào từ ngoài.
 */

// Không nhắc lại cùng một đơn trong vòng 24h.
export const PAYMENT_REMINDER_COOLDOWN_MS = 24 * 60 * 60 * 1000;
// Tối đa số đơn xử lý mỗi lần chạy — tránh dội mail và giữ request ngắn.
export const PAYMENT_REMINDER_BATCH_MAX = 50;
// Giãn nhịp giữa các thư để nhà cung cấp mail không chặn.
export const PAYMENT_REMINDER_DELAY_MS = 400;

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Chạy một lượt nhắc. Trả về thống kê { sent, skipped, failed } và danh sách
 * đơn đã (hoặc sẽ) xử lý.
 *
 * - `dry: true` KHÔNG gọi `sendReminder`, chỉ trả về danh sách đơn sẽ gửi.
 * - `onlyOrderCode` giới hạn còn đúng một đơn (nút nhắc riêng từng dòng).
 * - `sendReminder(item)` trả về `{ sent: boolean }` (hoặc ném lỗi). Chỉ đơn gửi
 *   thành công mới được ghi `lastRemindedAt`.
 */
export async function runPaymentReminders({
  store,
  sendReminder,
  dry = false,
  limit = PAYMENT_REMINDER_BATCH_MAX,
  delayMs = PAYMENT_REMINDER_DELAY_MS,
  buildBuyUrl = null,
  langForEmail = null,
  onlyOrderCode = null,
  now = Date.now(),
  sleep = defaultSleep,
} = {}) {
  const { due, skipped } = await store.listPaymentsForReminder({ now });
  const code = onlyOrderCode == null ? null : Number(onlyOrderCode);
  const dueList = code == null ? due : due.filter((o) => o.orderCode === code);
  const skippedList = code == null ? skipped : skipped.filter((o) => o.orderCode === code);

  const max = Math.max(0, Number.isFinite(Number(limit)) ? Number(limit) : PAYMENT_REMINDER_BATCH_MAX);
  const batch = dueList.slice(0, max);

  const planned = [];
  for (const order of batch) {
    // Ưu tiên ngôn ngữ đã nhớ cho email, rồi tới ngôn ngữ lúc đặt đơn.
    const remembered = langForEmail ? await langForEmail(order.email) : null;
    const lang = pickMailLang(remembered ?? order.lang);
    planned.push({
      orderCode: order.orderCode,
      email: order.email,
      plan: order.plan,
      amount: order.amount ?? null,
      lang,
      buyUrl: buildBuyUrl ? buildBuyUrl({ email: order.email, plan: order.plan, lang }) : null,
    });
  }

  // Chạy thử: tuyệt đối không gửi mail thật, không ghi cooldown.
  if (dry) {
    return { dry: true, sent: 0, skipped: skippedList.length, failed: 0, orders: planned };
  }

  let sent = 0;
  let failed = 0;
  const results = [];
  for (let i = 0; i < planned.length; i += 1) {
    const item = planned[i];
    try {
      const result = await sendReminder(item);
      if (result?.sent === false) {
        failed += 1;
        results.push({ ...item, sent: false, error: result?.error ?? "send failed" });
      } else {
        await store.markPaymentReminded(item.orderCode);
        sent += 1;
        results.push({ ...item, sent: true });
      }
    } catch (err) {
      failed += 1;
      results.push({ ...item, sent: false, error: String(err?.message ?? err).slice(0, 200) });
    }
    if (delayMs > 0 && i < planned.length - 1) await sleep(delayMs);
  }
  return { dry: false, sent, skipped: skippedList.length, failed, orders: results };
}
