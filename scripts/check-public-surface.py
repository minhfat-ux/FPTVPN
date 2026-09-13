#!/usr/bin/env python3
"""Quét TOÀN BỘ bề mặt công khai sau mỗi lần đổi hạ tầng (DNS, entry point, deploy).

Vì sao có script này: 13/09/2026 có 2 sự cố liên tiếp khi chuyển entry point sang node-2 —
(1) node-2 chưa có cert ⇒ web + API chết toàn cầu; (2) thiếu `trusted_proxies` ⇒ IP khách bị dồn
thành IP node-2. Cả hai đều "im lặng" với người đang có cache DNS. Script này kiểm một lượt:

  * DNS: meetflowai.site / api.meetflowai.site đang trỏ về node nào (và có khớp kỳ vọng không)
  * TLS: chứng chỉ + hạn dùng ở từng node (cảnh báo trước khi hết hạn)
  * Trang công khai: /buy /ai/buy /guide /ai/guide /support /open /terms /privacy
  * API: /health, /v1/app-version, /v1/ai/app-version, /v1/nodes
  * Tải APK: UA máy thường phải nhận VPNFlow.apk, UA Android 7/Fire TV phải nhận VPNFlow-android7.apk

    scripts/check-public-surface.py                      # kiểm qua DNS thật
    scripts/check-public-surface.py --ip 103.6.234.233   # ép kiểm đúng 1 node (--resolve)
    scripts/check-public-surface.py --verbose

Mã trả về: 0 nếu mọi thứ OK; 1 nếu có mục HỎNG.
"""

from __future__ import annotations

import argparse
import datetime as dt
from http.client import HTTPSConnection
import json
import re
import socket
import ssl
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

FAILS: list[str] = []
WARNS: list[str] = []

OKHTTP_UA = "okhttp/4.12.0"
FIRE_TV_UA = "Mozilla/5.0 (Linux; Android 7.1.2; AFTMM Build/NS6265)"

SITE_HOST = "meetflowai.site"
API_HOST = "api.meetflowai.site"
SITE_PATHS = ["/buy", "/ai/buy", "/guide", "/ai/guide", "/support", "/open", "/terms", "/privacy", "/PrivateVPN/Admin"]
API_PATHS = ["/health", "/v1/app-version", "/v1/ai/app-version", "/v1/nodes"]


def _ssl_context() -> ssl.SSLContext:
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except Exception:  # noqa: BLE001
        pass
    for bundle in ("/etc/ssl/cert.pem", "/etc/pki/tls/certs/ca-bundle.crt"):
        try:
            return ssl.create_default_context(cafile=bundle)
        except Exception:  # noqa: BLE001
            continue
    return ssl.create_default_context()


SSL_CTX = _ssl_context()


def record(label: str, ok: bool, detail: str = "", warn_only: bool = False) -> None:
    tag = "OK  " if ok else ("CẢNH BÁO" if warn_only else "HỎNG")
    print(f"  {tag:9} {label}" + (f" — {detail}" if detail else ""))
    if not ok:
        (WARNS if warn_only else FAILS).append(label)


def resolve(host: str) -> str:
    try:
        return socket.gethostbyname(host)
    except Exception:  # noqa: BLE001
        return ""


def cert_info(host: str, ip: str = "") -> tuple[str, int, str]:
    """-> (subject, số ngày còn lại, lỗi). ip rỗng = dùng DNS."""
    try:
        with socket.create_connection((ip or host, 443), timeout=12) as sock:
            with SSL_CTX.wrap_socket(sock, server_hostname=host) as tls:
                der = tls.getpeercert(binary_form=True)
        txt = ssl.DER_cert_to_PEM_cert(der)
        out = subprocess.run(["openssl", "x509", "-noout", "-subject", "-enddate"],
                             input=txt, capture_output=True, text=True, timeout=20).stdout
        subject = re.search(r"subject=(.*)", out)
        end = re.search(r"notAfter=(.*)", out)
        if not end:
            return ("?", 0, "không đọc được hạn cert")
        expires = dt.datetime.strptime(end.group(1).strip(), "%b %d %H:%M:%S %Y %Z").replace(
            tzinfo=dt.timezone.utc)
        days = (expires - dt.datetime.now(dt.timezone.utc)).days
        return (subject.group(1).strip() if subject else "?", days, "")
    except Exception as exc:  # noqa: BLE001
        return ("", 0, f"{type(exc).__name__}: {exc}")


class _ResolvedHTTPS(HTTPSConnection):
    """HTTPSConnection nhưng nối tới `ip` mà vẫn gửi SNI = hostname thật.

    Nếu truyền thẳng IP vào HTTPSConnection thì Python dùng chính IP làm SNI ⇒ Caddy không có
    cert/host nào khớp và trả 'tlsv1 alert internal error' (đúng lỗi đã gặp khi thử).
    """

    def __init__(self, host: str, ip: str, **kwargs):
        super().__init__(host, **kwargs)
        self._ip = ip

    def connect(self):  # noqa: D102 - copy từ http.client, chỉ đổi đích kết nối
        sock = socket.create_connection((self._ip, self.port), self.timeout)
        self.sock = self._context.wrap_socket(sock, server_hostname=self.host)


