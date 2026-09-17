#!/usr/bin/env python3
"""
Gửi một tin nhắn Telegram **byte-exact** từ file UTF-8.

    python3 ops/send-telegram.py <file.txt>

Vì sao không dùng bash + --data-urlencode "text=$TEXT": chuỗi đi qua nhiều lớp
(PowerShell → base64 → bash → curl) rất dễ bị đổi mã hoá. Ở đây Python đọc file
UTF-8, URL-encode đúng chuỗi đó và **so lại nội dung Telegram trả về** để chứng minh
không mất dấu tiếng Việt.

Bot token + chat id đọc từ /etc/flowvpn-tg-bot.env (không in ra).
"""

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

ENV_FILE = os.environ.get("FBUDDY_TG_ENV", "/etc/flowvpn-tg-bot.env")


def load_env(path):
    values = {}
    try:
        with open(path, encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                values[key.strip()] = value.strip().strip('"').strip("'")
    except OSError as err:
        print(f"Không đọc được {path}: {err}")
        sys.exit(1)
    return values


def main():
    if len(sys.argv) < 2:
        print("Dùng: python3 ops/send-telegram.py <file.txt>")
        sys.exit(2)
    path = sys.argv[1]
    try:
        with open(path, encoding="utf-8") as handle:
            text = handle.read()
    except OSError as err:
        print(f"Không đọc được {path}: {err}")
        sys.exit(1)

    text = text.lstrip("\ufeff").replace("\r\n", "\n").replace("\r", "\n").rstrip()
    if len(text) > 4000:
        print(f"Cảnh báo: tin nhắn {len(text)} ký tự, Telegram giới hạn 4096 — sẽ cắt bớt.")
        text = text[:4000] + "…"

    env = {**load_env(ENV_FILE), **os.environ}
    token = env.get("TELEGRAM_BOT_TOKEN")
    chat = (env.get("TELEGRAM_ALLOWED_CHATS") or env.get("TELEGRAM_CHAT_ID") or "").split(",")[0].strip()
    if not token or not chat:
        print("Thiếu TELEGRAM_BOT_TOKEN hoặc chat id")
        sys.exit(1)

    payload = urllib.parse.urlencode(
        {"chat_id": chat, "disable_web_page_preview": "true", "text": text}
    ).encode("utf-8")
    request = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/sendMessage", data=payload
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            result = json.load(response)
    except urllib.error.HTTPError as err:
        print(f"Telegram từ chối: HTTP {err.code} {err.read()[:200]!r}")
        sys.exit(1)
    except Exception as err:  # noqa: BLE001 - báo lỗi thật cho người chạy
        print(f"Không gửi được: {err}")
        sys.exit(1)

    print(f"telegram sent: {result.get('ok')} id={result.get('result', {}).get('message_id')}")
    print(f"ký tự gửi: {len(text)} | ký tự Telegram nhận: {len(result.get('result', {}).get('text', ''))}")
    sent = result.get("result", {}).get("text", "")
    if sent == text:
        print("khớp nội dung: True (không mất dấu tiếng Việt)")
    else:
        print("khớp nội dung: False — LỆCH MÃ HOÁ")
        print(f"  gửi : {text[:120]!r}")
        print(f"  nhận: {sent[:120]!r}")
        sys.exit(1)


if __name__ == "__main__":
    main()
