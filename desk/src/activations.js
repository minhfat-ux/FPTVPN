import { audit, get, run, withTransaction } from "./db.js";
import { checkInvitation, consumeInvitationUse, findInvitationByCode, isWellFormedCode, publicInvitation } from "./codes.js";
import { entitlementFor } from "./entitlement.js";
import { issueSession, publicActivation } from "./sessions.js";
import { badRequest, forbidden, newId, nowIso, shortText } from "./util.js";

/**
 * Đổi mã kích hoạt thành token phiên cho một thiết bị.
 *
 * Ba lớp kiểm tra, theo thứ tự:
 *  1. Mã đúng định dạng + còn hiệu lực (chưa thu hồi, chưa hết hạn, chưa hết lượt).
 *  2. User của mã có ĐƠN ĐÃ TRẢ TIỀN trong DB fBuddy (đọc trực tiếp, không cache).
 *  3. Còn lượt thiết bị. Cùng một `deviceId` kích hoạt lại ⇒ dùng lại dòng cũ,
 *     KHÔNG tiêu thêm lượt (cài lại app không bị tính là máy mới).
 *
 * Mọi nhánh từ chối đều ghi `desk_audit` để còn truy vết (và để rate limit theo
 * số lần thất bại).
 */

export function redeemCode({ code, deviceId = null, deviceLabel = null, ip = null, userAgent = null }) {
  const cleanDeviceId = deviceId ? shortText(deviceId, 128) : null;
  const cleanLabel = deviceLabel ? shortText(deviceLabel, 64) : null;

  if (!isWellFormedCode(code)) {
    audit("activation_failed", { ip, detail: { reason: "malformed_code" } });
    throw badRequest("Mã kích hoạt không đúng định dạng", "bad_code");
  }

  const invitation = findInvitationByCode(code);
  const state = checkInvitation(invitation);
  if (!state.ok) {
    audit("activation_failed", {
      ip,
      invitationId: invitation?.id ?? null,
      userId: invitation?.user_id ?? null,
      detail: { reason: state.reason },
    });
    // Thông báo chung cho mọi trường hợp: không xác nhận mã nào tồn tại.
    throw forbidden("Mã kích hoạt không hợp lệ hoặc đã hết hiệu lực", `code_${state.reason}`);
  }

  const entitlement = entitlementFor({ userId: invitation.user_id, orderId: invitation.order_id });
  if (!entitlement.entitled) {
    audit("activation_failed", {
      ip,
      invitationId: invitation.id,
      userId: invitation.user_id,
      detail: { reason: entitlement.reason },
    });
    throw forbidden("Đơn hàng chưa được xác nhận thanh toán", `not_entitled_${entitlement.reason}`);
  }

  const existing = cleanDeviceId
    ? get(
        `SELECT * FROM desk_activations
          WHERE invitation_id = ? AND device_id = ? AND revoked_at IS NULL
          ORDER BY activated_at DESC LIMIT 1`,
        invitation.id,
        cleanDeviceId,
      )
    : null;

  let activation = existing;
  let created = false;

  if (!activation) {
    // Thu hồi thiết bị phải "dính": cùng deviceId đã bị thu hồi thì KHÔNG được tự
    // kích hoạt lại bằng mã cũ (app tự kích hoạt lại khi token hết hạn, nên nếu không
    // chặn ở đây thì lệnh thu hồi của chủ dự án vô nghĩa). Khách vẫn dùng được máy
    // khác trong hạn mức thiết bị của mã.
    const revoked = cleanDeviceId
      ? get(
          `SELECT * FROM desk_activations
            WHERE invitation_id = ? AND device_id = ? AND revoked_at IS NOT NULL
            ORDER BY activated_at DESC LIMIT 1`,
          invitation.id,
          cleanDeviceId,
        )
      : null;
    if (revoked) {
      audit("activation_failed", {
        ip,
        invitationId: invitation.id,
        userId: invitation.user_id,
        activationId: revoked.id,
        detail: { reason: "device_revoked" },
      });
      throw forbidden("Thiết bị này đã bị thu hồi quyền", "device_revoked");
    }

    activation = withTransaction(() => {
      const fresh = get("SELECT * FROM desk_invitations WHERE id = ?", invitation.id);
      const usable = checkInvitation(fresh);
      if (!usable.ok) {
        throw forbidden("Mã kích hoạt không hợp lệ hoặc đã hết hiệu lực", `code_${usable.reason}`);
      }
      consumeInvitationUse(invitation.id);
      const id = newId("act");
      const now = nowIso();
      run(
        `INSERT INTO desk_activations
           (id, invitation_id, user_id, order_id, code_hash, device_id, device_label,
            activated_at, last_seen_at, ip, user_agent, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        invitation.id,
        invitation.user_id,
        invitation.order_id,
        invitation.code_hash,
        cleanDeviceId,
        cleanLabel,
        now,
        now,
        ip,
        userAgent ? shortText(userAgent, 200) : null,
        now,
        now,
      );
      return get("SELECT * FROM desk_activations WHERE id = ?", id);
    });
    created = true;
  }

  const session = issueSession({ activationId: activation.id, userId: activation.user_id });
  audit(created ? "activation_created" : "activation_reused", {
    userId: activation.user_id,
    invitationId: invitation.id,
    activationId: activation.id,
    ip,
    detail: { orderId: invitation.order_id, deviceLabel: cleanLabel, hasDeviceId: Boolean(cleanDeviceId) },
  });

  return {
    activation: publicActivation(activation),
    invitation: publicInvitation(invitation),
    session,
    plan: "desktop",
    order: entitlement.order,
  };
}
