#!/usr/bin/env python3
"""Kiểm tra một bản phát hành APK đã thật sự "sống" chưa — chạy sau mỗi lần upload.

Việc phải làm tay mỗi lần release (đã làm 2 lần cho 1.2.6) gói hết vào đây:

1. APK trên máy build là phiên bản nào (đọc thẳng `AndroidManifest.xml` trong APK).
2. Server đang quảng cáo gì cho client Android (`/v1/app-version?platform=android`).
3. Endpoint tải trả đúng file nào cho **máy thường** và cho **máy Android 7 / Fire TV**
   (UA routing) và kích thước có khớp bản build không.
4. (tuỳ chọn) Tải thật về, so md5 + đọc versionName trong file vừa tải — chứng minh
   khách tải đúng bản mình vừa build.

Ví dụ:

    scripts/check-apk-release.py                      # kiểm nhanh (không tải file)
    scripts/check-apk-release.py --download           # tải thật + so md5 (chậm, ~200MB)
    scripts/check-apk-release.py --self-test           # tự kiểm chính script (mock server)

Trả về mã 1 nếu có mục KHÔNG khớp.
"""

from __future__ import annotations

import argparse
import hashlib
import http.server
import json
import os
import re
import shutil
import socketserver
import ssl
import subprocess
import sys
import threading
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

DEFAULT_SITE = "https://meetflowai.site"
DEFAULT_API = "https://api.meetflowai.site"
BUILD_DIR = Path(os.environ.get("VPNFLOW_BUILD_DIR", str(Path.home() / ".vpnflow-build")))
DEFAULT_MODERN = BUILD_DIR / "app/outputs/apk/modern/release/app-modern-release.apk"
DEFAULT_LEGACY = BUILD_DIR / "app/outputs/apk/legacy/release/app-legacy-release.apk"

MODERN_UA = "okhttp/4.12.0"
FIRE_TV_UA = "Mozilla/5.0 (Linux; Android 7.1.2; AFTMM Build/NS6265) AppleWebKit/537.36 Chrome/70"

FAILURES: list[str] = []


def check(label: str, ok: bool, detail: str = "") -> bool:
    print(f"  {'OK  ' if ok else 'HỎNG'} {label}" + (f" — {detail}" if detail else ""))
    if not ok:
        FAILURES.append(label)
    return ok


def _aapt_candidates() -> list[str]:
    """aapt2/aapt: ưu tiên PATH, rồi tới Android SDK (kể cả khi SDK không có trong PATH)."""
    found: list[str] = []
    for tool in ("aapt", "aapt2"):
        exe = shutil.which(tool)
        if exe:
            found.append(exe)
    roots = [
        os.environ.get("ANDROID_HOME", ""),
        os.environ.get("ANDROID_SDK_ROOT", ""),
        str(Path.home() / "Library/Android/sdk"),
        "/usr/local/share/android-sdk",
    ]
    for root in roots:
        if not root:
            continue
        builds = Path(root) / "build-tools"
        if not builds.is_dir():
            continue
        for version_dir in sorted(builds.iterdir(), reverse=True):
            for tool in ("aapt", "aapt2"):
                candidate = version_dir / tool
                if candidate.is_file():
                    found.append(str(candidate))
    return found


def _aapt_info(path: Path) -> dict | None:
    """versionName/versionCode bằng aapt/aapt2 (nguồn chính xác; cần Android SDK build-tools)."""
    for exe in _aapt_candidates():
        try:
            out = subprocess.run([exe, "dump", "badging", str(path)],
                                 capture_output=True, text=True, timeout=90).stdout
        except Exception:  # noqa: BLE001
            continue
        name = re.search(r"versionName='([^']+)'", out)
        code = re.search(r"versionCode='(\d+)'", out)
        if name:
            return {"version_name": name.group(1),
                    "version_code": int(code.group(1)) if code else None,
                    "version_source": Path(exe).name + " " + str(Path(exe).parent.name)}
    return None


