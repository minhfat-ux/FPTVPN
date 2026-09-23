/**
 * QUYẾT ĐỊNH ĐÁNH THỨC — tách khỏi `ops/agent-watch.mjs` để kiểm thử được.
 *
 * Vì sao tách: `agent-watch.mjs` là script có tác dụng phụ ngay khi import (nó fetch git, poll
 * connector, có thể boot harness), nên không thể `import` để test hàm quyết định. Luật đánh thức
 * là thứ đã gây lỗi thật (xem `wakeReason`), nên nó phải có test.
 *
 * Hợp đồng: hàm THUẦN — chỉ nhìn `entry` (việc trong sổ) và tên agent của mình, trả lý do đánh
 * thức (chuỗi) hoặc `null`. Không đọc đĩa, không gọi mạng.
 */

/**
 * Việc này có cần ĐÁNH THỨC tôi không? Trả về lý do hoặc null.
 *
 * @param {{ task?: { to?: string, from?: string }, last?: { type?: string, actor?: string, result?: string } }} entry
 * @param {string} self tên agent của mình (WIN/MAC/SERVER…)
 */
export function wakeReason(entry, self) {
  const me = String(self ?? "").trim().toLowerCase();
  const to = String(entry?.task?.to ?? "").toLowerCase();
  const from = String(entry?.task?.from ?? "").toLowerCase();
  const last = entry?.last;
  const mine = to === me;
  const theirs = from === me;
  if (!last) return null;
  // Ai ghi sự kiện cuối? Sự kiện do CHÍNH TÔI ghi nghĩa là tôi vừa hành động xong, không phải
  // "bên kia vừa ghi chú" — đánh thức tôi vì nó là vòng lặp vô ích.
  const bySelf = String(last.actor ?? "").trim().toLowerCase() === me;
  if (mine && last.type === "sent") return "có việc mới được giao";
  if (mine && last.type === "verified" && last.result === "fail") return "bị trả lại, phải làm lại";
  // LỖI THẬT (23/09/2026, T-20260923-03): nhánh này cũ không phân biệt NGƯỜI GHI, nên mỗi lần
  // chính tôi báo `blocked` (bóng đã ở sân bên giao), watcher lại tự đánh thức tôi sau mỗi
  // cooldown ⇒ vòng lặp bất tận: blocked 12:07/12:20/12:36 sinh woken 12:16/12:27/12:37, mỗi
  // vòng tốn một phiên harness mà không có gì mới để làm. Chỉ đánh thức khi `blocked` do BÊN
  // KHÁC ghi (bên giao thêm ghi chú/chặn việc của tôi).
  if (mine && last.type === "blocked" && !bySelf) return "bên giao vừa ghi chú vào việc của tôi";
  // Bên giao chỉ bị đánh thức khi thật sự cần hành động — không réo mỗi lần đối tác `ack`/`progress`.
  if (theirs && last.type === "done") return "đối tác báo xong — cần nghiệm thu";
  if (theirs && last.type === "blocked") return "đối tác đang vướng, cần gỡ";
  return null;
}
