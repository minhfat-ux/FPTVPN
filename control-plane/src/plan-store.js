import fs from "node:fs";
import path from "node:path";

/**
 * Bảng gói bán (giá / thời hạn / nhãn) — sửa được từ admin, KHÔNG cần sửa code
 * rồi deploy lại VPS.
 *
 * Sản phẩm không còn phát hành trên App Store / Google Play nữa: mọi lượt mua
 * diễn ra trên backend của mình (trang https://meetflowai.site/buy + admin cấp
 * tay). Trước đây giá nằm cứng trong payments.js (PLANS) nên mỗi lần đổi giá
 * phải sửa code, chạy test rồi deploy. Từ nay danh sách gói nằm trong file JSON
 * cùng chỗ với các store khác của control plane (thư mục data/), admin sửa qua
 * tab Plans.
 *
 * File: PLANS_FILE (mặc định <control-plane>/data/plans.json), ghi mode 0600.
 *
 * Vì sao JSON mà không phải SQLite (như node-store.js): đây là một danh sách
 * cấu hình vài dòng, không phải dữ liệu giao dịch, và payments.js giữ nó ở dạng
 * BẢNG TRONG BỘ NHỚ (trang /buy render đồng bộ). Store chỉ cần đọc 1 lần lúc boot
 * rồi ghi lại nguyên file mỗi lần admin sửa — không cần schema, không cần
 * migration ALTER TABLE, và khi có sự cố thì mở file ra đọc/sửa tay được ngay
 * trên VPS (giống auth.json / ai-access.json).
 *
 * Đọc/ghi ĐỒNG BỘ có chủ đích: bảng gói phải sẵn sàng ngay khi route /buy render
 * và ngay sau khi admin bấm Save — không có khoảng thời gian trang bán hàng còn
 * thấy giá cũ. File chỉ vài trăm byte nên chi phí không đáng kể.
 *
 * Một dòng gói:
 *   { id, amount, days, label, badge, retired, created_at, updated_at }
 *   days = null nghĩa là gói vĩnh viễn (lifetime), không hết hạn.
 */

const ID_PATTERN = /^[a-z0-9][a-z0-9-_.]{1,62}$/i;
const MAX_LABEL = 120;
const MAX_BADGE = 40;
// Chặn trên chỉ để bắt lỗi gõ thừa số 0; không phải giá trị kinh doanh.
const MAX_AMOUNT = 1_000_000_000;

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function notFound(message) {
  const error = new Error(message);
  error.statusCode = 404;
  return error;
}

function conflict(message) {
  const error = new Error(message);
  error.statusCode = 409;
  return error;
}

/**
 * Kiểm tra dữ liệu gói do admin gửi lên, trả về các field hợp lệ đã chuẩn hoá.
 * Sai field nào thì báo đúng field đó (statusCode 400) để form admin hiện được
 * lý do, không âm thầm bỏ qua.
 *
 * `partial: true` = PATCH: chỉ field nào có trong body mới bị đổi.
 */
