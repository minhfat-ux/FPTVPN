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
#   scripts/archive-appstore.sh                # iOS
#   scripts/archive-appstore.sh mac            # macOS
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

TARGET="${1:-ios}"
case "$TARGET" in
  ios) SCHEME="PrivateVPN";    PLATFORM="iOS";   DEST="generic/platform=iOS" ;;
  mac) SCHEME="PrivateVPNMac"; PLATFORM="macOS"; DEST="generic/platform=macOS" ;;
  *) echo "usage: $0 [ios|mac]" >&2; exit 2 ;;
esac

OUT="build/${TARGET}-export"
ARCHIVE="$OUT/$SCHEME.xcarchive"
IPA="$OUT/ipa"

rm -rf "$ARCHIVE" "$IPA"
mkdir -p "$OUT"

cat > "$OUT/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>teamID</key><string>G6XW3RN6LJ</string>
  <key>uploadSymbols</key><true/>
  <key>compileBitcode</key><false/>
  <key>destination</key><string>export</string>
</dict></plist>
PLIST

echo "==> Archiving $SCHEME ($PLATFORM) for the App Store"
# PAYWALL_APPSTORE: removes the web buy page from the paywall at compile time.
xcodebuild -project PrivateVPN.xcodeproj -scheme "$SCHEME" \
  -configuration Release -destination "$DEST" \
  -archivePath "$ARCHIVE" \
  SWIFT_ACTIVE_COMPILATION_CONDITIONS='$(inherited) PAYWALL_APPSTORE' \
  archive -allowProvisioningUpdates

echo "==> Exporting IPA"
xcodebuild -exportArchive -archivePath "$ARCHIVE" \
  -exportOptionsPlist "$OUT/ExportOptions.plist" \
  -exportPath "$IPA" -allowProvisioningUpdates

echo
echo "==> Done. Upload this to App Store Connect / TestFlight:"
ls -1 "$IPA"/*.ipa
echo
echo "Reminder: this IPA is the In-App-Purchase-only build."
echo "TestFlight builds for our own web-payment channel are archived WITHOUT the flag"
echo "and must never be submitted for App Store review."
