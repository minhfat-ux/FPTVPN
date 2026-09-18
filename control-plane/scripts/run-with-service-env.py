#!/usr/bin/env python3
"""Chạy một script Node bằng ĐÚNG env của systemd unit (đọc unit + mọi drop-in).

Vì sao cần: các biến như `RESEND_API_KEY`, `SMTP_PASS`, `DEV_LOGIN_CODE`, `VND_PER_CNY` chỉ nằm
trong systemd (unit + `/etc/systemd/system/<unit>.service.d/*.conf`), không có trong shell. Chạy
script kiểm tra bằng env này thì hành vi giống hệt tiến trình đang phục vụ khách.

    python3 scripts/run-with-service-env.py /root/flowvpn-cp/scripts/check-mail-langs.mjs no-reply@meetflowai.site zh --only=otp

⚠️ Mọi tham số sau tên script được **chuyển tiếp nguyên vẹn** cho node. (Bản cũ trong /tmp chỉ lấy
argv[1] nên tham số bị mất → script chạy với giá trị mặc định, ví dụ gửi cả 18 email thay vì 1.)
"""
import glob
import os
import shlex
import sys

UNIT = os.environ.get("SERVICE_UNIT", "flowvpn-cp")
SERVICE_DIR = "/etc/systemd/system"

ENV = dict(os.environ)


def apply_line(line: str) -> None:
    line = line.strip()
    if not line.startswith("Environment="):
        return
    value = line[len("Environment="):]
    parts = shlex.split(value) if value.startswith('"') else [value]
    for part in parts:
        if "=" in part:
            key, val = part.split("=", 1)
            ENV[key] = val


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2

    unit_file = f"{SERVICE_DIR}/{UNIT}.service"
    paths = [unit_file] + sorted(glob.glob(f"{SERVICE_DIR}/{UNIT}.service.d/*.conf"))
    for path in paths:
        if not os.path.isfile(path):
            continue
        with open(path, encoding="utf-8") as handle:
            for raw in handle:
                apply_line(raw)

    ENV.setdefault("NODE_ENV", "production")
    workdir = os.environ.get("SERVICE_WORKDIR", "/root/flowvpn-cp")
    if os.path.isdir(workdir):
        os.chdir(workdir)

    script = sys.argv[1]
    forwarded = sys.argv[2:]
    print(f"[env] unit={UNIT} mail={'resend' if ENV.get('RESEND_API_KEY') else 'smtp'} "
          f"args={' '.join(forwarded) if forwarded else '(không có)'}")
    os.execvpe("node", ["node", script, *forwarded], ENV)
    return 0


if __name__ == "__main__":
    sys.exit(main())
