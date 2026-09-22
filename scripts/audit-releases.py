#!/usr/bin/env python3
"""Audit TOÀN BỘ kênh phát hành: mỗi nền tảng phải đang phục vụ ĐÚNG bản latest.

Chủ dự án yêu cầu (22/09/2026): *"kiểm tra lại các bản release, nếu bản nào đã release chưa phải
latest thì phải update lại link download và gửi thông báo cho khách"*.

Vì sao phải TẢI file thật rồi đọc version BÊN TRONG: đã hai lần suýt/kịp phát hiện sai lệch mà
nhìn bề ngoài không thấy —
  · Windows 1.4.1: installer tên `VPNFlow-Setup-1.4.1.exe` nhưng app bên trong khai `FileVersion 1.0.0.0`;
  · iOS 1.4.0/16: profile cấp nhóm keychain wildcard `G6XW3RN6LJ.*` thay vì nhóm cụ thể `.shared`;
  · macOS: `spctl` báo Notarized nhưng DMG chưa staple ⇒ khách "không thể mở".
Không tin tên file, không tin size, không tin nhật ký.

Dùng:
  python3 scripts/audit-releases.py                 # tải từng artifact thật rồi đối chiếu mốc
  python3 scripts/audit-releases.py --no-download   # chỉ đối chiếu mốc + size (nhanh, ít chắc hơn)
  python3 scripts/audit-releases.py --platform ios  # một nền tảng
  python3 scripts/audit-releases.py --json          # máy đọc

Health-watch định kỳ (PUBLISHER_PROCESS §7 mục 5) — chạy nền, ghi log JSONL, gọi alert khi LỆCH:
  python3 scripts/audit-releases.py --interval 21600 \
      --log ~/.vpnflow-release-audit.jsonl \
      --alert-cmd 'cat | scripts/notify/flowvpn-notify --from mac --to all --topic "Release LỆCH"'
  # JSON kết quả được đưa vào stdin của --alert-cmd; env AUDIT_EXIT/AUDIT_VERDICT/AUDIT_BASE kèm theo.

Mã thoát: 0 = mọi kênh khớp · 1 = có kênh LỆCH (phải cập nhật link + thông báo khách) · 2 = có
kênh KHÔNG KIỂM ĐƯỢC trên máy này (macOS cần chạy trên máy Mac, APK cần aapt2).
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone

# Nạp lại chính bộ đọc artifact của cổng chặn (tên file có gạch ngang nên phải import bằng spec).
_HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("cpv", os.path.join(_HERE, "check-publish-version.py"))
cpv = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(cpv)

# Nền tảng → (route tải, tên hiển thị). Windows phát theo tên file nên dựng URL riêng.
PLATFORMS = [
    ("windows", "Windows (Setup .exe)"),
    ("ios", "iOS (IPA Ad Hoc)"),
    ("macos", "macOS (DMG)"),
    ("android", "Android (APK modern)"),
    ("android-legacy", "Android (APK legacy)"),
]


def read_internal(platform: str, version: str) -> tuple:
    """Tải artifact đang phát rồi đọc version BÊN TRONG. Trả (info, lỗi)."""
    if platform == "windows":
        url = f"{cpv.BASE}" + cpv.WINDOWS_DL.format(name=f"VPNFlow-Setup-{version}.exe")
    else:
        url = f"{cpv.BASE}" + cpv.DOWNLOAD_ROUTES[platform]
    # Giữ ĐUÔI theo nền tảng (cpv.ARTIFACT_SUFFIX): `stapler validate` phân loại file theo đuôi,
    # nên DMG lưu không đuôi bị từ chối và audit báo LỆCH OAN cho macOS (đã gặp thật 22/09/2026).
    target = os.path.join(
        cpv.tempfile.gettempdir(),
        f"audit-{platform}{cpv.ARTIFACT_SUFFIX.get(platform, '')}",
    )
    try:
        request = cpv.urllib.request.Request(url, headers={"User-Agent": cpv.UA})
        with cpv.open_url(request, timeout=900) as response, open(target, "wb") as handle:
            cpv.shutil.copyfileobj(response, handle, length=1024 * 1024)
    except Exception as exc:  # noqa: BLE001 — audit không được chết vì 1 kênh
        return None, f"tải lỗi: {exc}"
    info = cpv.READERS[platform](target)
    info["_size"] = os.path.getsize(target)
    return info, info.get("error")


def run_once(args) -> tuple[int, list]:
    """Chạy một vòng audit. Trả (mã thoát, các dòng kết quả)."""
    rows = []
    for platform, label in PLATFORMS:
        if args.platform and args.platform != platform:
            continue
        latest, error = cpv.marker_latest(platform)
        row = {"platform": platform, "label": label, "marker": latest, "marker_error": error, "internal": None, "verdict": "", "note": ""}
        if error:
            row["verdict"] = "KHÔNG KIỂM ĐƯỢC"
            row["note"] = f"đọc mốc lỗi: {error}"
            rows.append(row)
            continue
        if args.no_download:
            if platform == "windows":
                probe = cpv.http_head(f"{cpv.BASE}" + cpv.WINDOWS_DL.format(name=f"VPNFlow-Setup-{latest}.exe"))
            else:
                probe = cpv.http_head(f"{cpv.BASE}" + cpv.DOWNLOAD_ROUTES[platform])
            row["verdict"] = "CHƯA ĐỐI CHIẾU" if "__error__" not in probe else "KHÔNG KIỂM ĐƯỢC"
            row["note"] = f"HTTP {probe.get('status', '?')} · {probe.get('length', 0)} byte (không tải để đọc version)"
            rows.append(row)
            continue

        info, read_error = read_internal(platform, latest or "")
        if info is None or read_error:
            row["verdict"] = "KHÔNG KIỂM ĐƯỢC"
            row["note"] = read_error or "không đọc được version bên trong"
            rows.append(row)
            continue
        internal = info.get("version")
        row["internal"] = internal
        row["build"] = info.get("build")
        if cpv.norm(internal) == cpv.norm(latest):
            row["verdict"] = "KHỚP"
            extra = []
            if info.get("keychain_missing"):
                row["verdict"] = "LỆCH"
                extra.append(f"keychain profile thiếu {info['keychain_missing']}")
            if info.get("staple_ok") is False:
                row["verdict"] = "LỆCH"
                extra.append("DMG chưa staple")
            if info.get("spctl_ok") is False:
                row["verdict"] = "LỆCH"
                extra.append("spctl chặn")
            row["note"] = "; ".join(extra) if extra else "bản phát = mốc"
        else:
            row["verdict"] = "LỆCH"
            row["note"] = f"đang phát {internal} nhưng mốc latest_version = {latest} ⇒ phải cập nhật link + thông báo khách"
        rows.append(row)

    if args.json:
        print(json.dumps(rows, ensure_ascii=False, indent=1))
    else:
        print(f"== Audit kênh phát hành · {cpv.BASE} ==")
        print(f"  {'nền tảng':<24} {'mốc latest':<12} {'bản ĐANG PHÁT':<15} {'kết luận':<14} ghi chú")
        for row in rows:
            print(
                f"  {row['label']:<24} {str(row['marker'] or '-'):<12} "
                f"{str(row.get('internal') or '-'):<15} {row['verdict']:<14} {row['note']}"
            )

    if any(r["verdict"] == "LỆCH" for r in rows):
        print("\n⛔ CÓ KÊNH LỆCH — cập nhật link tải + set lại mốc + thông báo khách (PUBLISHER_PROCESS §1c/§5).")
        return 1, rows
    if any(r["verdict"] in ("KHÔNG KIỂM ĐƯỢC", "CHƯA ĐỐI CHIẾU") for r in rows):
        print(
            "\n⚠️  CHƯA ĐỐI CHIẾU HẾT — có kênh chưa đọc được version bên trong "
            "(chạy lại KHÔNG kèm --no-download, trên máy đủ công cụ: macOS cho DMG, Android SDK cho APK). "
            "Không kết luận là đạt."
        )
        return 2, rows
    print("\n✅ Mọi kênh đang phục vụ đúng bản latest (đã đọc version bên trong từng artifact).")
    return 0, rows


def record(code: int, rows: list, args) -> None:
    """Ghi log JSONL + gọi alert khi có kênh LỆCH — dùng cho health-watch định kỳ."""
    if args.log:
        try:
            os.makedirs(os.path.dirname(os.path.abspath(args.log)), exist_ok=True)
            with open(args.log, "a", encoding="utf-8") as handle:
                handle.write(
                    json.dumps(
                        {"at": datetime.now(timezone.utc).isoformat(), "exit": code, "base": cpv.BASE, "rows": rows},
                        ensure_ascii=False,
                    )
                    + "\n"
                )
        except OSError as exc:
            print(f"⚠ không ghi được log {args.log}: {exc}", file=sys.stderr)

    if code == 1 and args.alert_cmd:
        payload = json.dumps(rows, ensure_ascii=False)
        try:
            subprocess.run(
                args.alert_cmd,
                shell=True,
                input=payload,
                text=True,
                env={**os.environ, "AUDIT_EXIT": str(code), "AUDIT_VERDICT": "LECH", "AUDIT_BASE": cpv.BASE},
            )
        except OSError as exc:
            print(f"⚠ alert-cmd lỗi: {exc}", file=sys.stderr)


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit các kênh phát hành")
    parser.add_argument("--platform", choices=[p for p, _ in PLATFORMS])
    parser.add_argument("--no-download", action="store_true", help="chỉ xem mốc + size")
    parser.add_argument("--json", action="store_true")
    parser.add_argument(
        "--interval",
        type=int,
        default=0,
        help="chạy lặp mỗi N giây (0 = một lần) — dùng cho health-watch định kỳ",
    )
    parser.add_argument(
        "--log",
        default=os.environ.get("AUDIT_LOG", ""),
        help="ghi mỗi lần chạy 1 dòng JSON vào file này (mặc định env AUDIT_LOG)",
    )
    parser.add_argument(
        "--alert-cmd",
        default=os.environ.get("AUDIT_ALERT_CMD", ""),
        help="lệnh gọi khi có kênh LỆCH; JSON kết quả đưa vào stdin (mặc định env AUDIT_ALERT_CMD)",
    )
    args = parser.parse_args()

    if args.interval and args.interval > 0:
        while True:
            code, rows = run_once(args)
            record(code, rows, args)
            time.sleep(args.interval)

    code, rows = run_once(args)
    record(code, rows, args)
    return code


if __name__ == "__main__":
    sys.exit(main())
