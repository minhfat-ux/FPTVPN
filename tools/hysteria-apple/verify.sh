#!/usr/bin/env bash
# Kiểm chứng artifact Apple do build.sh sinh ra: slice kiến trúc, module/header,
# và link + chạy thật chương trình test với slice macOS.
#
#   ./verify.sh                # kiểm tra $REPO_ROOT/iOS/Frameworks
#   OUT=/path ./verify.sh
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
OUT="${OUT:-$REPO_ROOT/iOS/Frameworks}"

IOS="$OUT/Hysteria.xcframework"
MAC_DIR="$OUT/Hysteria-macos.xcframework/macos-arm64_x86_64"

[ -d "$IOS" ] || { echo "missing $IOS (chạy ./build.sh trước)"; exit 1; }
[ -d "$MAC_DIR" ] || { echo "missing $MAC_DIR (chạy ./build.sh trước)"; exit 1; }

WORK="$(mktemp -d "${TMPDIR:-/tmp}/hysteria-apple-verify.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

echo "==> plists"
plutil -lint "$IOS/Info.plist" "$OUT/Hysteria-macos.xcframework/Info.plist"

# Bản fork xuất framework kiểu versioned (Versions/A/...), bản chính thống
# golang.org/x/mobile xuất bản phẳng (Hysteria.framework/Hysteria) — nhận cả hai.
fw_bin() {  # $1 = thư mục chứa <tên>.framework
  local fw="$1" name
  name="$(basename "$fw" .framework)"
  if [ -f "$fw/Versions/A/$name" ]; then echo "$fw/Versions/A/$name"; else echo "$fw/$name"; fi
}

IOS_DEV="$(fw_bin "$IOS/ios-arm64/Hysteria.framework")"
IOS_SIM="$(fw_bin "$IOS/ios-arm64_x86_64-simulator/Hysteria.framework")"
MAC="$(fw_bin "$MAC_DIR/Hysteria.framework")"

echo "==> slices"
for lib in "$IOS_DEV" "$IOS_SIM" "$MAC"; do
  echo "--- $lib"; lipo -info "$lib"; shasum -a 256 "$lib"
done

echo "==> headers (module Swift phải import)"
grep -h '^FOUNDATION_EXPORT\|^framework module' \
  "$(dirname "$IOS_DEV")/Headers/Mobile.objc.h" \
  "$(dirname "$IOS_DEV")/Modules/module.modulemap"

echo "==> ObjC: link + run slice macOS"
clang -fobjc-arc -fmodules -framework Foundation -F "$MAC_DIR" \
  "$HERE/test/link_test.m" -o "$WORK/link_test" -framework Hysteria
"$WORK/link_test"

echo "==> Swift: import Hysteria + link + run slice macOS"
swiftc -F "$MAC_DIR" "$HERE/test/swift_test.swift" -o "$WORK/swift_test" -framework Hysteria
"$WORK/swift_test"

echo "==> Swift: type-check slice iOS device"
swiftc -target arm64-apple-ios15.0 -sdk "$(xcrun --sdk iphoneos --show-sdk-path)" \
  -F "$IOS" -parse "$HERE/test/swift_test.swift"
echo "OK"
