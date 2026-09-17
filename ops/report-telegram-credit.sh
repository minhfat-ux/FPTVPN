#!/usr/bin/env bash
# Report: credit metering explained (formula + real numbers) + assistant now teaches credit policy.
set -euo pipefail
set -a
# shellcheck disable=SC1091
. /etc/flowvpn-tg-bot.env
set +a

CHAT=$(printf '%s' "${TELEGRAM_ALLOWED_CHATS:-${TELEGRAM_CHAT_ID:-}}" | cut -d, -f1 | tr -d ' ')
[ -n "${CHAT:-}" ] || { echo "Không có chat id"; exit 1; }

TEXT=$(cat <<'MSG'
💳 fBuddy — credit: cách tính, vì sao tốn, và trợ lý đã biết giải thích

1) CÁCH TÍNH (đang chạy đúng như này)
• 1 credit = 1 token, tính theo tổng token VÀO + token RA của mỗi lượt (kiểu ChatGPT)
• Công thức: credit bị trừ = (token vào + token ra) × 1, làm tròn lên, tối thiểu 1 credit/lượt
• Tài khoản mới: tặng 10.000 credit ngay lần đăng nhập đầu
• Sổ cái append-only, mỗi bút toán lưu số dư sau khi trừ → tra được từng đồng credit
• Admin không bị chặn khi hết credit nhưng VẪN bị trừ như thường

2) VÌ SAO 3 CÂU CHAT HẾT 5.510 CREDIT (số thật lấy từ DB)
• 1.906 + 1.831 + 1.773 = 5.510 credit, khớp đúng công thức
• Nguyên nhân: mỗi request phải gửi lại TOÀN BỘ schema 6 công cụ
• Đo thật trên GLM-4-Flash, cùng câu "chào em":
   - có công cụ: 1.707 token | chỉ system prompt: 114 token | chỉ câu hỏi: 8 token
   → ~93% chi phí một lượt chat là phần định nghĩa công cụ
• Hội thoại càng dài càng tốn vì gửi lại tối đa 24 message ngữ cảnh

3) ĐÃ SỬA: TRỢ LÝ KHÔNG CÒN NÓI "MIỄN PHÍ"
• System prompt trước đây không hề nhắc credit → hỏi thì trả lời kiểu "fBuddy miễn phí"
• Nay mỗi lượt đều có khối số liệu thật: công thức, mức tặng, SỐ DƯ / ĐÃ DÙNG / TRUNG BÌNH MỖI LƯỢT
  của chính người đang hỏi, kèm đường đi tới nút "Xin thêm token" và "Mua thêm token"
• Kiểm chứng thật trên production (tài khoản mới, hỏi "fBuddy có miễn phí không? credit tính sao?"):
  trả lời đúng "fBuddy không phải là miễn phí", nêu công thức, nêu 10.000 credit được tặng,
  chỉ đúng ảnh đại diện → "Xin thêm token", và link trang nạp credit
• Trang Nạp token có thêm 2 khối hướng dẫn: "Credit được cấp và tính như thế nào?" và
  "Cách xin thêm token hoặc mua thêm credit" (từng bước, có ảnh VietQR)

4) ĐÃ SỬA THÊM
• Lỗi thật: công cụ phân tích dữ liệu op "filter" LUÔN lỗi (đọc nhầm tham số) → đã sửa + test hồi quy
• 133/133 test pass; đã deploy https://fbuddy.meetflowai.site

5) CẦN ANH QUYẾT
• Nạp tiền chưa chạy được vì CHƯA CÓ số tài khoản ngân hàng: cần STK + tên chủ tài khoản (+ ngân hàng)
  thì ảnh VietQR mới hiện
• Muốn chat rẻ hơn thì chọn: hạ hệ số credit (1 credit = 5-10 token), tăng credit tặng,
  hay tối ưu gửi công cụ theo kiểu "lazy" (tiết kiệm ~80% nhưng lượt cần tạo tệp thêm 1 vòng gọi)
MSG
)

curl -sS -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -d "chat_id=${CHAT}" -d "disable_web_page_preview=true" \
  --data-urlencode "text=${TEXT}" \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); print("telegram sent:", d.get("ok"), d.get("result",{}).get("message_id") or d.get("description"))'
