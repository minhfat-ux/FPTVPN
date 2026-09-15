import test from "node:test";
import assert from "node:assert/strict";
import { adminPageHTML } from "../src/admin-page.js";

/**
 * Chạy ĐÚNG đoạn logic auto-detect API base trong admin page (lấy từ HTML đã
 * serve) với `window`/`localStorage` giả — để test được JS của trang mà không
 * cần trình duyệt/jsdom.
 */
function resolveBase({ origin, pathname, saved }) {
  const html = adminPageHTML();
  const start = html.indexOf("const detectedBase");
  const end = html.indexOf("fields.token.addEventListener");
  assert.ok(start > 0 && end > start, "không tìm thấy đoạn auto-detect base trong admin page");
  const snippet = html.slice(start, end);
  const localStorage = { getItem: (key) => (key === "fvpn_admin_base" ? saved : "") };
  const window = { location: { origin, pathname } };
  const fields = { token: { value: "" }, baseUrl: { value: "" } };
  new Function("window", "localStorage", "fields", snippet)(window, localStorage, fields);
  return fields.baseUrl.value;
}

test("served dưới /PrivateVPN/Admin → base giữ prefix để API đi qua proxy", () => {
  assert.equal(
    resolveBase({ origin: "https://meetflowai.site", pathname: "/PrivateVPN/Admin", saved: "" }),
    "https://meetflowai.site/PrivateVPN",
  );
});

test("served ở /admin (tunnel/Funnel) → base là origin", () => {
  assert.equal(
    resolveBase({ origin: "https://fcnvpn.tail303be3.ts.net", pathname: "/admin", saved: "" }),
    "https://fcnvpn.tail303be3.ts.net",
  );
});

test("base cũ CÙNG origin thì dùng lại", () => {
  assert.equal(
    resolveBase({
      origin: "https://meetflowai.site",
      pathname: "/PrivateVPN/Admin",
      saved: "https://meetflowai.site/PrivateVPN",
    }),
    "https://meetflowai.site/PrivateVPN",
  );
});

test("base cũ KHÁC origin thì bỏ, dùng base tự phát hiện (mạng bị chặn/GFW)", () => {
  // Ca thật: từng mở panel qua meetflowai.site (đã lưu base), sau đó mạng bị chặn
  // domain đó nên mở qua Tailscale Funnel — base cũ phải bị bỏ, nếu không mọi
  // request API sẽ trỏ về domain đang bị chặn và panel trắng dữ liệu.
  assert.equal(
    resolveBase({
      origin: "https://fcnvpn.tail303be3.ts.net",
      pathname: "/admin",
      saved: "https://meetflowai.site/PrivateVPN",
    }),
    "https://fcnvpn.tail303be3.ts.net",
  );
});

test("base cũ là chuỗi rỗng/không hợp lệ vẫn an toàn", () => {
  assert.equal(
    resolveBase({ origin: "https://fcnvpn.tail303be3.ts.net", pathname: "/admin", saved: "not-a-url" }),
    "https://fcnvpn.tail303be3.ts.net",
  );
});

/**
 * Chặn lỗi "nhập token xong panel trắng": toàn bộ JS của admin page nằm trong MỘT
 * template literal, nên `\"` trong đó bị template literal biến thành `"` thật —
 * chỉ 1 chỗ như vậy là cả <script> sai cú pháp và không dòng nào chạy.
 * Test này parse đúng đoạn JS mà server phát ra.
 */
test("JS nhúng trong admin page parse được (không lỗi cú pháp)", () => {
  const html = adminPageHTML();
  const start = html.indexOf("<script>");
  const end = html.lastIndexOf("</script>");
  assert.ok(start > 0 && end > start, "không tìm thấy <script> trong admin page");
  const script = html.slice(start + "<script>".length, end);
  assert.doesNotThrow(() => new Function(script), "JS của admin page sai cú pháp");
});
