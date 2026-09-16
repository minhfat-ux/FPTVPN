/**
 * Báo cáo định kỳ gửi từ SERVER (Telegram).
 *
 * Yêu cầu của chủ shop (16/09/2026): báo cáo phải tự chạy trên server để **tắt máy Mac
 * vẫn nhận được**. Vì vậy phần lịch chạy nằm trong control plane (node-2), còn module này
 * chỉ chứa hàm THUẦN (định dạng nội dung + tính giờ tới hạn) để test được không cần mạng.
 */

/** Một dòng "HH:MM" hợp lệ? */
export function parseReportTimes(value, fallback = ["08:00", "20:00"]) {
  const raw = Array.isArray(value) ? value : String(value ?? "").split(",");
  const times = raw
    .map((t) => String(t).trim())
    .filter((t) => /^\d{1,2}:\d{2}$/.test(t))
    .map((t) => {
      const [h, m] = t.split(":").map(Number);
      return { hour: h, minute: m, label: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}` };
    })
    .filter((t) => t.hour >= 0 && t.hour <= 23 && t.minute >= 0 && t.minute <= 59);
  return times.length ? times : fallback.map((t) => {
    const [h, m] = t.split(":").map(Number);
    return { hour: h, minute: m, label: t };
  });
}

/**
 * Đã tới giờ gửi báo cáo chưa? (giờ của server)
 *
 * `windowMinutes` để một lần khởi động lại / vòng lặp trễ vài phút vẫn gửi được, nhưng
 * không gửi bù cho mốc đã qua từ lâu. `lastSentAt` chặn gửi 2 lần cho cùng một mốc.
 */
export function reportDue({ now = new Date(), times = [], lastSentAt = null, windowMinutes = 10 } = {}) {
  const windowMs = Math.max(1, Number(windowMinutes) || 10) * 60_000;
  const last = lastSentAt ? new Date(lastSentAt).getTime() : 0;
  for (const { hour, minute } of times) {
    const slot = new Date(now);
    slot.setHours(hour, minute, 0, 0);
    const diff = now.getTime() - slot.getTime();
    if (diff < 0 || diff > windowMs) continue;      // chưa tới giờ, hoặc đã qua cửa sổ
    if (last >= slot.getTime()) continue;            // mốc này đã gửi rồi
    return { due: true, slot: slot.toISOString() };
  }
  return { due: false, slot: null };
}

/** Nội dung báo cáo: tiêu đề + các dòng, mức warn nếu có vấn đề cần người xử lý. */
export function formatStatusReport({
  now = new Date(),
  nodes = [],
  peers = null,
  devices = null,
  ios = null,
  payments = null,
  extra = [],
} = {}) {
  const lines = [];
  const issues = [];

  if (Array.isArray(nodes) && nodes.length) {
    lines.push(`Node: ${nodes.map((n) => `${n.name ?? n.id}${n.online ? (n.ms != null ? ` ✓ ${n.ms}ms` : " ✓") : " ✗ KHÔNG phản hồi"}`).join(" · ")}`);
    for (const n of nodes) if (!n.online) issues.push(`node ${n.name ?? n.id} không phản hồi`);
  }
  if (peers && peers.total != null) lines.push(`Peer online: ${peers.online ?? 0}/${peers.total}`);
  if (devices) {
    lines.push(`Thiết bị khách: ${devices.active ?? 0} active / ${devices.total ?? 0} tổng (test: ${devices.test ?? 0})`);
    const byPlatform = devices.byPlatform ?? {};
    const platformText = Object.entries(byPlatform).map(([k, v]) => `${k} ${v}`).join(" · ");
    if (platformText) lines.push(`Nền tảng: ${platformText}`);
    if (devices.newLast24h != null) lines.push(`Đăng ký mới 24h: ${devices.newLast24h}`);
    if (devices.peerless) {
      lines.push(`⚠️ ${devices.peerless} thiết bị active THIẾU peer (app báo Connected mà không có mạng)`);
      issues.push(`${devices.peerless} thiết bị thiếu peer`);
    }
  }
  if (ios && ios.pendingSign) {
    lines.push(`iOS đang chờ ký: ${ios.pendingSign}`);
    issues.push(`${ios.pendingSign} khách iOS chờ bản ký`);
  }
  if (payments && payments.pending) lines.push(`Đơn chờ thanh toán: ${payments.pending}`);
  for (const line of extra) if (line) lines.push(line);

  const stamp = `${now.toISOString().replace("T", " ").slice(0, 16)} UTC`;
  return {
    title: `Báo cáo VPNFlow (${stamp})`,
    lines,
    level: issues.length ? "warn" : "ok",
    issues,
  };
}
