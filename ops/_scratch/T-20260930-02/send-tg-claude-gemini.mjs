// Trả lời chủ dự án câu hỏi bus #604 (T-20260930-02) qua Telegram.
import { sendPing } from "../lib/telegram.mjs";

const text = `Đã kiểm tra xong việc "khách không dùng được Claude/Gemini khi bật VPN".

KẾT LUẬN: KHÔNG phải đường hầm VPN chặn.

Đo từ chính IP mà khách đi ra (165.101.114.162 — Vietnam/VNPT, KHÔNG bị gắn cờ proxy/hosting):
• claude.ai → 200 (mở được trang đăng nhập)
• api.anthropic.com → 401 (tới được Anthropic, chỉ sai khoá)
• gemini.google.com → 200 (tải được app Gemini)
• generativelanguage.googleapis.com → 400 (tới được Google API)
Cloudflare báo quốc gia loc=VN, và Việt Nam CÓ trong danh sách Anthropic hỗ trợ (cả API lẫn Claude.ai).
Đo ở 2 nơi độc lập — máy Windows qua VPN và thẳng trên VPS — đều 5/5 PASS.

NGHI PHẠM, theo thứ tự khả năng:
1) Bản app cũ ≤1.4.5 dính lỗi DNS đã biết (bật VPN là chết Google/YouTube/"link cần VPN" — Claude/Gemini đúng là loại link đó). Máy test đang cài 1.4.5; bản mới nhất hiện tại: Windows/macOS 1.4.7, iOS 1.4.6, Android 1.4.4.
   → Cho khách cập nhật lên bản mới nhất rồi thử lại.
2) Khách dùng công cụ dòng lệnh / script (không phải trình duyệt): Claude trả 403 do Cloudflare chặn theo "dấu vân tay" TLS. Cùng một IP: curl=403 nhưng trình duyệt/Node=200. Gemini không dính cái này.
3) Chặn ở tầng tài khoản (Anthropic/Google gắn cờ, CAPTCHA "unusual traffic"), hoặc mạng khách mất gói (tunnel đang mất 6%, có lúc 10-23%).

CẦN HỎI KHÁCH 4 CÂU ĐỂ CHỐT: (1) phiên bản app đang dùng? (2) dùng trình duyệt hay app/CLI? (3) lỗi nguyên văn (chụp ảnh)? (4) tắt VPN đi có dùng được không?

Bằng chứng đầy đủ: docs/evidence/T-20260930-02/README.md
Lệnh nghiệm thu (chạy lại được bất cứ lúc nào): node ops/verify-claude-gemini-vpn.mjs

Đã chép việc vào sổ T-20260930-02 và báo done. Không tắt, không đổi cấu hình VPN của anh.`;

const result = await sendPing(text, { prefix: "[WIN → chủ dự án]" });
console.log(result?.ok ? `đã gửi Telegram (message_id ${result.messageId})` : `LỖI gửi: ${JSON.stringify(result?.raw)}`);
