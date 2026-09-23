#!/usr/bin/env python3
"""Cổng chặn VERSION trước khi publish (và kiểm lại sau khi publish).

Vì sao có file này: ngày 21/09/2026 phát hiện kênh macOS đang phát DMG **1.3.3** trong khi mốc
phiên bản (`latest_mac_version`) quảng bá **1.4.0**, và bản Windows cài trên máy ghi
`FileVersion = 1.0.0` dù installer tên `VPNFlow-Setup-1.4.1.exe`. Cả hai đều KHÔNG nhìn ra được
nếu chỉ tin tên file / tin mốc. Luật mới: **publisher phải chạy cổng này trước khi upload; không
đạt thì DỪNG** (docs/PUBLISHER_PROCESS.md §2).

Đọc version từ BÊN TRONG artifact (không tin tên file), rồi đối chiếu 3 nguồn:
  1. version trong artifact  ==  --version (và --build nếu có)
  2. mốc `latest_version` trên control-plane  <=  --version   (phát hành lùi = chặn)
  3. file đang phát trên route tải (kích thước) — cảnh báo nếu trùng y hệt (có thể chưa upload)

Dùng:
  # TRƯỚC khi upload (mặc định)
  python3 scripts/check-publish-version.py --platform ios --file VPNFlow-latest.ipa \
      --version 1.4.1 --build 17

  # Windows: kiểm cả installer lẫn app exe bên trong
  python scripts/check-publish-version.py --platform windows \
      --file windows/installer/out/VPNFlow-Setup-1.4.1.exe \
      --app-exe windows/installer/out/publish/PrivateVPNWindows.App.exe \
      --version 1.4.1

  # SAU khi upload: tải file đang phát và đọc version bên trong, đối chiếu mốc
  python3 scripts/check-publish-version.py --platform macos --mode post --version 1.4.1

Mã thoát: 0 = ĐẠT, 1 = KHÔNG ĐẠT (dừng publish), 2 = không kiểm được (thiếu công cụ/file).
"""

from __future__ import annotations

import argparse
import json
import os
import plistlib
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
import zipfile

# Console Windows mặc định cp1252 ⇒ in tiếng Việt là UnicodeEncodeError (đã gặp thật 21/09/2026).
# Ép UTF-8 để chạy được ở mọi máy; lỗi ký tự thì thay bằng '?' chứ không làm chết cổng chặn.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

# CA của Python cài từ python.org (macOS) KHÔNG nạp chứng chỉ hệ thống ⇒ mọi request HTTPS chết với
# CERTIFICATE_VERIFY_FAILED; audit báo "KHÔNG KIỂM ĐƯỢC" cả 5 kênh (đã gặp thật 22/09/2026 trên máy Mac).
# Dùng certifi khi có; máy không có thì giữ mặc định (không được làm hỏng cổng chặn).
try:
    import ssl as _ssl

    import certifi as _certifi

    SSL_CONTEXT = _ssl.create_default_context(cafile=_certifi.where())
except Exception:  # noqa: BLE001 — thiếu certifi không phải lỗi cứng
    SSL_CONTEXT = None


def open_url(request, timeout: int = 25):
    """`urllib.request.urlopen` với ngữ cảnh CA đúng (certifi khi có) — xem chú thích `SSL_CONTEXT`."""
    if SSL_CONTEXT is None:
        return urllib.request.urlopen(request, timeout=timeout)
    return urllib.request.urlopen(request, timeout=timeout, context=SSL_CONTEXT)

# Route tải file đang phát + endpoint mốc phiên bản (xem docs/PUBLISHER_PROCESS.md §3, §4).
BASE = os.environ.get("FLOWVPN_BASE_URL", "https://meetflowai.site").rstrip("/")
# Cloudflare trả 403 cho User-Agent mặc định của urllib (đã gặp thật) ⇒ phải khai UA thật.
UA = "Mozilla/5.0 (compatible; VPNFlow-publish-guard/1.0; +https://meetflowai.site)"
DOWNLOAD_ROUTES = {
    "ios": "/v1/downloads/ios",
    "android": "/v1/downloads/android",
    "android-legacy": "/v1/downloads/android-legacy",
    "macos": "/v1/downloads/mac",
    "windows": "/dl/VPNFlow-Setup-{version}.exe",
}
# Windows phát qua /dl/<tên file>, không phải route cố định.
WINDOWS_DL = "/dl/{name}"
# Đuôi file theo nền tảng — PHẢI giữ khi tải artifact về máy: `stapler` phân loại file theo ĐUÔI,
# nên DMG lưu không đuôi bị từ chối "Stapler is incapable of working with Document files" ⇒ audit
# báo "DMG chưa staple" OAN (đã gặp thật 22/09/2026, trong khi `xcrun stapler validate <tên>.dmg`
# trả "The validate action worked!"). Bài học: không tin kết luận khi chính công cụ không đọc được file.
ARTIFACT_SUFFIX = {
    "ios": ".ipa",
    "macos": ".dmg",
    "android": ".apk",
    "android-legacy": ".apk",
    "windows": ".exe",
}


