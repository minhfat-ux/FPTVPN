#!/usr/bin/env bash
# Build FPT Tubeflow từ APK SmartTube (rebuild, không phải app gốc).
#
#   bash tools/fpt-tubeflow/build.sh <SmartTube.apk> [versionCode] [versionName]
#
# Kết quả: build/FPTTubeflow-<versionName>.apk (đã zipalign + ký debug keystore).
# Yêu cầu: apktool, JDK 17, Android build-tools + platform 35, python3 + Pillow.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SRC_APK="${1:?cần đường dẫn SmartTube.apk}"
VCODE="${2:-9013}"
VNAME="${3:-2.2-fpt-tubeflow}"
export JAVA_HOME="${JAVA_HOME:-$(ls -d "$HOME"/jdk/jdk-17*/Contents/Home | head -1)}"
export PATH="$JAVA_HOME/bin:$PATH"
SDK="${ANDROID_SDK:-$HOME/Library/Android/sdk}"
BT="$SDK/build-tools/35.0.0"
PLAT="$SDK/platforms/android-35/android.jar"
APKTOOL="${APKTOOL_JAR:-/tmp/apktool3.jar}"
WORK="$(mktemp -d)"
KEYSTORE="${KEYSTORE:-$HERE/debug.keystore}"

[ -f "$KEYSTORE" ] || { echo "thiếu keystore: $KEYSTORE"; exit 2; }
[ -f "$APKTOOL" ] || { echo "thiếu apktool jar: $APKTOOL"; exit 2; }

echo "[1/6] decode"
java -jar "$APKTOOL" d "$SRC_APK" -o "$WORK/app" -f
echo "[2/6] assets"
python3 "$HERE/make_assets.py" "$WORK/app" "$WORK/preview"
echo "[3/6] patch"
python3 "$HERE/patch_app.py" "$WORK/app" "$VCODE" "$VNAME"
echo "[4/6] build"
java -jar "$APKTOOL" b "$WORK/app" -o "$WORK/unsigned.apk"
echo "[5/6] align"
"$BT/zipalign" -f 4 "$WORK/unsigned.apk" "$WORK/aligned.apk"
echo "[6/6] sign"
mkdir -p "$HERE/build"
"$BT/apksigner" sign --ks "$KEYSTORE" --ks-pass pass:android --key-pass pass:android \
  --out "$HERE/build/FPTTubeflow-$VNAME.apk" "$WORK/aligned.apk"
"$BT/aapt2" dump badging "$HERE/build/FPTTubeflow-$VNAME.apk" | head -2
echo "preview: $WORK/preview"
