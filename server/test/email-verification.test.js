/**
 * Xác thực email mới kích hoạt tài khoản.
 *
 * Luật: đăng ký xong KHÔNG mở phiên; phải nhập mã trong email mới active. Có 2 lối thoát được
 * kiểm tra ở đây: (1) máy chưa cấu hình mailer ⇒ kích hoạt ngay (nếu không thì không ai vào được),
 * (2) đăng nhập không mật khẩu ⇒ nhận được mã tức là đã chứng minh sở hữu hộp thư ⇒ active luôn.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { api, apiRaw, bootServer, closeServer, registerAdmin } from "./helpers.js";

const RESEND = "https://api.resend.com/emails";
const sent = [];
const realFetch = globalThis.fetch;

/** Bắt email gửi qua Resend (không gọi mạng thật), luồn các request khác về fetch gốc. */
function interceptMail() {
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith(RESEND)) {
      const payload = JSON.parse(init.body);
      sent.push(payload);
      return new Response(JSON.stringify({ id: `test-${sent.length}` }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return realFetch(url, init);
  };
}

function lastCode() {
  const mail = sent[sent.length - 1];
  const match = /Mã xác thực email fBuddy: (\d{6})/.exec(mail?.text ?? "");
  assert.ok(match, `email phải chứa mã 6 số, nhận được: ${(mail?.text ?? "").slice(0, 120)}`);
  assert.match(mail.html, new RegExp(match[1]), "mã phải có cả trong bản HTML");
  return match[1];
}

let admin = null;

test("chuẩn bị: tạo admin khi CHƯA cấu hình mailer (kích hoạt ngay)", async () => {
  admin = await registerAdmin("admin-verify@fbuddy.test");
  assert.ok(admin.token, "chưa có mailer thì tài khoản được kích hoạt ngay để còn dùng được app");
  assert.equal(admin.user.emailVerified, true);
  assert.equal(admin.activatedWithoutVerification, true);
});

test("có mailer: đăng ký xong chưa active, email chứa mã, đăng nhập bị chặn", async () => {
  process.env.FBUDDY_RESEND_API_KEY = "test-resend-key";
  interceptMail();

  const email = "khach-moi@fbuddy.test";
  const registered = await api("POST", "/auth/register", { email, password: "matkhau12345", name: "Khách" });

  assert.equal(registered.pendingVerification, true, "phải yêu cầu xác thực email");
  assert.equal(registered.token, undefined, "KHÔNG được mở phiên trước khi xác thực");
  assert.equal(registered.user.emailVerified, false);
  assert.equal(registered.delivered, true, "email xác thực phải gửi được");
  assert.equal(sent[sent.length - 1].to[0], email);
  const code = lastCode();

  // Đăng nhập bằng mật khẩu trong lúc chưa xác thực ⇒ 403 + tự gửi lại mã.
  const blocked = await apiRaw("POST", "/auth/login", { email, password: "matkhau12345" });
  assert.equal(blocked.status, 403);
  const body = await blocked.json();
  assert.equal(body.error.code, "email_not_verified");
  assert.equal(body.error.details.email, email);
  assert.ok(body.error.details.delivered, "phải tự gửi lại mã kích hoạt");
  const resentCode = lastCode();

  // Mã sai bị từ chối.
  const wrong = await apiRaw("POST", "/auth/verify-email", { email, code: "000000" });
  assert.equal(wrong.status, 401);

  // Mã đúng ⇒ active + mở phiên luôn.
  const verified = await api("POST", "/auth/verify-email", { email, code: resentCode });
  assert.equal(verified.user.emailVerified, true);
  assert.ok(verified.token);
  assert.ok(verified.user.emailVerifiedAt);

  const me = await api("GET", "/auth/me", undefined, verified.token);
  assert.equal(me.user.emailVerified, true);

  // Mã dùng một lần: mã cũ không dùng lại được (kể cả mã đầu tiên).
  const reuse = await apiRaw("POST", "/auth/verify-email", { email, code });
  assert.equal(reuse.status, 401, "mã cũ không được dùng lại");
  const reuseSame = await apiRaw("POST", "/auth/verify-email", { email, code: resentCode });
  assert.equal(reuseSame.status, 401, "mã vừa dùng không được dùng lại");

  // Sau khi active thì đăng nhập bình thường.
  const login = await api("POST", "/auth/login", { email, password: "matkhau12345" });
  assert.ok(login.token);
});

test("chưa xác thực thì token cũ cũng không dùng được app", async () => {
  const { update } = await import("../src/db.js");
  // Hạ cờ xác thực của khách đã active để mô phỏng tài khoản bị thu hồi xác thực.
  const me = await api("GET", "/auth/me", undefined, admin.token);
  update("users", me.user.id, { email_verified: 0 });
  const blocked = await apiRaw("GET", "/auth/me", undefined, admin.token);
  assert.equal(blocked.status, 403);
  const body = await blocked.json();
  assert.equal(body.error.code, "email_not_verified");
  update("users", me.user.id, { email_verified: 1 }); // trả lại như cũ cho các test sau
  const ok = await api("GET", "/auth/me", undefined, admin.token);
  assert.equal(ok.user.emailVerified, true);
});

test("gửi lại mã: báo thành công, và không tiết lộ email nào đã đăng ký", async () => {
  const email = "khach-resend@fbuddy.test";
  await api("POST", "/auth/register", { email, password: "matkhau12345" });
  assert.equal(sent[sent.length - 1].to[0], email);

  const resend = await api("POST", "/auth/resend-verification", { email });
  assert.equal(resend.ok, true);
  assert.equal(resend.delivered, true);
  assert.equal(sent[sent.length - 1].to[0], email);

  const unknown = await api("POST", "/auth/resend-verification", { email: "khong-ton-tai@fbuddy.test" });
  assert.equal(unknown.ok, true);
  assert.equal(unknown.delivered, false);
});

test("đăng nhập không mật khẩu cũng kích hoạt tài khoản (đã chứng minh sở hữu hộp thư)", async () => {
  const email = "khach-passwordless@fbuddy.test";
  const requested = await api("POST", "/auth/request-token", { email });
  assert.equal(requested.delivered, true);
  const code = /Mã đăng nhập fBuddy: (\d{6})/.exec(sent[sent.length - 1].text)?.[1];
  assert.ok(code, "email đăng nhập phải chứa mã");

  const login = await api("POST", "/auth/verify-token", { email, token: code });
  assert.equal(login.user.emailVerified, true, "nhận được mã ⇒ coi như đã xác thực email");
});

test("admin THÊM TAY trên control panel ⇒ tài khoản active NGAY", async () => {
  const email = "khach-admin-them@fbuddy.test";
  const created = await api("POST", "/admin/users", { email, password: "matkhau12345", name: "Khách admin thêm" }, admin.token);
  assert.equal(created.user.emailVerified, true, "admin đã xác nhận người này ⇒ không bắt chờ email");

  // Đăng nhập được ngay, không cần mã kích hoạt.
  const login = await api("POST", "/auth/login", { email, password: "matkhau12345" });
  assert.ok(login.token, "tài khoản do admin thêm phải đăng nhập được ngay");
  assert.equal(login.user.emailVerified, true);
});

test("khách TỰ đăng ký thì vẫn phải xác thực; admin kích hoạt tay khi email không tới", async () => {
  const email = "khach-ket@fbuddy.test";
  const registered = await api("POST", "/auth/register", { email, password: "matkhau12345", name: "Kẹt" });
  assert.equal(registered.pendingVerification, true);
  assert.equal(registered.user.emailVerified, false);

  const blocked = await apiRaw("POST", "/auth/login", { email, password: "matkhau12345" });
  assert.equal(blocked.status, 403, "khách tự đăng ký thì vẫn bị chặn tới khi xác thực");

  // Admin kích hoạt tay (khách không nhận được mail).
  const activated = await api("POST", `/admin/users/${registered.user.id}/verify-email`, {}, admin.token);
  assert.equal(activated.user.emailVerified, true);

  const login = await api("POST", "/auth/login", { email, password: "matkhau12345" });
  assert.ok(login.token, "sau khi admin kích hoạt thì đăng nhập được");
});

test("tắt cờ requireEmailVerification thì đăng ký active ngay", async () => {
  const { patchAppSettings } = await import("../src/settings.js");
  patchAppSettings({ requireEmailVerification: false });
  const email = "khach-tat-cog@fbuddy.test";
  const registered = await api("POST", "/auth/register", { email, password: "matkhau12345" });
  assert.ok(registered.token, "tắt bắt buộc xác thực thì mở phiên ngay");
  assert.equal(registered.emailVerificationRequired, false);
  patchAppSettings({ requireEmailVerification: true });
});

test.after(async () => {
  globalThis.fetch = realFetch;
  delete process.env.FBUDDY_RESEND_API_KEY;
  await closeServer();
});