def fetch(url: str, ip: str = "", ua: str = "", method: str = "GET", timeout: int = 20) -> dict:
    """GET/HEAD url. Nếu `ip` có giá trị thì nối thẳng tới IP đó nhưng vẫn gửi Host/SNI đúng
    (urllib không có tuỳ chọn kiểu `curl --resolve`). Lưu ý: hàm này tên `fetch`, KHÔNG đặt là
    `http` vì sẽ che module `http` và làm `http.client...` hỏng."""
    parts = urllib.parse.urlsplit(url)
    path = parts.path or "/"
    if parts.query:
        path += "?" + parts.query
    if ip:
        conn = _ResolvedHTTPS(parts.hostname, ip, timeout=timeout, context=SSL_CTX)
        conn.putrequest(method, path, skip_host=True)
        conn.putheader("Host", parts.hostname)
        conn.putheader("User-Agent", ua or "surface-check/1")
        conn.endheaders()
        res = conn.getresponse()
        body = b"" if method == "HEAD" else res.read(4096)
        out = {"status": res.status, "headers": dict(res.getheaders()), "body": body}
        conn.close()
        return out
    req = urllib.request.Request(url, method=method, headers={"User-Agent": ua or "surface-check/1"})
    with urllib.request.urlopen(req, timeout=timeout, context=SSL_CTX) as res:
        body = b"" if method == "HEAD" else res.read(4096)
        return {"status": res.status, "headers": dict(res.getheaders()), "body": body}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--ip", default="", help="ép mọi request đi tới IP này (như curl --resolve)")
    parser.add_argument("--expect-site-ip", default="", help="cảnh báo nếu DNS không trỏ về IP này")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()
    ip = args.ip

    print("1) DNS")
    site_ip, api_ip = resolve(SITE_HOST), resolve(API_HOST)
    print(f"     {SITE_HOST} → {site_ip or '(không có A)'}")
    print(f"     {API_HOST} → {api_ip or '(không có A)'}")
    record("cả hai tên miền đều phân giải được", bool(site_ip and api_ip))
    if args.expect_site_ip:
        record(f"DNS trỏ về IP mong đợi ({args.expect_site_ip})",
               site_ip == args.expect_site_ip and api_ip == args.expect_site_ip,
               f"thực tế site={site_ip} api={api_ip}", warn_only=True)

    print("\n2) TLS + hạn chứng chỉ")
    for host in (SITE_HOST, API_HOST):
        subject, days, err = cert_info(host, ip)
        if err:
            record(f"TLS {host}", False, err)
        else:
            record(f"TLS {host}", days > 0, f"{subject} · còn {days} ngày",
                   warn_only=days > 0)
            if days <= 21:
                record(f"chứng chỉ {host} sắp hết hạn", False, f"còn {days} ngày", warn_only=False)

    print("\n3) Trang công khai")
    for path in SITE_PATHS:
        try:
            res = fetch(f"https://{SITE_HOST}{path}", ip)
            record(f"{path}", res["status"] == 200, f"HTTP {res['status']}")
        except Exception as exc:  # noqa: BLE001
            record(f"{path}", False, f"{type(exc).__name__}: {exc}")

    print("\n4) API")
    for path in API_PATHS:
        try:
            res = fetch(f"https://{API_HOST}{path}", ip)
            record(f"{path}", res["status"] == 200, f"HTTP {res['status']}")
        except Exception as exc:  # noqa: BLE001
            record(f"{path}", False, f"{type(exc).__name__}: {exc}")

    print("\n5) Phiên bản app đang quảng cáo + kênh tải APK")
    try:
        res = fetch(f"https://{API_HOST}/v1/app-version?platform=android", ip)
        adv = json.loads(res["body"].decode("utf-8"))
        if args.verbose:
            print("     " + json.dumps(adv, ensure_ascii=False))
        record("payload Android có apk_url + apk_url_legacy",
               bool(adv.get("apk_url")) and bool(adv.get("apk_url_legacy")))
        record("store_url không rỗng (bản ≤1.2.4 chỉ đọc field này)", bool(adv.get("store_url")))
        record("ngưỡng ép cập nhật ≤ bản mới nhất",
               str(adv.get("minimum_version", "0")) <= str(adv.get("latest_version", "0")),
               f"min={adv.get('minimum_version')} latest={adv.get('latest_version')}")
    except Exception as exc:  # noqa: BLE001
        record("đọc /v1/app-version", False, f"{type(exc).__name__}: {exc}")

    for ua, must in ((OKHTTP_UA, "VPNFlow.apk"), (FIRE_TV_UA, "VPNFlow-android7.apk")):
        try:
            res = fetch(f"https://{SITE_HOST}/v1/downloads/android", ip, ua=ua, method="HEAD")
            disp = res["headers"].get("Content-Disposition", "")
            record(f"UA {'Fire TV' if ua == FIRE_TV_UA else 'máy thường'} nhận {must}",
                   must in disp, disp or f"HTTP {res['status']}")
        except Exception as exc:  # noqa: BLE001
            record(f"HEAD APK (UA {'Fire TV' if ua == FIRE_TV_UA else 'máy thường'})", False,
                   f"{type(exc).__name__}: {exc}")

    print()
    if FAILS:
        print(f"KẾT LUẬN: {len(FAILS)} mục HỎNG → " + "; ".join(FAILS))
    else:
        print(f"KẾT LUẬN: bề mặt công khai OK" + (f" ({len(WARNS)} cảnh báo)" if WARNS else ""))
    return 1 if FAILS else 0


if __name__ == "__main__":
    sys.exit(main())
