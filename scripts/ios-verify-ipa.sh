#!/usr/bin/env bash
# CỔNG KIỂM IPA trước khi CÀI / PHÁT HÀNH (chủ dự án chốt 25/09/2026).
#
# Vì sao có: các lỗi thật đã lọt tới máy khách chỉ vì "không ai kiểm file trước khi cài":
#   • build 33 (24-25/09/2026): quên `eval "$(bash scripts/dev-hysteria-build-env.sh)"` ⇒ app có
#     `HysteriaPassword`/`HysteriaObfs` RỖNG ⇒ extension `TUNNEL_START_FAILED: providerConfiguration
#     thiếu khoá "hysteria"` ⇒ khách bấm Connect là **bật lên tắt ngay**.
#   • 22/09/2026: app còn nhóm keychain dùng chung ⇒ profile Ad Hoc không cấp ⇒ `SecItemAdd(-34018)`
#     ⇒ khách kẹt màn đăng nhập.
#   • 24/09/2026: IPA bị đẩy lên khi chưa đúng version/build bên trong.
#
# Dùng:
#   bash scripts/ios-verify-ipa.sh <file.ipa> [--version 1.4.5] [--build 34]
# Mã thoát: 0 = ĐẠT (được phép cài/phát hành) · 1 = KHÔNG ĐẠT (DỪNG)
set -uo pipefail
IPA="${1:-}"
[ -f "$IPA" ] || { echo "usage: $0 <file.ipa> [--version X] [--build N]" >&2; exit 2; }
shift || true
WANT_V=""; WANT_B=""
while [ $# -gt 0 ]; do
  case "$1" in
    --version) WANT_V="${2:-}"; shift 2 ;;
    --build)   WANT_B="${2:-}"; shift 2 ;;
    *) echo "tham so la: $1" >&2; exit 2 ;;
  esac
done
W="$(mktemp -d)"; trap 'rm -rf "$W"' EXIT
unzip -oq "$IPA" -d "$W" || { echo "⛔ KHÔNG ĐẠT: unzip lỗi"; exit 1; }
APP="$(find "$W/Payload" -maxdepth 1 -name '*.app' | head -1)"
APPEX="$(find "$W/Payload" -name '*.appex' | head -1)"
FAIL=0
ok()   { printf '  [ ĐẠT ] %s\n' "$*"; }
bad()  { printf '  [KHÔNG ĐẠT] %s\n' "$*"; FAIL=1; }

[ -n "$APP" ] || { echo "⛔ KHÔNG ĐẠT: không có Payload/*.app"; exit 1; }
V="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP/Info.plist" 2>/dev/null)"
B="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$APP/Info.plist" 2>/dev/null)"
echo "== Cổng kiểm IPA: $IPA =="
echo "   version trong file: ${V:-?}/${B:-?}"

# 1) credential hysteria2 (lỗi build 33)
PWD_IN="$(/usr/libexec/PlistBuddy -c 'Print :HysteriaPassword' "$APP/Info.plist" 2>/dev/null || true)"
OBF_IN="$(/usr/libexec/PlistBuddy -c 'Print :HysteriaObfs' "$APP/Info.plist" 2>/dev/null || true)"
if [ -n "$PWD_IN" ] && [ -n "$OBF_IN" ]; then
  ok "Credential hysteria2 có trong Info.plist của app (${#PWD_IN} + ${#OBF_IN} ký tự)"
else
  bad "Credential hysteria2 RỖNG ⇒ extension sẽ báo TUNNEL_START_FAILED ('bật lên tắt ngay'). Thiếu env: chạy 'eval \"\$(bash scripts/dev-hysteria-build-env.sh)\"' rồi build lại"
fi

# 2) extension có mặt + cùng số version/build
if [ -n "$APPEX" ]; then
  AV="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APPEX/Info.plist" 2>/dev/null)"
  AB="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$APPEX/Info.plist" 2>/dev/null)"
  if [ "$AV" = "$V" ] && [ "$AB" = "$B" ]; then ok "Extension cùng số ($AV/$AB)"; else bad "Extension lệch số: $AV/$AB vs app $V/$B"; fi
else
  bad "Thiếu *.appex (packet tunnel) trong IPA"
fi

# 3) so version ky vong
[ -n "$WANT_V" ] && { [ "$V" = "$WANT_V" ] && ok "Khớp --version $WANT_V" || bad "Version trong file $V ≠ --version $WANT_V"; }
[ -n "$WANT_B" ] && { [ "$B" = "$WANT_B" ] && ok "Khớp --build $WANT_B" || bad "Build trong file $B ≠ --build $WANT_B"; }

# 4) KHÔNG được có nhóm keychain dùng chung (luật 3, sự cố 22/09/2026)
if codesign -d --entitlements :- "$APP" 2>/dev/null | grep -q "com.privatevpn.shared"; then
  bad "App CÒN nhóm keychain 'com.privatevpn.shared' ⇒ SecItemAdd -34018 ⇒ khách kẹt màn đăng nhập"
else
  ok "Không có nhóm keychain dùng chung"
fi

# 5) chữ ký hợp lệ
if codesign --verify --deep --strict "$APP" 2>/dev/null; then ok "codesign --verify --deep --strict"; else bad "Chữ ký KHÔNG hợp lệ"; fi

# 6) profile ad-hoc: có UDID + get-task-allow=false (khách không cần Developer Mode)
if security cms -D -i "$APP/embedded.mobileprovision" > "$W/p.plist" 2>/dev/null; then
  python3 - "$W/p.plist" <<'PY' || FAIL=1
import plistlib,sys
p=plistlib.load(open(sys.argv[1],'rb')); u=p.get('ProvisionedDevices') or []
gt=p.get('Entitlements',{}).get('get-task-allow')
print(f"  [ {'ĐẠT' if u else 'KHÔNG ĐẠT'} ] profile Ad Hoc: {len(u)} UDID")
print(f"  [ {'ĐẠT' if gt is False else 'KHÔNG ĐẠT'} ] get-task-allow = {gt} (phải False)")
sys.exit(0 if u and gt is False else 1)
PY
else
  bad "Không đọc được embedded.mobileprovision"
fi

echo
if [ "$FAIL" = "0" ]; then echo "✅ ĐẠT — được phép cài/phát hành."; exit 0; fi
echo "⛔ KHÔNG ĐẠT — DỪNG, không cài/phát hành bản này."; exit 1