def apk_info(path: Path, override_version: str | None = None) -> dict:
    """Thông tin APK: versionName/versionCode (aapt), kích thước, md5."""
    info = _aapt_info(path)
    if override_version:
        info = {"version_name": override_version, "version_code": None, "version_source": "--local-version"}
    if info is None:
        # Không có aapt: đọc thô chuỗi trong AndroidManifest.xml. CHỈ là đoán — chuỗi kiểu
        # "7.1.1" của thư viện cũng khớp mẫu, nên phải cảnh báo rõ chứ không im lặng.
        with zipfile.ZipFile(path) as zf:
            text = zf.read("AndroidManifest.xml").decode("utf-16-le", errors="ignore")
        versions = sorted(set(re.findall(r"\b\d+\.\d+\.\d+\b", text)))
        info = {"version_name": versions[0] if versions else "?",
                "version_code": None, "version_source": "đoán (không có aapt)"}
    info.update({
        "size": path.stat().st_size,
        "md5": hashlib.md5(path.read_bytes()).hexdigest(),
    })
    return info


def _ssl_context() -> ssl.SSLContext:
    """CA bundle chắc chắn có: python trên macOS (Homebrew/python.org) thường thiếu CA hệ thống,
    khiến urllib báo CERTIFICATE_VERIFY_FAILED trong khi curl vẫn chạy bình thường."""
    try:
        import certifi  # có thì dùng ngay
        return ssl.create_default_context(cafile=certifi.where())
    except Exception:  # noqa: BLE001
        pass
    for bundle in ("/etc/ssl/cert.pem", "/etc/pki/tls/certs/ca-bundle.crt",
                   "/usr/local/etc/openssl@3/cert.pem"):
        if Path(bundle).is_file():
            try:
                return ssl.create_default_context(cafile=bundle)
            except Exception:  # noqa: BLE001
                continue
    return ssl.create_default_context()


SSL_CONTEXT = _ssl_context()


def fetch_json(url: str, timeout: int = 20) -> dict:
    with urllib.request.urlopen(url, timeout=timeout, context=SSL_CONTEXT) as res:
        return json.loads(res.read().decode("utf-8"))


def head(url: str, user_agent: str, timeout: int = 25) -> dict:
    req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": user_agent})
    with urllib.request.urlopen(req, timeout=timeout, context=SSL_CONTEXT) as res:
        return {
            "status": res.status,
            "length": int(res.headers.get("Content-Length") or 0),
            "disposition": res.headers.get("Content-Disposition") or "",
        }


def download(url: str, user_agent: str = MODERN_UA) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": user_agent})
    with urllib.request.urlopen(req, timeout=300, context=SSL_CONTEXT) as res:
        return res.read()


def version_from_bytes(data: bytes) -> str:
    """versionName từ AndroidManifest.xml bên trong APK nhị phân (không cần ghi ra đĩa)."""
    import io

    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        raw = zf.read("AndroidManifest.xml")
    text = raw.decode("utf-16-le", errors="ignore")
    versions = sorted(set(re.findall(r"\b\d+\.\d+\.\d+\b", text)))
    return versions[-1] if versions else "?"


