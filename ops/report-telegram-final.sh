#!/usr/bin/env bash
# fBuddy status report to the project Telegram channel.
# Reads the bot token from the existing tg-bot env file; the token is never printed.
set -euo pipefail
set -a
# shellcheck disable=SC1091
. /etc/flowvpn-tg-bot.env
set +a

CHAT=$(printf '%s' "${TELEGRAM_ALLOWED_CHATS:-${TELEGRAM_CHAT_ID:-}}" | cut -d, -f1 | tr -d ' ')
if [ -z "${CHAT:-}" ]; then echo "Không có chat id trong env"; exit 1; fi

TEXT=$(cat <<'MSG'
✅ fBuddy — ĐÃ LÊN PRODUCTION: https://fbuddy.meetflowai.site

ĐANG CHẠY
• Model mặc định: DeepSeek (deepseek-chat) — đã test thật: trả lời 834ms, streaming tiếng Việt OK
• Đăng nhập: mã 6 số gửi qua email (Resend đã bật, mail "delivered"), magic link dùng được
• Tài khoản: minhnb2@fpt.com = admin (đã đăng nhập thành công theo log)
• 4 skill chạy thật: sửa ảnh (AI + canvas), tạo PPTX, tạo XLSX, phân tích dữ liệu
• Cài đặt backend: Nhà cung cấp AI + MCP server (stdio/http/sse) — tab "MCP server" trong Cài đặt
• Theme + logo FlowTech (navy #0A1F3B, green #33C773)

BẰNG CHỨNG
• 64/64 test tự động pass (tạo .pptx/.xlsx byte thật, MCP CRUD, phân quyền, rate limit)
• Smoke qua domain công khai: 7/7 bước ĐẠT (tải được pptx 55KB hợp lệ)
• Test với DeepSeek thật: model tự gọi tool generate_pptx, tạo file 58KB tải về hợp lệ
• Kiểm tra UI bằng trình duyệt (headless): login → chat → Studio → Settings, 0 exception

ĐÃ SỬA (bug thật, có bằng chứng)
• Login bằng mã bị 401 do auto-submit gửi mã thiếu 1 ký tự (anh gặp) — đã sửa + test lại OK
• Chat mất câu trả lời khi model trả lời nhanh (stale state) — đã sửa
• Chế độ "Trò chuyện" không được cấp tool nên "làm slide" báo không khả dụng — đã sửa
• Thẻ tệp bị lặp, magic link không đổi tài khoản, 3 bug backend do test bắt được

CÒN LẠI
• SSO Firebase/Facebook: chừa sẵn chỗ, sẽ bật sau
• Nên thử tay Image Studio và một MCP server http/sse thật

LƯU Ý HẠ TẦNG (có sẵn, không do fBuddy)
• dhs.meetflowai.site và dhs-win.meetflowai.site KHÔNG có bản ghi DNS
• meetflowai.site/ trả 404 vì thiếu index.html trong /var/www/flowvpn

Chi tiết: fbuddy/docs/HANDOVER.md
MSG
)

curl -sS -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -d "chat_id=${CHAT}" \
  -d "disable_web_page_preview=true" \
  --data-urlencode "text=${TEXT}" \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); print("telegram sent:", d.get("ok"), d.get("result",{}).get("message_id") or d.get("description"))'
