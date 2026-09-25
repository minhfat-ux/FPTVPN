#!/usr/bin/env python3
"""Kiểm bất biến chống RÒ IPv6 của bản vá 26/09/2026 (5G).

BỐI CẢNH: `ipv6Settings.includedRoutes = [::/0]` khiến MỌI IPv6 đi vào tunnel. Bản `18f8c82`
(22/09) làm đúng thế nhưng KHÔNG loại trừ dải của relay ⇒ kết nối của extension tới
`api.meetflowai.site` (có AAAA) bị hút vào tunnel, mà tunnel không có IPv6 ⇒ ĐEN ⇒
"mất mạng khi connect". Bản vá 26/09 loại trừ dải IPv6 Cloudflare để việc đó không thể xảy ra.

Script này chứng minh bất biến đó bằng DỮ LIỆU SỐNG, và bắt được ca Cloudflare thêm dải mới
(lúc đó danh sách hardcode trong `HysteriaDefaults` sẽ cũ đi ⇒ phải cập nhật).

    python3 scripts/check-relay-ipv6-exclusion.py            # kiểm
    python3 scripts/check-relay-ipv6-exclusion.py --verbose

Mã trả về: 0 = ĐẠT; 1 = HỎNG (in rõ dải/địa chỉ nào không khớp).
"""

from __future__ import annotations

import ipaddress
import pathlib
import re
import subprocess
import sys


ROOT = pathlib.Path(__file__).resolve().parent.parent
DEFAULTS = ROOT / "iOS/PrivateVPN/Services/HysteriaDefaults.swift"
OFFICIAL_V6 = "https://www.cloudflare.com/ips-v6/"
RELAY_HOSTS = ["api.meetflowai.site", "t1.meetflowai.site"]

FAILS: list[str] = []


def excluded_ranges() -> list[ipaddress.IPv6Network]:
    """Đọc THẲNG danh sách từ mã nguồn — không chép lại, để script không bị lệch khỏi code."""
    text = DEFAULTS.read_text(encoding="utf-8")
    start = text.index("relayIPv6ExcludedCIDRs")
    block = text[start : text.index("]", start)]
    cidrs = re.findall(r'"([0-9a-fA-F:]+/\d+)"', block)
    if not cidrs:
        FAILS.append("HysteriaDefaults.relayIPv6ExcludedCIDRs RỖNG hoặc không đọc được")
    nets = []
    for cidr in cidrs:
        try:
            nets.append(ipaddress.ip_network(cidr))
        except ValueError as error:
            FAILS.append(f"dải sai định dạng trong mã nguồn: {cidr} ({error})")
    return nets


def resolve_aaaa(host: str) -> list[str]:
    """Phân giải AAAA, thử lại 2 lần.

    Vì sao KHÔNG đẩy lỗi DNS vào `FAILS`: mạng chập chờn làm `dig` timeout là lỗi MÔI TRƯỜNG,
    không phải lỗi mã — để nó fail cổng sẽ thành cổng flaky rồi người ta bỏ qua. Lỗi THẬT của
    cổng này là: một AAAA ĐÃ phân giải được mà KHÔNG nằm trong dải loại trừ.
    """
    for _ in range(2):
        try:
            out = subprocess.run(
                ["dig", "+short", "+time=5", "+tries=1", "AAAA", host],
                capture_output=True, text=True, timeout=12,
            ).stdout
        except Exception:  # noqa: BLE001
            continue
        addrs = [line.strip() for line in out.splitlines() if ":" in line]
        if addrs:
            return addrs
    return []


def main() -> int:
    verbose = "--verbose" in sys.argv
    nets = excluded_ranges()

    print(f"Loại trừ IPv6 trong mã nguồn: {len(nets)} dải")
    for net in nets:
        print(f"  {net}")
    print()

    # (1) Mọi AAAA của host relay phải nằm TRONG một dải loại trừ.
    for host in RELAY_HOSTS:
        addrs = resolve_aaaa(host)
        if not addrs:
            print(f"  ⚠ {host}: không có AAAA (bỏ qua)")
            continue
        for addr in addrs:
            ip = ipaddress.ip_address(addr)
            hit = [str(n) for n in nets if ip in n]
            if hit:
                print(f"  ✅ {host:22s} {addr:34s} ⊂ {hit[0]}")
            else:
                print(f"  ❌ {host:22s} {addr:34s} KHÔNG nằm dải loại trừ nào")
                FAILS.append(f"{host} ({addr}) không được loại trừ ⇒ relay bị hút vào tunnel")

    # (2) Danh sách CHÍNH THỨC của Cloudflare phải được phủ hết (bắt dải mới).
    #     Dùng `curl` chứ KHÔNG dùng urllib: Python của macOS ở đây thiếu CA bundle
    #     (`CERTIFICATE_VERIFY_FAILED`) ⇒ chốt chặn này sẽ chết âm thầm nếu dùng urllib.
    official: list[ipaddress.IPv6Network] = []
    try:
        out = subprocess.run(
            ["curl", "-sS", "--max-time", "20", OFFICIAL_V6],
            capture_output=True, text=True, timeout=30,
        )
        if out.returncode != 0:
            raise RuntimeError(out.stderr.strip()[:200])
        for line in out.stdout.split():
            line = line.strip()
            if ":" in line:
                official.append(ipaddress.ip_network(line))
    except Exception as error:  # noqa: BLE001
        print(f"  ⚠ không lấy được {OFFICIAL_V6}: {error} (bỏ qua mục 2)")
        FAILS.append(f"KHÔNG kiểm được dải Cloudflare công bố ({error})")
    if official:
        print(f"\nCloudflare công bố {len(official)} dải IPv6 — kiểm đã phủ hết chưa:")
        for net in official:
            if any(net.subnet_of(ours) or net == ours for ours in nets):
                if verbose:
                    print(f"  ✅ {net}")
            else:
                print(f"  ❌ {net} CHƯA có trong relayIPv6ExcludedCIDRs ⇒ cập nhật HysteriaDefaults")
                FAILS.append(f"thiếu dải Cloudflare {net}")

    print()
    if FAILS:
        print(f"KẾT LUẬN: HỎNG — {len(FAILS)} vấn đề")
        for item in FAILS:
            print(f"  - {item}")
        return 1
    print("KẾT LUẬN: ĐẠT — mọi AAAA của relay đều bị loại trừ và phủ hết dải Cloudflare công bố.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
