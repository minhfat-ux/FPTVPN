#!/usr/bin/env python3
"""Cổng TĨNH: bắt lỗi "gọi hàm có `<khoá>.lock()` trong lúc ĐANG giữ chính khoá đó".

Vì sao cần: `NSLock` KHÔNG tái nhập. Một lời gọi như vậy **tự khoá chết** và giữ khoá tới hết
phiên. Ca thật build 25→34 (26 phiên máy thật): nhịp watchdog gọi `currentTransport()` (hàm này
`flowLock.lock()` lần nữa) trong vùng đã khoá ⇒ chết ngay nhịp đầu +15 s ⇒ nhịp lấy mẫu 1 s,
nhịp tim watchdog, đồng hồ canh và giám sát lưu lượng **chết lặng**, còn cầu `packetFlow↔fd`
vẫn chở gói và vẫn in nhịp 5 s nên log trông "bình thường" (xem AGENTS.md §7c).

Thuật toán (theo TỪNG khoá, TỪNG file):
  1. liệt kê hàm mà thân hàm có `<khoá>.lock()`;
  2. với mỗi `<khoá>.lock()`, tìm `<khoá>.unlock()` khớp theo độ sâu ngoặc ⇒ vùng đang giữ khoá
     (bỏ qua mẫu một dòng `lock(); defer { unlock() }` và dòng comment);
  3. báo mọi lời gọi hàm ở nhóm (1) nằm trong vùng đó, và mọi `lock()` không có `unlock()` khớp.

Dùng:  python3 scripts/ios-lint-locks.py [file.swift ...]
Exit 0 = sạch; exit 1 = có lời gọi lấy khoá lồng nhau (hoặc khoá không được nhả).
"""
import glob
import re
import sys

LOCK_RE = re.compile(r"(\w+)\.lock\(\)")
UNLOCK_RE = re.compile(r"(\w+)\.unlock\(\)")


def strip_comment(line):
    """Bỏ comment để không báo nhầm vào chính dòng giải thích."""
    out = []
    in_str = False
    i = 0
    while i < len(line):
        ch = line[i]
        if ch == '"' and (i == 0 or line[i - 1] != "\\"):
            in_str = not in_str
        if not in_str and line[i:i + 2] == "//":
            break
        out.append(ch)
        i += 1
    return "".join(out)


def lock_names(code):
    return sorted({m.group(1) for l in code for m in LOCK_RE.finditer(l)})


def regions_for(code, name):
    """Vùng đang giữ `name`: [(dòng lock, dòng unlock)] và danh sách lock không có unlock khớp."""
    lock = f"{name}.lock()"
    unlock = f"{name}.unlock()"
    regions, unclosed = [], []
    for i, line in enumerate(code):
        if lock not in line:
            continue
        if unlock in line:      # mẫu một dòng `lock(); defer { unlock() }`
            continue
        depth = 0
        for j in range(i + 1, len(code)):
            depth += code[j].count("{") - code[j].count("}")
            if unlock in code[j] and depth <= 0:
                regions.append((i, j))
                break
        else:
            unclosed.append(i + 1)
    return regions, unclosed


def locker_functions(code, name):
    """Tên hàm mà thân hàm có `name.lock()`."""
    lock = f"{name}.lock()"
    names = {}
    for i, line in enumerate(code):
        m = re.search(r"\bfunc\s+(\w+)\s*\(", line)
        if not m:
            continue
        depth = line.count("{") - line.count("}")
        body, k = [], i
        while depth > 0 and k + 1 < len(code):
            k += 1
            body.append(code[k])
            depth += code[k].count("{") - code[k].count("}")
        if any(lock in b for b in body):
            names[m.group(1)] = i + 1
    return names


def check(path):
    raw = open(path, errors="replace").read().splitlines()
    code = [strip_comment(l) for l in raw]
    findings = []
    stats = []
    for name in lock_names(code):
        regions, unclosed = regions_for(code, name)
        lockers = locker_functions(code, name)
        stats.append(f"{name}: {len(regions)} vùng/{len(lockers)} hàm")
        for ln in unclosed:
            findings.append((ln, f"‹{name} KHÔNG được nhả›", 0, ln, 0,
                             f"{name}.lock() không có {name}.unlock() khớp trong file"))
        for a, b in regions:
            for k in range(a + 1, b):
                if re.search(r"\bfunc\s", code[k]):
                    continue
                for fn, decl in lockers.items():
                    if re.search(rf"(?<![\w.]){fn}\s*\(", code[k]):
                        findings.append((k + 1, fn, decl, a + 1, b + 1, raw[k].strip()))
    return stats, findings


def main(paths):
    if not paths:
        paths = sorted(glob.glob("iOS/PrivateVPNPacketTunnel/*.swift"))
    bad = 0
    for p in paths:
        stats, findings = check(p)
        name = p.split("/")[-1]
        if not stats:
            continue
        if findings:
            bad += 1
            print(f"  ❌ {name}: {len(findings)} vấn đề khoá")
            for ln, fn, decl, a, b, text in findings:
                if decl:
                    print(f"       dòng {ln}: `{fn}()` (hàm này lock ở dòng {decl}) "
                          f"nằm trong vùng đang giữ khoá {a}-{b}")
                else:
                    print(f"       dòng {ln}: {fn}")
                print(f"         {text[:96]}")
        else:
            print(f"  ✅ {name}: " + " · ".join(stats))
    print()
    if bad:
        print(f"KẾT LUẬN: KHÔNG ĐẠT — {bad} file có lời gọi lấy khoá LỒNG NHAU "
              "(NSLock không tái nhập — xem AGENTS.md §7c)")
        return 1
    print("KẾT LUẬN: ĐẠT — không có lời gọi lấy khoá lồng nhau")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
