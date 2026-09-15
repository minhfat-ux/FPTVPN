import test from "node:test";
import assert from "node:assert/strict";
import { adminPageHTML } from "../src/admin-page.js";

/**
 * Trích đúng khối helper phân trang/sắp xếp/lọc mà server phát ra (admin page
 * nằm trong 1 template literal) rồi chạy như JS thuần — không cần jsdom.
 */
function loadPagerHelpers() {
  const html = adminPageHTML();
  const start = html.indexOf("// ===== ADMIN PAGINATION HELPERS");
  const end = html.indexOf("// ===== END ADMIN PAGINATION HELPERS");
  assert.ok(start > 0 && end > start, "không tìm thấy khối ADMIN PAGINATION HELPERS trong admin page");
  const snippet = html.slice(start, end);
  const factory = new Function(
    snippet +
      "\nreturn { ADMIN_PAGE_SIZE, adminSortByTimeDesc, adminFilterItems, adminPaginate, adminUpdatePager };",
  );
  return factory();
}

const { ADMIN_PAGE_SIZE, adminSortByTimeDesc, adminFilterItems, adminPaginate } = loadPagerHelpers();

test("ADMIN_PAGE_SIZE = 10 (đổi 1 chỗ cho cả 2 bảng)", () => {
  assert.equal(ADMIN_PAGE_SIZE, 10);
});

test("sắp xếp mặc định: thời gian đăng ký mới nhất lên trên", () => {
  const rows = [
    { id: "old", created_at: "2024-01-01T00:00:00.000Z" },
    { id: "new", created_at: "2026-05-01T00:00:00.000Z" },
    { id: "mid", created_at: "2025-03-15T12:00:00.000Z" },
  ];
  const sorted = adminSortByTimeDesc(rows, (r) => r.created_at);
  assert.deepEqual(sorted.map((r) => r.id), ["new", "mid", "old"]);
});

test("bản ghi thiếu/không hợp lệ thời gian bị đẩy xuống cuối, giữ thứ tự ổn định", () => {
  const rows = [
    { id: "no-date-1", created_at: null },
    { id: "new", created_at: "2026-05-01T00:00:00.000Z" },
    { id: "no-date-2", created_at: "khong-phai-ngay" },
    { id: "old", created_at: "2024-01-01T00:00:00.000Z" },
  ];
  const sorted = adminSortByTimeDesc(rows, (r) => r.created_at);
  assert.deepEqual(sorted.map((r) => r.id), ["new", "old", "no-date-1", "no-date-2"]);
});

test("phân trang 10 item/trang: trang 1 đủ 10, trang cuối phần dư", () => {
  const rows = Array.from({ length: 25 }, (_, i) => ({ id: i }));
  const p1 = adminPaginate(rows, 1, ADMIN_PAGE_SIZE);
  assert.equal(p1.page, 1);
  assert.equal(p1.totalPages, 3);
  assert.equal(p1.total, 25);
  assert.equal(p1.items.length, 10);
  assert.deepEqual(p1.items.map((r) => r.id), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

  const p3 = adminPaginate(rows, 3, ADMIN_PAGE_SIZE);
  assert.equal(p3.page, 3);
  assert.equal(p3.items.length, 5);
  assert.deepEqual(p3.items.map((r) => r.id), [20, 21, 22, 23, 24]);
});

test("refresh làm ngắn dữ liệu → tự kẹp về trang cuối", () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({ id: i }));
  const view = adminPaginate(rows, 5, ADMIN_PAGE_SIZE); // đang ở trang 5 nhưng chỉ còn 2 trang
  assert.equal(view.totalPages, 2);
  assert.equal(view.page, 2);
  assert.equal(view.items.length, 2);
});

