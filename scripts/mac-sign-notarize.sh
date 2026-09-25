#!/usr/bin/env bash
# Ký Developer ID + NOTARIZE + STAPLE app & DMG macOS — quy trình chuẩn ở docs/MACOS_SIGN_NOTARIZE.md.
#
# Vì sao cần: DMG không ký/không notarize ⇒ khách mở lần đầu bị Gatekeeper chặn
# (`spctl: rejected · source=Unnotarized Developer ID` / `does not have a ticket stapled`).
#
# Usage:
#   scripts/mac-sign-notarize.sh <VPNFlow.app> <version-tag> [--dmg]
#     <VPNFlow.app>  bundle đã build (có thể đang ký Apple Development; script sẽ ký lại Developer ID)
#     <version-tag>  dùng để đặt tên file, vd: 1.4.3-20
#     --dmg          đóng gói DMG + ký + notarize + staple luôn (mặc định: chỉ app)
#
# Biến môi trường (đều có mặc định hợp lý):
#   MAC_RELEASE_DIR   thư mục làm việc (mặc định ~/.vpnflow-macrelease)
#   MAC_PROFILES_DIR  nơi có app.provisionprofile / appex.provisionprofile / app.ent.plist / appex.ent.plist
#   MAC_SIGN_IDENTITY identity Developer ID (mặc định "Developer ID Application: Minh Nguyen (G6XW3RN6LJ)")
#   ASC_KEY_ID / ASC_ISSUER_ID / ASC_KEY_PATH  khoá notarytool
#
# KHÔNG chứa secret: chỉ đọc đường dẫn khoá từ môi trường/mặc định.
set -euo pipefail

APP_SRC="${1:?usage: $0 <VPNFlow.app> <version-tag> [--dmg]}"
VER="${2:?thiếu version-tag, vd 1.4.3-20}"
DO_DMG=0; [ "${3:-}" = "--dmg" ] && DO_DMG=1

BASE="${MAC_RELEASE_DIR:-$HOME/.vpnflow-macrelease}"
PROFILES="${MAC_PROFILES_DIR:-$BASE/profiles}"
ID="${MAC_SIGN_IDENTITY:-Developer ID Application: Minh Nguyen (G6XW3RN6LJ)}"
KEYID="${ASC_KEY_ID:-8GW3662G64}"
ISSUER="${ASC_ISSUER_ID:-7a64d085-c03d-4b10-9b96-ff8e00c42e79}"
KEY="${ASC_KEY_PATH:-$HOME/.appstoreconnect/private_keys/AuthKey_$KEYID.p8}"

[ -d "$APP_SRC" ] || { echo "LỖI: không thấy app $APP_SRC" >&2; exit 1; }
[ -f "$KEY" ]     || { echo "LỖI: không thấy khoá notarytool $KEY" >&2; exit 1; }
security find-identity -v -p codesigning | grep -qF "$ID" || { echo "LỖI: không có identity '$ID'" >&2; exit 1; }

STAGE="$BASE/stage-$VER"; APP="$STAGE/VPNFlow.app"
APPEX="$APP/Contents/PlugIns/PrivateVPNMacPacketTunnel.appex"
mkdir -p "$BASE"
echo "== 1. stage: $APP"
rm -rf "$STAGE"; mkdir -p "$STAGE"; ditto "$APP_SRC" "$APP"

echo "== 2. nhúng provisioning profile (Developer ID)"
[ -f "$PROFILES/app.provisionprofile" ]   && cp "$PROFILES/app.provisionprofile"   "$APP/Contents/embedded.provisionprofile"
[ -f "$PROFILES/appex.provisionprofile" ] && cp "$PROFILES/appex.provisionprofile" "$APPEX/Contents/embedded.provisionprofile"

