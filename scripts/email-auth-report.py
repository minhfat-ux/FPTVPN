#!/usr/bin/env python3
"""Gửi 1 mail test từ control plane rồi đọc báo cáo xác thực (SPF/DKIM/DMARC).

Chạy TRÊN VPS (nơi có env của service + hộp thư nhận trả lời):

    cd /root/flowvpn-cp && python3 scripts/email-auth-report.py

Cách hoạt động: gửi 1 thư tới check-auth@verifier.port25.com bằng đúng transport
mà service đang dùng (Resend nếu có RESEND_API_KEY, ngược lại SMTP), rồi đăng
nhập IMAP của hộp thư gửi để đọc báo cáo trả về và in ra các dòng kết quả.

Dùng sau mỗi lần đổi DNS (DKIM/SPF/DMARC) hoặc đổi nhà cung cấp gửi mail.
"""
import email
import email.utils
import imaplib
import os
import re
import subprocess
import sys
import time

VERIFIER = "check-auth@verifier.port25.com"
WAIT_SECONDS = int(os.environ.get("AUTH_TEST_WAIT", "110"))


def service_env():
    """Đọc env thật của tiến trình service (có SMTP_*/RESEND_*/...)."""
    env = {}
    pids = subprocess.run(["pgrep", "-f", "src/index.js"], capture_output=True, text=True).stdout.split()
    for pid in pids:
        try:
            with open(f"/proc/{pid}/environ", "rb") as fh:
                raw = fh.read()
        except OSError:
            continue
        for kv in raw.split(b"\0"):
            if b"=" in kv:
                key, value = kv.split(b"=", 1)
                env[key.decode()] = value.decode()
        if env.get("SMTP_USER"):
            break
    return env


def send_test(env):
    """Gửi thư test qua mailer của control plane (đúng transport đang dùng)."""
    script = """
import { sendAiInvoiceEmail, mailTransportName } from "./src/mailer.js";
console.log("transport:", mailTransportName());
const r = await sendAiInvoiceEmail({ to: process.argv[2], lang: "vi", orderCode: 0,
  planLabel: "auth check", amount: 0, days: 1, activatedAt: new Date().toISOString(),
  expiresAt: null, guideUrl: "https://meetflowai.site/ai/guide" });
console.log("send:", JSON.stringify(r));
"""
    helper = "/root/flowvpn-cp/_auth_send.mjs"
    open(helper, "w").write(script)
    run = subprocess.run(
        ["node", helper, VERIFIER],
        cwd="/root/flowvpn-cp",
        capture_output=True,
        text=True,
        env={**os.environ, **env},
    )
    print((run.stdout or run.stderr).strip()[:400])


def fetch_report(env, since_ts):
    host = env.get("SMTP_HOST", "")
    if not host or not env.get("SMTP_USER"):
        print("Không đọc được SMTP_HOST/SMTP_USER của service → không lấy được báo cáo.")
        return 1
    box = imaplib.IMAP4_SSL(host, 993)
    box.login(env["SMTP_USER"], env["SMTP_PASS"])
    box.select("INBOX")
    deadline = time.time() + 240
    msg = None
    while time.time() < deadline:
        _, data = box.search(None, "FROM", "verifier.port25.com")
        ids = data[0].split()
        for mid in reversed(ids[-5:]):
            _, msg_data = box.fetch(mid, "(RFC822)")
            candidate = email.message_from_bytes(msg_data[0][1])
            try:
                sent = email.utils.parsedate_to_datetime(candidate["Date"]).timestamp()
            except Exception:
                sent = 0
            if sent >= since_ts - 180:      # báo cáo cho thư vừa gửi
                msg = candidate
                break
        if msg:
            break
        time.sleep(20)
    if msg is None:
        print("Không thấy báo cáo mới (kiểm tra lại transport/log gửi mail).")
        box.logout()
        return 1
    body = ""
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() == "text/plain":
                body += part.get_payload(decode=True).decode(errors="replace")
    else:
        body = msg.get_payload(decode=True).decode(errors="replace")
    wanted = re.compile(r"SPF check|DKIM check|DMARC|iprev|SpamAssassin|Result:|NXDOMAIN|doesn't exist", re.I)
    for line in body.splitlines():
        if wanted.search(line):
            print("   ", line.strip()[:130])
    box.logout()
    return 0


def main():
    env = service_env()
    print(f"transport sẽ dùng: {'resend' if env.get('RESEND_API_KEY') else 'smtp'}")
    import time as _time
    sent_at = _time.time()
    send_test(env)
    print(f"chờ {WAIT_SECONDS}s để dịch vụ kiểm tra trả lời...")
    time.sleep(WAIT_SECONDS)
    return fetch_report(env, sent_at)


if __name__ == "__main__":
    sys.exit(main())
