#!/usr/bin/env bash
# Rebuild the Android hysteria AAR used by android/app/libs/hysteria.aar.
#
#   ./build.sh            # clone (if missing) + patch + bind
#   HYSTERIA_SRC=/path ./build.sh
#
# Requirements: Go 1.22+, gomobile (go install golang.org/x/mobile/cmd/gomobile@latest
# && gomobile init), Android SDK + NDK r25 (r26+ fails: "no usable NDK ...
# meta/platforms.json"), JAVA_HOME (JDK 17).
#
# WINDOWS (harness Windows, làm lại được y hệt — 19/10/2026):
#   - NDK: tải `android-ndk-r25c-windows.zip` (467.520.926 B) rồi giải nén vào
#     `$ANDROID_HOME/ndk/25.2.9519653` (gomobile đọc `ANDROID_NDK_HOME`).
#   - gomobile/gobind: `go install github.com/sagernet/gomobile/cmd/{gomobile,gobind}@v0.1.13`
#     (GOPROXY=https://goproxy.cn,direct — proxy.golang.org timeout từ mạng này).
#   - javac mặc định đọc theo windows-1252 ⇒ comment tiếng Việt trong mobile.go bị chép sang
#     `Mobile.java` làm build đứt với "unmappable character". PHẢI đặt
#     `JAVA_TOOL_OPTIONS=-Dfile.encoding=UTF-8` (và `_JAVA_OPTIONS` như bản dự phòng).
#   - `python3` không có sẵn trên Windows: chép `python.exe` thành `python3.exe` cùng thư mục.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
SRC="${HYSTERIA_SRC:-/tmp/hysteria}"
TAG="app/v2.12.2"
OUT="$REPO_ROOT/android/app/libs/hysteria.aar"

export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@17}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export PATH="$PATH:/opt/homebrew/bin:$HOME/go/bin:$ANDROID_HOME/platform-tools"
# hysteria có `go.work` (app/core/extras). gomobile bind chạy trong workspace mode sẽ từ chối
# `-mod=mod`; app/go.mod đã có replace trỏ ../core, ../extras nên tắt workspace là đủ và ổn định.
export GOWORK=off

if [ ! -d "$SRC" ]; then
  echo "==> cloning hysteria ($TAG) into $SRC"
  git clone --depth 1 --branch "$TAG" https://github.com/apernet/hysteria.git "$SRC"
fi

echo "==> patching tun server for the Android TUN fd"
(cd "$SRC" && python3 "$HERE/patch_tun_fd.py")

echo "==> installing the gomobile wrapper package"
mkdir -p "$SRC/app/mobile"
cp "$HERE/mobile.go" "$SRC/app/mobile/mobile.go"

echo "==> gomobile bind"
# gomobile trên máy này là bản fork `github.com/sagernet/gomobile` (hysteria dùng), nên package
# `bind` của nó phải có trong module thì gomobile bind mới sinh + biên dịch được (bản upstream
# `golang.org/x/mobile` báo "no Go package in github.com/sagernet/gomobile/bind").
(cd "$SRC/app" && go get github.com/sagernet/gomobile/bind@v0.1.13 >/dev/null 2>&1 || true)
# Android 15+ trên thiết bị trang 16 KB đòi LOAD segment của .so phải p_align >= 16384; mặc định
# linker chỉ căn 4096 nên libgojni.so bị Android 16 cảnh báo. Ép max-page-size=16384 (vô hại với
# ABI 32-bit). Xem docs/YEU_CAU_TOC_DO_ON_DINH.md §4.5.
(cd "$SRC/app" && gomobile bind -target=android -androidapi=26 \
  -ldflags="-extldflags=-Wl,-z,max-page-size=16384" -o "$OUT" ./mobile)

echo "==> done: $OUT"
ls -la "$OUT"
echo "==> exported Java API:"
TMP=$(mktemp -d)
(cd "$TMP" && unzip -o -q "$OUT" classes.jar && unzip -o -q classes.jar 'mobile/Mobile.class' && "$JAVA_HOME/bin/javap" -classpath . mobile.Mobile | grep -E 'connect|serve|stop')