class Result:
    def __init__(self) -> None:
        self.rows: list[tuple[str, str, str]] = []  # (mức, hạng mục, chi tiết)
        self.failed = 0
        self.warned = 0
        self.unknown = 0

    def ok(self, item: str, detail: str = "") -> None:
        self.rows.append(("ĐẠT", item, detail))

    def warn(self, item: str, detail: str) -> None:
        self.rows.append(("CẢNH BÁO", item, detail))
        self.warned += 1

    def fail(self, item: str, detail: str) -> None:
        self.rows.append(("KHÔNG ĐẠT", item, detail))
        self.failed += 1

    def unknown_(self, item: str, detail: str) -> None:
        self.rows.append(("KHÔNG KIỂM ĐƯỢC", item, detail))
        self.unknown += 1

    def render(self) -> None:
        width = max(len(i) for _, i, _ in self.rows) if self.rows else 10
        for level, item, detail in self.rows:
            print(f"  [{level:>14}] {item:<{width}}  {detail}")


def http_json(url: str, timeout: int = 20):
    request = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with open_url(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8", "replace"))
    except (urllib.error.URLError, urllib.error.HTTPError, ValueError, TimeoutError) as exc:
        return {"__error__": str(exc)}


def http_head(url: str, timeout: int = 25) -> dict:
    request = urllib.request.Request(url, method="HEAD", headers={"User-Agent": UA})
    try:
        with open_url(request, timeout=timeout) as response:
            return {
                "status": response.status,
                "length": int(response.headers.get("Content-Length") or 0),
            }
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as exc:
        return {"__error__": str(exc)}


def marker_latest(platform: str) -> tuple[str | None, str | None]:
    """Trả (latest_version, lỗi).

    `android-legacy` KHÔNG phải kênh riêng ở `/v1/app-version`: server chỉ nhận
    `android|ios|macos|windows`, giá trị lạ rơi vào payload **iOS** (xem `app-version.js`).
    APK legacy dùng CHUNG mốc với Android modern ⇒ phải hỏi `platform=android`, nếu không
    audit sẽ đối chiếu APK legacy với mốc iOS (đúng khi hai số tình cờ bằng nhau, sai khi lệch).
    """
    query = "android" if platform == "android-legacy" else platform
    payload = http_json(f"{BASE}/v1/app-version?platform={query}")
    if "__error__" in payload:
        return None, payload["__error__"]
    return str(payload.get("latest_version") or ""), None


# ---------------------------------------------------------------- đọc version trong artifact


def _entitlement_blobs(data: bytes):
    """Các khối XML plist entitlements nhúng trong binary Mach-O (code signature)."""
    for match in re.finditer(rb"<\?xml[^>]*\?>", data):
        start = match.start()
        end = data.find(b"</plist>", start)
        if end == -1:
            continue
        blob = data[start : end + 8]
        if b"keychain-access-groups" in blob or b"application-identifier" in blob:
            yield blob.decode("utf-8", "replace")


def _keychain_groups(blob: str) -> list:
    match = re.search(r"<key>keychain-access-groups</key>\s*<array>(.*?)</array>", blob, re.S)
    if not match:
        return []
    return re.findall(r"<string>([^<]*)</string>", match.group(1))


def _prefix_keys(values: dict, prefix: str) -> dict:
    return {f"{prefix}{k}": v for k, v in values.items()}


def _hysteria_credentials(info: dict, plistlib_module=None) -> dict:
    """Đọc credential hysteria2 nhúng trong Info.plist — KHÔNG trả về giá trị, chỉ trạng thái.

    Vì sao cần: credential hysteria2 **nhúng lúc build** (`HYST_PASSWORD`/`HYST_OBFS`, xem
    docs/MACOS_SIGN_NOTARIZE.md §2 và project.yml) chứ không nằm trong repo. Build tay mà thiếu
    biến ⇒ app cài được, mở được, nhưng **không kết nối được**, và lỗi hiện ra rất khó đoán
    (22/09/2026: bản macOS build mới báo "Invalid user" trong message của app — trong khi server
    từ chối credential đúng nghĩa lại trả `authentication error, HTTP status code: 404`).
    Cổng chặn này bắt đúng lúc PHÁT HÀNH, thay vì để khách phát hiện.

    Trả về: cờ CÓ/KHÔNG + độ dài (để đối chiếu mà không lộ secret) + kết quả so với env build
    (`HYST_PASSWORD`/`HYST_OBFS`) nếu môi trường có đặt.
    """
    password = str(info.get("HysteriaPassword") or "")
    obfs = str(info.get("HysteriaObfs") or "")
    expected_password = (os.environ.get("HYST_PASSWORD") or "").strip()
    expected_obfs = (os.environ.get("HYST_OBFS") or "").strip()
    return {
        "hysteria_password": bool(password),
        "hysteria_password_len": len(password),
        "hysteria_obfs": bool(obfs),
        "hysteria_obfs_len": len(obfs),
        # None = môi trường không đặt ⇒ không kết luận; True/False = khớp/khác env build.
        "hysteria_password_env_match": (password == expected_password) if expected_password else None,
        "hysteria_obfs_env_match": (obfs == expected_obfs) if expected_obfs else None,
    }


def _check_hysteria_credentials(result, internal: dict) -> None:
    """Cổng chặn: credential hysteria2 phải có trong app (và extension), khớp env build nếu có.

    KHÔNG bao giờ in giá trị credential — chỉ in độ dài + khớp/khác.
    """
    for label, has_key, len_key in (
        ("app", "hysteria_password", "hysteria_password_len"),
        ("extension", "ext_hysteria_password", "ext_hysteria_password_len"),
    ):
        if has_key not in internal:
            continue  # artifact không có phần này (vd macOS không có .appex)
        if internal.get(has_key):
            result.ok(f"Credential hysteria2 ({label})", f"có · {internal.get(len_key, 0)} ký tự")
        else:
            result.fail(
                f"Credential hysteria2 THIẾU ({label})",
                "Info.plist không có HysteriaPassword ⇒ app cài được nhưng KHÔNG kết nối được. "
                "Build lại kèm HYST_PASSWORD/HYST_OBFS (docs/MACOS_SIGN_NOTARIZE.md §2).",
            )

    if internal.get("hysteria_obfs") is False:
        result.warn("Credential obfs", "không có HysteriaObfs — chỉ đúng nếu server tắt obfs")

    for label, match_key in (
        ("HysteriaPassword", "hysteria_password_env_match"),
        ("HysteriaObfs", "hysteria_obfs_env_match"),
    ):
        match = internal.get(match_key)
        if match is True:
            result.ok(f"{label} khớp env build", "trùng giá trị biến môi trường lúc build")
        elif match is False:
            result.fail(
                f"{label} KHÁC env build",
                "credential nhúng trong artifact không trùng biến môi trường hiện tại "
                "(không in giá trị) — build đã dùng credential CŨ/khác ⇒ khách sẽ không kết nối được.",
            )


def version_ios(path: str) -> dict:
    """IPA: version + extension + NHÓM KEYCHAIN (code signature vs provisioning profile).

    Vì sao kiểm nhóm keychain ở đây: 22/09/2026 bản iOS đang phát bị đúng lỗi này — binary
    khai `keychain-access-groups = G6XW3RN6LJ.com.privatevpn.shared` nhưng **profile Ad Hoc
    không có nhóm đó** (`ProvisionedDevices` chỉ cấp `…com.privatevpn.app` và
    `…app.packet-tunnel`). iOS cấp nhóm theo PROFILE ⇒ `SecItemAdd` trả `errSecMissingEntitlement
    (-34018)` ⇒ lưu phiên đăng nhập thất bại ⇒ "nhập code xong không vào được app".
    Lệnh verify cũ chỉ soi code signature nên vẫn PASS trong khi khách không dùng được.
    """
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        app_info = [n for n in names if re.fullmatch(r"Payload/[^/]+\.app/Info\.plist", n)]
        if not app_info:
            return {"error": "không thấy Payload/*.app/Info.plist trong IPA"}
        with archive.open(app_info[0]) as handle:
            info = plistlib.load(handle)
        out = {
            "version": info.get("CFBundleShortVersionString"),
            "build": str(info.get("CFBundleVersion") or ""),
            "extension": any(n.endswith(".appex/Info.plist") for n in names),
        }
        out.update(_hysteria_credentials(info, plistlib))
        # Extension phải cùng số với app (PUBLISHER_PROCESS §2).
        ext_info = [n for n in names if re.fullmatch(r"Payload/[^/]+\.app/PlugIns/[^/]+\.appex/Info\.plist", n)]
        if ext_info:
            with archive.open(ext_info[0]) as handle:
                ext = plistlib.load(handle)
            out["ext_version"] = ext.get("CFBundleShortVersionString")
            out["ext_build"] = str(ext.get("CFBundleVersion") or "")
            # Credential hysteria2 phải có ở CẢ app lẫn extension: extension mới là chỗ dựng tunnel.
            out.update(_prefix_keys(_hysteria_credentials(ext, plistlib), "ext_"))

        # Nhóm keychain: lấy từ code signature của app + extension, và từ 2 provisioning profile.
        signature_groups = set()
        for name in names:
            if name.endswith("embedded.mobileprovision"):
                continue  # profile xét riêng ở dưới, không trộn vào code signature
            if re.fullmatch(r"Payload/[^/]+\.app/[^/]+", name) or re.fullmatch(
                r"Payload/[^/]+\.app/PlugIns/[^/]+\.appex/[^/]+", name
            ):
                for blob in _entitlement_blobs(archive.read(name)):
                    signature_groups.update(_keychain_groups(blob))
        profile_groups = set()
        for name in names:
            if name.endswith("embedded.mobileprovision"):
                data = archive.read(name)
                profile_groups.update(
                    match.decode() for match in re.findall(rb"G6XW3RN6LJ\.[A-Za-z0-9._-]+", data)
                )
        # `com.apple.token` là nhóm hệ thống, không tính là nhóm chia sẻ của app.
        app_groups = sorted(g for g in signature_groups if not g.startswith("com.apple.") and "*" not in g)
        out["keychain_signature"] = app_groups
        out["keychain_profile"] = sorted(profile_groups)
        out["keychain_missing"] = [g for g in app_groups if g not in profile_groups]
        return out


def _find_aapt2() -> str | None:
    """Tìm aapt2/aapt: ưu tiên PATH, rồi tới SDK mặc định của Android Studio trên macOS.

    Android Studio KHÔNG thêm `build-tools/` vào PATH, nên máy Mac "đủ công cụ" vẫn báo thiếu
    aapt2 nếu chỉ dựa vào `which` (đã gặp thật 22/09/2026). Tìm giúp để audit không bỏ sót kênh Android.
    """
    found = shutil.which("aapt2") or shutil.which("aapt")
    if found:
        return found
    if sys.platform == "darwin":
        import glob

        candidates = sorted(
            glob.glob(os.path.expanduser("~/Library/Android/sdk/build-tools/*/aapt2")),
            reverse=True,
        )
        if candidates:
            return candidates[0]
    return None


def version_android(path: str) -> dict:
    """APK: aapt2 dump badging (công cụ chuẩn của luật §2)."""
    aapt2 = _find_aapt2()
    if not aapt2:
        return {"error": "không có aapt2/aapt trong PATH (cần Android SDK build-tools)"}
    tool = os.path.basename(aapt2)
    command = [aapt2, "dump", "badging", path] if tool.startswith("aapt2") else [aapt2, "dump", "badging", path]
    proc = subprocess.run(command, capture_output=True, text=True)
    if proc.returncode != 0:
        return {"error": f"{tool} lỗi: {(proc.stderr or proc.stdout).strip()[:200]}"}
    name = re.search(r"versionName='([^']*)'", proc.stdout)
    code = re.search(r"versionCode='([^']*)'", proc.stdout)
    return {
        "version": name.group(1) if name else None,
        "build": code.group(1) if code else "",
    }


def _run(command) -> tuple:
    """Chạy lệnh, trả (exit_code, dòng cuối của output). Không bao giờ ném."""
    try:
        proc = subprocess.run(command, capture_output=True, text=True, errors="replace")
        tail = ((proc.stdout or "") + (proc.stderr or "")).strip().splitlines()
        return proc.returncode, (tail[-1].strip() if tail else "")
    except (OSError, subprocess.SubprocessError) as exc:
        return 127, str(exc)


def version_macos(path: str) -> dict:
    """DMG: version + **vé staple + Gatekeeper + chữ ký** (chỉ làm được trên macOS).

    Vì sao kiểm staple ở đây: 22/09/2026 khách cài DMG xong mở app báo *"không thể mở"*. DMG đã
    `notarytool` Accepted nhưng **chưa staple** ⇒ máy khách (nhất là khi không có mạng) không có vé
    để Gatekeeper đối chiếu ⇒ chặn. `spctl` trên máy build vẫn báo Notarized nên rất dễ tưởng đã xong.
    """
    if sys.platform != "darwin":
        return {"error": "cần macOS (hdiutil/stapler/spctl) để kiểm DMG — chạy trên máy Mac"}
    out: dict = {}
    # (1) vé staple của chính file DMG
    code, line = _run(["xcrun", "stapler", "validate", path])
    out["staple_ok"] = code == 0
    out["staple_note"] = line
    # (2) Gatekeeper đánh giá đúng như khách mở lần đầu
    code, line = _run(
        ["spctl", "-a", "-t", "open", "--context", "context:primary-signature", "-vv", path]
    )
    out["spctl_ok"] = code == 0
    out["spctl_note"] = line

    mount = tempfile.mkdtemp(prefix="vpnflow-dmg-")
    try:
        attach = subprocess.run(
            ["hdiutil", "attach", path, "-nobrowse", "-readonly", "-mountpoint", mount],
            capture_output=True, text=True,
        )
        if attach.returncode != 0:
            return {"error": f"hdiutil attach lỗi: {(attach.stderr or attach.stdout).strip()[:200]}"}
        for root, _dirs, files in os.walk(mount):
            if not root.endswith(".app"):
                continue
            # Bundle macOS đặt plist ở Contents/Info.plist; bundle kiểu iOS đặt ngay .app/Info.plist.
            # Trước 22/09 chỉ tìm .app/Info.plist nên cổng macOS LUÔN báo "không thấy" trên DMG thật.
            candidates = [
                os.path.join(root, "Contents", "Info.plist"),
                os.path.join(root, "Info.plist"),
            ]
            info_path = next((p for p in candidates if os.path.isfile(p)), None)
            if info_path:
                with open(info_path, "rb") as handle:
                    info = plistlib.load(handle)
                # (3) chữ ký của app bên trong (deep: gồm cả extension + framework)
                code, line = _run(["codesign", "--verify", "--deep", "--strict", "--verbose=2", root])
                out["codesign_ok"] = code == 0
                out["codesign_note"] = line
                # (4) vé staple của chính .app (app phải tự mang vé, không chỉ DMG)
                code, line = _run(["xcrun", "stapler", "validate", root])
                out["app_staple_ok"] = code == 0
                out["app_staple_note"] = line
                out.update({
                    "version": info.get("CFBundleShortVersionString"),
                    "build": str(info.get("CFBundleVersion") or ""),
                })
                out.update(_hysteria_credentials(info, plistlib))
                # Credential cũng phải có trong .appex (extension là chỗ dựng tunnel), nếu có extension.
                for sub in os.listdir(os.path.join(root, "Contents", "PlugIns")) if os.path.isdir(
                    os.path.join(root, "Contents", "PlugIns")
                ) else []:
                    appex_info = os.path.join(root, "Contents", "PlugIns", sub, "Contents", "Info.plist")
                    if os.path.isfile(appex_info):
                        with open(appex_info, "rb") as handle:
                            appex = plistlib.load(handle)
                        out.update(_prefix_keys(_hysteria_credentials(appex, plistlib), "ext_"))
                        break
                return out
        return {"error": "không thấy .app/Contents/Info.plist (hoặc .app/Info.plist) trong DMG"}
    finally:
        subprocess.run(["hdiutil", "detach", mount, "-quiet"], capture_output=True, text=True)
        shutil.rmtree(mount, ignore_errors=True)


def version_windows(path: str) -> dict:
    """EXE: đọc VS_VERSIONINFO. Trên Windows dùng PowerShell; nơi khác báo rõ không đọc được."""
    if os.name == "nt":
        # Đường dẫn phải NHÚNG vào lệnh: `powershell -Command <script> <path>` không đưa path vào
        # $args như mong đợi (đã gặp thật: FileVersion trả rỗng, ProductVersion trả chính đường dẫn).
        quoted = str(path).replace("'", "''")
        script = (
            f"$p='{quoted}';"
            "$i=(Get-Item -LiteralPath $p -ErrorAction Stop).VersionInfo;"
            "Write-Output ($i.FileVersion + '|' + $i.ProductVersion)"
        )
        proc = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", script],
            capture_output=True, text=True, errors="replace",
        )
        raw = (proc.stdout or "").strip()
        if proc.returncode != 0 or "|" not in raw:
            return {"error": f"không đọc được VersionInfo: {(proc.stderr or raw).strip()[:200]}"}
        file_version, product_version = raw.split("|", 1)
        return {
            "version": file_version.strip(),
            "product": product_version.strip(),
            "build": "",
        }
    return {"error": "cần Windows để đọc VersionInfo của .exe (hoặc truyền --internal-version)"}


