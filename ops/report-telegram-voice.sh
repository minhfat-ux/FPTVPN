#!/usr/bin/env bash
# Voice feature report to the project Telegram channel.
set -euo pipefail
set -a
# shellcheck disable=SC1091
. /etc/flowvpn-tg-bot.env
set +a

CHAT=$(printf '%s' "${TELEGRAM_ALLOWED_CHATS:-${TELEGRAM_CHAT_ID:-}}" | cut -d, -f1 | tr -d ' ')
[ -n "${CHAT:-}" ] || { echo "Không có chat id"; exit 1; }

TEXT=$(cat <<'MSG'
🎙 fBuddy — đã có NÓI CHUYỆN BẰNG GIỌNG NÓI (bản miễn phí 100%)

CÁCH DÙNG (không cần key, không tốn phí)
• Nút micro trong ô chat: nói → chữ tự hiện vào ô chat
• Nút "Nói chuyện": chế độ rảnh tay — anh nói, máy trả lời bằng giọng nói, rồi tự nghe tiếp
• Nút loa ở mỗi câu trả lời: đọc to câu đó
• Cài đặt → Giọng nói: chọn ngôn ngữ, giọng đọc, tốc độ, "tự đọc mọi câu trả lời"

CHẤT LƯỢNG MIỄN PHÍ
• Nhận dạng: Web Speech API của trình duyệt (tiếng Việt)
• Giọng đọc: trên Microsoft Edge có sẵn 2 giọng tiếng Việt natural MIỄN PHÍ — Microsoft Hoài My và Nam Minh.
  Trên Chrome cần cài thêm gói giọng nói tiếng Việt của Windows.
• Chống vọng tiếng (echoCancellation) + tự dừng đọc khi anh nói (barge-in)

SO SÁNH CHI PHÍ (giá công bố 2026)
• Trình duyệt: $0
• Soniox: STT $0,12/giờ + TTS ~$0,70/giờ  ← rẻ nhất trong nhóm API
• Gemini Live: ~$1,38/giờ
• OpenAI Realtime-2: ~$6–18/giờ
→ Đang để mặc định $0; muốn chất lượng đồng nhất mọi máy thì trỏ STT/TTS sang provider
  (Gemini hoặc Groq đều có free tier) trong Cài đặt → Giọng nói, không cần sửa code.

KỸ THUẬT
• Backend: /api/voice/config, /api/voice/transcribe, /api/voice/speech, /api/settings/voice/test
• Adapter: Gemini (audio in + TTS, PCM bọc thành WAV) và OpenAI-compatible (Groq whisper, OpenAI tts-1)
• Test: 77/77 ca pass, gồm cả hình dạng request của từng provider (test bằng fetch giả, không tốn tiền API)

ĐỒNG THỜI ĐÃ SỬA
• Lỗi vỡ layout lịch sử hội thoại khi tiêu đề dài (đã đo: 0px tràn ngang, tiêu đề cắt bằng ellipsis)
MSG
)

curl -sS -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -d "chat_id=${CHAT}" -d "disable_web_page_preview=true" \
  --data-urlencode "text=${TEXT}" \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); print("telegram sent:", d.get("ok"), d.get("result",{}).get("message_id") or d.get("description"))'
