import test from "node:test";
import assert from "node:assert/strict";
import { adminPageHTML } from "../src/admin-page.js";

/**
 * Trích đúng khối khai báo khu/tab mà server phát ra (admin page nằm trong 1
 * template literal) rồi chạy như JS thuần — không cần jsdom.
 */
function loadAreaHelpers() {
  const html = adminPageHTML();
  const start = html.indexOf("// ===== ADMIN AREA NAV HELPERS");
  const end = html.indexOf("// ===== END ADMIN AREA NAV HELPERS");
  assert.ok(start > 0 && end > start, "không tìm thấy khối ADMIN AREA NAV HELPERS trong admin page");
  const snippet = html.slice(start, end);
  const factory = new Function(
    snippet +
      "\nreturn { ADMIN_TAB_AREA, ADMIN_AREA_DEFAULT_TAB, ADMIN_AREA_HASH, ADMIN_HASH_AREA, adminAreaForTab };",
  );
  return factory();
}

const {
  ADMIN_TAB_AREA,
  ADMIN_AREA_DEFAULT_TAB,
  ADMIN_AREA_HASH,
  ADMIN_HASH_AREA,
  adminAreaForTab,
} = loadAreaHelpers();

// Toàn bộ tab cũ trước khi chia khu — không được mất tab nào.
const LEGACY_TABS = ["nodes", "users", "ios", "stats", "payments", "plans", "ai", "aiu"];
const AREAS = ["vpn", "ai", "system"];

test("mọi tab cũ đều thuộc đúng một khu (không sót panel)", () => {
  assert.deepEqual(Object.keys(ADMIN_TAB_AREA).sort(), [...LEGACY_TABS].sort());
  for (const tab of LEGACY_TABS) {
    assert.ok(AREAS.includes(ADMIN_TAB_AREA[tab]), `tab ${tab} chưa được gán khu`);
  }
});

test("phân khu đúng sản phẩm: VPNFlow / MeetFlow AI / Hệ thống", () => {
  assert.equal(ADMIN_TAB_AREA.stats, "vpn");
  assert.equal(ADMIN_TAB_AREA.users, "vpn");
  assert.equal(ADMIN_TAB_AREA.ios, "vpn");
  assert.equal(ADMIN_TAB_AREA.payments, "vpn");
  assert.equal(ADMIN_TAB_AREA.plans, "vpn");
  assert.equal(ADMIN_TAB_AREA.ai, "ai");
  assert.equal(ADMIN_TAB_AREA.aiu, "ai");
  assert.equal(ADMIN_TAB_AREA.nodes, "system");
});

test("mặc định mở khu VPNFlow (tab Dashboard)", () => {
  assert.equal(ADMIN_AREA_DEFAULT_TAB.vpn, "stats");
  assert.equal(adminAreaForTab(ADMIN_AREA_DEFAULT_TAB.vpn), "vpn");
});

test("mỗi khu có tab mặc định thuộc chính khu đó", () => {
  for (const area of Object.keys(ADMIN_AREA_DEFAULT_TAB)) {
    assert.equal(adminAreaForTab(ADMIN_AREA_DEFAULT_TAB[area]), area, `tab mặc định của ${area} sai khu`);
  }
});

test("deep-link hash: #vpnflow / #meetflow-ai / #he-thong", () => {
  assert.equal(ADMIN_HASH_AREA.vpnflow, "vpn");
  assert.equal(ADMIN_HASH_AREA["meetflow-ai"], "ai");
  assert.equal(ADMIN_HASH_AREA["he-thong"], "system");
  assert.equal(ADMIN_AREA_HASH.ai, "meetflow-ai");
});

test("tab/hash lạ trả về khu rỗng (không nhận nhầm thuộc tính prototype)", () => {
  assert.equal(adminAreaForTab("khong-ton-tai"), "");
  assert.equal(adminAreaForTab("constructor"), "");
  assert.equal(adminAreaForTab(""), "");
});

test("admin page có đủ 3 nút khu và 3 nhóm tab con", () => {
  const html = adminPageHTML();
  for (const id of ["areaVpn", "areaAi", "areaSystem", "tabsVpn", "tabsAi", "tabsSystem"]) {
    assert.ok(html.includes('id="' + id + '"'), `thiếu phần tử #${id} trong admin page`);
  }
  assert.ok(html.includes(">VPNFlow<"), "thiếu nhãn VPNFlow");
  assert.ok(html.includes(">MeetFlow AI<"), "thiếu nhãn MeetFlow AI");
  assert.ok(html.includes(">Hệ thống<"), "thiếu nhãn Hệ thống");
});