READERS = {
    "ios": version_ios,
    "android": version_android,
    "android-legacy": version_android,
    "macos": version_macos,
    "windows": version_windows,
}


def norm(value: str | None) -> str:
    """1.4.1 / 1.4.1.0 / 1.4.1+build đều quy về 1.4.1 để so."""
    if not value:
        return ""
    text = str(value).strip().split("+")[0]
    parts = text.split(".")
    while len(parts) > 3 and parts[-1] in {"0", ""}:
        parts.pop()
    return ".".join(parts)


def compare(a: str, b: str) -> int:
    """-1 nếu a<b, 0 bằng, 1 nếu a>b (so theo từng khúc số)."""
    left = [int(x) if x.isdigit() else 0 for x in norm(a).split(".") if x != ""]
    right = [int(x) if x.isdigit() else 0 for x in norm(b).split(".") if x != ""]
    for i in range(max(len(left), len(right))):
        li = left[i] if i < len(left) else 0
        ri = right[i] if i < len(right) else 0
        if li != ri:
            return -1 if li < ri else 1
    return 0


def download_for_post(platform: str, version: str, path: str | None) -> tuple[str | None, str]:
    """Tải file đang phát về để đọc version bên trong (mode post)."""
    if path:
        return path, ""
    if platform == "windows":
        url = f"{BASE}" + WINDOWS_DL.format(name=f"VPNFlow-Setup-{version}.exe")
    else:
        url = f"{BASE}" + DOWNLOAD_ROUTES[platform]
    # Giữ ĐUÔI theo nền tảng (xem ARTIFACT_SUFFIX): thiếu .dmg thì `stapler validate` từ chối
    # ⇒ mode post báo macOS LỆCH oan dù DMG đã staple thật.
    target = os.path.join(
        tempfile.gettempdir(),
        f"publish-post-{platform}{ARTIFACT_SUFFIX.get(platform, '')}",
    )
    # PHẢI gửi kèm UA thật: `urlretrieve` mặc định dùng `Python-urllib/...` nên Cloudflare trả 403
    # (đã gặp thật 22/09: `--mode post` không tải được DMG, trong khi `http_json`/`http_head` thì được
    # vì đã set UA). Tải theo luồng để không nạp cả file vào RAM.
    request = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with open_url(request, timeout=120) as response, open(target, "wb") as handle:
            shutil.copyfileobj(response, handle)
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError) as exc:
        return None, f"tải {url} lỗi: {exc}"
    return target, ""


