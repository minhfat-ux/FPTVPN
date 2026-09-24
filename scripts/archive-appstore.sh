#!/usr/bin/env bash
#
# Build + export an IPA for VPNFlow (iOS or macOS).
#
# Kênh App Store đã bị BỎ theo quyết định của chủ dự án (14/09/2026): sản phẩm chỉ
# bán qua trang web của mình (`https://meetflowai.site/buy`), nên không còn bản
# In-App-Purchase nào để nộp. `PAYWALL_APPSTORE` đã bị xoá khỏi **cả** code iOS và
# macOS, nghĩa là archive `appstore` sẽ ra **đúng** binary web-paywall như `direct` —
# nộp lên App Store Review là bị từ chối 3.1.1. Vì vậy mode đó bị CHẶN thẳng (exit 2),
# không âm thầm hạ cấp thành `direct`.
#
# Usage:
#   scripts/archive-appstore.sh                      # iOS, our own distribution
#   scripts/archive-appstore.sh ios direct           # iOS, TestFlight/sideload
#   scripts/archive-appstore.sh ios diawi            # iOS, install via Diawi
#   scripts/archive-appstore.sh mac direct           # macOS, our own distribution
#   scripts/archive-appstore.sh mac diawi            # macOS, direct install
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

TARGET="${1:-ios}"
MODE="${2:-direct}"
case "$TARGET" in
  ios) SCHEME="PrivateVPN";    PLATFORM="iOS";   DEST="generic/platform=iOS" ;;
  mac) SCHEME="PrivateVPNMac"; PLATFORM="macOS"; DEST="generic/platform=macOS" ;;
  *) echo "usage: $0 [ios|mac] [direct|diawi|adhoc]" >&2; exit 2 ;;
esac

# `iOS/Frameworks/` bị `.gitignore` (framework 90 MB + 59 MB) ⇒ cây mới/CI KHÔNG có sẵn và
# build sẽ chết ở "There is no XCFramework found at …". Đã gặp thật 23/09/2026 ở CẢ hai nền
# tảng khi dựng cây phát hành sạch — báo lỗi sớm và chỉ rõ cách khắc phục thay vì để Xcode
# báo khó hiểu.
case "$TARGET" in
  ios) FW="iOS/Frameworks/Hysteria.xcframework" ;;
  mac) FW="iOS/Frameworks/Hysteria-macos.xcframework" ;;
esac
if [ ! -d "$FW" ]; then
  echo "LỖI: thiếu $FW" >&2
  echo "     Thư mục iOS/Frameworks/ bị .gitignore nên cây/CI mới không có sẵn framework." >&2
  echo "     Copy từ cây đang build được (Hysteria.xcframework ~90 MB cho iOS," >&2
  echo "     Hysteria-macos.xcframework ~59 MB cho macOS) rồi chạy lại lệnh này." >&2
  exit 1
