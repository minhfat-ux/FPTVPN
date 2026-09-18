/**
 * Rate limit trong bộ nhớ (cửa sổ trượt).
 *
 * Đủ cho một service một tiến trình; nếu sau này chạy nhiều bản sau load balancer
 * thì phải chuyển sang Redis hoặc bảng trong DB. Mục tiêu ở đây là chặn dò mã
 * kích hoạt và spam endpoint công khai — không phải đo lường chính xác.
 */

export function createLimiter({ windowMs, max, name = "limiter" }) {
  const hits = new Map();
  let operations = 0;

  function prune(key, now) {
    const list = hits.get(key);
    if (!list) return null;
    const cutoff = now - windowMs;
    while (list.length && list[0] <= cutoff) list.shift();
    if (!list.length) {
      hits.delete(key);
      return null;
    }
    return list;
  }

  function sweep(now) {
    for (const key of [...hits.keys()]) prune(key, now);
  }

  return {
    name,
    /** Ghi một lượt và cho biết có vượt hạn mức chưa. */
    take(key) {
      const now = Date.now();
      operations += 1;
      if (operations % 500 === 0) sweep(now);
      const list = prune(key, now) ?? [];
      if (list.length >= max) {
        hits.set(key, list);
        return { ok: false, remaining: 0, retryAfterSec: Math.max(1, Math.ceil((list[0] + windowMs - now) / 1000)) };
      }
      list.push(now);
      hits.set(key, list);
      return { ok: true, remaining: Math.max(0, max - list.length), retryAfterSec: 0 };
    },
    /** Xem trước mà không ghi lượt. */
    peek(key) {
      const list = prune(String(key), Date.now());
      const used = list?.length ?? 0;
      return { ok: used < max, used, remaining: Math.max(0, max - used) };
    },
    reset(key) {
      if (key === undefined) hits.clear();
      else hits.delete(String(key));
    },
    size() {
      return hits.size;
    },
  };
}

/** Bộ limiter dùng chung cho service (tạo mới mỗi lần boot). */
export function createLimiters(config) {
  return {
    activatePerIp: createLimiter({ windowMs: 60 * 60 * 1000, max: config.rateActivatePerHourPerIp, name: "activate_ip" }),
    activateFailPerIp: createLimiter({
      windowMs: 10 * 60 * 1000,
      max: config.rateActivateFailPerTenMinPerIp,
      name: "activate_fail_ip",
    }),
    sessionPerIp: createLimiter({ windowMs: 60 * 60 * 1000, max: config.rateSessionPerHour, name: "session_ip" }),
    adminPerIp: createLimiter({ windowMs: 60 * 60 * 1000, max: config.rateAdminPerHour, name: "admin_ip" }),
  };
}
