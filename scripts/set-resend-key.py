#!/usr/bin/env python3
"""Bật/tắt gửi mail qua Resend trên VPS (chạy TRÊN VPS, key đọc từ stdin).

    echo "re_xxx" | python3 scripts/set-resend-key.py     # bật Resend
    python3 scripts/set-resend-key.py --clear             # quay lại SMTP

Ghi key vào systemd drop-in (không vào git), reload + restart service rồi in ra
transport đang dùng. Key không xuất hiện trong tham số dòng lệnh.
"""
import re
import subprocess
import sys
import time

DROPIN = "/etc/systemd/system/flowvpn-cp.service.d/store-urls.conf"
LINE_RE = re.compile(r"^Environment=\"?RESEND_API_KEY=")


def read_dropin():
    with open(DROPIN, encoding="utf-8") as fh:
        return fh.read().split("\n")


def write_dropin(lines):
    with open(DROPIN, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))


def set_key(key):
    lines = [l for l in read_dropin() if not LINE_RE.match(l)]
    while lines and lines[-1].strip() == "":
        lines.pop()
    lines.append("")
    lines.append("# Gửi mail qua Resend (ký DKIM bằng meetflowai.site). Xoá dòng này để quay lại SMTP.")
    lines.append(f'Environment="RESEND_API_KEY={key}"')
    write_dropin(lines + [""])
    print("đã ghi RESEND_API_KEY vào drop-in")


def clear_key():
    lines = [l for l in read_dropin() if not LINE_RE.match(l)]
    write_dropin(lines)
    print("đã xoá RESEND_API_KEY (quay lại SMTP)")


def restart_and_report():
    subprocess.run(["systemctl", "daemon-reload"], check=True)
    subprocess.run(["systemctl", "restart", "flowvpn-cp"], check=True)
    time.sleep(4)  # để service ghi log khởi động mới
    out = subprocess.run(
        ["systemctl", "is-active", "flowvpn-cp"], capture_output=True, text=True
    ).stdout.strip()
    print("service:", out)
    log = subprocess.run(
        ["journalctl", "-u", "flowvpn-cp", "-n", "80", "--no-pager"],
        capture_output=True,
        text=True,
    ).stdout
    lines = [l for l in log.splitlines() if "mail transport" in l]
    if lines:
        print("   ", lines[-1].split(":", 2)[-1].strip())


def main():
    if "--clear" in sys.argv:
        clear_key()
    else:
        key = sys.stdin.read().strip()
        if not key.startswith("re_"):
            print("Key không hợp lệ (phải bắt đầu bằng re_)")
            return 2
        set_key(key)
    restart_and_report()
    print("\nKiểm tra xác thực:  cd /root/flowvpn-cp && python3 scripts/email-auth-report.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
