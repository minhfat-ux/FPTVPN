#!/usr/bin/env python3
"""Bổ sung các đường dẫn allowlist còn thiếu trong config đang dùng.

Vì sao cần: `loadConfig()` trong selfdefense.mjs hợp nhất `{...DEFAULT_CONFIG, ...user}`, nên
`allow.pathPrefixes` trong config.json ĐÈ HẲN mặc định trong code. Bản mới thêm đường dẫn vào
mặc định sẽ KHÔNG có tác dụng với máy đã cài — đã gặp thật 25/09/2026: thiếu `/Library/Developer/`
khiến CoreSimulator bắn alert oan liên tục.

Chỉ THÊM, không bao giờ xoá — phần người dùng tự cấu hình được giữ nguyên.
"""
from __future__ import annotations

import json
import sys


def main() -> int:
    if len(sys.argv) != 3:
        print("dùng: sync-config-allowlist.py <config.example.json> <config.json>")
        return 2
    example_path, config_path = sys.argv[1], sys.argv[2]

    try:
        with open(example_path, encoding="utf-8") as fh:
            want = json.load(fh).get("allow", {}).get("pathPrefixes", [])
        with open(config_path, encoding="utf-8") as fh:
            current = json.load(fh)
    except (OSError, ValueError) as err:
        print(f"(bỏ qua kiểm tra allowlist: {err})")
        return 0

    have = current.setdefault("allow", {}).setdefault("pathPrefixes", [])
    missing = [p for p in want if p not in have]
    if not missing:
        print("allowlist trong config đã đủ")
        return 0

    have.extend(missing)
    with open(config_path, "w", encoding="utf-8") as fh:
        json.dump(current, fh, indent=2, ensure_ascii=False)
        fh.write("\n")
    print("+ bổ sung allowlist còn thiếu: " + ", ".join(missing))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
