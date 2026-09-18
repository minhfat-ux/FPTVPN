#!/usr/bin/env bash
# Rebuild the Apple (iOS device + iOS simulator + macOS) hysteria2 frameworks used
# by iOS/PrivateVPN*, iOS/PrivateVPNPacketTunnel and the macOS VPNFlow targets.
#
#   ./build.sh                        # clone (if missing) + patch + bind + install
#   HYSTERIA_SRC=/path ./build.sh     # reuse an existing hysteria checkout
#   OUT=/path ./build.sh              # default: $REPO_ROOT/iOS/Frameworks (gitignored)
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

export PATH="$PATH:/opt/homebrew/bin:$HOME/go/bin"
export GOTOOLCHAIN="${GOTOOLCHAIN:-local}"

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

# gobind loads bind/objc from the *target* module, so the hysteria app module has
# to require whichever module the running toolchain comes from.
if ! grep -q "$TOOLCHAIN_MARKER" "$SRC/app/go.mod"; then
  echo "==> installing $GOMOBILE_MOD into the target module ($TOOLCHAIN_GET)"
  (cd "$SRC/app" && eval "$TOOLCHAIN_GET")
fi

echo "==> gomobile bind (ios + iossimulator) -> Hysteria.framework, module Hysteria"
(cd "$SRC/app" && "$GOMOBILE" bind -target=ios,iossimulator -o "$STAGE/Hysteria.xcframework" ./mobile)

# gomobile derives both the framework name and the clang module name from the -o
# basename, so "-o .../Hysteria-macos.xcframework" would give module
# "Hysteria-Macos" — not a valid Swift identifier ("no such module"). Bind as
# Hysteria and stage it under the -macos container name instead: both platforms
# then expose `import Hysteria`.
echo "==> gomobile bind (macos)"
(cd "$SRC/app" && "$GOMOBILE" bind -target=macos -o "$STAGE/macos/Hysteria.xcframework" ./mobile)

echo "==> installing into $OUT"
mkdir -p "$OUT"
rm -rf "$OUT/Hysteria.xcframework" "$OUT/Hysteria-macos.xcframework"
ditto "$STAGE/Hysteria.xcframework" "$OUT/Hysteria.xcframework"
ditto "$STAGE/macos/Hysteria.xcframework" "$OUT/Hysteria-macos.xcframework"

echo "==> exported ObjC/Swift API (Mobile.objc.h)"
grep -h '^FOUNDATION_EXPORT' "$OUT/Hysteria.xcframework/ios-arm64/Hysteria.framework/Headers/Mobile.objc.h"

echo "==> artifacts"
du -sh "$OUT/Hysteria.xcframework" "$OUT/Hysteria-macos.xcframework"
for lib in \
  "$OUT/Hysteria.xcframework/ios-arm64/Hysteria.framework/Versions/A/Hysteria" \
  "$OUT/Hysteria.xcframework/ios-arm64_x86_64-simulator/Hysteria.framework/Versions/A/Hysteria" \
  "$OUT/Hysteria-macos.xcframework/macos-arm64_x86_64/Hysteria.framework/Versions/A/Hysteria"; do
  echo "--- $lib"
  lipo -info "$lib"
  shasum -a 256 "$lib"
done

echo "==> done: $OUT/Hysteria.xcframework (iOS device + simulator), $OUT/Hysteria-macos.xcframework (macOS)"