test("mọi panel (section) cũ vẫn còn, chỉ đổi chỗ hiển thị", () => {
  const html = adminPageHTML();
  for (const id of [
    "view-list", "view-users", "view-ios", "view-payments", "view-plans",
    "view-ai", "view-ai-users", "view-stats", "view-edit",
  ]) {
    assert.ok(html.includes('id="' + id + '"'), `mất panel #${id}`);
  }
});

test("nhớ tab/khu qua localStorage (F5 không nhảy về tab đầu)", () => {
  const html = adminPageHTML();
  assert.ok(html.includes('"fvpn_admin_tab"'), "thiếu key localStorage fvpn_admin_tab");
  assert.ok(html.includes('"fvpn_admin_area"'), "thiếu key localStorage fvpn_admin_area");
});

/**
 * Ô Actions của tab Users từng append từng nút rời nhau (`append(grant, " ", revoke)`) nên các nút
 * so le và rớt xuống dòng. Nay phải là 2 nhóm chức năng trong MỘT khối flex: Cấp hạn | vạch ngăn | Thu hồi.
 */
test("tab Users: ô Actions gom thành nhóm chức năng, cùng một hàng", () => {
  const html = adminPageHTML();

  // CSS: một hàng, không wrap; nhóm là flex con; vạch ngăn dọc giữa các nhóm.
  const css = html.slice(html.indexOf(".act-groups {"), html.indexOf(".act-sep {"));
  // Nhóm KHÔNG tự xuống dòng (nút trong nhóm luôn cùng hàng); container cho phép rớt CẢ nhóm khi hẹp.
  assert.ok(css.includes(".act-group { display: inline-flex; flex-wrap: nowrap"), "nút trong một nhóm phải luôn cùng hàng");
  assert.ok(css.includes("align-items: center"), "các nút phải thẳng hàng theo trục giữa");
  assert.ok(html.includes(".act-groups { display: flex; flex-wrap: wrap"), "các nhóm xếp cạnh nhau, chỉ rớt cả nhóm khi hẹp");
  assert.ok(html.includes(".act-sep {"), "thiếu vạch ngăn giữa hai nhóm chức năng");

  // JS của tab Users: 1 container duy nhất gắn vào ô Actions (nhiều nút rời = so le).
  const users = html.slice(html.indexOf("// Ô Actions: 2 NHÓM"), html.indexOf("fields.usersBody.appendChild(row)"));
  assert.ok(users.includes('actions.className = "row-actions act-groups"'), "ô Actions phải dùng khối .act-groups");
  assert.ok(users.includes('grantGroup.className = "act-group"'), "nút cấp hạn phải nằm trong nhóm riêng");
  assert.ok(users.includes('revokeGroup.className = "act-group"'), "nút thu hồi phải nằm trong nhóm riêng");
  assert.ok(users.includes("grantGroup.append(grant, grantYear)"), "hai nút cấp hạn nằm CÙNG nhóm, cạnh nhau");
  assert.ok(users.includes("row.children[6].appendChild(actions)"), "chỉ gắn MỘT khối vào ô Actions");
  assert.ok(!users.includes('row.children[6].append(grant, " ", revoke)'), "không được append nút rời như trước");
  assert.ok(users.includes('actions.appendChild(sep)'), "phải có vạch ngăn giữa nhóm cấp hạn và nhóm thu hồi");

  // Cân đối: hai nút cấp hạn cùng kiểu (không nút nào là secondary lệch tông), nhãn rõ thời gian.
  assert.ok(users.includes('grant.textContent = "30 ngày"') && users.includes('grantYear.textContent = "1 năm"'), "nhãn nút cấp hạn phải ghi rõ số ngày/năm");
  assert.ok(!/grant\.className = "secondary"/.test(users), "hai nút cấp hạn phải cùng một kiểu cho cân đối");
  assert.ok(users.includes('grantLabel.textContent = "Cấp hạn"'), "thiếu nhãn nhóm cấp hạn");

  // Tab AI Users dùng đúng cách bố trí đó (nhất quán giữa hai tab).
  assert.ok(html.includes('actions.className = "row-actions act-groups"'), "tab AI Users cũng phải gom nhóm");
  assert.ok(html.includes("function aiuSep()"), "thiếu helper vạch ngăn của tab AI Users");

  // Màn hẹp: mỗi nhóm xuống một hàng, vạch ngăn ẩn đi (không còn ý nghĩa).
  assert.ok(html.includes(".act-groups { flex-direction: column;"), "màn hẹp phải xếp dọc từng nhóm");
  assert.ok(html.includes(".act-sep { display: none; }"), "màn hẹp phải ẩn vạch ngăn");
});
