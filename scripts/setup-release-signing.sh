#!/usr/bin/env bash
# setup-release-signing.sh — create the Google Play release keystore + signing
# properties ONCE. Safe to re-run: it never overwrites an existing keystore.
#
# Usage:
#   bash scripts/setup-release-signing.sh
#
# Creates (outside the repo, never committed):
#   ~/keystores/vpnflow-release.keystore       (PKCS12, alias "vpnflow", 10000 days)
#   ~/keystores/vpnflow-keystore-password.txt  (password, chmod 600)
#   ~/keystores/vpnflow-signing.properties     (gradle signing config, chmod 600)
#
# WARNING: BACK THIS UP. Losing the keystore means the app can NEVER be updated.
set -euo pipefail

KEYSTORE_DIR="$HOME/keystores"
KEYSTORE="$KEYSTORE_DIR/vpnflow-release.keystore"
PASS_FILE="$KEYSTORE_DIR/vpnflow-keystore-password.txt"
PROPS_FILE="$KEYSTORE_DIR/vpnflow-signing.properties"
ALIAS="vpnflow"

find_java() {
  local candidate="/Volumes/BIWIN/SourcesCode/PrivateVPN/.tools/jdk/temurin-17.jdk/Contents/Home"
  if [ -x "$candidate/bin/keytool" ]; then echo "$candidate"; return 0; fi
  if command -v /usr/libexec/java_home >/dev/null 2>&1; then
    local jh; jh="$(/usr/libexec/java_home 2>/dev/null || true)"
    [ -n "$jh" ] && echo "$jh" && return 0
  fi
  echo ""
}

JAVA_HOME="$(find_java)"
if [ -z "$JAVA_HOME" ]; then
  echo "ERROR: no JDK found. Set JAVA_HOME to a JDK 17+ install." >&2
  exit 1
fi
export PATH="$JAVA_HOME/bin:$PATH"

mkdir -p "$KEYSTORE_DIR"
chmod 700 "$KEYSTORE_DIR"

if [ -f "$KEYSTORE" ]; then
  echo "Keystore already exists: $KEYSTORE (keeping it)."
else
  PASS="$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)"
  umask 077
  printf '%s' "$PASS" > "$PASS_FILE"
  chmod 600 "$PASS_FILE"
  keytool -genkeypair -v \
    -keystore "$KEYSTORE" \
    -alias "$ALIAS" \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass "$PASS" -keypass "$PASS" \
    -dname "CN=FlowVPN, OU=Mobile, O=FlowVPN, L=Hanoi, ST=Hanoi, C=VN" >/dev/null
  chmod 600 "$KEYSTORE"
  echo "Created $KEYSTORE"
fi

if [ ! -f "$PROPS_FILE" ]; then
  PASS="$(cat "$PASS_FILE")"
  umask 077
  cat > "$PROPS_FILE" <<EOF
storeFile=$KEYSTORE
storePassword=$PASS
keyAlias=$ALIAS
keyPassword=$PASS
EOF
  chmod 600 "$PROPS_FILE"
  echo "Created $PROPS_FILE"
else
  echo "Signing properties already exist: $PROPS_FILE (keeping it)."
fi

echo
echo "Release signing ready."
echo "   Keystore: $KEYSTORE"
echo "   Password file: $PASS_FILE"
echo "   Gradle props: $PROPS_FILE"
echo
echo "WARNING: BACK THIS UP (keystore + password). Losing it = cannot update the app ever again."
echo "   Next: cd android && ./gradlew :app:bundleRelease"