def run_checks(args) -> int:
    print(f"# Kênh phát hành: {args.site}  (API {args.api})")

    print("\n1) APK trên máy build")
    modern = Path(args.local)
    legacy = Path(args.local_legacy) if args.local_legacy else None
    local_info = None
    if modern.exists():
        local_info = apk_info(modern, args.local_version)
        print(f"  modern: {modern.name} — versionName={local_info['version_name']} "
              f"(code {local_info['version_code']}, nguồn: {local_info['version_source']}) "
              f"size={local_info['size']} md5={local_info['md5'][:12]}…")
        if "đoán" in str(local_info["version_source"]):
            print("  ⚠️  Không tìm thấy aapt/aapt2 — versionName chỉ là suy đoán, hãy cài Android SDK build-tools")
    else:
        check("có file APK modern trên máy build", False, f"không thấy {modern}")
    if legacy and legacy.exists():
        li = apk_info(legacy, args.local_version)
        print(f"  legacy: {legacy.name} — versionName={li['version_name']} "
              f"(nguồn: {li['version_source']}) size={li['size']} md5={li['md5'][:12]}…")
    elif legacy:
        print(f"  legacy: (bỏ qua — không thấy {legacy})")

    print("\n2) Server quảng cáo gì cho Android")
    try:
        adv = fetch_json(f"{args.api}/v1/app-version?platform=android")
        print("  " + json.dumps(adv, ensure_ascii=False))
    except Exception as exc:  # noqa: BLE001 - báo rõ lý do mạng, không crash
        check("gọi được /v1/app-version", False, f"{type(exc).__name__}: {exc}")
        return finish()

    apk_url = adv.get("apk_url") or ""
    apk_url_legacy = adv.get("apk_url_legacy") or ""
    check("payload có apk_url", bool(apk_url), apk_url)
    check("payload có apk_url_legacy (máy Android 7 / Fire TV)", bool(apk_url_legacy), apk_url_legacy)
    check("store_url không rỗng (bản ≤1.2.4 chỉ đọc field này)", bool(adv.get("store_url")), adv.get("store_url", ""))
    if local_info:
        check(
            "versionName server quảng cáo khớp bản build",
            adv.get("latest_version") == local_info["version_name"],
            f"server={adv.get('latest_version')} build={local_info['version_name']}",
        )
        forced = adv.get("minimum_version")
        check(
            "ngưỡng ép cập nhật không cao hơn bản đang phát",
            not forced or forced <= local_info["version_name"],
            f"minimum={forced}",
        )
    if args.token:
        try:
            admin = fetch_json(f"{args.api}/v1/admin/android-version")
            print("  admin: " + json.dumps(admin, ensure_ascii=False))
        except Exception as exc:  # noqa: BLE001
            print(f"  (bỏ qua admin — {type(exc).__name__}: {exc})")

    print("\n3) Endpoint tải trả file nào cho từng loại máy")
    if apk_url and local_info:
        try:
            r = head(apk_url, MODERN_UA)
            check("máy thường nhận bản modern", "VPNFlow.apk" in r["disposition"], r["disposition"])
            check("kích thước khớp bản build modern", r["length"] == local_info["size"],
                  f"server={r['length']} build={local_info['size']}")
        except Exception as exc:  # noqa: BLE001
            check("HEAD apk_url", False, f"{type(exc).__name__}: {exc}")
    if apk_url and legacy and legacy.exists():
        try:
            r = head(apk_url, FIRE_TV_UA)
            check("máy Android 7 / Fire TV nhận bản legacy (UA routing)",
                  "android7" in r["disposition"] or "legacy" in r["disposition"], r["disposition"])
            check("kích thước khớp bản build legacy", r["length"] == legacy.stat().st_size,
                  f"server={r['length']} build={legacy.stat().st_size}")
        except Exception as exc:  # noqa: BLE001
            check("HEAD apk_url (UA Fire TV)", False, f"{type(exc).__name__}: {exc}")

    if args.download:
        print("\n4) Tải thật về và so md5 (chứng minh khách tải đúng bản)")
        try:
            data = download(apk_url)
            got = hashlib.md5(data).hexdigest()
            check("md5 file tải về khớp bản build", local_info and got == local_info["md5"],
                  f"tải về={got[:12]}… build={(local_info or {}).get('md5', '?')[:12]}…")
            check("versionName trong file tải về khớp", version_from_bytes(data) == (local_info or {}).get("version_name"),
                  f"file={version_from_bytes(data)} build={(local_info or {}).get('version_name')}")
        except Exception as exc:  # noqa: BLE001
            check("tải APK", False, f"{type(exc).__name__}: {exc}")

    return finish()


def finish() -> int:
    if FAILURES:
        print(f"\nKẾT LUẬN: {len(FAILURES)} mục KHÔNG khớp → " + "; ".join(FAILURES))
        return 1
    print("\nKẾT LUẬN: tất cả mục đều khớp ✅")
    return 0


# --- self-test: dựng server giả để kiểm chính script -------------------------------