export function normalizePlanInput(input = {}, { partial = false, existing = null } = {}) {
  const errors = [];
  const out = {};

  // id là slug và BẤT BIẾN sau khi tạo: order cũ, hoá đơn cũ và productId
  // ("bankqr.monthly") đều trỏ theo id, đổi id là làm đơn cũ mất tên gói.
  if (input.id !== undefined) {
    const id = String(input.id ?? "").trim();
    if (partial) {
      if (id !== String(existing?.id ?? "")) {
        errors.push("id cannot be changed (retire this plan and create a new one instead)");
      }
    } else if (!id) {
      errors.push("id is required");
    } else if (!ID_PATTERN.test(id)) {
      errors.push("id must be 2-63 characters using letters, numbers, dash, underscore or dot");
    } else {
      out.id = id;
    }
  } else if (!partial) {
    errors.push("id is required");
  }

  if (input.amount !== undefined) {
    const amount = Number(input.amount);
    if (!Number.isSafeInteger(amount) || amount <= 0) errors.push("amount must be a positive integer (VND)");
    else if (amount > MAX_AMOUNT) errors.push(`amount must be at most ${MAX_AMOUNT}`);
    else out.amount = amount;
  } else if (!partial) {
    errors.push("amount is required");
  }

  // days: null = gói vĩnh viễn. Gói lifetime đang bán trước đây cũng để days = null
  // (xem DEFAULT_PLANS trong payments.js), nên null là giá trị hợp lệ chứ không
  // phải "thiếu dữ liệu".
  if (input.days !== undefined) {
    if (input.days === null || input.days === "") {
      out.days = null;
    } else {
      const days = Number(input.days);
      if (!Number.isSafeInteger(days) || days <= 0) errors.push("days must be a positive integer, or null for a lifetime plan");
      else out.days = days;
    }
  } else if (!partial) {
    errors.push("days is required (use null for a lifetime plan)");
  }

  if (input.label !== undefined) {
    const label = String(input.label ?? "").trim();
    if (!label) errors.push("label is required");
    else if (label.length > MAX_LABEL) errors.push(`label must be at most ${MAX_LABEL} characters`);
    else out.label = label;
  } else if (!partial) {
    errors.push("label is required");
  }

  // badge không bắt buộc: tên ngắn hiện trên trang /buy cho gói mới thêm.
  if (input.badge !== undefined) {
    if (typeof input.badge !== "string") errors.push("badge must be a string");
    else {
      const badge = input.badge.trim();
      if (badge.length > MAX_BADGE) errors.push(`badge must be at most ${MAX_BADGE} characters`);
      else out.badge = badge;
    }
  } else if (!partial) {
    out.badge = "";
  }

  if (input.retired !== undefined) {
    if (typeof input.retired !== "boolean") errors.push("retired must be a boolean");
    else out.retired = input.retired;
  } else if (!partial) {
    out.retired = false;
  }

  if (errors.length > 0) throw badRequest(errors.join("; "));
  if (partial && Object.keys(out).length === 0) {
    throw badRequest("no updatable fields provided (amount, days, label, badge, retired)");
  }
  return out;
}

/**
 * Chuẩn hoá một dòng đọc từ file. Dùng CHÍNH bộ kiểm tra của API, nên file do
 * admin sửa tay mà sai (thiếu days, amount = 0, label rỗng…) sẽ không lọt ra
 * trang bán hàng — quan trọng nhất là không bao giờ bán với giá 0.
 * Trả về null nếu dòng không dùng được.
 */
function normalizeStoredPlan(row, now = new Date().toISOString()) {
  if (!row || typeof row !== "object") return null;
  let plan = null;
  try {
    plan = normalizePlanInput(row, { partial: false });
  } catch {
    return null;
  }
  return {
    ...plan,
    created_at: String(row.created_at ?? now),
    updated_at: String(row.updated_at ?? now),
  };
}

/** Bảng cứng trong code (payments.js DEFAULT_PLANS) -> mảng theo đúng thứ tự. */
function defaultsToPlans(defaults, now) {
  const out = [];
  for (const [id, cfg] of Object.entries(defaults ?? {})) {
    const plan = normalizeStoredPlan({ ...cfg, id }, now);
    if (plan) out.push(plan);
    else console.error(`plans: bảng mặc định trong code có gói không hợp lệ (id=${id}) — bỏ qua`);
  }
  return out;
}

export class PlanStore {
  /**
   * @param filePath  file JSON của bảng gói (mặc định <data dir>/plans.json)
   * @param defaults  bảng cứng trong code — dùng để SEED lần đầu và làm FALLBACK
   * @param onChange  gọi mỗi khi bảng đổi (index.js truyền applyPlans để trang
   *                  /buy, tạo order và hoá đơn dùng ngay giá mới)
   */
  constructor(filePath, defaults = {}, { onChange = null } = {}) {
    this.filePath = filePath;
    this._defaults = defaultsToPlans(defaults, new Date().toISOString());
    this._onChange = typeof onChange === "function" ? onChange : null;
    this._plans = this._loadOrSeed();
    this._notify();
  }

  /** Toàn bộ gói theo thứ tự hiển thị (kể cả gói đã ngừng bán). */
  all() {
    return this._plans.map((plan) => ({ ...plan }));
  }

  get(id) {
    const plan = this._plans.find((p) => p.id === id);
    return plan ? { ...plan } : null;
  }

  create(input = {}) {
    const plan = normalizePlanInput(input, { partial: false });
    if (this._plans.some((p) => p.id === plan.id)) {
      throw conflict(`Plan '${plan.id}' already exists`);
    }
    const now = new Date().toISOString();
    const row = { ...plan, created_at: now, updated_at: now };
    this._commit([...this._plans, row]);
    return { ...row };
  }