test("page < 1 hoặc không hợp lệ → kẹp về trang 1", () => {
  const rows = Array.from({ length: 25 }, (_, i) => ({ id: i }));
  assert.equal(adminPaginate(rows, 0, ADMIN_PAGE_SIZE).page, 1);
  assert.equal(adminPaginate(rows, -3, ADMIN_PAGE_SIZE).page, 1);
  assert.equal(adminPaginate(rows, "x", ADMIN_PAGE_SIZE).page, 1);
});

test("danh sách rỗng vẫn có 1 trang (không chia cho 0)", () => {
  const view = adminPaginate([], 4, ADMIN_PAGE_SIZE);
  assert.equal(view.totalPages, 1);
  assert.equal(view.page, 1);
  assert.equal(view.total, 0);
  assert.deepEqual(view.items, []);
});

test("lọc trên TOÀN BỘ dữ liệu rồi mới phân trang", () => {
  const rows = Array.from({ length: 30 }, (_, i) => ({ email: `user${i}@x.com` }));
  // "user1" khớp user1 + user10..user19 = 11 bản ghi, nằm rải rác khắp 30 bản ghi.
  const filtered = adminFilterItems(rows, "user1", (r) => r.email);
  assert.equal(filtered.length, 11);
  const p1 = adminPaginate(filtered, 1, ADMIN_PAGE_SIZE);
  assert.equal(p1.total, 11);
  assert.equal(p1.totalPages, 2);
  assert.equal(p1.items.length, 10);
  const p2 = adminPaginate(filtered, 2, ADMIN_PAGE_SIZE);
  assert.equal(p2.items.length, 1);
  assert.deepEqual(p2.items.map((r) => r.email), ["user19@x.com"]);
});

test("lọc không phân biệt hoa/thường và bỏ khoảng trắng thừa", () => {
  const rows = [{ email: "Khach@Gmail.com" }, { email: "other@x.com" }];
  assert.equal(adminFilterItems(rows, "  khach  ", (r) => r.email).length, 1);
});

test("admin page có đủ điều khiển phân trang cho cả Users và UDID", () => {
  const html = adminPageHTML();
  for (const id of [
    "usersSearch", "usersPrev", "usersNext", "usersPageInfo", "usersTotal",
    "iosSearch", "iosPrev", "iosNext", "iosPageInfo", "iosTotal",
  ]) {
    assert.ok(html.includes('id="' + id + '"'), `thiếu phần tử #${id} trong admin page`);
  }
});

test("cả hai bảng sắp xếp theo thời gian đăng ký (created_at / registeredAt)", () => {
  const html = adminPageHTML();
  assert.ok(html.includes("user.created_at"), "Users phải sắp theo created_at");
  assert.ok(html.includes("d.registeredAt"), "UDID phải sắp theo registeredAt");
});

test("bảng MeetFlow AI dùng chung cơ chế phân trang (adminPaginate + ADMIN_PAGE_SIZE)", () => {
  const html = adminPageHTML();
  assert.ok(
    html.includes("adminPaginate(aiuState.rows, aiuState.page, ADMIN_PAGE_SIZE)"),
    "AI users phải phân trang bằng helper chung",
  );
  assert.ok(
    html.includes("adminUpdatePager(fields.aiuPrev, fields.aiuNext, fields.aiuPageInfo, fields.aiuTotal"),
    "AI users phải cập nhật thanh phân trang bằng adminUpdatePager",
  );
});

test("bảng MeetFlow AI có đủ điều khiển phân trang", () => {
  const html = adminPageHTML();
  for (const id of ["aiuPrev", "aiuNext", "aiuPageInfo", "aiuTotal"]) {
    assert.ok(html.includes('id="' + id + '"'), `thiếu phần tử #${id} trong admin page`);
  }
});

test("bảng MeetFlow AI sắp mặc định theo lastSeen (hoạt động gần nhất)", () => {
  const html = adminPageHTML();
  assert.ok(html.includes("adminSortByTimeDesc(aiuState.rows"), "AI users phải sắp bằng helper chung");
  assert.ok(html.includes("return r.lastSeen;"), "trường thời gian của AI users là lastSeen");
});
