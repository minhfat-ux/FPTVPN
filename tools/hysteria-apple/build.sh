#!/usr/bin/env bash
# Rebuild the Apple (iOS device + iOS simulator + macOS) hysteria2 frameworks used
# by iOS/PrivateVPN*, iOS/PrivateVPNPacketTunnel and the macOS VPNFlow targets.
#
#   ./build.sh                        # clone (if missing) + patch + bind + install
#   HYSTERIA_SRC=/path ./build.sh     # reuse an existing hysteria checkout
#   OUT=/path ./build.sh              # default: $REPO_ROOT/iOS/Frameworks (gitignored)
#   STACK=system ./build.sh           # KHÔNG gVisor (chỉ để A/B; macOS sẽ blackhole TCP)
#
# Stack gVisor (mặc định): đây là thứ làm TCP chạy được qua extension macOS. Stack
# `System` của sing-tun kết thúc TCP bằng vòng NAT qua chính TUN (đẩy gói TCP đã NAT
# về 100.100.100.102 để kernel nói chuyện với listener nằm TRONG extension), mà utun
# của NetworkExtension trên macOS KHÔNG chở gói ⇒ mọi SYN của máy treo `SYN_SENT`.
# Xem `tools/hysteria-apple/patch_gvisor.py` + `prepare_sing_tun.py`.
#
# Requirements: Go 1.25+ + Xcode + gomobile. CẢ HAI toolchain đều chạy được
# (đã test end-to-end, ra framework tương đương) — script tự nhận diện:
#   * fork SagerNet (mặc định trên máy này, $HOME/go/bin/gomobile):
#       go install github.com/sagernet/gomobile/cmd/gomobile@v0.1.13
#       go install github.com/sagernet/gomobile/cmd/gobind@v0.1.13
#   * bản chính thống golang.org/x/mobile (cài vào GOBIN riêng để không ghi đè
#     bản fork dùng cho libbox):
#       GOBIN=/tmp/gomobile-std/bin go install golang.org/x/mobile/cmd/gomobile@latest
#       GOBIN=/tmp/gomobile-std/bin go install golang.org/x/mobile/cmd/gobind@latest
#       GOMOBILE=/tmp/gomobile-std/bin/gomobile ./build.sh
# Điểm mấu chốt KHÔNG phải bản fork: gobind load package bind theo MODULE ĐÍCH,
# nên module hysteria phải require đúng module của toolchain đang dùng (xem bên
# dưới) — thiếu bước đó thì lỗi "unable to import bind: no Go package in
# <module>/bind" (fork) / "missing golang.org/x/mobile dependency" (chính thống).
#
# The xcframeworks (~115 MB of static archives) are NOT committed (.gitignore
# ignores iOS/Frameworks/). Rebuild, then check them with ./verify.sh.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
SRC="${HYSTERIA_SRC:-/tmp/hysteria-apple/hysteria}"
TAG="app/v2.12.2"
OUT="${OUT:-$REPO_ROOT/iOS/Frameworks}"
GOMOBILE="${GOMOBILE:-gomobile}"
GOMOBILE_VERSION="${GOMOBILE_VERSION:-v0.1.13}"   # chỉ dùng cho fork SagerNet
# gVisor (mặc định) hay stack System (chỉ để A/B). Xem khối chú thích ở đầu file.
STACK="${STACK:-gvisor}"
# Phiên bản nền của `github.com/apernet/sing-tun`: fork sao y go.mod của upstream
# v0.2.5 (cùng sing v0.3.2 / x/net v0.21.0 / x/sys v0.17.0) nên file gVisor của
# upstream khớp API 1:1 — xem `prepare_sing_tun.py`.
UPSTREAM_SING_TUN="${UPSTREAM_SING_TUN:-v0.2.5}"
# Phiên bản gVisor mà upstream v0.2.5 require (API `stack.PacketBufferPtr` khớp glue).
GVISOR_VERSION="${GVISOR_VERSION:-v0.0.0-20231209105102-8d27a30e436e}"

export PATH="$PATH:/opt/homebrew/bin:$HOME/go/bin"
export GOTOOLCHAIN="${GOTOOLCHAIN:-local}"
# proxy.golang.org từ mạng này dial timeout (đo 19/09/2026: 3/3 lần treo 12s rồi fail,
# làm `go get` chết sau 5 phút). LƯU Ý: khi GOPROXY là danh sách thì lỗi MẠNG là lỗi
# cứng (Go chỉ rơi sang proxy sau khi gặp 404/410), nên mirror phải đứng trước. Hash
# module vẫn được kiểm qua go.sum + sum.golang.org nên mirror không chèn được code.
export GOPROXY="${GOPROXY:-https://goproxy.cn,https://proxy.golang.org,direct}"

# Go/Xcode work must stay on APFS: the repo lives on exFAT and gobind/xcrun choke
# on it, so everything is built in a temp dir and copied to OUT at the end.
STAGE="$(mktemp -d "${TMPDIR:-/tmp}/hysteria-apple.XXXXXX")"
trap 'rm -rf "$STAGE"' EXIT

