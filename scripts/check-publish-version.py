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
# Nhóm keychain mà code iOS thực sự dùng (KeychainStore.accessGroup + PacketTunnelProvider) —
# cổng chặn bắt buộc profile phải cấp ĐÚNG nhóm này, không chấp nhận wildcard `TEAMID.*`.
DEFAULT_IOS_KEYCHAIN_GROUP = "G6XW3RN6LJ.com.privatevpn.shared"


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
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8", "replace"))
    except (urllib.error.URLError, urllib.error.HTTPError, ValueError, TimeoutError) as exc:
        return {"__error__": str(exc)}


def http_head(url: str, timeout: int = 25) -> dict:
    request = urllib.request.Request(url, method="HEAD", headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return {
                "status": response.status,
                "length": int(response.headers.get("Content-Length") or 0),
            }
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as exc:
        return {"__error__": str(exc)}


def marker_latest(platform: str) -> tuple[str | None, str | None]:
    """Trả (latest_version, lỗi)."""
    payload = http_json(f"{BASE}/v1/app-version?platform={platform}")
    if "__error__" in payload:
        return None, payload["__error__"]
    return str(payload.get("latest_version") or ""), None


# ---------------------------------------------------------------- đọc version trong artifact


def version_ios(path: str) -> dict:
    """IPA: Payload/*.app/Info.plist (+ kiểm extension có mặt — luật §2)."""
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
        # Extension phải cùng số với app (PUBLISHER_PROCESS §2).
        ext_info = [n for n in names if re.fullmatch(r"Payload/[^/]+\.app/PlugIns/[^/]+\.appex/Info\.plist", n)]
        if ext_info:
            with archive.open(ext_info[0]) as handle:
                ext = plistlib.load(handle)
            out["ext_version"] = ext.get("CFBundleShortVersionString")
            out["ext_build"] = str(ext.get("CFBundleVersion") or "")
        return out


# ------------------------------------------- chữ ký vs PROFILE (sự cố 22/09/2026)
# Vì sao có khối này: IPA 1.4.0/16 (8.135.823 B) khai trong CHỮ KÝ
# `keychain-access-groups = G6XW3RN6LJ.com.privatevpn.shared`, nhưng `embedded.mobileprovision`
# chỉ cấp nhóm wildcard `G6XW3RN6LJ.*` ⇒ iOS không coi nhóm cụ thể là được cấp ⇒ `SecItemAdd`
# trả `errSecMissingEntitlement` (-34018) ⇒ `AuthSessionStore.save()` nuốt lỗi, `isSignedIn=false`,
# app kẹt ở màn hình đăng nhập (và khoá WireGuard không lưu được ⇒ tunnel chết). Cổng cũ chỉ soi
# CHỮ KÝ (thấy `.shared` nên PASS oan) mà không soi PROFILE. Luật mới: kiểm CẢ HAI, cho app + extension.
TEAM_PREFIX_RE = re.compile(r"^\$\((?:AppIdentifierPrefix|TeamIdentifierPrefix)\)")
TEAM_WILDCARD_RE = re.compile(r"^[A-Z0-9]{10}\.\*$")


def _plist_bytes(raw: bytes):
    """Bóc khối XML plist ra khỏi vỏ CMS của file `.mobileprovision`."""
    start = raw.find(b"<?xml")
    end = raw.rfind(b"</plist>")
    if start < 0 or end < 0:
        return None
    try:
        return plistlib.loads(raw[start:end + len(b"</plist>")])
    except Exception:
        return None


def _ios_bundles(root: str) -> dict:
    """Đường dẫn Payload/*.app và .appex bên trong thư mục đã giải nén."""
    payload = os.path.join(root, "Payload")
    if not os.path.isdir(payload):
        return {"app": None, "ext": None}
    app = next((os.path.join(payload, n) for n in sorted(os.listdir(payload)) if n.endswith(".app")), None)
    ext = None
    if app:
        plugins = os.path.join(app, "PlugIns")
        if os.path.isdir(plugins):
            ext = next((os.path.join(plugins, n) for n in sorted(os.listdir(plugins)) if n.endswith(".appex")), None)
    return {"app": app, "ext": ext}


def _codesign_entitlements(bundle: str) -> dict:
    """Entitlements đang có trong chữ ký của bundle (cần macOS + codesign)."""
    if not bundle or not os.path.isdir(bundle):
        return {}
    proc = subprocess.run(["codesign", "-d", "--entitlements", ":-", bundle], capture_output=True)
    plist = _plist_bytes((proc.stdout or b"") + (proc.stderr or b""))
    return plist if isinstance(plist, dict) else {}


def ios_entitlement_report(path: str) -> tuple[dict | None, str]:
    """Trả ({'app': {sig, profile}, 'ext': {...}}, lỗi) cho một IPA."""
    if not shutil.which("codesign"):
        return None, "cần macOS + codesign để đọc entitlements trong chữ ký (chạy cổng này trên máy Mac)"
    work = tempfile.mkdtemp(prefix="vpnflow-ipa-")
    try:
        with zipfile.ZipFile(path) as archive:
            archive.extractall(work)
        bundles = _ios_bundles(work)
        if not bundles["app"]:
            return None, "IPA không có Payload/*.app"
        report: dict = {}
        for label in ("app", "ext"):
            bundle = bundles[label]
            if not bundle:
                continue
            profile = {}
            profile_path = os.path.join(bundle, "embedded.mobileprovision")
            if os.path.isfile(profile_path):
                with open(profile_path, "rb") as handle:
                    profile = (_plist_bytes(handle.read()) or {}).get("Entitlements") or {}
            report[label] = {"sig": _codesign_entitlements(bundle), "profile": profile}
        return report, ""
    finally:
        shutil.rmtree(work, ignore_errors=True)


def _team_id(ents: dict) -> str:
    app_id = str(ents.get("application-identifier") or "")
    return app_id.split(".")[0] if app_id else ""


def _keychain_groups(ents: dict, team: str) -> list:
    """Nhóm keychain do bundle khai (bỏ nhóm hệ thống `com.apple.*`), đã giải `$(TeamIdentifierPrefix)`."""
    groups: list = []
    for group in ents.get("keychain-access-groups") or []:
        if not isinstance(group, str) or group.startswith("com.apple."):
            continue
        resolved = TEAM_PREFIX_RE.sub((team + ".") if team else "", group)
        if resolved not in groups:
            groups.append(resolved)
    return groups


def _has_team_wildcard(groups: list) -> bool:
    return any(TEAM_WILDCARD_RE.match(g or "") for g in groups)


def check_ios_keychain(result: "Result", path: str, allow_wildcard: bool = False,
                       required: list | None = None) -> None:
    """Đối chiếu nhóm keychain trong CHỮ KÝ với nhóm PROFILE thực sự cấp (app + extension).

    `required` = nhóm cụ thể mà code app thực sự dùng (mặc định lấy hằng số của app này).
    Chỉ khi nhóm đó có mặt ở CẢ chữ ký LẪN profile thì `SecItemAdd` mới chắc chắn chạy.
    """
    report, error = ios_entitlement_report(path)
    if error:
        result.unknown_("Keychain iOS (chữ ký vs profile)", error)
        return
    required = required or []
    shared: dict = {}
    for label, name in (("app", "App"), ("ext", "Extension")):
        item = report.get(label)
        if not item:
            continue
        team = _team_id(item["sig"]) or _team_id(item["profile"])
        sig_groups = _keychain_groups(item["sig"], team)
        prof_groups = _keychain_groups(item["profile"], team)
        shared[label] = tuple(sig_groups)

        # `application-identifier` của chữ ký phải khớp profile (bắt lỗi ký sai entitlements —
        # đúng ca appex 1.4.0/16 bị ký bằng entitlements của app).
        sig_app = item["sig"].get("application-identifier")
        prof_app = item["profile"].get("application-identifier")
        if sig_app and prof_app and sig_app != prof_app:
            result.fail(f"application-identifier iOS ({name})",
                        f"chữ ký {sig_app} ≠ profile {prof_app} (bundle bị ký sai entitlements)")

        if required:
            for group in required:
                sig_ok = group in sig_groups or (allow_wildcard and _has_team_wildcard(sig_groups))
                prof_ok = group in prof_groups or (allow_wildcard and _has_team_wildcard(prof_groups))
                if not sig_ok:
                    result.fail(f"Keychain group iOS ({name})",
                                f"CHỮ KÝ không khai nhóm {group} (đang khai {sig_groups or 'không có'})")
                if not prof_ok:
                    result.fail(f"Keychain group iOS ({name})",
                                f"PROFILE không cấp nhóm {group} (profile: {prof_groups or 'không có'}) — "
                                f"SecItemAdd sẽ trả errSecMissingEntitlement (-34018) ⇒ app kẹt màn hình đăng nhập")
                if sig_ok and prof_ok:
                    result.ok(f"Keychain group iOS ({name})", f"{group} có ở cả chữ ký lẫn profile")
            continue

        if not sig_groups:
            result.warn(f"Keychain group iOS ({name})", "chữ ký không khai keychain-access-groups")
            continue
        # Không biết nhóm runtime ⇒ đối chiếu chung: mọi nhóm chữ ký phải có trong profile
        # (wildcard `TEAMID.*` KHÔNG tính là cấp nhóm cụ thể — kẽ hở làm lọt bản 1.4.0/16).
        missing = [g for g in sig_groups
                   if g not in prof_groups and not (allow_wildcard and _has_team_wildcard(prof_groups))]
        if missing:
            result.fail(f"Keychain group iOS ({name})",
                        f"chữ ký khai {sig_groups} nhưng PROFILE không cấp {missing} "
                        f"(profile: {prof_groups or 'không có'}) — SecItemAdd sẽ trả "
                        f"errSecMissingEntitlement (-34018) ⇒ app kẹt màn hình đăng nhập")
        else:
            result.ok(f"Keychain group iOS ({name})", f"{sig_groups} có trong profile")
    if shared.get("app") and shared.get("ext") and shared["app"] != shared["ext"]:
        result.fail("Nhóm keychain app ≠ extension",
                    f"app {shared['app']} vs ext {shared['ext']} — app và extension PHẢI cùng nhóm")


def version_android(path: str) -> dict:
    """APK: aapt2 dump badging (công cụ chuẩn của luật §2)."""
    aapt2 = shutil.which("aapt2") or shutil.which("aapt")
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


def version_macos(path: str) -> dict:
    """DMG: mount rồi đọc Info.plist của .app (chỉ làm được trên macOS)."""
    if sys.platform != "darwin":
        return {"error": "cần macOS (hdiutil) để đọc version trong DMG — chạy trên máy Mac"}
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
                return {
                    "version": info.get("CFBundleShortVersionString"),
                    "build": str(info.get("CFBundleVersion") or ""),
                }
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
    target = os.path.join(tempfile.gettempdir(), os.path.basename(url.split("?")[0]) or "artifact.bin")
    # PHẢI gửi kèm UA thật: `urlretrieve` mặc định dùng `Python-urllib/...` nên Cloudflare trả 403
    # (đã gặp thật 22/09: `--mode post` không tải được DMG, trong khi `http_json`/`http_head` thì được
    # vì đã set UA). Tải theo luồng để không nạp cả file vào RAM.
    request = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(request, timeout=120) as response, open(target, "wb") as handle:
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
    parser.add_argument("--allow-keychain-wildcard", action="store_true",
                        help="iOS: coi nhóm wildcard TEAMID.* trong profile là đủ (mặc định: BẮT BUỘC "
                             "profile liệt kê đúng nhóm cụ thể mà chữ ký khai)")
    parser.add_argument("--require-keychain-group", action="append", default=None,
                        help="iOS: nhóm keychain BẮT BUỘC có ở cả chữ ký lẫn profile "
                             f"(mặc định: {DEFAULT_IOS_KEYCHAIN_GROUP})")
    args = parser.parse_args()

    result = Result()
    print(f"== Cổng chặn version · platform={args.platform} · mode={args.mode} · định phát {args.version}"
          + (f" (build {args.build})" if args.build else ""))

    # ---- 1. version BÊN TRONG artifact
    internal = None
    artifact = None
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
            artifact = target
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

    # ---- 1b. iOS: nhóm keychain phải được CẢ chữ ký LẪN profile cấp (sự cố 22/09/2026)
    if args.platform == "ios" and artifact:
        required = args.require_keychain_group or [DEFAULT_IOS_KEYCHAIN_GROUP]
        check_ios_keychain(result, artifact, args.allow_keychain_wildcard, required)

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
