import test from "node:test";
import assert from "node:assert/strict";
import "./helpers.js";

const codes = await import("../src/codes.js");
const { all, initDb, run } = await import("../src/db.js");

initDb();

test("mã sinh ra đúng định dạng FBW-XXXX-XXXX-XXXX, đủ 60 bit", () => {
  const seen = new Set();
  for (let i = 0; i < 50; i += 1) {
    const code = codes.generateCode();
    assert.match(code, /^FBW-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
    assert.equal(codes.isWellFormedCode(code), true);
    seen.add(code);
  }
  assert.equal(seen.size, 50, "50 mã phải khác nhau");
});

test("chuẩn hoá chịu được người dùng gõ sai: thường, khoảng trắng, O/0, I/1", () => {
  const canonical = codes.normalizeCode(codes.generateCode());
  const messy = `  ${canonical.slice(0, 4).toLowerCase()} ${canonical.slice(4, 8)}-${canonical.slice(8)} `;
  assert.equal(codes.normalizeCode(messy), canonical);
  assert.equal(codes.normalizeCode("fbw " + canonical), canonical);
  assert.equal(codes.isWellFormedCode("FBW-123"), false);
  assert.equal(codes.isWellFormedCode(""), false);
  assert.equal(codes.isWellFormedCode(null), false);
});

test("chuỗi có ký tự ngoài bảng chữ (U) bị coi là không hợp lệ", () => {
  assert.equal(codes.isWellFormedCode("FBW-UUUU-UUUU-UUUU"), false);
});

test("DB chỉ lưu HMAC của mã, không lưu mã gốc", () => {
  const { code } = codes.issueInvitation({ userId: "u_hash", email: "hash@example.com" });
  const rows = all("SELECT * FROM desk_invitations");
  const dumped = JSON.stringify(rows);
  assert.equal(dumped.includes(code), false, "mã gốc không được xuất hiện trong DB");
  assert.equal(dumped.includes(codes.normalizeCode(code)), false, "mã đã chuẩn hoá cũng không được có trong DB");
  assert.equal(codes.hashCode(code) !== code, true);
});

test("tìm mã theo code đã chuẩn hoá và theo bản gõ lộn", () => {
  const { code, invitation } = codes.issueInvitation({ userId: "u_lookup" });
  assert.equal(codes.findInvitationByCode(code)?.id, invitation.id);
  assert.equal(codes.findInvitationByCode(code.toLowerCase())?.id, invitation.id);
  assert.equal(codes.findInvitationByCode("FBW-0000-0000-0000"), null);
});

test("phát mã mới cho cùng (user, đơn) ⇒ mã cũ bị thu hồi, chỉ còn một mã sống", () => {
  const first = codes.issueInvitation({ userId: "u_rotate", orderId: "ord_1" });
  const second = codes.issueInvitation({ userId: "u_rotate", orderId: "ord_1" });
  assert.notEqual(first.code, second.code);
  assert.equal(Boolean(codes.getInvitation(first.invitation.id).revoked_at), true);
  assert.equal(codes.checkInvitation(codes.findInvitationByCode(first.code)).reason, "revoked");
  assert.equal(codes.checkInvitation(codes.findInvitationByCode(second.code)).ok, true);
  assert.equal(codes.activeInvitation({ userId: "u_rotate", orderId: "ord_1" }).id, second.invitation.id);
});

test("mã hết hạn bị từ chối", () => {
  const { code, invitation } = codes.issueInvitation({ userId: "u_expire" });
  run("UPDATE desk_invitations SET expires_at = ? WHERE id = ?", new Date(Date.now() - 1000).toISOString(), invitation.id);
  assert.equal(codes.checkInvitation(codes.findInvitationByCode(code)).reason, "expired");
});

test("thu hồi mã ⇒ không dùng được nữa, và ghi audit", () => {
  const { code, invitation } = codes.issueInvitation({ userId: "u_revoke" });
  codes.revokeInvitation({ id: invitation.id, reason: "test_revoke" });
  assert.equal(codes.checkInvitation(codes.findInvitationByCode(code)).reason, "revoked");
  const audits = all("SELECT * FROM desk_audit WHERE action = 'invitation_revoked'");
  assert.equal(audits.length >= 1, true);
});

test("API trả ra ngoài không có code_hash", () => {
  const { invitation } = codes.issueInvitation({ userId: "u_public" });
  const listed = codes.listInvitations({ userId: "u_public" });
  assert.equal(listed.length, 1);
  assert.equal("codeHash" in listed[0], false);
  assert.equal("code_hash" in listed[0], false);
  assert.equal("codeHash" in invitation, false);
  assert.equal(typeof listed[0].codeHint, "string");
  assert.equal(listed[0].codeHint.length, 4);
});