def self_test() -> int:
    """Chạy script với một server giả: một ca ĐÚNG và một ca SAI (UA routing hỏng)."""
    import tempfile

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        modern = tmp_path / "modern.apk"
        legacy = tmp_path / "legacy.apk"
        for path, marker in ((modern, b"M" * 4096), (legacy, b"L" * 8192)):
            with zipfile.ZipFile(path, "w") as zf:
                zf.writestr("AndroidManifest.xml", ("\u0000".join(["x", "1.2.6", "6", "26"])).encode("utf-16-le"))
                zf.writestr("filler.bin", marker)

        state = {"legacy_routing": True}

        class Handler(http.server.BaseHTTPRequestHandler):
            def log_message(self, *a):  # im lặng
                pass

            def do_GET(self):  # noqa: N802
                if self.path.startswith("/v1/app-version"):
                    body = json.dumps({
                        "platform": "android", "minimum_version": "1.2.6", "latest_version": "1.2.6",
                        "apk_url": f"http://127.0.0.1:{self.server.server_address[1]}/v1/downloads/android",
                        "apk_url_legacy": f"http://127.0.0.1:{self.server.server_address[1]}/v1/downloads/android-legacy",
                        "store_url": f"http://127.0.0.1:{self.server.server_address[1]}/v1/downloads/android",
                    }).encode()
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Content-Length", str(len(body)))
                    self.end_headers()
                    self.wfile.write(body)
                    return
                if self.path.startswith("/v1/downloads/android"):
                    ua = self.headers.get("User-Agent", "")
                    old = "Android 7" in ua or "AFT" in ua
                    if old and state["legacy_routing"]:
                        data, name = legacy.read_bytes(), "VPNFlow-android7.apk"
                    else:
                        data, name = modern.read_bytes(), "VPNFlow.apk"
                    self.send_response(200)
                    self.send_header("Content-Disposition", f'attachment; filename="{name}"')
                    self.send_header("Content-Length", str(len(data)))
                    self.end_headers()
                    if self.command != "HEAD":
                        self.wfile.write(data)
                    return
                self.send_error(404)

            def do_HEAD(self):  # noqa: N802
                self.do_GET()

        with socketserver.TCPServer(("127.0.0.1", 0), Handler) as srv:
            port = srv.server_address[1]
            threading.Thread(target=srv.serve_forever, daemon=True).start()
            base = [
                sys.executable, __file__,
                "--api", f"http://127.0.0.1:{port}", "--site", f"http://127.0.0.1:{port}",
                "--local", str(modern), "--local-legacy", str(legacy),
                "--local-version", "1.2.6",
            ]
            print("=== self-test ca 1: cấu hình ĐÚNG (phải trả mã 0) ===")
            ok1 = os.system(" ".join(base)) == 0
            state["legacy_routing"] = False
            print("\n=== self-test ca 2: UA routing HỎNG (phải trả mã 1) ===")
            failed2 = os.system(" ".join(base)) != 0
            srv.shutdown()
    good = ok1 and failed2
    print(f"\nself-test: {'PASS' if good else 'FAIL'} (ca đúng={ok1}, phát hiện lỗi={failed2})")
    return 0 if good else 1


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--site", default=DEFAULT_SITE, help=f"host tải APK (mặc định {DEFAULT_SITE})")
    parser.add_argument("--api", default=DEFAULT_API, help=f"host API (mặc định {DEFAULT_API})")
    parser.add_argument("--local", default=str(DEFAULT_MODERN), help="APK modern trên máy build")
    parser.add_argument("--local-legacy", default=str(DEFAULT_LEGACY), help="APK legacy trên máy build")
    parser.add_argument("--local-version", default=None,
                        help="ghi đè versionName của APK local (dùng khi máy không có aapt)")
    parser.add_argument("--token", default=os.environ.get("AUTH_TOKEN", ""), help="Bearer token admin (tuỳ chọn)")
    parser.add_argument("--download", action="store_true", help="tải thật APK về để so md5 (chậm)")
    parser.add_argument("--self-test", action="store_true", help="tự kiểm script bằng server giả")
    args = parser.parse_args()
    if args.self_test:
        return self_test()
    return run_checks(args)


if __name__ == "__main__":
    sys.exit(main())
