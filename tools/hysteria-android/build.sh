#!/usr/bin/env bash
# Rebuild the Android hysteria AAR used by android/app/libs/hysteria.aar.
#
#   ./build.sh            # clone (if missing) + patch + bind
#   HYSTERIA_SRC=/path ./build.sh
#
# Requirements: Go 1.22+, gomobile (go install golang.org/x/mobile/cmd/gomobile@latest
# && gomobile init), Android SDK + NDK r25 (r26+ fails: "no usable NDK ...
# meta/platforms.json"), JAVA_HOME (JDK 17).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
SRC="${HYSTERIA_SRC:-/tmp/hysteria}"
TAG="app/v2.12.2"
OUT="$REPO_ROOT/android/app/libs/hysteria.aar"

export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@17}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export PATH="$PATH:/opt/homebrew/bin:$HOME/go/bin:$ANDROID_HOME/platform-tools"

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
(cd "$SRC/app" && go get -tool golang.org/x/mobile/cmd/gobind >/dev/null 2>&1 || true)
(cd "$SRC/app" && gomobile bind -target=android -androidapi=26 -o "$OUT" ./mobile)

echo "==> done: $OUT"
ls -la "$OUT"
echo "==> exported Java API:"
TMP=$(mktemp -d)
(cd "$TMP" && unzip -o -q "$OUT" classes.jar && unzip -o -q classes.jar 'mobile/Mobile.class' && "$JAVA_HOME/bin/javap" -classpath . mobile.Mobile | grep -E 'connect|serve|stop')
