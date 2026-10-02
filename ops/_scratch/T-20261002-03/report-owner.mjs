// T-20261002-03 (bus #654) — gửi báo cáo tasks cho chủ dự án qua Telegram.
// Dùng: AGENT_NAME=WIN node ops/_scratch/T-20261002-03/report-owner.mjs
import { sendPing } from "../../lib/telegram.mjs";

const text = [
  "BÁO CÁO TASKS (WIN) — 02/10/2026 13:35 giờ VN",
  "",
  "1) VỪA XONG trong phiên này (đã deploy LIVE, chờ nghiệm thu):",
  "• bus #652 → T-20261002-01: trang /ai/buy — nhãn ô email đang là \"Your VPNFlow account email\" đã sửa thành \"Email\" (đủ 5 ngôn ngữ: Email / 邮箱 / メールアドレス / 이메일). Trang /buy của VPNFlow giữ nguyên.",
  "• bus #653 → T-20261002-02: /ai/buy đã có nút tải bản Windows (MeetFlowAI Overlay .zip 71,4 MB, chạy MeetFlowAI.Win.exe) kèm dòng hướng dẫn riêng cho app overlay.",
  "Bằng chứng: commit 87fc9d8 (control-plane trên node-2) + b99da57 (flowgpt: docs/evidence/T-20261002-01/). Lệnh nghiệm thu: scp ops/_scratch/T-20261002-cp/verify-ai-buy.mjs root@165.101.114.162:/tmp/ && ssh ... 'cd /root/flowvpn-cp && node /tmp/verify-ai-buy.mjs' → 63 PASS / 0 FAIL.",
  "",
  "2) ĐANG CHỜ ĐỐI TÁC:",
  "• T-20260922-09 (win→server): giao 14.347 phút (~10 ngày) server CHƯA ack — máy server chưa chạy watcher.",
  "• Chờ MAC: T-20260922-01, -06, -12, -14 (in_progress); T-20260922-15, -17 (acked).",
  "",
  "3) ĐANG VƯỚNG:",
  "• T-20260927-01 — publish MeetFlow AI Android lên Google Play: blocked (cần quyền/credential Play Console).",
  "• bus-516 (Play tester Android VPNFlow) và T-20260921-01 (nâng DSH harness 0.1.5-rc.1): mac→win, blocked.",
  "• T-20260928-03 và T-20260928-04: mới ở trạng thái \"created\", CHƯA ai giao/ack.",
  "",
  "4) 30 việc owner→win trước đó (T-20260922-18 → T-20260930-03) đều đã \"done\" — đang chờ bên giao chạy lệnh verify để khép sổ.",
  "",
  "5) CẦN CHỦ DỰ ÁN QUYẾT:",
  "• 2 test đỏ CÓ SẴN trên control-plane (mac-install \"4 bước Mac\" và sendTelegram mojibake) làm cổng deploy chính thức deploy-control-plane.sh từ chối deploy ⇒ có mở việc riêng để sửa 2 test đó không?",
].join("\n");

const result = await sendPing(text, { prefix: "[WIN → chủ dự án]" });
console.log(JSON.stringify(result));
process.exit(result.ok ? 0 : 1);
