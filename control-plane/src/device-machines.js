/**
 * Đếm "MÁY THẬT" thay vì đếm bản ghi đăng ký (bus #591 / T-20260929-04).
 *
 * VÌ SAO CẦN: app Android sinh cặp khoá WireGuard + tên máy MỚI mỗi lần cài lại (khoá lưu trong
 * SecureStore; xoá dữ liệu/gỡ app là mất), nên server nhận thêm một bản ghi cho CÙNG một chiếc máy.
 * Dashboard lấy `devices.length` vì thế vừa thừa (mỗi lần cài lại +1) vừa không nói lên "số máy".
 * Đo thật 29/09/2026: tài khoản minhnb2@me.com có 6 bản ghi (1 macos + 5 android) nhưng chỉ 1 máy Mac
 * + 1 điện thoại Android.
 *
 * Cách đếm — mỗi bản ghi được gán một khoá máy:
 *  - có `machineId` (client gửi mã máy ổn định; Android = Settings.Secure.ANDROID_ID) ⇒ khoá theo mã đó;
 *  - không có `machineId`, platform KHÁC android (iOS giữ danh tính trong Keychain, macOS/Windows giữ
 *    trong tệp riêng — đều sống qua lần cài lại) ⇒ mỗi bản ghi là một máy;
 *  - không có `machineId`, platform = android ⇒ KHÔNG thể phân biệt các bản ghi cũ (mã máy chưa từng
 *    được gửi), nên gộp theo (user, platform) và đếm là MỘT máy; số bản ghi bị gộp trả riêng để hiển
 *    thị minh bạch, không giấu.
 */

export function normalizeMachineId(value) {
  const id = String(value ?? "").trim();
  return id ? id.slice(0, 128) : null;
}

/** Khoá "máy thật" của một bản ghi. `index` chỉ dùng khi bản ghi thiếu id (không xảy ra trên thực tế). */
export function machineKey(device, index = 0) {
  const userId = String(device?.userId ?? "");
  const platform = String(device?.platform ?? "unknown").toLowerCase();
  const machineId = normalizeMachineId(device?.machineId);
  if (machineId) return `${userId}|${platform}|id:${machineId}`;
  if (platform === "android") return `${userId}|android|legacy`;
  return `${userId}|${platform}|rec:${device?.id ?? `anon:${index}`}`;
}

/** Bản ghi cũ của Android: chưa có mã máy nên không thể là căn cứ đếm máy. */
export function isLegacyAndroidRecord(device) {
  return !normalizeMachineId(device?.machineId) && String(device?.platform ?? "").toLowerCase() === "android";
}

/**
 * @param {Array<object>} devices các bản ghi có `userId` (bản ghi thật của khách)
 * @returns {{machines:number, records:number, legacy_android_records:number, legacy_android_grouped_away:number}}
 */
export function summarizeMachines(devices) {
  const list = Array.isArray(devices) ? devices : [];
  const keys = new Set();
  const legacyUsers = new Set();
  let legacyAndroid = 0;
  list.forEach((device, index) => {
    keys.add(machineKey(device, index));
    if (isLegacyAndroidRecord(device)) {
      legacyAndroid += 1;
      legacyUsers.add(String(device?.userId ?? ""));
    }
  });
  return {
    machines: keys.size,
    records: list.length,
    legacy_android_records: legacyAndroid,
    // Số bản ghi Android cũ bị gộp bớt khi đếm theo máy (mỗi tài khoản còn đúng 1).
    legacy_android_grouped_away: legacyAndroid - legacyUsers.size,
  };
}