# Entitlements: ưu tiên file cấp sẵn; nếu không có thì lấy từ chữ ký hiện tại và BỎ get-task-allow
# (cờ dev-only làm notarize fail).
ent_for() { # $1=target  $2=file cấp sẵn  $3=file ra
  if [ -f "$2" ]; then cp "$2" "$3"; else
    codesign -d --entitlements :- "$1" > "$3" 2>/dev/null || true
    /usr/libexec/PlistBuddy -c "Delete :com.apple.security.get-task-allow" "$3" 2>/dev/null || true
  fi
}
ent_for "$APPEX" "$PROFILES/appex.ent.plist" "$BASE/appex.ent.plist"
ent_for "$APP"   "$PROFILES/app.ent.plist"   "$BASE/app.ent.plist"

echo "== 3. ký framework con TRƯỚC (bỏ bước này notarize sẽ Invalid)"
find "$APPEX/Contents/Frameworks" -maxdepth 3 -name "*.framework" -type d 2>/dev/null | while read -r fw; do
  bin="$fw/Versions/A/$(basename "$fw" .framework)"
  [ -f "$bin" ] || bin="$fw/$(basename "$fw" .framework)"
  [ -f "$bin" ] && codesign --force --options runtime --timestamp --sign "$ID" "$bin"
  codesign --force --options runtime --timestamp --sign "$ID" "$fw"
done
find "$APPEX/Contents/Frameworks" -maxdepth 2 -name "*.dylib" -type f 2>/dev/null | while read -r d; do
  codesign --force --options runtime --timestamp --sign "$ID" "$d"
done

echo "== 4. ký extension rồi tới app"
codesign --force --options runtime --timestamp --sign "$ID" --entitlements "$BASE/appex.ent.plist" "$APPEX"
codesign --force --options runtime --timestamp --sign "$ID" --entitlements "$BASE/app.ent.plist"   "$APP"
codesign --verify --deep --strict --verbose=2 "$APP" 2>&1 | tail -2

echo "== 5. notarize APP (zip) + staple"
ZIP="$BASE/VPNFlow-app-$VER.zip"; rm -f "$ZIP"
ditto -c -k --keepParent "$APP" "$ZIP"
xcrun notarytool submit "$ZIP" --key "$KEY" --key-id "$KEYID" --issuer "$ISSUER" --wait
xcrun stapler staple "$APP"
xcrun stapler validate "$APP"

if [ "$DO_DMG" = "1" ]; then
  echo "== 6. DMG"
  DMGSTAGE="$BASE/dmgstage-$VER"; DMG="$BASE/VPNFlow-mac-$VER.dmg"; HYBRID="$BASE/VPNFlow-mac-$VER.hybrid.dmg"
  rm -rf "$DMGSTAGE" "$DMG" "$HYBRID"; mkdir -p "$DMGSTAGE"
  ditto "$APP" "$DMGSTAGE/VPNFlow.app"; ln -s /Applications "$DMGSTAGE/Applications"
  # makehybrid: `hdiutil create -srcfolder` bị chặn trong sandbox của harness (đã gặp thật).
  hdiutil makehybrid -hfs -hfs-volume-name VPNFlow -o "$HYBRID" "$DMGSTAGE"
  hdiutil convert "$HYBRID" -format UDZO -o "$DMG"; rm -f "$HYBRID"
  echo "== 7. ký DMG (SAU staple app, TRƯỚC submit)"
  codesign --force --timestamp --sign "$ID" "$DMG"
  echo "== 8. notarize DMG + staple + verify"
  xcrun notarytool submit "$DMG" --key "$KEY" --key-id "$KEYID" --issuer "$ISSUER" --wait
  xcrun stapler staple "$DMG"
  xcrun stapler validate "$DMG"
  spctl -a -t open --context context:primary-signature -vv "$DMG" 2>&1 | tail -3
  echo "== 9. DMG xong:"; ls -l "$DMG"; shasum -a 256 "$DMG"
fi
echo "== XONG ($VER)"
