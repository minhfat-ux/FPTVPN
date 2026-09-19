#!/usr/bin/env python3
"""Dựng bản `sing-tun` CÓ gVisor để nhúng vào framework Apple.

Vì sao cần: framework hysteria đang dùng `github.com/apernet/sing-tun` — bản fork mà
hysteria tự bỏ gVisor bằng `scripts/remove_gvisor.sh` (chỉ còn `stack_gvisor_stub.go`
trả `ErrGVisorNotIncluded`). Trên macOS, utun của NetworkExtension KHÔNG chở gói (xem
`iOS/PrivateVPNPacketTunnel/HysteriaTransport.swift:resolveTunnelFD`) nên stack `System`
không thể kết thúc TCP: nó NAT gói TCP về `100.100.100.102` rồi đẩy ngược vào TUN để
kernel nói chuyện với listener của chính extension, mà vòng đó không bao giờ khép kín
⇒ mọi SYN treo `SYN_SENT`. gVisor kết thúc TCP ngay trong userspace nên không cần vòng
đó. Xem thêm `tools/hysteria-apple/patch_gvisor.py`.

Vì sao KHÔNG `replace` thẳng sang `github.com/sagernet/sing-tun`: fork của apernet có
thêm `StackRunner` (hysteria gọi `tunStack.(tun.StackRunner).Run()`) và vài patch darwin
(`errors_patch*.go`, `isErrNotPollable`) — thay hẳn module là mất chúng. Thay vào đó:
giữ nguyên fork, CHÉP LẠI đúng các file `//go:build with_gvisor` của upstream
sagernet/sing-tun ở phiên bản nền của fork, rồi build với `-tags with_gvisor`.

Phiên bản nền (`UPSTREAM_VERSION`): fork có `go.mod` y hệt `v0.2.5` (cùng `sing v0.3.2`,
`x/net v0.21.0`, `x/sys v0.17.0`, `comshim`) và `diff -rq` chỉ khác đúng các file gVisor
bị xoá + vài patch của hysteria, nên API khớp 1:1.

Dùng:
  prepare_sing_tun.py --fork <dir> --upstream <dir> --dest <dir>
                     [--gvisor-version v0.0.0-20231209105102-8d27a30e436e]
"""
import argparse
import os
import re
import shutil
import sys

UPSTREAM_VERSION = "v0.2.5"
GVISOR_VERSION = "v0.0.0-20231209105102-8d27a30e436e"
# Các require mà upstream v0.2.5 cần thêm khi bật gVisor (xem go.mod của v0.2.5).
GVISOR_REQUIRES = [
    ("github.com/sagernet/gvisor", GVISOR_VERSION, ""),
    ("github.com/google/btree", "v1.1.2", " // indirect"),
    ("golang.org/x/time", "v0.5.0", " // indirect"),
]


