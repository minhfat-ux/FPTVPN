#!/usr/bin/env bash
# Wire the Telegram bot into FlowGpt so token requests reach the owner, then fire
# one real demo request through the API. Secrets are never printed.
set -euo pipefail

ENV_FILE=/etc/flowgpt/flowgpt.env
TG_ENV=/etc/flowvpn-tg-bot.env

TOKEN=$(grep -hoP '^TELEGRAM_BOT_TOKEN=\K.*' "$TG_ENV" 2>/dev/null | tr -d '"' | tr -d "'" | head -1 || true)
CHATS=$(grep -hoP '^TELEGRAM_ALLOWED_CHATS=\K.*' "$TG_ENV" 2>/dev/null | tr -d '"' | tr -d "'" | head -1 || true)
CHAT_ID=$(printf '%s' "${CHATS:-}" | cut -d, -f1 | tr -d ' ')

if [ -z "${TOKEN:-}" ] || [ -z "${CHAT_ID:-}" ]; then
  echo "Không lấy được token/chat id từ $TG_ENV"
  exit 1
fi
echo "Đã lấy bot token (len ${#TOKEN}) và chat id (len ${#CHAT_ID}) — không in giá trị"

grep -v '^FLOWGPT_TELEGRAM_BOT_TOKEN=' "$ENV_FILE" | grep -v '^FLOWGPT_TELEGRAM_CHAT_ID=' > "$ENV_FILE.tmp" 2>/dev/null || true
{
  printf 'FLOWGPT_TELEGRAM_BOT_TOKEN=%s\n' "$TOKEN"
  printf 'FLOWGPT_TELEGRAM_CHAT_ID=%s\n' "$CHAT_ID"
} >> "$ENV_FILE.tmp"
install -m 600 "$ENV_FILE.tmp" "$ENV_FILE"
rm -f "$ENV_FILE.tmp"
echo "Đã ghi 2 biến Telegram vào $ENV_FILE (mode $(stat -c %a "$ENV_FILE"))"

systemctl restart flowgpt
sleep 3
systemctl is-active flowgpt

echo
echo "== gửi thử một yêu cầu xin token qua API =="
python3 - <<'PY'
import json, subprocess, secrets, urllib.request

BASE = "http://127.0.0.1:7790/api"

def call(method, path, body=None, token=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            return res.status, json.loads(res.read().decode() or "{}")
    except urllib.error.HTTPError as err:
        return err.code, json.loads(err.read().decode() or "{}")

email = "demo-token-request@flowgpt.local"
status, requested = call("POST", "/auth/request-token", {"email": email})
code = requested.get("devCode")
status, verified = call("POST", "/auth/verify-token", {"email": email, "token": code})
token = verified.get("token")
print("  tài khoản demo:", email, "| đăng nhập:", bool(token))

status, result = call("POST", "/credits/request", {"amount": 10000, "note": "Em thử luồng xin token ạ"}, token)
print("  HTTP", status)
print("  trạng thái yêu cầu:", result.get("request", {}).get("status"))
telegram = result.get("telegram", {})
print("  Telegram đã gửi:", telegram.get("sent"), telegram.get("message") or f"message_id={telegram.get('messageId')}")
PY
