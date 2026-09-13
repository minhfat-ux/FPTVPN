import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  amountCovers,
  extractOrderRef,
  isIncomingTransfer,
  verifySepayApiKey,
  verifySepaySignature,
  verifySepayUrlToken,
  accountMatches,
  clientIpAllowed,
} from "../src/sepay.js";

const SECRET = "spsk_test_example_secret";
const NOW = 1_700_000_000;

function sign(body, { secret = SECRET, timestamp = NOW } = {}) {
  const hex = crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return { signature: `sha256=${hex}`, timestamp: String(timestamp) };
}

test("chữ ký HMAC đúng thì pass", () => {
  const raw = '{"id":1,"transferAmount":200000}';
  const { signature, timestamp } = sign(raw);
  assert.equal(verifySepaySignature({ rawBody: raw, signature, timestamp, secret: SECRET, nowSec: NOW }), true);
});

test("chữ ký sai / sửa body / sai secret / thiếu header đều bị từ chối", () => {
  const raw = '{"id":1,"transferAmount":200000}';
  const { signature, timestamp } = sign(raw);
  const base = { rawBody: raw, signature, timestamp, secret: SECRET, nowSec: NOW };
  assert.equal(verifySepaySignature({ ...base, rawBody: raw + " " }), false, "body bị sửa");
  assert.equal(verifySepaySignature({ ...base, secret: "spsk_khac" }), false, "sai secret");
  assert.equal(verifySepaySignature({ ...base, signature: "sha256=deadbeef" }), false, "hex sai định dạng");
  assert.equal(verifySepaySignature({ ...base, signature: "" }), false, "thiếu chữ ký");
  assert.equal(verifySepaySignature({ ...base, timestamp: "" }), false, "thiếu timestamp");
  assert.equal(verifySepaySignature({ ...base, secret: "" }), false, "chưa cấu hình secret");
});

test("chống replay: chữ ký quá cũ bị từ chối, trong cửa sổ thì pass", () => {
  const raw = '{"id":2}';
  const old = sign(raw, { timestamp: NOW - 3600 });
  assert.equal(
    verifySepaySignature({ rawBody: raw, ...old, secret: SECRET, nowSec: NOW }),
    false,
    "chữ ký 1 giờ trước",
  );
  const fresh = sign(raw, { timestamp: NOW - 60 });
  assert.equal(verifySepaySignature({ rawBody: raw, ...fresh, secret: SECRET, nowSec: NOW }), true);
  const tolerance = sign(raw, { timestamp: NOW - 200 });
  assert.equal(
    verifySepaySignature({ rawBody: raw, ...tolerance, secret: SECRET, nowSec: NOW, toleranceSec: 300 }),
    true,
  );
});

test("chấp nhận tiền tố sha256 viết hoa và khoảng trắng thừa", () => {
  const raw = '{"id":3}';
  const { signature, timestamp } = sign(raw);
  const upper = signature.replace("sha256=", "SHA256=").toUpperCase().replace("SHA256=", "SHA256=");
  assert.equal(verifySepaySignature({ rawBody: raw, signature: ` ${upper} `, timestamp, secret: SECRET, nowSec: NOW }), true);
});

test("API Key: nhận Apikey/Bearer, từ chối key sai và key rỗng", () => {
  assert.equal(verifySepayApiKey({ authorization: "Apikey spsk_test_abc", apiKey: "spsk_test_abc" }), true);
  assert.equal(verifySepayApiKey({ authorization: "apikey spsk_test_abc", apiKey: "spsk_test_abc" }), true);
  assert.equal(verifySepayApiKey({ authorization: "Bearer spsk_test_abc", apiKey: "spsk_test_abc" }), true);
  assert.equal(verifySepayApiKey({ authorization: "Apikey spsk_test_abc", apiKey: "spsk_test_khac" }), false);
  assert.equal(verifySepayApiKey({ authorization: "", apiKey: "spsk_test_abc" }), false);
  assert.equal(verifySepayApiKey({ authorization: "Apikey spsk_test_abc", apiKey: "" }), false);
});

test("chỉ nhận giao dịch tiền VÀO", () => {
  assert.equal(isIncomingTransfer({ transferType: "in" }), true);
  assert.equal(isIncomingTransfer({ transferType: "IN" }), true);
  assert.equal(isIncomingTransfer({}), true, "payload test thiếu transferType vẫn nhận");
  assert.equal(isIncomingTransfer({ transferType: "out" }), false);
});

test("đọc mã đơn: ưu tiên tiền tố VPNFLOW/MEETFLOW trong code hoặc content", () => {
  assert.deepEqual(extractOrderRef({ code: "VPNFLOW-123456" }), { orderCode: 123456, product: "vpn", via: "VPNFLOW" });
  assert.deepEqual(extractOrderRef({ content: "CT DEN: 970422 VPNFLOW-987654 CAM ON" }), {
    orderCode: 987654,
    product: "vpn",
    via: "VPNFLOW",
  });
  assert.deepEqual(extractOrderRef({ content: "MEETFLOW-445566 thanh toan" }), {
    orderCode: 445566,
    product: "ai",
    via: "MEETFLOW",
  });
  // khoảng trắng/gạch dưới thay cho gạch nối, không phân biệt hoa thường
  assert.equal(extractOrderRef({ content: "vpnflow 123456" }).orderCode, 123456);
  assert.equal(extractOrderRef({ content: "vpnflow_123456" }).product, "vpn");
  // khách gõ tay thiếu tiền tố ⇒ vẫn lấy được số, product để index.js tự tra
  assert.deepEqual(extractOrderRef({ code: "123456" }), { orderCode: 123456, product: null, via: "code" });
  assert.deepEqual(extractOrderRef({ content: "chuyen tien 123456 nhe" }), {
    orderCode: 123456,
    product: null,
    via: "content",
  });
  // nội dung không có mã đơn nào
  assert.deepEqual(extractOrderRef({ content: "NGUYEN VAN A chuyen tien" }), {
    orderCode: null,
    product: null,
    via: null,
  });
});