def main() -> int:
    parser = argparse.ArgumentParser(description="Cổng chặn version trước/sau khi publish")
    parser.add_argument("--platform", required=True,
                        choices=["ios", "android", "android-legacy", "macos", "windows"])
    parser.add_argument("--file", help="artifact cần kiểm (mode pre: bắt buộc)")
    parser.add_argument("--app-exe", help="Windows: thêm exe app bên trong để kiểm version")
    parser.add_argument("--version", required=True, help="version ĐỊNH phát hành, vd 1.4.1")
    parser.add_argument("--build", help="build/bundleVersion/versionCode (iOS bắt buộc)")
    parser.add_argument("--mode", choices=["pre", "post"], default="pre",
                        help="pre = trước upload (mặc định), post = kiểm file đang phát")
    parser.add_argument("--internal-version", help="dùng khi không đọc được version trong artifact")
    parser.add_argument("--allow-same", action="store_true",
                        help="cho phép phát lại ĐÚNG version đang là mốc (mặc định: cảnh báo)")
    args = parser.parse_args()

    result = Result()
    print(f"== Cổng chặn version · platform={args.platform} · mode={args.mode} · định phát {args.version}"
          + (f" (build {args.build})" if args.build else ""))

    # ---- 1. version BÊN TRONG artifact
    internal = None
    if args.internal_version:
        internal = {"version": args.internal_version, "build": args.build or "", "source": "tham số --internal-version"}
        result.warn("Nguồn version", "dùng --internal-version (không đọc từ file)")
    else:
        target, error = (args.file, "") if args.mode == "pre" else download_for_post(
            args.platform, args.version, args.file)
        if error:
            result.fail("Tải artifact", error)
            target = None
        if target and not os.path.isfile(target):
            result.fail("Artifact", f"không thấy file: {target}")
            target = None
        if target:
            reader = READERS[args.platform]
            info = reader(target)
            if "error" in info:
                result.unknown_("Đọc version trong artifact", info["error"])
            else:
                internal = info
                result.ok("Đọc version trong artifact",
                          f"{info.get('version')}" + (f" / build {info.get('build')}" if info.get("build") else ""))

    if internal:
        got, want = norm(internal.get("version")), norm(args.version)
        if got == want:
            result.ok("Version trong artifact khớp", f"{got} == {want}")
        else:
            result.fail("Version trong artifact KHÁC",
                        f"trong file: {internal.get('version')} · định phát: {args.version}")
        if args.build:
            if str(internal.get("build") or "") == str(args.build):
                result.ok("Build khớp", f"build {args.build}")
            else:
                result.fail("Build KHÁC",
                            f"trong file: {internal.get('build') or '(không có)'} · định phát: {args.build}")
        if internal.get("ext_version") is not None:
            if norm(internal["ext_version"]) == want and str(internal.get("ext_build") or "") == str(args.build or internal.get("ext_build") or ""):
                result.ok("Extension cùng số", f"{internal['ext_version']} / {internal.get('ext_build')}")
            else:
                result.fail("Extension LỆCH số",
                            f"app {internal.get('version')}/{internal.get('build')} vs ext "
                            f"{internal.get('ext_version')}/{internal.get('ext_build')}")
        if internal.get("extension") is False:
            result.fail("Thiếu extension", "IPA không có .appex (PUBLISHER_PROCESS §2)")
        if internal.get("product"):
            result.ok("ProductVersion", str(internal["product"]))

        # iOS/macOS: credential hysteria2 nhúng lúc build PHẢI có (cả app lẫn extension).
        # Thiếu ⇒ app cài được nhưng KHÔNG kết nối được (ca thật 22/09/2026, bản macOS build tay).
        if "hysteria_password" in internal:
            _check_hysteria_credentials(result, internal)

        # iOS: nhóm keychain phải có trong CẢ code signature LẪN provisioning profile.
        # Thiếu ở profile ⇒ SecItemAdd trả -34018 ⇒ không lưu được phiên ⇒ "nhập code xong
        # không vào được app" (ca thật 22/09/2026).
        if "keychain_signature" in internal:
            sig, prof = internal["keychain_signature"], internal.get("keychain_profile") or []
            missing = internal.get("keychain_missing") or []
            if not sig:
                result.unknown_("Nhóm keychain", "không đọc được keychain-access-groups trong binary")
            elif missing:
                result.fail("Nhóm keychain THIẾU trong profile",
                            f"binary khai {missing} nhưng profile chỉ cấp {prof} ⇒ keychain trả "
                            f"errSecMissingEntitlement (-34018), app không lưu được phiên đăng nhập. "
                            f"Sửa: bật Keychain Sharing cho App ID (nhóm G6XW3RN6LJ.com.privatevpn.shared) "
                            f"rồi sinh lại profile và ký lại IPA")
            else:
                result.ok("Nhóm keychain khớp profile", f"{sig}")

        # macOS: vé staple + Gatekeeper + chữ ký — đúng những gì khách gặp khi mở lần đầu.
        if "staple_ok" in internal:
            if internal.get("staple_ok"):
                result.ok("Vé staple của DMG", internal.get("staple_note") or "hợp lệ")
            else:
                result.fail("DMG CHƯA STAPLE",
                            f"`xcrun stapler validate` thất bại ({internal.get('staple_note')}) ⇒ máy khách "
                            f"không có vé để Gatekeeper đối chiếu ⇒ mở app báo 'không thể mở'. "
                            f"Chạy `xcrun stapler staple <dmg>`; nếu phải ký lại DMG thì đúng thứ tự: "
                            f"ký → notarytool submit --wait (Accepted) → staple")
            if internal.get("app_staple_ok") is False:
                result.fail("App bên trong chưa staple",
                            "staple cả VPNFlow.app rồi mới tạo DMG (app phải tự mang vé, không chỉ DMG)")
            if internal.get("spctl_ok") is False:
                result.fail("Gatekeeper chặn (spctl)",
                            f"{internal.get('spctl_note')} — khách sẽ không mở được")
            elif internal.get("spctl_ok"):
                result.ok("Gatekeeper (spctl)", internal.get("spctl_note") or "accepted")
            if internal.get("codesign_ok") is False:
                result.fail("Chữ ký app KHÔNG hợp lệ",
                            f"codesign --verify --deep --strict: {internal.get('codesign_note')}")
            elif internal.get("codesign_ok"):
                result.ok("codesign --deep --strict", "valid on disk")

    # Windows: kiểm thêm exe app bên trong (nơi thực sự mang số hiệu người dùng thấy)
    if args.app_exe:
        info = version_windows(args.app_exe)
        if "error" in info:
            result.unknown_("Version app exe", info["error"])
        else:
            got = norm(info.get("version"))
            if got == norm(args.version):
                result.ok("App exe khớp", f"FileVersion {info.get('version')}")
            else:
                result.fail("App exe KHÁC",
                            f"FileVersion {info.get('version')} · định phát {args.version} "
                            f"(csproj thiếu <Version> ⇒ app tự khai 1.0.0)")

    # ---- 2. mốc phiên bản trên control-plane
    latest, error = marker_latest(args.platform)
    if error:
        result.unknown_("Đọc mốc latest_version", error)
    elif not latest:
        result.unknown_("Mốc latest_version", "server không trả latest_version")
    else:
        relation = compare(args.version, latest)
        if args.mode == "post":
            # Sau upload: mốc PHẢI bằng bản vừa phát. Nhỏ hơn = quên PATCH (đúng ca 1.0.7:
            # buy page 1.0.7 nhưng latest_version kẹt 1.0.5 nên app không được báo có bản mới).
            if relation == 0:
                result.ok("Mốc phiên bản", f"đã bằng bản vừa phát ({latest})")
            elif relation > 0:
                result.fail("Mốc phiên bản CHƯA cập nhật",
                            f"mốc đang {latest} < bản vừa phát {args.version} — PATCH /v1/admin/<platform>-version")
            else:
                result.warn("Mốc phiên bản", f"mốc {latest} > bản vừa kiểm {args.version}")
        elif relation > 0:
            result.ok("Mốc phiên bản", f"đang {latest} → phát {args.version} (tiến)")
        elif relation == 0:
            if args.allow_same:
                result.ok("Mốc phiên bản", f"phát lại đúng {latest} (đã cho phép)")
            else:
                result.warn("Mốc phiên bản", f"đang {latest} — phát lại CÙNG số, khách sẽ không thấy 'có bản mới'")
        else:
            result.fail("Phát hành LÙI", f"mốc đang {latest} > định phát {args.version}")

    # ---- 3. file đang phát trên route tải (cảnh báo sớm nếu chưa upload / phát nhầm)
    if args.platform == "windows":
        probe = http_head(f"{BASE}" + WINDOWS_DL.format(name=f"VPNFlow-Setup-{args.version}.exe"))
    else:
        probe = http_head(f"{BASE}" + DOWNLOAD_ROUTES[args.platform])
    if "__error__" in probe:
        result.warn("Route tải", f"không HEAD được: {probe['__error__']}")
    else:
        served = probe.get("length") or 0
        local = os.path.getsize(args.file) if args.file and os.path.isfile(args.file) else 0
        if probe.get("status") != 200:
            result.warn("Route tải", f"HTTP {probe.get('status')}")
        elif local and served == local:
            result.warn("Route tải", f"file đang phát đã đúng {served} byte như local (có thể chưa upload bản mới)")
        else:
            result.ok("Route tải", f"HTTP 200 · đang phát {served} byte"
                                   + (f" · local {local} byte" if local else ""))

    print("\n-- Kết quả --")
    result.render()

    if result.failed:
        print(f"\n⛔ KHÔNG ĐẠT ({result.failed} mục) — DỪNG publish. Sửa rồi chạy lại cổng này.")
        return 1
    if result.unknown:
        print(f"\n⚠️  {result.unknown} mục không kiểm được — chạy cổng này trên máy có đủ công cụ "
              f"(macOS cho DMG, Windows cho .exe, Android SDK cho APK) trước khi publish.")
        return 2
    if result.warned:
        print(f"\n✅ ĐẠT (có {result.warned} cảnh báo — đọc kỹ trước khi upload).")
        return 0
    print("\n✅ ĐẠT — được phép upload.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
