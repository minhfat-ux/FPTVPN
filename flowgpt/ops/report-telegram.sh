#!/usr/bin/env bash
# One-off status report for the FlowGpt build. Reads the bot token from the
# existing tg-bot env file; the token is never printed.
set -euo pipefail
set -a
# shellcheck disable=SC1091
. /etc/flowvpn-tg-bot.env
set +a

CHAT=$(printf '%s' "${TELEGRAM_ALLOWED_CHATS:-${TELEGRAM_CHAT_ID:-}}" | cut -d, -f1 | tr -d ' ')
if [ -z "${CHAT:-}" ]; then echo "Không có chat id trong env"; exit 1; fi

TEXT=$(cat <<'MSG'
🚀 FlowGpt — báo cáo tiến độ (DSH Windows)

ĐÃ XONG
• Backend Node/Express + SQLite: chat streaming (SSE), tool-calling, artifact tải về
• Đăng nhập mới: mã 6 số / magic link gửi qua email (passwordless), chưa cần mật khẩu; chừa sẵn chỗ SSO Firebase + Facebook
• Cấu hình từ backend: nhà cung cấp AI (Gemini/OpenAI/Claude/OpenAI-compatible/Demo) + MCP server (stdio/http/sse), key mã hoá AES-256-GCM
• 4 skill chạy thật: tạo .pptx, tạo .xlsx, phân tích dữ liệu CSV/Excel (thống kê/nhóm/top/tương quan/biểu đồ), sửa ảnh AI
• Test tự động: 62/62 pass — có ca tạo file pptx/xlsx thật, MCP CRUD, rate limit, phân quyền

ĐANG LÀM
• UI Chat + Studio (Image Studio canvas, PPT/Excel builder, DataLab) — 3 luồng chạy song song
• UI Cài đặt đã xong (provider, MCP, email, người dùng)
• Theme đã áp palette FlowTech Harness (navy #0A1F3B + green #33C773) và logo FlowTech

CẦN ANH XÁC NHẬN
• Thêm bản ghi DNS: A  flowgpt  →  165.101.114.162  (Cloudflare, Proxied) để Caddy xin được cert cho flowgpt.meetflowai.site

TIẾP THEO
• Build web → deploy node-2: systemd flowgpt (port 7790) + block Caddy flowgpt.meetflowai.site
• Sau đó: anh vào /settings dán API key (hoặc bật provider Demo để thử ngay) và kết nối Resend để gửi mã đăng nhập thật
MSG
)

curl -sS -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -d "chat_id=${CHAT}" \
  -d "disable_web_page_preview=true" \
  --data-urlencode "text=${TEXT}" \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); print("telegram sent:", d.get("ok"), d.get("result",{}).get("message_id") or d.get("description"))'