test("số tiền: đủ thì mới tự kích hoạt", () => {
  assert.equal(amountCovers(200000, 200000), true);
  assert.equal(amountCovers(250000, 200000), true, "chuyển thừa vẫn tính đủ");
  assert.equal(amountCovers(199000, 200000), false, "thiếu 1.000đ là KHÔNG kích hoạt");
  assert.equal(amountCovers(0, 200000), false);
  assert.equal(amountCovers(-5, 200000), false);
  assert.equal(amountCovers(200000, null), true, "không biết giá ⇒ để chủ shop xác nhận");
});

test("token trong URL (dự phòng cho chế độ 'không xác thực' của SePay)", () => {
  assert.equal(verifySepayUrlToken({ token: "tok_abc123", urlToken: "tok_abc123" }), true);
  assert.equal(verifySepayUrlToken({ token: " tok_abc123 ", urlToken: "tok_abc123" }), true, "bỏ khoảng trắng");
  assert.equal(verifySepayUrlToken({ token: "tok_sai", urlToken: "tok_abc123" }), false);
  assert.equal(verifySepayUrlToken({ token: "", urlToken: "tok_abc123" }), false);
  assert.equal(verifySepayUrlToken({ token: "tok_abc123", urlToken: "" }), false, "chưa cấu hình ⇒ không nhận");
});

test("nội dung KHÔNG có dấu gạch (vietqr.app bỏ gạch) vẫn đọc được mã đơn", () => {
  // vietqr.app đặt nội dung vào tag 62/08 và bỏ dấu gạch: VPNFLOW-1789319664-NAM → VPNFLOW1789319664NAM
  assert.deepEqual(extractOrderRef({ content: "VPNFLOW1789319664NAM" }), {
    orderCode: 1789319664,
    product: "vpn",
    via: "VPNFLOW",
  });
  assert.equal(extractOrderRef({ content: "MEETFLOW178931966430NG" }).orderCode, 1789319664);
  assert.equal(extractOrderRef({ content: "MEETFLOW178931966430NG" }).product, "ai");
  // nội dung ngân hàng hay chèn số tài khoản vào trước — phải lấy mã đơn có tiền tố, không lấy số TK
  assert.equal(extractOrderRef({ content: "CT DEN 57222538888 VPNFLOW1789319664NAM" }).orderCode, 1789319664);
  // không có tiền tố: vẫn lấy được nhóm số dính chữ
  assert.equal(extractOrderRef({ content: "chuyen tien 1789319664 nhe" }).orderCode, 1789319664);
});

test("tài khoản nhận: tiền phải vào đúng tài khoản của shop", () => {
  const expected = ["57222538888"];
  assert.equal(accountMatches({ payloadAccount: "57222538888", expectedAccounts: expected }), true);
  // SePay có nơi trả kèm tên ngân hàng / khoảng trắng
  assert.equal(accountMatches({ payloadAccount: "TPBank-57222538888", expectedAccounts: expected }), true);
  assert.equal(accountMatches({ payloadAccount: "99999999999", expectedAccounts: expected }), false);
  // Không cấu hình tài khoản, hoặc payload không gửi ⇒ không chặn (để chủ shop xác nhận tay)
  assert.equal(accountMatches({ payloadAccount: "99999999999", expectedAccounts: [] }), true);
  assert.equal(accountMatches({ payloadAccount: null, expectedAccounts: expected }), true);
});

test("whitelist IP của SePay: trống thì không chặn, có thì chỉ nhận đúng dải", () => {
  assert.equal(clientIpAllowed({ ip: "1.2.3.4", allowlist: "" }), true, "chưa cấu hình ⇒ không chặn");
  assert.equal(clientIpAllowed({ ip: "1.2.3.4", allowlist: "1.2.3.4,5.6.7.8" }), true);
  assert.equal(clientIpAllowed({ ip: "9.9.9.9", allowlist: "1.2.3.4,5.6.7.8" }), false);
  assert.equal(clientIpAllowed({ ip: "1.2.3.55", allowlist: "1.2.3.0/24" }), true);
  assert.equal(clientIpAllowed({ ip: "1.2.4.1", allowlist: "1.2.3.0/24" }), false);
  assert.equal(clientIpAllowed({ ip: "::ffff:1.2.3.4", allowlist: "1.2.3.4" }), true, "IPv4-mapped IPv6 vẫn khớp");
  assert.equal(clientIpAllowed({ ip: "", allowlist: "1.2.3.4" }), false, "không xác định được IP ⇒ chặn");
});