GOMOBILE_BIN="$(command -v "$GOMOBILE" || true)"
[ -n "$GOMOBILE_BIN" ] || { echo "gomobile not found: go install github.com/sagernet/gomobile/cmd/gomobile@$GOMOBILE_VERSION"; exit 1; }

GOMOBILE_HELP="$("$GOMOBILE_BIN" bind -h 2>&1 || true)"
case "$GOMOBILE_HELP" in
  *macos*) ;;
  *) echo "$GOMOBILE_BIN does not support -target=macos"; exit 1 ;;
esac

# gomobile gọi `gobind` qua PATH, nên gobind phải CÙNG toolchain với gomobile
# (không được trộn fork với bản chính thống).
export PATH="$(dirname "$GOMOBILE_BIN"):$PATH"
command -v gobind >/dev/null || { echo "gobind not found next to $GOMOBILE_BIN"; exit 1; }

# gobind resolve package bind trong module ĐÍCH: mỗi toolchain cần require riêng.
GOMOBILE_MOD="$(go version -m "$GOMOBILE_BIN" | awk '$1 == "mod" { print $2; exit }')"   # dòng "mod", không phải "path" (path là .../cmd/gomobile)
case "$GOMOBILE_MOD" in
  github.com/sagernet/gomobile)
    TOOLCHAIN_MARKER='github.com/sagernet/gomobile '
    TOOLCHAIN_GET="go get github.com/sagernet/gomobile@$GOMOBILE_VERSION" ;;
  golang.org/x/mobile)
    TOOLCHAIN_MARKER='tool golang.org/x/mobile/cmd/gobind'
    TOOLCHAIN_GET='go get -tool golang.org/x/mobile/cmd/gobind' ;;
  *) echo "unrecognized gomobile build ($GOMOBILE_BIN: $GOMOBILE_MOD)"; exit 1 ;;
esac
echo "==> toolchain: $GOMOBILE_MOD ($GOMOBILE_BIN)"

if [ ! -d "$SRC" ]; then
  echo "==> cloning hysteria ($TAG) into $SRC"
  git clone --depth 1 --branch "$TAG" https://github.com/apernet/hysteria.git "$SRC"
fi

# The Android script's patch is platform-neutral: sing-tun honours
# Options.FileDescriptor on darwin (tun_darwin.go) exactly like on Android, so the
# iOS utun fd from NEPacketTunnelProvider can be handed to hysteria unchanged.
echo "==> patching the tun server for a pre-made TUN fd (iOS utun / Android VpnService)"
(cd "$SRC" && python3 "$REPO_ROOT/tools/hysteria-android/patch_tun_fd.py")

echo "==> installing the gomobile wrapper package"
mkdir -p "$SRC/app/mobile"
cp "$REPO_ROOT/tools/hysteria-android/mobile.go" "$SRC/app/mobile/mobile.go"

echo "==> patching hysteria for the gVisor stack (patch_gvisor.py)"
python3 "$HERE/patch_gvisor.py" --src "$SRC"

BIND_TAGS=()
if [ "$STACK" = "gvisor" ]; then
  # Module sing-tun của framework KHÔNG có gVisor (hysteria bỏ bằng
  # scripts/remove_gvisor.sh). Giữ nguyên fork rồi chép lại các file gVisor của
  # upstream vào một bản sao, và trỏ module sang bản sao đó.
  echo "==> dựng bản sing-tun có gVisor ($UPSTREAM_SING_TUN + gvisor $GVISOR_VERSION)"
  # `go list -m` trả thư mục THAY THẾ khi go.mod đã có replace (lần chạy lại), nên bỏ
  # replace trước rồi mới hỏi để luôn lấy được bản trong module cache.
  (cd "$SRC/app" && GOWORK=off go mod edit -dropreplace=github.com/apernet/sing-tun)
  FORK_DIR="$(cd "$SRC/app" && GOWORK=off go mod download github.com/apernet/sing-tun && GOWORK=off go list -m -f '{{.Dir}}' github.com/apernet/sing-tun)"
  UPSTREAM_DIR="$(cd "$SRC/app" && GOWORK=off go mod download -json "github.com/sagernet/sing-tun@$UPSTREAM_SING_TUN" | python3 -c 'import json,sys; print(json.load(sys.stdin)["Dir"])')"
  echo "   fork=$FORK_DIR"
  echo "   upstream=$UPSTREAM_DIR"
  python3 "$HERE/prepare_sing_tun.py" \
    --fork "$FORK_DIR" --upstream "$UPSTREAM_DIR" \
    --dest "$SRC/third_party/sing-tun" --gvisor-version "$GVISOR_VERSION"

  # GOWORK=off: `go.work` của checkout luôn thắng `replace` trong go.mod, mà replace
  # này CHÍNH LÀ thứ bật gVisor — để workspace bật thì framework build ra thiếu gVisor
  # và tunnel báo lỗi rõ (`RequireGVisor`) thay vì chạy.
  (cd "$SRC/app" && GOWORK=off go mod edit -replace=github.com/apernet/sing-tun="$SRC/third_party/sing-tun")
  echo "==> go.sum cho gVisor ($GVISOR_VERSION)"
  (cd "$SRC/app" && GOWORK=off GOFLAGS=-mod=mod go get "github.com/sagernet/gvisor@$GVISOR_VERSION")
  # -mod=mod: go.sum của checkout thiếu dòng cho gVisor + deps của nó; để go build tự
  # cập nhật thay vì chết với "missing go.sum entry".
  export GOWORK=off
  export GOFLAGS="${GOFLAGS:-} -mod=mod"
  BIND_TAGS=(-tags with_gvisor)
