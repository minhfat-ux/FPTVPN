/**
 * Nhường slot thiết bị: thu hồi bản ghi CŨ của chính máy đó để đăng ký bản mới.
 *
 * VÌ SAO CẦN: khi app xoay khoá WireGuard (cài lại, đổi cách lưu khoá, khôi phục máy), phía server
 * thấy một public key mới ⇒ coi là **thiết bị mới** và chặn nếu tài khoản đã đủ hạn mức
 * (`device_limit_reached`, mặc định 3). Nhưng bản ghi cũ chính là chiếc máy đang ngồi trước mặt
 * khách — chặn như vậy là oan, mà khách thì không hiểu phải làm gì. Đúng ca này gặp ngày 14/09
 * trên macOS: tunnel lên nhưng "mất mạng" vì đăng ký bị 403, peer không tồn tại trên node.
 *
 * NGUYÊN TẮC AN TOÀN (không được nới):
 * - chỉ bản ghi của CHÍNH user đang đăng nhập,
 * - chỉ cùng `platform` (app Mac không được "cướp" slot của điện thoại),
 * - không phải chính khoá đang đăng ký,
 * - bản ghi còn active (đã thu hồi rồi thì không tính vào hạn mức nữa).
 * Sai một điều kiện ⇒ KHÔNG làm gì (và lần đăng ký đó vẫn bị chặn như cũ).
 */

/** Có được phép thu hồi `target` để nhường slot cho thiết bị mới không? */
export function deviceReplaceDecision({ target, userId, platform, publicKey } = {}) {
  if (!target) return { allowed: false, reason: "not_found" };
  if (!userId || target.userId !== userId) return { allowed: false, reason: "not_owner" };
  if (target.active === false) return { allowed: false, reason: "already_inactive" };
  if (target.publicKey === publicKey) return { allowed: false, reason: "same_device" };
  if (String(target.platform ?? "") !== String(platform ?? "")) {
    return { allowed: false, reason: "different_platform" };
  }
  return { allowed: true, reason: "previous_install_same_platform" };
}

/**
 * Áp dụng yêu cầu nhường slot (nếu client khai `replace_device_id`).
 *
 * Trả `{ replaced }`: null khi không làm gì, hoặc `{ device_id, name }` khi đã thu hồi bản ghi cũ.
 * Caller truyền vào `store` (DeviceStore) và `removePeer` (xoá peer trên exit node) để module này
 * không phụ thuộc trực tiếp vào express/wireguard.
 */
export async function applyDeviceReplace({
  body,
  userId,
  platform,
  publicKey,
  store,
  removePeer,
  log = console,
} = {}) {
  const replaceId = String(body?.replace_device_id ?? "").trim();
  if (!replaceId) return { replaced: null };

  const target = await store.findById(replaceId);
  const decision = deviceReplaceDecision({ target, userId, platform, publicKey });
  if (!decision.allowed) {
    log.log?.(`register: bỏ qua replace_device_id=${replaceId} (${decision.reason})`);
    return { replaced: null, reason: decision.reason };
  }

  await removePeer(target);
  await store.deactivate(target.id);
  log.log?.(
    `register: thu hồi bản ghi cũ ${target.id} (${target.deviceName}, platform=${target.platform ?? "?"}) để nhường slot`,
  );
  return { replaced: { device_id: target.id, name: target.deviceName } };
}