  update(id, patch = {}) {
    const index = this._plans.findIndex((p) => p.id === id);
    if (index < 0) throw notFound(`Plan '${id}' not found`);
    const changes = normalizePlanInput(patch, { partial: true, existing: this._plans[index] });
    const row = { ...this._plans[index], ...changes, updated_at: new Date().toISOString() };
    this._commit(this._plans.map((p, i) => (i === index ? row : p)));
    return { ...row };
  }

  /**
   * Ngừng bán một gói — KHÔNG xoá.
   *
   * Gói đã ngừng bán vẫn phải tra được tên trên hoá đơn, đơn cũ và màn hình
   * admin (xem comment của gói lifetime trong payments.js). Xoá hẳn record là
   * làm những đơn đó hiện ra id trần ("lifetime") thay vì tên gói.
   */
  retire(id) {
    return this.update(id, { retired: true });
  }

  /** Ghi file TRƯỚC rồi mới đổi bảng trong bộ nhớ: ghi lỗi thì bảng cũ giữ nguyên. */
  _commit(next) {
    this._write(next);
    this._plans = next;
    this._notify();
  }

  _notify() {
    if (!this._onChange) return;
    // Ngừng bán hết mọi gói là hợp lệ (owner có thể muốn tạm dừng bán), nhưng
    // trang /buy sẽ không còn gói nào để chọn — phải nói ra, đừng để im lặng.
    if (!this._plans.some((plan) => plan.retired !== true)) {
      console.warn("plans: KHÔNG còn gói nào đang bán — trang /buy sẽ không có gói để mua");
    }
    try {
      this._onChange(this._plans.map((plan) => ({ ...plan })));
    } catch (err) {
      console.error("plans: không nạp được bảng gói vào payments:", err?.message ?? err);
    }
  }

  _write(plans) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ plans }, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this.filePath);
    try {
      fs.chmodSync(this.filePath, 0o600);
    } catch {
      // best effort (một số filesystem không hỗ trợ chmod)
    }
  }

  /**
   * Đọc file, hoặc seed từ bảng cứng khi chưa có gì.
   *
   * Quy tắc quan trọng: KHÔNG BAO GIỜ trả về danh sách rỗng. Một bảng giá trống
   * làm trang /buy không còn gói nào để mua — mất đơn mà không ai biết. Nên:
   *   - file chưa có / chưa có gói  -> seed từ DEFAULT_PLANS trong code
   *   - file hỏng, không đọc được   -> chạy bằng DEFAULT_PLANS, KHÔNG ghi đè file
   *     (file hỏng có thể là dữ liệu admin sửa tay, còn cứu được)
   *   - dòng nào sai                -> dùng lại gói cùng id trong DEFAULT_PLANS
   */
  _loadOrSeed() {
    const now = new Date().toISOString();
    let parsed = null;
    let exists = true;
    try {
      parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
    } catch (err) {
      if (err.code === "ENOENT") {
        exists = false;
      } else {
        console.error(`plans: đọc ${this.filePath} lỗi (${err.message}) — dùng bảng giá mặc định trong code, giữ nguyên file`);
        return this._defaults.map((plan) => ({ ...plan }));
      }
    }

    const rows = Array.isArray(parsed?.plans) ? parsed.plans : [];
    if (rows.length > 0) {
      const plans = [];
      for (const row of rows) {
        const plan = normalizeStoredPlan(row, now);
        if (plan) {
          plans.push(plan);
          continue;
        }
        // Dòng sai: giữ gói đó bằng giá trong code nếu có, thay vì bán với giá 0.
        const id = String(row?.id ?? "").trim();
        const fallback = this._defaults.find((p) => p.id === id);
        console.error(`plans: dòng gói không hợp lệ trong ${this.filePath} (id=${id || "?"})${fallback ? " — dùng giá mặc định trong code" : " — bỏ qua"}`);
        if (fallback) plans.push({ ...fallback });
      }
      if (plans.length > 0) return plans;
    }

    // Trống (lần đầu, hoặc file vừa bị làm rỗng) -> seed từ bảng cứng để
    // deployment cũ chạy y như trước khi có store này.
    const seeded = this._defaults.map((plan) => ({ ...plan, created_at: now, updated_at: now }));
    try {
      this._write(seeded);
    } catch (err) {
      console.error(`plans: không ghi được ${this.filePath} (${err.message}) — vẫn dùng bảng mặc định trong bộ nhớ`);
    }
    return seeded;
  }
}