else
  echo "==> STACK=system: KHÔNG có gVisor (TCP qua extension macOS sẽ treo) — chỉ dùng để A/B"
fi

# gobind loads bind/objc from the *target* module, so the hysteria app module has
# to require whichever module the running toolchain comes from.
if ! grep -q "$TOOLCHAIN_MARKER" "$SRC/app/go.mod"; then
  echo "==> installing $GOMOBILE_MOD into the target module ($TOOLCHAIN_GET)"
  (cd "$SRC/app" && eval "$TOOLCHAIN_GET")
fi

echo "==> gomobile bind (ios + iossimulator) -> Hysteria.framework, module Hysteria"
(cd "$SRC/app" && "$GOMOBILE" bind ${BIND_TAGS[@]+"${BIND_TAGS[@]}"} -target=ios,iossimulator -o "$STAGE/Hysteria.xcframework" ./mobile)

# gomobile derives both the framework name and the clang module name from the -o
# basename, so "-o .../Hysteria-macos.xcframework" would give module
# "Hysteria-Macos" — not a valid Swift identifier ("no such module"). Bind as
# Hysteria and stage it under the -macos container name instead: both platforms
# then expose `import Hysteria`.
echo "==> gomobile bind (macos)"
(cd "$SRC/app" && "$GOMOBILE" bind ${BIND_TAGS[@]+"${BIND_TAGS[@]}"} -target=macos -o "$STAGE/macos/Hysteria.xcframework" ./mobile)

echo "==> installing into $OUT"
mkdir -p "$OUT"
rm -rf "$OUT/Hysteria.xcframework" "$OUT/Hysteria-macos.xcframework"
ditto "$STAGE/Hysteria.xcframework" "$OUT/Hysteria.xcframework"
ditto "$STAGE/macos/Hysteria.xcframework" "$OUT/Hysteria-macos.xcframework"

echo "==> exported ObjC/Swift API (Mobile.objc.h)"
grep -h '^FOUNDATION_EXPORT' "$OUT/Hysteria.xcframework/ios-arm64/Hysteria.framework/Headers/Mobile.objc.h"

echo "==> artifacts"
du -sh "$OUT/Hysteria.xcframework" "$OUT/Hysteria-macos.xcframework"

# fork SagerNet xuất framework kiểu versioned (Versions/A/<name>), bản chính thống
# golang.org/x/mobile xuất bản phẳng (<name>.framework/<name>) — nhận cả hai.
fw_bin() {  # $1 = thư mục <tên>.framework
  local fw="$1" name
  name="$(basename "$fw" .framework)"
  if [ -f "$fw/Versions/A/$name" ]; then echo "$fw/Versions/A/$name"; else echo "$fw/$name"; fi
}

for lib in \
  "$(fw_bin "$OUT/Hysteria.xcframework/ios-arm64/Hysteria.framework")" \
  "$(fw_bin "$OUT/Hysteria.xcframework/ios-arm64_x86_64-simulator/Hysteria.framework")" \
  "$(fw_bin "$OUT/Hysteria-macos.xcframework/macos-arm64_x86_64/Hysteria.framework")"; do
  echo "--- $lib"
  lipo -info "$lib"
  shasum -a 256 "$lib"
done

# Bằng chứng gVisor THẬT SỰ vào binary (không chỉ nằm trong source): đếm symbol
# `sagernet/gvisor` trong archive. Bản build không gVisor cho 0 symbol.
if [ "$STACK" = "gvisor" ]; then
  echo "==> kiểm tra symbol gVisor trong framework"
  for lib in \
    "$(fw_bin "$OUT/Hysteria.xcframework/ios-arm64/Hysteria.framework")" \
    "$(fw_bin "$OUT/Hysteria-macos.xcframework/macos-arm64_x86_64/Hysteria.framework")"; do
    count="$(nm -a "$lib" 2>/dev/null | grep -c 'sagernet/gvisor' || true)"
    echo "--- ${lib#"$OUT"/}: $count symbol gvisor"
    if [ "$count" -eq 0 ]; then
      echo "LỖI: $lib không có symbol gVisor — framework này sẽ treo TCP"; exit 1
    fi
  done
fi

echo "==> done: $OUT/Hysteria.xcframework (iOS device + simulator), $OUT/Hysteria-macos.xcframework (macOS)"
