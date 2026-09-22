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

Mã thoát: 0 = mọi kênh khớp · 1 = có kênh LỆCH (phải cập nhật link + thông báo khách) · 2 = có
kênh KHÔNG KIỂM ĐƯỢC trên máy này (macOS cần chạy trên máy Mac, APK cần aapt2).
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import sys

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
    target = os.path.join(cpv.tempfile.gettempdir(), "audit-" + os.path.basename(url.split("?")[0]))
    try:
        request = cpv.urllib.request.Request(url, headers={"User-Agent": cpv.UA})
        with cpv.urllib.request.urlopen(request, timeout=900) as response, open(target, "wb") as handle:
            cpv.shutil.copyfileobj(response, handle, length=1024 * 1024)
    except Exception as exc:  # noqa: BLE001 — audit không được chết vì 1 kênh
        return None, f"tải lỗi: {exc}"
    info = cpv.READERS[platform](target)
    info["_size"] = os.path.getsize(target)
    return info, info.get("error")


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit các kênh phát hành")
    parser.add_argument("--platform", choices=[p for p, _ in PLATFORMS] + ["android-legacy"])
    parser.add_argument("--no-download", action="store_true", help="chỉ xem mốc + size")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

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
        return 1
    if any(r["verdict"] in ("KHÔNG KIỂM ĐƯỢC", "CHƯA ĐỐI CHIẾU") for r in rows):
        print(
            "\n⚠️  CHƯA ĐỐI CHIẾU HẾT — có kênh chưa đọc được version bên trong "
            "(chạy lại KHÔNG kèm --no-download, trên máy đủ công cụ: macOS cho DMG, Android SDK cho APK). "
            "Không kết luận là đạt."
        )
        return 2
    print("\n✅ Mọi kênh đang phục vụ đúng bản latest (đã đọc version bên trong từng artifact).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
