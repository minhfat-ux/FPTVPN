#!/bin/bash
set -e
SDK="$HOME/Library/Android/sdk"
BT="$SDK/build-tools/35.0.0"
PLAT="$SDK/platforms/android-35/android.jar"
export JAVA_HOME="$HOME/jdk/jdk-17.0.20.1+1/Contents/Home"
export PATH="$JAVA_HOME/bin:$PATH"

rm -rf build
mkdir -p build/gen build/obj build/dex

echo "[1/7] compile resources"
"$BT/aapt2" compile --dir res -o build/res.zip

echo "[2/7] link resources"
"$BT/aapt2" link -o build/base.apk -I "$PLAT" \
  --manifest AndroidManifest.xml --java build/gen build/res.zip

echo "[3/7] javac"
find src build/gen -name "*.java" > build/sources.txt
javac -source 17 -target 17 -classpath "$PLAT" \
  -encoding UTF-8 -d build/obj @build/sources.txt| grep -v "bootstrap class path" || true

echo "[4/7] d8"
"$BT/d8" --lib "$PLAT" --min-api 23 --output build/dex $(find build/obj -name "*.class")

echo "[5/7] add classes.dex"
cp build/base.apk build/unsigned.apk
(cd build && zip -q -j unsigned.apk dex/classes.dex)

echo "[6/7] zipalign"
"$BT/zipalign" -f 4 build/unsigned.apk build/aligned.apk

echo "[7/7] sign"
if [ ! -f debug.keystore ]; then
  keytool -genkeypair -keystore debug.keystore -alias androiddebugkey \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass android -keypass android \
    -dname "CN=Android Debug,O=Android,C=US" >/dev/null 2>&1
fi
"$BT/apksigner" sign --ks debug.keystore --ks-pass pass:android \
  --key-pass pass:android --out TVFlowHome.apk build/aligned.apk

echo
echo "=== DONE ==="
ls -lh TVFlowHome.apk
"$BT/aapt2" dump badging TVFlowHome.apk 2>/dev/null | grep -E "^package|launchable-activity|sdkVersion|targetSdkVersion" || true
