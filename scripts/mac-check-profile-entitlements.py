#!/usr/bin/env python3
"""Cổng chặn: profile nhúng PHẢI cấp ĐỦ quyền mà binary yêu cầu.

Vì sao có file này (ca thật 26/09/2026):
  Profile Developer ID của macOS chỉ cấp các giá trị `*-systemextension` cho
  `com.apple.developer.networking.networkextension`, trong khi app/appex khai `packet-tunnel-provider`.
  ⇒ AMFI `AppleMobileFileIntegrityError Code=-413 "No matching profile found"` +
  `Unsatisfied Entitlements: com.apple.developer.networking.networkextension` ⇒ kernel chặn tiến trình
  (`ASP: Security policy would not allow process`) ⇒ macOS báo **"The application "VPNFlow" can't be opened."**
  Bản 1.4.6/21 đã ký + notarize + staple + `spctl accepted` mà vẫn KHÔNG mở được ⇒ cổng notarize/spctl
  KHÔNG bắt được lỗi này. Chỉ cổng này bắt được.

Dùng:
  python3 scripts/mac-check-profile-entitlements.py <VPNFlow.app> [<...appex>]
Mã thoát: 0 = đạt · 1 = thiếu quyền (DỪNG, không phát hành) · 2 = không kiểm được.
"""
import plistlib
import subprocess
import sys


def entitlements_of(target: str) -> dict:
    out = subprocess.run(
        ["codesign", "-d", "--entitlements", ":-", target],
        capture_output=True,
    ).stdout
    if b"<?xml" not in out:
        return {}
    start = out.index(b"<?xml")
    return plistlib.loads(out[start:])


def profile_entitlements(target: str) -> dict | None:
    prof = f"{target.rstrip('/')}/Contents/embedded.provisionprofile"
    import os

    if not os.path.isfile(prof):
        return None
    out = subprocess.run(["security", "cms", "-D", "-i", prof], capture_output=True).stdout
    if not out.strip():
        return None
    return plistlib.loads(out).get("Entitlements", {})


def covered(value, granted, key: str) -> bool:
    """True nếu `value` do binary yêu cầu nằm trong `granted` của profile."""
    if isinstance(value, list):
        if not isinstance(granted, list):
            return False
        for item in value:
            if item in granted:
                continue
            if isinstance(item, str) and any(
                isinstance(g, str) and g.endswith("*") and item.startswith(g[:-1]) for g in granted
            ):
                continue
            return False
        return True
    if isinstance(value, str):
        if value == granted:
            return True
        return isinstance(granted, str) and granted.endswith("*") and value.startswith(granted[:-1])
    return value == granted


def main() -> int:
    targets = sys.argv[1:]
    if not targets:
        print("dùng: mac-check-profile-entitlements.py <app> [<appex> …]", file=sys.stderr)
        return 2
    exit_code = 0
    for target in targets:
        want = entitlements_of(target)
        if not want:
            print(f"   ? {target}: không đọc được entitlements từ chữ ký")
            exit_code = max(exit_code, 2)
            continue
        # Chỉ quyền "hạn chế" mới bắt buộc phải có trong profile.
        restricted = {
            k: v
            for k, v in want.items()
            if k == "com.apple.developer.networking.networkextension"
            or k.startswith("com.apple.developer.")
            or k == "keychain-access-groups"
            or k == "com.apple.application-identifier"
            # App Group cũng là quyền hạn chế (phải có trong profile) — và system extension BẮT BUỘC
            # có nó vì `NEMachServiceName` phải bắt đầu bằng một App Group (NE error Code=6, 26/09/2026).
            or k == "com.apple.security.application-groups"
        }
        got = profile_entitlements(target)
        if got is None:
            print(f"   LỖI {target}: KHÔNG có Contents/embedded.provisionprofile nhưng binary khai quyền hạn chế:")
            for k in restricted:
                print(f"        - {k}")
            print("        ⇒ macOS sẽ chặn mở app (AMFI -413 'No matching profile found'). DỪNG.")
            exit_code = 1
            continue
        bad = []
        for k, v in restricted.items():
            if k not in got:
                bad.append(f"{k}: profile KHÔNG có khoá này")
            elif not covered(v, got[k], k):
                bad.append(f"{k}: binary xin {v!r} — profile chỉ cấp {got[k]!r}")
        if bad:
            print(f"   LỖI {target}: profile KHÔNG cấp đủ quyền ⇒ app sẽ KHÔNG mở được:")
            for b in bad:
                print(f"        - {b}")
            ne = got.get("com.apple.developer.networking.networkextension", [])
            if not ne:
                print("        ⇒ profile KHÔNG có 'com.apple.developer.networking.networkextension':")
                print("          bật capability NETWORK_EXTENSIONS cho App ID rồi tạo lại profile:")
                print("          `node scripts/asc-mac-devid-profiles.mjs`. KHÔNG phát hành bản này.")
            else:
                print(f"          profile cấp: [{', '.join(ne)}]")
                print("          · tunnel macOS từ 26/09/2026 là SYSTEM EXTENSION ⇒ binary phải khai")
                print("            `packet-tunnel-provider-systemextension` (giá trị `packet-tunnel-provider`")
                print("            của appex plugin KHÔNG dùng được với profile Developer ID).")
                print("          · app (bên gọi OSSystemExtensionRequest) cần thêm")
                print("            `com.apple.developer.system-extension.install` = true.")
                print("          · tạo lại profile: `node scripts/asc-mac-devid-profiles.mjs`.")
            exit_code = 1
        else:
            print(f"   OK {target}: profile cấp đủ {len(restricted)} quyền hạn chế")
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
