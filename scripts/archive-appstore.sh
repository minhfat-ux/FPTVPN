#!/usr/bin/env bash
#
# Build + export the App Store IPA for VPNFlow.
#
# The App Store binary must sell with In-App Purchase only (Guideline 3.1.1 /
# 3.1.3), so this script compiles with PAYWALL_APPSTORE defined. TestFlight /
# sideload builds of the same source keep the web buy page and must NOT be
# submitted to App Store Review — archive those without this flag.
#
# Usage:
#   scripts/archive-appstore.sh                      # iOS, App Store build
#   scripts/archive-appstore.sh mac                  # macOS, App Store build
#   scripts/archive-appstore.sh ios direct           # iOS, TestFlight/sideload
#                                                    #   build (web buy page ON)
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

TARGET="${1:-ios}"
MODE="${2:-appstore}"
case "$TARGET" in
  ios) SCHEME="PrivateVPN";    PLATFORM="iOS";   DEST="generic/platform=iOS" ;;
  mac) SCHEME="PrivateVPNMac"; PLATFORM="macOS"; DEST="generic/platform=macOS" ;;
  *) echo "usage: $0 [ios|mac] [appstore|direct|diawi]" >&2; exit 2 ;;
esac
case "$MODE" in
  appstore|direct|diawi) ;;
  *) echo "usage: $0 [ios|mac] [appstore|direct|diawi]" >&2; exit 2 ;;
esac

# Export method + compile flags theo kênh phát hành.
#
# Vì sao `diawi` KHÁC `direct` dù cùng cờ biên dịch: Diawi phát hành bằng cách cài
# trực tiếp lên máy, nên IPA **phải** được ký bằng profile có UDID thiết bị
# (development/ad-hoc). IPA xuất bằng `app-store-connect` KHÔNG cài được qua Diawi —
# profile nhúng có 0 thiết bị (đã kiểm: app-store = 0, development = 4 thiết bị).
# Trước đây script xuất cả `direct` bằng app-store-connect, tức kênh được chủ dự án
# chọn để phát qua Diawi lại cho ra file không cài được.
#
# `development` chứ không phải `ad-hoc` vì máy này chưa có Apple ID trong Xcode nên
# không tạo được profile ad-hoc (lỗi "No Accounts" / "No profiles ... were found").
# Khi đã đăng nhập Apple ID + tạo profile ad-hoc (thêm UDID từng tester) thì đổi
# METHOD ở đây sang `ad-hoc` — đúng chuẩn Diawi hơn và không bật get-task-allow.
case "$MODE" in
  appstore) METHOD="app-store-connect"; COND='$(inherited) PAYWALL_APPSTORE' ;;
  direct)   METHOD="app-store-connect"; COND='$(inherited)' ;;
  diawi)    METHOD="development";       COND='$(inherited)' ;;
esac

OUT="build/${TARGET}-${MODE}-export"
ARCHIVE="$OUT/$SCHEME.xcarchive"
IPA="$OUT/ipa"

rm -rf "$ARCHIVE" "$IPA"
mkdir -p "$OUT"

cat > "$OUT/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>$METHOD</string>
  <key>teamID</key><string>G6XW3RN6LJ</string>
  <key>uploadSymbols</key><true/>
  <key>compileBitcode</key><false/>
  <key>destination</key><string>export</string>
</dict></plist>
PLIST

if [ "$MODE" = "appstore" ]; then
  # PAYWALL_APPSTORE removes the web buy page from the paywall at compile time.
  echo "==> Archiving $SCHEME ($PLATFORM) for App Store review (IAP only)"
else
  echo "==> Archiving $SCHEME ($PLATFORM) for our own distribution (web buy page ON)"
fi
# COND đã được đặt ở khối case phía trên — không gán lại ở đây để chỉ có MỘT nguồn
# sự thật cho cờ biên dịch (trước đây hai nơi cùng gán, thêm mode mới là lệch ngay).

xcodebuild -project PrivateVPN.xcodeproj -scheme "$SCHEME" \
  -configuration Release -destination "$DEST" \
  -archivePath "$ARCHIVE" \
  SWIFT_ACTIVE_COMPILATION_CONDITIONS="$COND" \
  archive -allowProvisioningUpdates

echo "==> Exporting IPA (method=$METHOD)"
xcodebuild -exportArchive -archivePath "$ARCHIVE" \
  -exportOptionsPlist "$OUT/ExportOptions.plist" \
  -exportPath "$IPA" -allowProvisioningUpdates

echo
if [ "$MODE" = "diawi" ]; then
  echo "==> Done. IPA cài trực tiếp được — upload lên Diawi:"
else
  echo "==> Done. Upload this to App Store Connect / TestFlight:"
fi
ls -1 "$IPA"/*.ipa
echo
if [ "$MODE" = "appstore" ]; then
  echo "This IPA is the In-App-Purchase-only build -> submit to App Store Review."
  echo "For TestFlight with our web payment page, run instead:"
  echo "  $0 $TARGET direct"
else
  echo "This IPA contains the web buy page -> TestFlight / sideload ONLY."
  echo "NEVER submit it for App Store review (Guideline 3.1.1 / 3.1.3);"
  echo "build the review binary with: $0 $TARGET appstore"
fi