fi
case "$MODE" in
  direct|diawi|adhoc) ;;
  appstore)
    # Không dùng lại nhánh im lặng: cờ biên dịch không còn nên bản "review" sẽ giống hệt
    # bản web và chỉ gây nhầm là đã có bản nộp hợp lệ.
    echo "ERROR: the App Store channel was removed by owner decision (14/09/2026)." >&2
    echo "  iOS and macOS now sell only through the web buy page" >&2
    echo "  (https://meetflowai.site/buy), and PAYWALL_APPSTORE no longer exists in the" >&2
    echo "  code — an 'appstore' archive would be the SAME web-paywall binary as 'direct'" >&2
    echo "  and would be rejected 3.1.1 if submitted." >&2
    echo "  Use: $0 <ios|mac> direct    (or: $0 <ios|mac> diawi)" >&2
    exit 2
    ;;
  *) echo "usage: $0 [ios|mac] [direct|diawi]" >&2; exit 2 ;;
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
  # Không còn mode `appstore` (đã bị chặn ở trên), nên không còn cờ biên dịch nào để đặt:
  # COND luôn chỉ là '$(inherited)'.
  direct) METHOD="app-store-connect"; COND='$(inherited)' ;;
  diawi)  METHOD="development";       COND='$(inherited)' ;;
  # `adhoc` = ĐÚNG CHUẨN để phát cho khách qua Diawi/OTA:
  #  - ký bằng chứng chỉ Apple Distribution + profile Ad Hoc (danh sách UDID)
  #  - KHÔNG có get-task-allow ⇒ máy khách KHÔNG phải bật "Developer Mode" (iOS 16+)
  # Điều kiện: máy build phải đăng nhập Apple ID của team G6XW3RN6LJ trong Xcode, hoặc truyền
  # App Store Connect API key để xcodebuild tự lấy profile:
  #   xcodebuild ... -allowProvisioningUpdates \
  #     -authenticationKeyPath ~/.appstoreconnect/private_keys/AuthKey_XXX.p8 \
  #     -authenticationKeyID XXX -authenticationKeyIssuerID <issuer-uuid>
  adhoc)  METHOD="ad-hoc";            COND='$(inherited)' ;;
esac

# Xcode cần quyền truy cập tài khoản để tạo/tải profile (nhất là `ad-hoc`). Truyền App Store Connect
# API key thì KHÔNG cần đăng nhập Apple ID trong Xcode — đúng cái đang chặn mode adhoc trước đây.
ASC_KEY_ID="${ASC_KEY_ID:-8GW3662G64}"
ASC_ISSUER_ID="${ASC_ISSUER_ID:-7a64d085-c03d-4b10-9b96-ff8e00c42e79}"
ASC_P8="${ASC_KEY_PATH:-$HOME/.appstoreconnect/private_keys/AuthKey_${ASC_KEY_ID}.p8}"
AUTH_ARGS=()
if [ -f "$ASC_P8" ]; then
  AUTH_ARGS=(-allowProvisioningUpdates
             -authenticationKeyPath "$ASC_P8"
             -authenticationKeyID "$ASC_KEY_ID"
             -authenticationKeyIssuerID "$ASC_ISSUER_ID")
  echo "  (dùng App Store Connect API key $ASC_KEY_ID để lấy profile)"
else
  echo "  (không thấy API key $ASC_P8 — dựa vào Apple ID đã đăng nhập trong Xcode)"
  AUTH_ARGS=(-allowProvisioningUpdates)
fi

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

echo "==> Archiving $SCHEME ($PLATFORM) for our own distribution (web buy page ON)"
# COND đã được đặt ở khối case phía trên — không gán lại ở đây để chỉ có MỘT nguồn
# sự thật cho cờ biên dịch (trước đây hai nơi cùng gán, thêm mode mới là lệch ngay).

xcodebuild -project PrivateVPN.xcodeproj -scheme "$SCHEME" \
  -configuration Release -destination "$DEST" \
  -archivePath "$ARCHIVE" \
  SWIFT_ACTIVE_COMPILATION_CONDITIONS="$COND" \
  archive "${AUTH_ARGS[@]}"

echo "==> Exporting IPA (method=$METHOD)"
xcodebuild -exportArchive -archivePath "$ARCHIVE" \
  -exportOptionsPlist "$OUT/ExportOptions.plist" \
  -exportPath "$IPA" "${AUTH_ARGS[@]}"

echo
if [ "$MODE" = "diawi" ]; then
  echo "==> Done. IPA cài trực tiếp được — upload lên Diawi:"
else
  echo "==> Done. Upload this to App Store Connect / TestFlight:"
fi
ls -1 "$IPA"/*.ipa
echo
echo "This IPA contains the web buy page -> TestFlight / sideload ONLY."
echo "NEVER submit it for App Store review: 3.1.1 requires In-App Purchase for"
echo "digital goods, and the App Store channel was removed by owner decision"
echo "(14/09/2026) — there is no IAP-only build to submit any more."