def build_tag(path):
    """Nhãn build ở dòng đầu file .go ('' nếu không có)."""
    with open(path, "r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            return line if line.startswith("//go:build") else ""
    return ""


def force_rmtree(path):
    """Xoá cây có file chỉ-đọc (bản sao module cache để lại 0444/0555)."""
    if not os.path.exists(path):
        return
    os.chmod(path, 0o755)
    for root, dirs, files in os.walk(path):
        for name in dirs + files:
            try:
                os.chmod(os.path.join(root, name), 0o755)
            except OSError:
                pass
    shutil.rmtree(path)
    assert not os.path.exists(path), f"không xoá được {path}"


def copy_tree_writable(source, dest):
    force_rmtree(dest)
    shutil.copytree(source, dest)
    # Module cache để file ở dạng chỉ-đọc (0444/0555) — trả quyền ghi cho bản sao.
    os.chmod(dest, 0o755)
    for root, dirs, files in os.walk(dest):
        for name in dirs:
            os.chmod(os.path.join(root, name), 0o755)
        for name in files:
            os.chmod(os.path.join(root, name), 0o644)


def restore_gvisor_files(upstream, dest):
    """Chép mọi file upstream có nhãn `with_gvisor` vào bản sao của fork."""
    wanted = []
    for name in sorted(os.listdir(upstream)):
        path = os.path.join(upstream, name)
        if not os.path.isfile(path) or not name.endswith(".go"):
            continue
        tag = build_tag(path)
        if "with_gvisor" in tag:
            wanted.append(name)
    assert "stack_gvisor.go" in wanted, f"upstream {upstream} không có stack_gvisor.go"
    assert "tun_darwin_gvisor.go" in wanted, f"upstream {upstream} thiếu endpoint gVisor cho darwin"
    for name in wanted:
        text = open(os.path.join(upstream, name), "r", encoding="utf-8").read()
        # File của upstream import chính module sagernet; trong fork phải trỏ về apernet.
        text = text.replace("github.com/sagernet/sing-tun/", "github.com/apernet/sing-tun/")
        with open(os.path.join(dest, name), "w", encoding="utf-8") as handle:
            handle.write(text)
    return wanted


def retag_stub(dest):
    """`stack_gvisor_stub.go` của fork bị bỏ mất nhãn `!with_gvisor` — trả lại."""
    path = os.path.join(dest, "stack_gvisor_stub.go")
    text = open(path, "r", encoding="utf-8").read()
    if text.lstrip().startswith("//go:build"):
        # Nhãn cũ có thể là bất kỳ biến thể nào; chuẩn hoá lại thành `!with_gvisor`.
        text = re.sub(r"^\s*//go:build[^\n]*\n+", "", text, count=1)
    text = "//go:build !with_gvisor\n\n" + text
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(text)


def patch_go_mod(dest):
    path = os.path.join(dest, "go.mod")
    text = open(path, "r", encoding="utf-8").read()
    missing = [
        (module, version, comment)
        for module, version, comment in GVISOR_REQUIRES
        if f"\t{module} " not in text
    ]
    if missing:
        block = "require (\n" + "".join(
            f"\t{module} {version}{comment}\n" for module, version, comment in missing
        ) + ")\n"
        text = text.rstrip("\n") + "\n\n" + block
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(text)
    return [module for module, _, _ in missing]


def merge_go_sum(dest, upstream):
    """go.sum của bản sao cần dòng cho các module mới (gomod của upstream v0.2.5)."""
    with open(os.path.join(dest, "go.sum"), "r", encoding="utf-8") as handle:
        lines = set(handle.read().splitlines())
    with open(os.path.join(upstream, "go.sum"), "r", encoding="utf-8") as handle:
        extra = set(handle.read().splitlines())
    merged = sorted(line for line in lines | extra if line.strip())
    with open(os.path.join(dest, "go.sum"), "w", encoding="utf-8") as handle:
        handle.write("\n".join(merged) + "\n")
    return len(merged) - len(lines)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--fork", required=True, help="thư mục module github.com/apernet/sing-tun")
    parser.add_argument("--upstream", required=True, help="thư mục module github.com/sagernet/sing-tun (cùng phiên bản nền)")
    parser.add_argument("--dest", required=True, help="đích (thư mục mới, sẽ bị xoá nếu có)")
    parser.add_argument("--gvisor-version", default=GVISOR_VERSION)
    args = parser.parse_args()

    global GVISOR_REQUIRES
    GVISOR_REQUIRES = [
        (module, args.gvisor_version if module == "github.com/sagernet/gvisor" else version, comment)
        for module, version, comment in GVISOR_REQUIRES
    ]

    if os.path.abspath(args.fork) == os.path.abspath(args.dest):
        raise SystemExit("--fork và --dest trùng nhau: `go list -m` đang trả thư mục replace")
    if not os.path.exists(os.path.join(args.fork, "go.mod")):
        raise SystemExit(f"{args.fork} không có go.mod")
    module = open(os.path.join(args.fork, "go.mod"), "r", encoding="utf-8").read()
    assert module.splitlines()[0].strip() == "module github.com/apernet/sing-tun", \
        f"{args.fork} không phải module apernet/sing-tun"

    copy_tree_writable(args.fork, args.dest)
    # `scripts/remove_gvisor.sh` trong fork sẽ xoá lại đúng thứ ta vừa chép vào.
    shutil.rmtree(os.path.join(args.dest, "scripts"), ignore_errors=True)

    restored = restore_gvisor_files(args.upstream, args.dest)
    retag_stub(args.dest)
    added_requires = patch_go_mod(args.dest)
    added_sums = merge_go_sum(args.dest, args.upstream)

    print(f"   chép {len(restored)} file gVisor từ {os.path.basename(args.upstream)}: " + ", ".join(restored))
    print(f"   require thêm vào go.mod: {added_requires or 'không (đã có)'}")
    print(f"   go.sum: +{added_sums} dòng")
    return 0


if __name__ == "__main__":
    sys.exit(main())
