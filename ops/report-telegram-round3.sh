#!/usr/bin/env bash
# Report: OpenRouter default + voice + skill marketplace + layout fix.
set -euo pipefail
set -a
# shellcheck disable=SC1091
. /etc/flowvpn-tg-bot.env
set +a

CHAT=$(printf '%s' "${TELEGRAM_ALLOWED_CHATS:-${TELEGRAM_CHAT_ID:-}}" | cut -d, -f1 | tr -d ' ')
[ -n "${CHAT:-}" ] || { echo "Không có chat id"; exit 1; }

TEXT=$(cat <<'MSG'
🚀 fBuddy — cập nhật lớn: OpenRouter mặc định + Nói chuyện bằng giọng nói + Chợ kỹ năng

1) OPENROUTER LÀ MẶC ĐỊNH
• Key đã nạp (mã hoá AES-256-GCM, không lưu dạng thô), OpenRouter báo 444 model khả dụng
• Mặc định: google/gemini-2.5-flash — test thật 1,4s + streaming tiếng Việt OK
• DeepSeek vẫn bật làm dự phòng; nút "Đặt mặc định" có ở từng nhà cung cấp
• Cơ chế an toàn mới: nhà cung cấp mặc định thiếu key thì chat TỰ LÙI về provider còn key
  (app không chết) và hiện thông báo giải thích

2) NÓI CHUYỆN BẰNG GIỌNG NÓI (miễn phí 100%)
• Nút micro: nói → chữ tự vào ô chat
• Nút "Nói chuyện": chế độ rảnh tay — nghe → trả lời bằng giọng nói → nghe tiếp, có barge-in
• Nút loa ở mỗi câu trả lời + công tắc "tự đọc"
• Giọng đọc: Edge có sẵn Microsoft Hoài My / Nam Minh (vi-VN natural, miễn phí)
• Cài đặt → Giọng nói: chọn ngôn ngữ, giọng, tốc độ; muốn đổi sang Gemini/Groq (free tier) thì chọn ở đây

3) KỸ NĂNG THÀNH DROPDOWN + CHỢ KỸ NĂNG
• Dãy chip cũ → dropdown top 10, có icon + mô tả từng kỹ năng
• Nút "Thêm kỹ năng…" mở chợ kỹ năng: chọn/bỏ, đếm n/10, giữ thứ tự
• Danh sách theo TỪNG người dùng; mặc định nhận đủ 5 kỹ năng đang chạy
• Đã chừa sẵn 4 mục "Sắp có": Kỹ năng từ MCP server · Xử lý tài liệu · Dịch tài liệu · Kỹ năng riêng của công ty
• Thêm kỹ năng mới sau này KHÔNG cần sửa server

4) ĐÃ SỬA
• Vỡ layout lịch sử hội thoại khi tiêu đề dài (đo thật: 0px tràn ngang, cắt bằng ellipsis)
• Lỗi 500 khi upload sai tên field → nay trả 400 kèm hướng dẫn

BẰNG CHỨNG
• 93/93 test tự động pass
• Kiểm chứng trong trình duyệt thật: dropdown + chợ kỹ năng (bỏ/thêm/lưu đúng), voice mode vào trạng thái
  "Đang nghe…", tab Giọng nói, chat tạo file PPTX 64,9 KB tải được — 0 exception
• Production: https://fbuddy.meetflowai.site (asset khớp đúng bản build)
MSG
)

curl -sS -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -d "chat_id=${CHAT}" -d "disable_web_page_preview=true" \
  --data-urlencode "text=${TEXT}" \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); print("telegram sent:", d.get("ok"), d.get("result",{}).get("message_id") or d.get("description"))'
