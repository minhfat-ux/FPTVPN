#!/usr/bin/env bash
# Report: GLM default + provider failover.
set -euo pipefail
set -a
# shellcheck disable=SC1091
. /etc/flowvpn-tg-bot.env
set +a

CHAT=$(printf '%s' "${TELEGRAM_ALLOWED_CHATS:-${TELEGRAM_CHAT_ID:-}}" | cut -d, -f1 | tr -d ' ')
[ -n "${CHAT:-}" ] || { echo "Không có chat id"; exit 1; }

TEXT=$(cat <<'MSG'
🤖 FlowGpt — đã chuyển mặc định sang GLM (Zhipu)

TRẠNG THÁI HIỆN TẠI
• Mặc định: GLM · glm-4-flash (đã test thật: 1,7s + streaming tiếng Việt OK)
• Tool calling chạy: đã tạo được file PPTX 64 KB qua công cụ generate_pptx
• Dự phòng: DeepSeek và OpenRouter vẫn bật

PHÁT HIỆN VỀ KEY GLM (quan trọng)
• Key hợp lệ, tài khoản thấy 10 model: glm-4.5 · 4.5-air · 4.6 · 4.7 · 5 · 5-turbo · 5.1 · 5.2 · 5.3 · 5.3-flash
• NHƯNG: glm-4.6, 4.7, 5.x đều trả 429 "余额不足或无可用资源包,请充值" = số dư/gói tài nguyên chưa có
• CHỈ 2 model chạy miễn phí trên key này:
   - glm-4-flash  ~1,7 giây
   - glm-4.5-air  ~0,43 giây  ← nhanh gấp 4 lần, mới hơn; nên cân nhắc đổi mặc định sang model này
• Muốn dùng model 5.x thì nạp tiền/gói tại bigmodel.cn, sau đó chỉ cần chọn lại trong Cài đặt

CƠ CHẾ AN TOÀN MỚI (để mặc định hỏng không làm chết app)
• Nếu provider mặc định hết tiền / sai key / bị rate-limit, lượt chat TỰ CHUYỂN sang provider
  còn dùng được, kèm thông báo giải thích cho người dùng
• Nút "Đặt mặc định" ở từng nhà cung cấp trong Cài đặt → Nhà cung cấp AI

BẰNG CHỨNG
• 96/96 test tự động pass (thêm bộ test riêng cho việc tự chuyển provider)
• Verify trên chính production: lượt chat thật qua GLM trả lời 539 ký tự; lượt yêu cầu tạo file
  trả về artifact PPTX 64.050 byte hợp lệ (magic PK), tài khoản test đã tự dọn sau khi kiểm tra
MSG
)

curl -sS -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -d "chat_id=${CHAT}" -d "disable_web_page_preview=true" \
  --data-urlencode "text=${TEXT}" \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); print("telegram sent:", d.get("ok"), d.get("result",{}).get("message_id") or d.get("description"))'
