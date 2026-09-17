import "./helpers.js";
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { api, apiRaw, bootServer, closeServer, safeJson } from "./helpers.js";

after(async () => {
  await closeServer();
});

/// Session of the first account (admin) — codes are rate limited per email, so
/// every later test reuses this one instead of requesting new codes.
let adminToken = null;
const ADMIN_EMAIL = "first.user@fbuddy.test";

test("meta advertises passwordless email login and the future SSO providers", async () => {
  const { baseUrl } = await bootServer();
  const meta = await fetch(`${baseUrl}/api/meta`).then((r) => r.json());
  assert.equal(meta.authMethods.emailToken, true);
  assert.equal(meta.authMethods.sso.firebase, false);
  assert.equal(meta.authMethods.sso.facebook, false);
  assert.equal(meta.firstUserIsAdmin, true);
  // No Resend key in the test environment → mailer not configured.
  assert.equal(meta.mailer.configured, false);
});

test("requesting a code creates the first account as admin and returns a dev code", async () => {
  const result = await api("POST", "/auth/request-token", { email: "First.User@fBuddy.test" });
  assert.equal(result.ok, true);
  assert.equal(result.delivered, false);
  assert.equal(result.mailerConfigured, false);
  assert.match(result.devCode, /^\d{6}$/);
  assert.ok(result.expiresInMin >= 5);
  // The magic link points back at the app with both parameters.
  assert.match(result.devLink, /\?email=first\.user%40fbuddy\.test&token=/);

  const session = await api("POST", "/auth/verify-token", { email: ADMIN_EMAIL, token: result.devCode });
  assert.equal(session.user.isAdmin, true);
  adminToken = session.token;
});

test("a wrong code is rejected and a correct code logs the user in once", async () => {
  const email = "wrongcode@fbuddy.test";
  const requested = await api("POST", "/auth/request-token", { email });

  const wrong = await apiRaw("POST", "/auth/verify-token", { email, token: "000000" });
  assert.equal(wrong.status, 401);
  const wrongBody = await wrong.json();
  assert.match(wrongBody.error.message, /không đúng/i);

  const session = await api("POST", "/auth/verify-token", { email, token: requested.devCode });
  assert.equal(session.user.email, email);
  assert.equal(session.user.isAdmin, false); // first account was the previous test's
  assert.ok(session.token);

  // Single use: the same code cannot be redeemed twice.
  const reuse = await apiRaw("POST", "/auth/verify-token", { email, token: requested.devCode });
  assert.equal(reuse.status, 401);

  const me = await api("GET", "/auth/me", undefined, session.token);
  assert.equal(me.user.email, email);
});

test("the magic-link token works and invalidates sibling codes", async () => {
  const email = "magiclink@fbuddy.test";
  const requested = await api("POST", "/auth/request-token", { email });
  const linkToken = new URL(requested.devLink).searchParams.get("token");
  assert.ok(linkToken && linkToken.length > 20);

  const session = await api("POST", "/auth/verify-token", { email, token: linkToken });
  assert.equal(session.user.email, email);

  // The numeric code from the same request is now void.
  const stale = await apiRaw("POST", "/auth/verify-token", { email, token: requested.devCode });
  assert.equal(stale.status, 401);
});

test("requesting a new code invalidates the previous one", async () => {
  const email = "rotate@fbuddy.test";
  const first = await api("POST", "/auth/request-token", { email });
  const second = await api("POST", "/auth/request-token", { email });
  assert.notEqual(first.devCode, second.devCode);

  const old = await apiRaw("POST", "/auth/verify-token", { email, token: first.devCode });
  assert.equal(old.status, 401);
  const fresh = await api("POST", "/auth/verify-token", { email, token: second.devCode });
  assert.equal(fresh.user.email, email);
});

test("codes are rate limited per email address", async () => {
  const email = "spam@fbuddy.test";
  for (let i = 0; i < 3; i += 1) {
    await api("POST", "/auth/request-token", { email });
  }
  const blocked = await apiRaw("POST", "/auth/request-token", { email });
  assert.equal(blocked.status, 429);
  assert.match((await blocked.json()).error.message, /quá nhiều mã/i);
});

test("invalid emails are rejected before any mail is sent", async () => {
  const response = await apiRaw("POST", "/auth/request-token", { email: "khong-phai-email" });
  assert.equal(response.status, 400);
});

test("unknown emails do not get a code when auto-creation is disabled", async () => {
  await api("PUT", "/settings/app", { settings: { autoCreateUserOnLogin: false } }, adminToken);

  const result = await api("POST", "/auth/request-token", { email: "nguoi-la@fbuddy.test" });
  assert.equal(result.ok, true);
  assert.equal(result.delivered, false);
  // No enumeration signal and no usable code.
  assert.equal(result.devCode, undefined);

  await api("PUT", "/settings/app", { settings: { autoCreateUserOnLogin: true } }, adminToken);
});

test("password login can be switched off from settings", async () => {
  await api("PUT", "/settings/app", { settings: { passwordLoginEnabled: false } }, adminToken);
  const blocked = await apiRaw("POST", "/auth/login", {
    email: ADMIN_EMAIL,
    password: "bat-ky",
  });
  assert.equal(blocked.status, 403);
  assert.match((await blocked.json()).error.message, /mật khẩu đang tắt/i);

  await api("PUT", "/settings/app", { settings: { passwordLoginEnabled: true } }, adminToken);
});

test("app settings expose mailer state but never the Resend key", async () => {
  const before = await api("GET", "/settings/app", undefined, adminToken);
  assert.equal(before.settings.hasResendKey, false);
  assert.equal(before.settings.resendApiKeyEnc, undefined);
  assert.equal(before.settings.resendKeyPreview, null);
  assert.equal(before.settings.loginTokenTtlMin, 15);

  // Storing a key keeps it write-only.
  const saved = await api(
    "PUT",
    "/settings/app",
    { settings: { resendApiKey: "re_TESTKEY_1234567890", mailerFrom: "no-reply@meetflowai.site" } },
    adminToken,
  );
  assert.equal(saved.settings.hasResendKey, true);
  assert.equal(saved.settings.resendApiKeyEnc, undefined);
  assert.ok(saved.settings.resendKeyPreview.startsWith("re_T"));
  assert.ok(!JSON.stringify(saved.settings).includes("re_TESTKEY_1234567890"));

  // Clearing it with an empty string works.
  const cleared = await api("PUT", "/settings/app", { settings: { resendApiKey: "" } }, adminToken);
  assert.equal(cleared.settings.hasResendKey, false);
});

test("mailer test endpoint refuses politely when no key is configured", async () => {
  const result = await api("POST", "/settings/mailer/test", { to: "owner@fbuddy.test" }, adminToken);
  assert.equal(result.ok, false);
  assert.match(result.message, /Resend API key/);

  const bad = await apiRaw("POST", "/settings/mailer/test", { to: "khong-phai-email" }, adminToken);
  assert.equal(bad.status, 400);
});

test("only admins can reach the mailer settings surface", async () => {
  const requested = await api("POST", "/auth/request-token", { email: "normal@fbuddy.test" });
  const { token } = await api("POST", "/auth/verify-token", {
    email: "normal@fbuddy.test",
    token: requested.devCode,
  });
  const response = await apiRaw("POST", "/settings/mailer/test", { to: "x@y.com" }, token);
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, "forbidden");
});
