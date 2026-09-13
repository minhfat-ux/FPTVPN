import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PlanStore } from "../src/plan-store.js";
import { DEFAULT_PLANS, PLANS_PUBLIC, applyPlans, buyPageHTML, isSellablePlan, planNameFor } from "../src/payments.js";

/**
 * Bảng gói bán giờ nằm trong store (data/plans.json) và sửa được từ admin, nên
 * nhóm test này khoá lại đúng những thứ có thể làm MẤT ĐƠN nếu sai:
 *   - upgrade lên bản mới không được seed lại / đổi giá của deployment cũ;
 *   - store trống hay file hỏng thì phải rơi về bảng giá cứng trong code, không
 *     bao giờ để trang /buy trắng gói;
 *   - retire = ngừng bán chứ không xoá: gói retired biến khỏi trang bán hàng
 *     nhưng hoá đơn/đơn cũ vẫn phải tra ra tên gói;
 *   - trang /buy render giá từ store, không phải giá cứng.
 * Không test nào chạm mạng.
 */

const DEFAULT_IDS = Object.keys(DEFAULT_PLANS);

async function makeStore(options = {}, defaults = DEFAULT_PLANS) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "privatevpn-plans-"));
  const file = path.join(dir, "plans.json");
  return {
    dir,
    file,
    store: new PlanStore(file, defaults, options),
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

/** Trả bảng gói đang chạy (module payments.js) về mặc định cho test sau. */
function restoreDefaults() {
  applyPlans(DEFAULT_IDS.map((id) => ({ id, ...DEFAULT_PLANS[id] })));
}

/** Trang /buy thật, render từ bảng gói đang chạy. */
function buyPage() {
  return buyPageHTML({ baseUrl: "https://meetflowai.site", lang: "vi", product: "vpn", methods: ["bankqr"] });
}

test("lần đầu: store chưa có file -> seed từ bảng cứng trong code", async () => {
  const { file, store, cleanup } = await makeStore();
  try {
    assert.deepEqual(store.all().map((p) => p.id), DEFAULT_IDS, "seed đúng thứ tự gói đang bán");
    // Giá phải đúng bằng giá đang chạy production trước khi có store này.
    assert.equal(store.get("monthly").amount, 200000);
    assert.equal(store.get("quarterly").amount, 550000);
    assert.equal(store.get("semiannual").amount, 950000);
    assert.equal(store.get("yearly").amount, 1800000);
    assert.equal(store.get("monthly").days, 30);
    assert.equal(store.get("yearly").days, 365);
    // Lifetime đã ngừng bán nhưng vẫn phải nằm trong store (hoá đơn cũ tra tên gói).
    assert.equal(store.get("lifetime").retired, true);
    assert.equal(store.get("lifetime").days, null, "gói vĩnh viễn giữ days = null");

    // Và đã ghi ra file để lần boot sau không seed lại.
    const onDisk = JSON.parse(await readFile(file, "utf8"));
    assert.deepEqual(onDisk.plans.map((p) => p.id), DEFAULT_IDS);
    // File không được cho nhóm/người khác đọc (chmod 0600; vài filesystem chỉ giữ bit owner).
    const mode = (await stat(file)).mode & 0o777;
    assert.equal(mode & 0o077, 0, "plans.json phải là file riêng của owner");
  } finally {
    await cleanup();
  }
});

test("file hỏng -> dùng bảng cứng trong code và KHÔNG ghi đè file", async () => {
  const { file, store, cleanup } = await makeStore();
  try {
    await writeFile(file, "{ this is not json");
    const reopened = new PlanStore(file, DEFAULT_PLANS);
    assert.deepEqual(reopened.all().map((p) => p.id), DEFAULT_IDS, "không được trả danh sách rỗng");
    assert.equal(reopened.get("monthly").amount, 200000);
    // File hỏng có thể là dữ liệu admin sửa tay còn cứu được -> phải giữ nguyên.
    assert.equal(await readFile(file, "utf8"), "{ this is not json");
    assert.equal(store.get("monthly").amount, 200000);
  } finally {
    await cleanup();
  }
});

test("file rỗng (plans: []) -> seed lại, không bao giờ để /buy trống gói", async () => {
  const { file, cleanup } = await makeStore();
  try {
    await writeFile(file, JSON.stringify({ plans: [] }));
    const reopened = new PlanStore(file, DEFAULT_PLANS);
    assert.deepEqual(reopened.all().map((p) => p.id), DEFAULT_IDS);
    const onDisk = JSON.parse(await readFile(file, "utf8"));
    assert.equal(onDisk.plans.length, DEFAULT_IDS.length);
  } finally {
    await cleanup();
  }
});

test("gói có sẵn trên VPS (file cũ): KHÔNG seed lại, giữ nguyên giá admin đã đặt", async () => {
  const { file, cleanup } = await makeStore();
  try {
    // File của bản trước: chỉ có monthly với giá khác bảng cứng, thiếu field
    // badge/retired (shape cũ) — giống một deployment đã chạy được một thời gian.
    await writeFile(file, JSON.stringify({
      plans: [{ id: "monthly", amount: 250000, days: 45, label: "Monthly (250,000 VND / 45 days)" }],
    }));
    const reopened = new PlanStore(file, DEFAULT_PLANS);
    const plans = reopened.all();
    assert.equal(plans.length, 1, "không được thêm lại các gói cứng khác");
    assert.equal(plans[0].amount, 250000, "giá trong store thắng giá cứng trong code");
    assert.equal(plans[0].days, 45);
    assert.equal(plans[0].badge, "", "field mới của shape cũ mặc định rỗng");
    assert.equal(plans[0].retired, false);
    assert.equal(reopened.get("yearly"), null);
  } finally {
    await cleanup();
  }
});

test("dòng sai trong file -> dùng lại giá mặc định của gói đó (không bao giờ bán giá 0)", async () => {
  const { file, cleanup } = await makeStore();
  try {
    await writeFile(file, JSON.stringify({
      plans: [
        { id: "monthly", amount: 0, days: 30, label: "Sửa tay hỏng" },
        { id: "khong-co-that", amount: 1000, days: 0, label: "Gói lạ" },
      ],
    }));
    const reopened = new PlanStore(file, DEFAULT_PLANS);
    const monthly = reopened.get("monthly");
    assert.ok(monthly, "gói bị sửa hỏng phải rơi về bảng mặc định, không bị mất");
    assert.equal(monthly.amount, 200000);
    assert.equal(reopened.get("khong-co-that"), null, "dòng không dùng được thì bỏ qua");
  } finally {
    await cleanup();
  }
});

test("ghi rồi đọc lại: create/update sống qua lần mở store sau (round-trip)", async () => {
  const { file, store, cleanup } = await makeStore();
  try {
    const created = store.create({ id: "promo60", amount: 300000, days: 60, label: "Promo 2 months (300,000 VND / 60 days)", badge: "2 Months" });
    assert.equal(created.retired, false);
    assert.equal(created.badge, "2 Months");

    store.update("monthly", { amount: 220000, days: 31 });
    store.update("promo60", { badge: "Promo 60" });

    const reopened = new PlanStore(file, DEFAULT_PLANS);
    assert.deepEqual(reopened.all().map((p) => p.id), [...DEFAULT_IDS, "promo60"], "gói mới nằm cuối danh sách");
    assert.equal(reopened.get("monthly").amount, 220000);
    assert.equal(reopened.get("monthly").days, 31);
    assert.equal(reopened.get("monthly").label, DEFAULT_PLANS.monthly.label, "field không gửi lên giữ nguyên");
    assert.equal(reopened.get("promo60").badge, "Promo 60");
    assert.equal(reopened.get("promo60").amount, 300000);
  } finally {
    await cleanup();
  }
});

test("store đổi -> onChange nạp lại bảng gói đang chạy (trang /buy + order dùng ngay)", async () => {
  const { store, cleanup } = await makeStore({ onChange: applyPlans });
  try {
    assert.equal(PLANS_PUBLIC.monthly.amount, 200000);
    store.update("monthly", { amount: 260000 });
    assert.equal(PLANS_PUBLIC.monthly.amount, 260000, "không cần deploy, không cần restart");
    assert.ok(buyPage().includes("260.000 đ"));
    assert.ok(!buyPage().includes("200.000 đ"));
  } finally {
    restoreDefaults();
    await cleanup();
  }
});

test("retire: gói ngừng bán biến khỏi /buy nhưng tên gói vẫn tra được cho đơn cũ", async () => {
  const { store, cleanup } = await makeStore({ onChange: applyPlans });
  try {
    assert.ok(buyPage().includes('data-plan="monthly"'));
    assert.equal(isSellablePlan("vpn", "monthly"), true);

    const retired = store.retire("monthly");
    assert.equal(retired.retired, true);
    // Còn nguyên trong store: đơn cũ, hoá đơn, màn hình admin vẫn đọc được giá + tên.
    assert.equal(store.get("monthly").amount, 200000);
    assert.equal(store.all().length, DEFAULT_IDS.length, "retire KHÔNG được xoá gói");
    // Trang bán hàng không còn gói này...
    assert.ok(!buyPage().includes('data-plan="monthly"'), "gói retired không được bán nữa");
    assert.equal(isSellablePlan("vpn", "monthly"), false);
    // ...và API tạo order chặn đúng theo cờ retired (POST /v1/payments/create).
    assert.equal(PLANS_PUBLIC.monthly.retired, true);
    // Nhưng hoá đơn/đơn cũ vẫn ra TÊN GÓI, không phải id trần.
    assert.equal(planNameFor("vi", "vpn", "monthly"), "Hàng tháng");
    assert.equal(planNameFor("en", "vpn", "monthly"), "Monthly");
    assert.equal(planNameFor("vi", "vpn", "lifetime"), "Trọn đời");

    // Mở bán lại được.
    store.update("monthly", { retired: false });
    assert.ok(buyPage().includes('data-plan="monthly"'));
    assert.equal(isSellablePlan("vpn", "monthly"), true);
  } finally {
    restoreDefaults();
    await cleanup();
  }
});

test("/buy render giá và gói từ store, không phải bảng cứng trong code", async () => {
  const { store, cleanup } = await makeStore({ onChange: applyPlans });
  try {
    store.update("yearly", { amount: 1900000, days: 400 });
    store.create({ id: "promo60", amount: 300000, days: 60, label: "Promo 2 months", badge: "Promo 60" });
    const html = buyPage();

    assert.ok(html.includes("1.900.000 đ"), "giá sửa trong store phải lên trang bán");
    assert.ok(!html.includes("1.800.000 đ"), "không được còn giá cứng 1.800.000");
    assert.ok(html.includes("400 ngày"), "số ngày sửa trong store phải lên trang bán");
    assert.ok(html.includes('data-plan="promo60"'), "gói admin thêm phải xuất hiện");
    assert.ok(html.includes("Promo 60"), "gói mới hiện badge (chưa có tên trong bảng dịch)");
    assert.ok(html.includes("300.000 đ"));
    assert.ok(!html.includes("undefined"), "gói mới không được hiện undefined");
    // Gói đã ngừng bán (lifetime) không bao giờ lên trang bán.
    assert.ok(!html.includes('data-plan="lifetime"'));
  } finally {
    restoreDefaults();
    await cleanup();
  }
});

test("ngừng bán hết mọi gói: trang /buy vẫn render, chỉ là không còn gói nào để mua", async () => {
  const { store, cleanup } = await makeStore({ onChange: applyPlans });
  try {
    for (const id of DEFAULT_IDS) store.retire(id);
    const html = buyPage();
    assert.ok(html.includes("VPNFlow"), "trang bán hàng không được vỡ");
    assert.equal((html.match(/data-plan=/g) || []).length, 0, "không còn gói nào được bán");
    // Dù ngừng bán hết, tên gói của đơn cũ vẫn phải tra được.
    assert.equal(planNameFor("vi", "vpn", "yearly"), "Hàng năm");
    assert.equal(store.all().length, DEFAULT_IDS.length, "retire không xoá gói nào");
  } finally {
    restoreDefaults();
    await cleanup();
  }
});

// Mỗi ca dưới đây phải trả 400 kèm thông báo nói ĐÚNG field sai (route admin map
// err.statusCode -> HTTP status, xem index.js).
test("validate: dữ liệu gói sai -> 400 kèm thông báo rõ ràng", async () => {
  const { store, cleanup } = await makeStore();
  const base = { id: "ok-plan", amount: 100000, days: 30, label: "OK plan" };
  const cases = [
    [{ ...base, id: "" }, /id is required/],
    [{ ...base, id: "x" }, /id must be 2-63 characters/],
    [{ ...base, id: "goi co dau cach" }, /id must be 2-63 characters/],
    [{ ...base, id: "gói-tiếng-việt" }, /id must be 2-63 characters/],
    [{ amount: 100000, days: 30, label: "OK" }, /id is required/],
    [{ ...base, amount: 0 }, /amount must be a positive integer/],
    [{ ...base, amount: -1000 }, /amount must be a positive integer/],
    [{ ...base, amount: 1000.5 }, /amount must be a positive integer/],
    [{ ...base, amount: "hai tram" }, /amount must be a positive integer/],
    [{ ...base, amount: undefined }, /amount is required/],
    [{ ...base, days: 0 }, /days must be a positive integer, or null/],
    [{ ...base, days: -30 }, /days must be a positive integer, or null/],
    [{ ...base, days: 1.5 }, /days must be a positive integer, or null/],
    [{ ...base, days: "ba muoi" }, /days must be a positive integer, or null/],
    [{ ...base, days: undefined }, /days is required/],
    [{ ...base, label: "" }, /label is required/],
    [{ ...base, label: "   " }, /label is required/],
    [{ ...base, label: "x".repeat(121) }, /label must be at most 120 characters/],
    [{ ...base, badge: 123 }, /badge must be a string/],
    [{ ...base, badge: "y".repeat(41) }, /badge must be at most 40 characters/],
    [{ ...base, retired: "true" }, /retired must be a boolean/],
  ];
  try {
    for (const [input, expected] of cases) {
      assert.throws(
        () => store.create(input),
        (err) => err.statusCode === 400 && expected.test(err.message),
        `input ${JSON.stringify(input)} phải bị từ chối với ${expected}`,
      );
    }
    // Không ca nào được ghi vào store.
    assert.deepEqual(store.all().map((p) => p.id), DEFAULT_IDS);
  } finally {
    await cleanup();
  }
});

test("validate: id trùng 409, gói không tồn tại 404, patch rỗng/id đổi 400", async () => {
  const { store, cleanup } = await makeStore();
  try {
    assert.throws(
      () => store.create({ id: "monthly", amount: 100000, days: 30, label: "Trùng id" }),
      (err) => err.statusCode === 409 && /already exists/.test(err.message),
    );
    assert.throws(
      () => store.update("khong-co-goi-nay", { amount: 100000 }),
      (err) => err.statusCode === 404 && /not found/.test(err.message),
    );
    assert.throws(
      () => store.update("monthly", {}),
      (err) => err.statusCode === 400 && /no updatable fields/.test(err.message),
    );
    assert.throws(
      () => store.update("monthly", { id: "monthly-2" }),
      (err) => err.statusCode === 400 && /id cannot be changed/.test(err.message),
    );
    assert.throws(
      () => store.retire("khong-co-goi-nay"),
      (err) => err.statusCode === 404,
    );
    assert.throws(
      () => store.update("monthly", { retired: "yes" }),
      (err) => err.statusCode === 400 && /retired must be a boolean/.test(err.message),
    );
    // Gói vĩnh viễn: days = null hợp lệ (gói lifetime đang có days = null).
    const lifetime = store.update("lifetime", { amount: 1600000, days: null });
    assert.equal(lifetime.days, null);
    assert.equal(lifetime.retired, true);
  } finally {
    await cleanup();
  }
});

// index.js boot cả HTTP server nên test không import được nó; thay vào đó khoá
// lại phần nối dây: 4 route admin phải tồn tại và phải qua requireAdminAuth.
test("admin API: 4 route plans đều được đăng ký sau requireAdminAuth", async () => {
  const src = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(src, /app\.get\("\/v1\/admin\/plans", requireAdminAuth/);
  assert.match(src, /app\.post\("\/v1\/admin\/plans", requireAdminAuth/);
  assert.match(src, /app\.patch\("\/v1\/admin\/plans\/:id", requireAdminAuth/);
  assert.match(src, /app\.post\("\/v1\/admin\/plans\/:id\/retire", requireAdminAuth/);
  // Store phải được dựng với bảng cứng làm seed/fallback và onChange = applyPlans.
  assert.match(src, /new PlanStore\(PLANS_FILE, DEFAULT_PLANS, \{ onChange: applyPlans \}\)/);
});
